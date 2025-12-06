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
