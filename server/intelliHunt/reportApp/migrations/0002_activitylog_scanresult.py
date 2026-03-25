import uuid
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reportApp", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ActivityLog",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("username", models.CharField(max_length=150)),
                ("action", models.CharField(max_length=50, choices=[
                    ("login", "Login"), ("register", "Register"),
                    ("report_run", "Report Run"), ("repo_scan", "Repo Scan"),
                    ("cmdb_import", "CMDB Import"), ("yaml_upload", "YAML Upload"),
                ])),
                ("status", models.CharField(max_length=20, default="started", choices=[
                    ("started", "Started"), ("completed", "Completed"), ("error", "Error"),
                ])),
                ("detail", models.TextField(blank=True, default="")),
                ("duration_ms", models.IntegerField(null=True, blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("organization", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="activity_logs", to="reportApp.organization",
                )),
                ("user", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="activity_logs", to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"app_label": "reportApp", "ordering": ["-created_at"]},
        ),
        migrations.AddIndex(
            model_name="activitylog",
            index=models.Index(fields=["organization", "-created_at"], name="act_org_ts_idx"),
        ),
        migrations.AddIndex(
            model_name="activitylog",
            index=models.Index(fields=["user", "-created_at"], name="act_user_ts_idx"),
        ),
        migrations.CreateModel(
            name="ScanResult",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("username", models.CharField(max_length=150)),
                ("task_id", models.CharField(max_length=36, unique=True, db_index=True)),
                ("target", models.TextField()),
                ("input_type", models.CharField(max_length=10, default="url")),
                ("status", models.CharField(max_length=20, default="running")),
                ("report_markdown", models.TextField(blank=True, default="")),
                ("duration_ms", models.IntegerField(null=True, blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("completed_at", models.DateTimeField(null=True, blank=True)),
                ("organization", models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name="scan_results", to="reportApp.organization",
                )),
                ("user", models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name="scan_results", to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={"app_label": "reportApp", "ordering": ["-created_at"]},
        ),
        migrations.AddIndex(
            model_name="scanresult",
            index=models.Index(fields=["organization", "-created_at"], name="scan_org_ts_idx"),
        ),
    ]
