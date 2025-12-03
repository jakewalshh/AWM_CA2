from rest_framework import serializers
from .models import Lorry, Location

class LorrySerializer(serializers.ModelSerializer):
    class Meta:
        model = Lorry
        fields = '__all__'

class LocationSerializer(serializers.ModelSerializer):
    lorry_name = serializers.CharField(source='lorry.name', read_only=True)
    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()
    
    def get_latitude(self, obj):
        return obj.point.y if obj.point else None

    def get_longitude(self, obj):
        return obj.point.x if obj.point else None

    class Meta:
        model = Location
        fields = ['id', 'lorry', 'lorry_name', 'latitude', 'longitude', 'timestamp', 'current_county']
