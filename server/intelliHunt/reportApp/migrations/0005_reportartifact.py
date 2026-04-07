import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('reportApp', '0004_passwordresettoken'),
    ]

    operations = [
        migrations.CreateModel(
            name='ReportArtifact',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('username', models.CharField(blank=True, default='', max_length=150)),
                ('source', models.CharField(choices=[('manual_report', 'Manual Report'), ('scheduled_report', 'Scheduled Report'), ('repo_scan', 'Repo Scan')], max_length=32)),
                ('task_id', models.CharField(blank=True, db_index=True, default='', max_length=64)),
                ('storage_kind', models.CharField(choices=[('file', 'file'), ('db', 'db')], default='file', max_length=8)),
                ('storage_path', models.CharField(blank=True, default='', max_length=512)),
                ('markdown_blob', models.TextField(blank=True, default='')),
                ('byte_size', models.IntegerField(default=0)),
                ('content_sha256', models.CharField(blank=True, db_index=True, default='', max_length=64)),
                ('metrics_status', models.CharField(choices=[('ok', 'ok'), ('partial', 'partial'), ('failed', 'failed')], default='ok', max_length=16)),
                ('metrics_error', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='report_artifacts', to='reportApp.organization')),
                ('scan_result', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='artifacts', to='reportApp.scanresult')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='report_artifacts', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='reportartifact',
            index=models.Index(fields=['organization', '-created_at'], name='reportApp_r_organiz_5a8e3c_idx'),
        ),
        migrations.AddIndex(
            model_name='reportartifact',
            index=models.Index(fields=['organization', 'source', '-created_at'], name='reportApp_r_organiz_3f1a2d_idx'),
        ),
    ]
