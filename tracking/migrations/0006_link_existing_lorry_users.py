from django.db import migrations


def link_existing(apps, schema_editor):
    Lorry = apps.get_model('tracking', 'Lorry')
    User = apps.get_model('auth', 'User')
    for lorry in Lorry.objects.filter(user__isnull=True):
        try:
            user = User.objects.get(username=lorry.name)
        except User.DoesNotExist:
            continue
        lorry.user = user
        lorry.save(update_fields=['user'])


def unlink_existing(apps, schema_editor):
    Lorry = apps.get_model('tracking', 'Lorry')
    Lorry.objects.update(user=None)


class Migration(migrations.Migration):

    dependencies = [
        ('tracking', '0005_seed_lorry_users'),
    ]

    operations = [
        migrations.RunPython(link_existing, unlink_existing),
    ]
