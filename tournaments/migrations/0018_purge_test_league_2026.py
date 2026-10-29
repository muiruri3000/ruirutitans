from django.db import migrations, models


def purge_test_leagues(apps, schema_editor):
    Category = apps.get_model('tournaments', 'Category')
    GlobalSettings = apps.get_model('tournaments', 'GlobalSettings')

    # Permanently delete any test categories from database
    qs = Category.objects.filter(
        models.Q(key__icontains='test-league') |
        models.Q(key__icontains='test_league') |
        models.Q(key='test') |
        models.Q(label__icontains='test league') |
        models.Q(label__icontains='test 2026')
    )
    count = qs.count()
    if count > 0:
        print(f"Purging {count} test league category records from database...")
        qs.delete()

    # Reset active category key if it pointed to a test category
    settings = GlobalSettings.objects.filter(id=1).first()
    if settings and settings.active_category_key:
        lower_key = settings.active_category_key.lower()
        if 'test' in lower_key:
            settings.active_category_key = 'ruiru-titans-league-oct-nov-2026'
            settings.save(update_fields=['active_category_key'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('tournaments', '0017_weeklymvp'),
    ]

    operations = [
        migrations.RunPython(purge_test_leagues, reverse_code=noop),
    ]
