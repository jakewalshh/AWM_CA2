from django.contrib.gis.db import models as gis_models
from django.db import models

# Create your models here.

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