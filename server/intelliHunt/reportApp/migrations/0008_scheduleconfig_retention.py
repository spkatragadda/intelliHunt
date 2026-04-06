from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('reportApp', '0007_backfill_artifacts'),
    ]

    operations = [
        migrations.AddField(
            model_name='scheduleconfig',
            name='retention_days',
            field=models.IntegerField(default=365, help_text='Delete artifacts older than this many days.'),
        ),
        migrations.AddField(
            model_name='scheduleconfig',
            name='retention_max_artifacts',
            field=models.IntegerField(default=200, help_text='Keep at most this many artifacts per org.'),
        ),
    ]
