from rest_framework import serializers
from django.contrib.gis.geos import Point, LineString
from .models import Lorry, Location, LorryRoute

class LorrySerializer(serializers.ModelSerializer):
    class Meta:
        model = Lorry
        fields = '__all__'

class LocationSerializer(serializers.ModelSerializer):
    lorry_name = serializers.CharField(source='lorry.name', read_only=True)
    latitude = serializers.SerializerMethodField()
    longitude = serializers.SerializerMethodField()
    travel_time_seconds = serializers.SerializerMethodField()
    distance_meters = serializers.SerializerMethodField()
    
    def get_latitude(self, obj):
        # Returns latitude from the Point geometry
        return obj.point.y if obj.point else None

    def get_longitude(self, obj):
        # Returns longitude from the Point geometry
        return obj.point.x if obj.point else None

    def get_travel_time_seconds(self, obj):
        # Pulls latest route travel time for this lorry
        latest_route = obj.lorry.routes.order_by('-created_at').first()
        return latest_route.travel_time_seconds if latest_route else None

    def get_distance_meters(self, obj):
        # Pulls latest route distance for this lorry
        latest_route = obj.lorry.routes.order_by('-created_at').first()
        return latest_route.distance_meters if latest_route else None

    class Meta:
        model = Location
        fields = ['id', 'lorry', 'lorry_name', 'latitude', 'longitude', 'timestamp', 'current_county', 'travel_time_seconds', 'distance_meters']


class LorryRouteSerializer(serializers.ModelSerializer):
    # Accept lat/lon arrays; store as LineString/Point
    path = serializers.ListField(child=serializers.ListField(child=serializers.FloatField()), min_length=2)
    destination = serializers.ListField(child=serializers.FloatField(), min_length=2, max_length=2)
    travel_time_seconds = serializers.IntegerField(required=False, allow_null=True)
    distance_meters = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = LorryRoute
        fields = ['id', 'lorry', 'path', 'destination', 'travel_time_seconds', 'distance_meters', 'created_at']

    def to_representation(self, instance):
        # Outputs geometry as lat/lon arrays with lorry name
        data = super().to_representation(instance)
        # Represent geometry as [lat, lon]
        data['path'] = [[coord[1], coord[0]] for coord in instance.path.coords]
        data['destination'] = [instance.destination.y, instance.destination.x]
        data['lorry_name'] = instance.lorry.name
        return data

    def create(self, validated_data):
        # Converts incoming lat/lon arrays to geometry fields on create
        path_coords = validated_data.pop('path')
        dest_coords = validated_data.pop('destination')
        line = LineString([(lng, lat) for lat, lng in path_coords], srid=4326)
        dest_point = Point(dest_coords[1], dest_coords[0], srid=4326)
        return LorryRoute.objects.create(path=line, destination=dest_point, **validated_data)
