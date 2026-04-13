import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reportApp", "0009_scanresult_scan_level"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="Notification",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("type", models.CharField(choices=[("drift", "New CVEs Detected"), ("run_complete", "Scheduled Run Complete"), ("run_error", "Scheduled Run Failed")], max_length=32)),
                ("title", models.CharField(max_length=255)),
                ("body", models.TextField()),
                ("read", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="notifications", to="reportApp.organization")),
                ("user", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="notifications", to=settings.AUTH_USER_MODEL)),
            ],
            options={
                "app_label": "reportApp",
                "ordering": ["-created_at"],
            },
        ),
        migrations.RemoveIndex(
            model_name="activitylog",
            name="act_org_ts_idx",
        ),
        migrations.RemoveIndex(
            model_name="activitylog",
            name="act_user_ts_idx",
        ),
    ]
