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
]
