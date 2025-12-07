from django.db import migrations, models
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ('tracking', '0003_lorryroute_distance_meters_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='lorry',
            name='user',
            field=models.OneToOneField(blank=True, null=True, on_delete=models.SET_NULL, related_name='lorry', to=settings.AUTH_USER_MODEL),
        ),
    ]
