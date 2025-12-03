from rest_framework import viewsets
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.contrib.gis.geos import Point
from django.db.models import Max
from django.views.decorators.csrf import csrf_exempt
from .models import Lorry, Location
from .serializers import LorrySerializer, LocationSerializer

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
