from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'lorries', views.LorryViewSet)
router.register(r'locations', views.LocationViewSet)

urlpatterns = [
    path('api/', include(router.urls)),
    path('api/latest-locations/', views.latest_lorry_locations, name='latest_locations'),
    path('api/ingest-location/', views.ingest_location, name='ingest_location'),
    path('api/route/', views.calculate_route, name='tomtom_route'),
    path('api/lorry/<int:lorry_id>/route/', views.latest_route_for_lorry, name='latest_route_for_lorry'),
    path('api/lorry/<int:lorry_id>/route/clear/', views.clear_route, name='clear_route'),
    path('api/routes/', views.save_route, name='save_route'),
]
