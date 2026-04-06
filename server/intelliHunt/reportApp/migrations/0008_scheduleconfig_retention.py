import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('reportApp', '0007_backfill_artifacts'),
    ]

    operations = [
        migrations.CreateModel(
            name='ScheduleConfig',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=False)),
                ('frequency', models.CharField(choices=[('daily', 'Daily'), ('weekly', 'Weekly'), ('monthly', 'Monthly')], default='weekly', max_length=16)),
                ('day_of_week', models.IntegerField(default=0)),
                ('day_of_month', models.IntegerField(default=1)),
                ('hour', models.IntegerField(default=8)),
                ('notify_email', models.BooleanField(default=True)),
                ('retention_days', models.IntegerField(default=365, help_text='Delete artifacts older than this many days.')),
                ('retention_max_artifacts', models.IntegerField(default=200, help_text='Keep at most this many artifacts per org.')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('organization', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='schedule', to='reportApp.organization')),
            ],
            options={
                'app_label': 'reportApp',
            },
        ),
    ]
