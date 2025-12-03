from django.contrib import admin
from .models import Lorry, Location

@admin.register(Lorry)
class LorryAdmin(admin.ModelAdmin):
    list_display = ['name', 'created_at']
    search_fields = ['name']

@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ['lorry', 'timestamp', 'current_county']
    list_filter = ['timestamp', 'current_county']
    readonly_fields = ['timestamp']
