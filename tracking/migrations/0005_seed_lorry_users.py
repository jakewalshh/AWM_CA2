from django.db import migrations
from django.contrib.auth.hashers import make_password


def seed_lorry_users(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    User = apps.get_model('auth', 'User')
    Lorry = apps.get_model('tracking', 'Lorry')

    basic_group, _ = Group.objects.get_or_create(name='BasicUser')
    admin_group, _ = Group.objects.get_or_create(name='OverallAdmin')

    mapping = {
        2: 'JakeMac',
        4: 'Lorry2Galway',
        5: 'Lorry5Cavan',
        6: 'Lorry6Carlow',
        7: 'Lorry7Meath',
        13: 'Lorry8Clare',
    }

    for lorry_id, username in mapping.items():
        lorry = Lorry.objects.filter(pk=lorry_id).first()
        if not lorry:
            continue
        user, created = User.objects.get_or_create(
            username=username,
            defaults={'password': make_password('change_me_now'), 'is_active': True}
        )
        if created:
            user.groups.add(basic_group)
        if not lorry.user:
            lorry.user = user
            lorry.save(update_fields=['user'])


def rollback_seed(apps, schema_editor):
    User = apps.get_model('auth', 'User')
    Group = apps.get_model('auth', 'Group')
    usernames = ['JakeMac', 'Lorry2Galway', 'Lorry5Cavan', 'Lorry6Carlow', 'Lorry7Meath', 'Lorry8Clare']
    User.objects.filter(username__in=usernames).delete()
    Group.objects.filter(name__in=['BasicUser', 'OverallAdmin']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('tracking', '0004_lorry_user_field'),
    ]

    operations = [
        migrations.RunPython(seed_lorry_users, rollback_seed),
    ]
