from rest_framework import viewsets
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.contrib.gis.geos import Point
from django.db.models import Max
from django.views.decorators.csrf import csrf_exempt
import requests
from math import ceil
from .models import Lorry, Location, LorryRoute
from .serializers import LorrySerializer, LocationSerializer, LorryRouteSerializer

class LorryViewSet(viewsets.ModelViewSet):
    queryset = Lorry.objects.all()
    serializer_class = LorrySerializer

class LocationViewSet(viewsets.ModelViewSet):
    queryset = Location.objects.all()
    serializer_class = LocationSerializer

@api_view(['GET'])
def latest_lorry_locations(request):
    """Get latest location for each lorry for live map"""
    # Get latest location per lorry
    latest_locations = (Location.objects
                       .select_related('lorry')
                       .order_by('lorry', '-timestamp')
                       .distinct('lorry'))
    
    serializer = LocationSerializer(latest_locations, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@csrf_exempt  # allow posting without CSRF token; we gate with ingest token instead
@authentication_classes([])  # disable SessionAuthentication so browser CSRF isn't required (token-only)
@permission_classes([AllowAny])
def ingest_location(request):
    """Simple ingest endpoint to post a lorry's latest position."""
    # Token gate for non-browser clients; set a strong token via env in production
    token = request.headers.get('X-INGEST-TOKEN')
    if not settings.INGEST_TOKEN or token != settings.INGEST_TOKEN:
        return Response({'detail': 'Unauthorized'}, status=401)

    lorry_id = request.data.get('lorry_id') or request.data.get('lorry')
    lat = request.data.get('lat') or request.data.get('latitude')
    lon = request.data.get('lon') or request.data.get('longitude')
    county = request.data.get('current_county') or request.data.get('county')

    if lorry_id is None:
        return Response({'detail': 'lorry_id is required'}, status=400)

    try:
        lat = float(lat)
        lon = float(lon)
    except (TypeError, ValueError):
        return Response({'detail': 'lat and lon must be numeric'}, status=400)

    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return Response({'detail': 'lat/lon out of range'}, status=400)

    lorry = get_object_or_404(Lorry, pk=lorry_id)

    location = Location.objects.create(
        lorry=lorry,
        point=Point(lon, lat, srid=4326),
        current_county=county or ''
    )

    return Response(LocationSerializer(location).data, status=201)


@api_view(['GET'])
def latest_route_for_lorry(request, lorry_id):
    """Fetch the most recent saved route for a lorry."""
    lorry = get_object_or_404(Lorry, pk=lorry_id)
    route = LorryRoute.objects.filter(lorry=lorry).order_by('-created_at').first()
    if not route:
        return Response({}, status=204)
    return Response(LorryRouteSerializer(route).data)


@api_view(['POST'])
@csrf_exempt
@authentication_classes([])
@permission_classes([AllowAny])
def save_route(request):
    """Persist a route for a lorry (overwrites by simply adding a new latest record)."""
    serializer = LorryRouteSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=201)
    return Response(serializer.errors, status=400)


@api_view(['DELETE'])
@csrf_exempt
@authentication_classes([])
@permission_classes([AllowAny])
def clear_route(request, lorry_id):
    """Delete all stored routes for a lorry (used by clear button)."""
    lorry = get_object_or_404(Lorry, pk=lorry_id)
    LorryRoute.objects.filter(lorry=lorry).delete()
    return Response(status=204)


@api_view(['GET'])
def calculate_route(request):
    """Proxy TomTom Routing API for a simple point-to-point route."""
    origin = request.query_params.get('origin')  # "lat,lon"
    dest = request.query_params.get('dest')      # "lat,lon"

    if not origin or not dest:
        return Response({'detail': 'origin and dest are required as \"lat,lon\"'}, status=400)

    if not settings.TOMTOM_API_KEY:
        return Response({'detail': 'TomTom API key not configured'}, status=500)

    url = f"https://api.tomtom.com/routing/1/calculateRoute/{origin}:{dest}/json"
    params = {
        'key': settings.TOMTOM_API_KEY,
        'routeRepresentation': 'polyline',
        'computeTravelTimeFor': 'all',
        'traffic': 'true'
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
    except requests.RequestException as exc:
        return Response({'detail': f'Failed to reach TomTom: {exc}'}, status=502)

    if resp.status_code != 200:
        return Response({'detail': 'TomTom error', 'status': resp.status_code, 'body': resp.text}, status=502)

    return Response(resp.json())


@api_view(['GET'])
def pois_for_lorry(request, lorry_id):
    """Fetch fuel/toll POIs along a lorry's latest stored route using Overpass."""
    lorry = get_object_or_404(Lorry, pk=lorry_id)
    route = LorryRoute.objects.filter(lorry=lorry).order_by('-created_at').first()
    if not route:
        return Response({}, status=204)

    radius = int(request.query_params.get('radius_m', 2000))
    types_param = request.query_params.get('types', 'fuel,toll')
    query_templates = []
    for t in types_param.split(','):
        t = t.strip().lower()
        if t == 'fuel':
            query_templates.append('node["amenity"="fuel"](around:{radius},{lat},{lon});')
            query_templates.append('way["amenity"="fuel"](around:{radius},{lat},{lon});')
        elif t in ('toll', 'toll_booth'):
            # Toll booths
            query_templates.append('node["barrier"="toll_booth"](around:{radius},{lat},{lon});')
            query_templates.append('way["barrier"="toll_booth"](around:{radius},{lat},{lon});')

    if not query_templates:
        return Response({'detail': 'No valid POI types provided'}, status=400)

    # Sample the route coordinates to limit query size
    coords = list(route.path.coords)  # (lon, lat)
    max_samples = 25
    step = max(1, ceil(len(coords) / max_samples))
    sampled = coords[::step]

    # Build Overpass QL: multiple around queries for nodes/ways with tags
    query_parts = ["[out:json][timeout:25];("]
    for lon, lat in sampled:
        for tpl in query_templates:
            query_parts.append(tpl.format(radius=radius, lat=lat, lon=lon))
    query_parts.append(");out center;")
    overpass_query = "\n".join(query_parts)

    try:
        resp = requests.post(settings.OVERPASS_URL, data={'data': overpass_query}, timeout=30)
    except requests.RequestException as exc:
        return Response({'detail': f'Failed to reach Overpass: {exc}'}, status=502)

    if resp.status_code != 200:
        return Response({'detail': 'Overpass error', 'status': resp.status_code, 'body': resp.text}, status=502)

    data = resp.json()
    elements = data.get('elements', [])

    # Deduplicate by OSM id
    seen = set()
    features = []
    for el in elements:
        osm_id = f"{el.get('type')}/{el.get('id')}"
        if osm_id in seen:
            continue
        seen.add(osm_id)
        if el.get('type') == 'node':
            lat = el.get('lat')
            lon = el.get('lon')
        else:
            center = el.get('center')
            if not center:
                continue
            lat = center.get('lat')
            lon = center.get('lon')
        if lat is None or lon is None:
            continue
        tags_el = el.get('tags', {})
        poi_type = tags_el.get('amenity') or tags_el.get('shop') or 'poi'
        name = tags_el.get('name', poi_type.title())
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {
                "id": osm_id,
                "name": name,
                "type": poi_type,
                "tags": tags_el
            }
        })

    return Response({
        "type": "FeatureCollection",
        "features": features
    })
