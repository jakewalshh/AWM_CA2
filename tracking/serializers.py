from rest_framework import serializers
from .models import Lorry, Location

class LorrySerializer(serializers.ModelSerializer):
    class Meta:
        model = Lorry
        fields = '__all__'

class LocationSerializer(serializers.ModelSerializer):
    lorry_name = serializers.CharField(source='lorry.name', read_only=True)
    
    class Meta:
        model = Location
        fields = ['id', 'lorry', 'lorry_name', 'point', 'timestamp', 'current_county']
