from django.contrib import admin
from django.contrib.gis.admin import OSMGeoAdmin
from .models import Lorry, Location, LorryRoute

@admin.register(Lorry)
class LorryAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'created_at']
    search_fields = ['name']

@admin.register(Location)
class LocationAdmin(OSMGeoAdmin):
    list_display = ['lorry', 'timestamp', 'current_county']
    list_filter = ['timestamp', 'current_county']
    readonly_fields = ['timestamp']


@admin.register(LorryRoute)
class LorryRouteAdmin(admin.ModelAdmin):
    list_display = ('lorry', 'created_at')
    list_filter = ('lorry',)