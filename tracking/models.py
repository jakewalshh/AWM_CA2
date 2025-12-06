from django.contrib.gis.db import models as gis_models
from django.db import models


class Lorry(models.Model):
    name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Location(models.Model):
    lorry = models.ForeignKey(Lorry, on_delete=models.CASCADE, related_name='locations')
    point = gis_models.PointField()
    timestamp = models.DateTimeField(auto_now_add=True)
    current_county = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
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
        return f"Route for {self.lorry.name} @ {self.created_at}"
