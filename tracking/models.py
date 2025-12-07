from django.contrib.gis.db import models as gis_models
from django.db import models
from django.conf import settings


class Lorry(models.Model):
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='lorry')

    def __str__(self):
        # Returns the lorry name for admin displays
        return self.name


class Location(models.Model):
    lorry = models.ForeignKey(Lorry, on_delete=models.CASCADE, related_name='locations')
    point = gis_models.PointField()
    timestamp = models.DateTimeField(auto_now_add=True)
    current_county = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
        #  location string for admin displays
        return f"Location of {self.lorry.name} at {self.timestamp}"


class LorryRoute(models.Model):
    lorry = models.ForeignKey(Lorry, on_delete=models.CASCADE, related_name='routes')
    path = gis_models.LineStringField(srid=4326)
    destination = gis_models.PointField(srid=4326)
    travel_time_seconds = models.IntegerField(null=True, blank=True)
    distance_meters = models.IntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        get_latest_by = 'created_at'

    def __str__(self):
        # Shows which lorry the route belongs to with timestamp
        return f"Route for {self.lorry.name} @ {self.created_at}"
