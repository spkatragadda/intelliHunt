import uuid
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('reportApp', '0005_reportartifact'),
    ]

    operations = [
        migrations.CreateModel(
            name='ReportMetric',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('snapshot_at', models.DateTimeField(db_index=True)),
                ('source', models.CharField(max_length=32)),
                ('total_cves', models.IntegerField(default=0)),
                ('unique_cves', models.IntegerField(default=0)),
                ('critical_count', models.IntegerField(default=0)),
                ('high_count', models.IntegerField(default=0)),
                ('medium_count', models.IntegerField(default=0)),
                ('low_count', models.IntegerField(default=0)),
                ('info_count', models.IntegerField(default=0)),
                ('unknown_severity_count', models.IntegerField(default=0)),
                ('cvss_avg', models.FloatField(blank=True, null=True)),
                ('cvss_max', models.FloatField(blank=True, null=True)),
                ('new_cves_count', models.IntegerField(default=0)),
                ('resolved_cves_count', models.IntegerField(default=0)),
                ('carried_over_count', models.IntegerField(default=0)),
                ('oldest_unpatched_days', models.IntegerField(blank=True, null=True)),
                ('affected_products_count', models.IntegerField(default=0)),
                ('cve_ids', models.JSONField(default=list)),
                ('top_products', models.JSONField(default=list)),
                ('severity_breakdown', models.JSONField(default=dict)),
                ('artifact', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='metric', to='reportApp.reportartifact')),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='report_metrics', to='reportApp.organization')),
            ],
            options={
                'ordering': ['-snapshot_at'],
            },
        ),
        migrations.AddIndex(
            model_name='reportmetric',
            index=models.Index(fields=['organization', 'snapshot_at'], name='reportApp_r_organiz_7b2c4d_idx'),
        ),
        migrations.AddIndex(
            model_name='reportmetric',
            index=models.Index(fields=['organization', 'source', 'snapshot_at'], name='reportApp_r_organiz_9c5e6f_idx'),
        ),
    ]
