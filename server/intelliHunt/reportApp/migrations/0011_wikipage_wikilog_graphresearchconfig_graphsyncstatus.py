import uuid

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reportApp", "0010_notification_remove_activitylog_act_org_ts_idx_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="WikiPage",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("entity_type", models.CharField(max_length=32)),
                ("entity_id", models.CharField(max_length=255)),
                ("title", models.CharField(max_length=512)),
                ("content_markdown", models.TextField()),
                ("links_to", models.JSONField(default=list)),
                ("graph_context_hash", models.CharField(max_length=64, blank=True, default="")),
                ("last_refreshed", models.DateTimeField(auto_now=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="reportApp.organization")),
            ],
            options={
                "unique_together": {("organization", "entity_type", "entity_id")},
            },
        ),
        migrations.CreateModel(
            name="WikiLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("operation", models.CharField(choices=[("ingest", "Ingest"), ("query", "Query"), ("lint", "Lint"), ("expand", "Expand")], max_length=16)),
                ("title", models.CharField(max_length=512)),
                ("detail", models.TextField(blank=True)),
                ("pages_affected", models.JSONField(default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="reportApp.organization")),
            ],
        ),
        migrations.CreateModel(
            name="GraphResearchConfig",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("enabled", models.BooleanField(default=False)),
                ("frequency", models.CharField(choices=[("daily", "Daily"), ("weekly", "Weekly"), ("biweekly", "Biweekly")], default="weekly", max_length=16)),
                ("day_of_week", models.IntegerField(default=0)),
                ("hour", models.IntegerField(default=2)),
                ("expand_depth", models.IntegerField(default=2)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("organization", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="graph_research_config", to="reportApp.organization")),
            ],
        ),
        migrations.CreateModel(
            name="GraphSyncStatus",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("sync_type", models.CharField(max_length=32)),
                ("status", models.CharField(max_length=20)),
                ("started_at", models.DateTimeField()),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("nodes_created", models.IntegerField(default=0)),
                ("relationships_created", models.IntegerField(default=0)),
                ("pages_updated", models.IntegerField(default=0)),
                ("errors", models.TextField(blank=True)),
                ("organization", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to="reportApp.organization")),
            ],
        ),
    ]
