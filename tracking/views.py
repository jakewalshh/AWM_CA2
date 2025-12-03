from rest_framework import viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.db.models import Max
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
