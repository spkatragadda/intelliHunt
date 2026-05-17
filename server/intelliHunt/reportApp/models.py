import os
import uuid
from django.db import models
from django.conf import settings


class Organization(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "reportApp"

    def __str__(self):
        return self.name


class UserProfile(models.Model):
    TIER_CHOICES = [
        ('free', 'Free'),
        ('pro', 'Pro'),
    ]
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name="members",
    )
    tier = models.CharField(max_length=10, choices=TIER_CHOICES, default='free')

    class Meta:
        app_label = "reportApp"

    def __str__(self):
        return f"{self.user.username} @ {self.organization.name}"


class ActivityLog(models.Model):
    ACTION_CHOICES = [
        ("login",        "Login"),
        ("register",     "Register"),
        ("report_run",   "Report Run"),
        ("repo_scan",    "Repo Scan"),
        ("cmdb_import",  "CMDB Import"),
        ("yaml_upload",  "YAML Upload"),
    ]
    STATUS_CHOICES = [
        ("started",   "Started"),
        ("completed", "Completed"),
        ("error",     "Error"),
    ]

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="activity_logs",
    )
    user         = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="activity_logs",
    )
    username    = models.CharField(max_length=150)
    action      = models.CharField(max_length=50, choices=ACTION_CHOICES)
    status      = models.CharField(max_length=20, choices=STATUS_CHOICES, default="started")
    detail      = models.TextField(blank=True, default="")
    duration_ms = models.IntegerField(null=True, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "reportApp"
        ordering  = ["-created_at"]

    def __str__(self):
        return f"{self.username} | {self.action} | {self.status}"


class ScanResult(models.Model):
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="scan_results",
    )
    user         = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="scan_results",
    )
    username        = models.CharField(max_length=150)
    task_id         = models.CharField(max_length=36, unique=True, db_index=True)
    target          = models.TextField()
    input_type      = models.CharField(max_length=10, default="url")
    scan_level      = models.CharField(max_length=10, default="speed")
    status          = models.CharField(max_length=20, default="running")
    report_markdown = models.TextField(blank=True, default="")
    duration_ms     = models.IntegerField(null=True, blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    completed_at    = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "reportApp"
        ordering  = ["-created_at"]

    def __str__(self):
        return f"Scan {self.task_id} ({self.status})"


class PasswordResetToken(models.Model):
    id         = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user       = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reset_tokens",
    )
    token_hash = models.CharField(max_length=64, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    used       = models.BooleanField(default=False)

    class Meta:
        app_label = "reportApp"

    def __str__(self):
        return f"PasswordResetToken for {self.user_id} (used={self.used})"


class ScheduleConfig(models.Model):
    FREQUENCY_CHOICES = [
        ('daily',   'Daily'),
        ('weekly',  'Weekly'),
        ('monthly', 'Monthly'),
    ]
    organization  = models.OneToOneField(
        Organization, on_delete=models.CASCADE, related_name='schedule',
    )
    enabled       = models.BooleanField(default=False)
    frequency     = models.CharField(max_length=16, choices=FREQUENCY_CHOICES, default='weekly')
    # day_of_week: 0=Mon … 6=Sun (weekly); day_of_month: 1-28 (monthly)
    day_of_week   = models.IntegerField(default=0)
    day_of_month  = models.IntegerField(default=1)
    hour          = models.IntegerField(default=8)  # UTC hour
    notify_email  = models.BooleanField(default=True)
    retention_days = models.IntegerField(default=365)
    retention_max_artifacts = models.IntegerField(default=200)
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "reportApp"

    def __str__(self):
        return f"Schedule for {self.organization.name} ({self.frequency}, enabled={self.enabled})"


class ReportArtifact(models.Model):
    """
    Historical archive of one completed report run (manual, scheduled, or repo scan).
    The markdown is stored on the per-tenant filesystem via tenant_path(); the DB row
    is the queryable index + audit trail.
    """
    SOURCE_CHOICES = [
        ("manual_report",    "Manual Report"),
        ("scheduled_report", "Scheduled Report"),
        ("repo_scan",        "Repo Scan"),
    ]
    STORAGE_CHOICES = [("file", "file"), ("db", "db")]
    METRICS_STATUS_CHOICES = [
        ("ok",      "ok"),
        ("partial", "partial"),
        ("failed",  "failed"),
    ]

    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="report_artifacts",
    )
    user         = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="report_artifacts",
    )
    username       = models.CharField(max_length=150, blank=True, default="")
    source         = models.CharField(max_length=32, choices=SOURCE_CHOICES)
    task_id        = models.CharField(max_length=64, blank=True, default="", db_index=True)
    scan_result    = models.ForeignKey(
        ScanResult, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="artifacts",
    )
    storage_kind   = models.CharField(max_length=8, choices=STORAGE_CHOICES, default="file")
    storage_path   = models.CharField(max_length=512, blank=True, default="")
    markdown_blob  = models.TextField(blank=True, default="")
    byte_size      = models.IntegerField(default=0)
    content_sha256 = models.CharField(max_length=64, blank=True, default="", db_index=True)
    metrics_status = models.CharField(
        max_length=16, choices=METRICS_STATUS_CHOICES, default="ok",
    )
    metrics_error  = models.TextField(blank=True, default="")
    created_at     = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        app_label = "reportApp"
        ordering  = ["-created_at"]
        indexes   = [
            models.Index(fields=["organization", "-created_at"], name="reportApp_r_organiz_5a8e3c_idx"),
            models.Index(fields=["organization", "source", "-created_at"], name="reportApp_r_organiz_3f1a2d_idx"),
        ]

    def __str__(self):
        return f"Artifact {self.id} ({self.source}) org={self.organization_id}"

    def delete(self, *args, **kwargs):
        # Remove the on-disk markdown file before removing the DB row.
        # Re-resolve through tenant_path + realpath to prevent directory escape.
        if self.storage_kind == "file" and self.storage_path:
            try:
                from .auth import tenant_dir, tenant_path
                abs_path = os.path.realpath(tenant_path(str(self.organization_id), self.storage_path))
                tenant_root = os.path.realpath(tenant_dir(str(self.organization_id)))
                if abs_path.startswith(tenant_root + os.sep) and os.path.exists(abs_path):
                    os.unlink(abs_path)
            except Exception:
                import logging
                logging.getLogger("intelliHunt").exception(
                    "Failed to unlink artifact file for %s", self.pk,
                )
        return super().delete(*args, **kwargs)


class ReportMetric(models.Model):
    """
    Denormalized numeric snapshot extracted from a ReportArtifact at save time.
    All trend queries hit this table so we never re-parse markdown at read time.
    """
    id           = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    artifact     = models.OneToOneField(
        ReportArtifact, on_delete=models.CASCADE, related_name="metric",
    )
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="report_metrics",
    )
    snapshot_at  = models.DateTimeField(db_index=True)
    source       = models.CharField(max_length=32)

    total_cves             = models.IntegerField(default=0)
    unique_cves            = models.IntegerField(default=0)
    critical_count         = models.IntegerField(default=0)
    high_count             = models.IntegerField(default=0)
    medium_count           = models.IntegerField(default=0)
    low_count              = models.IntegerField(default=0)
    info_count             = models.IntegerField(default=0)
    unknown_severity_count = models.IntegerField(default=0)

    cvss_avg = models.FloatField(null=True, blank=True)
    cvss_max = models.FloatField(null=True, blank=True)

    new_cves_count      = models.IntegerField(default=0)
    resolved_cves_count = models.IntegerField(default=0)
    carried_over_count  = models.IntegerField(default=0)

    oldest_unpatched_days   = models.IntegerField(null=True, blank=True)
    affected_products_count = models.IntegerField(default=0)

    cve_ids            = models.JSONField(default=list)
    top_products       = models.JSONField(default=list)
    severity_breakdown = models.JSONField(default=dict)

    class Meta:
        app_label = "reportApp"
        ordering  = ["-snapshot_at"]
        indexes   = [
            models.Index(fields=["organization", "snapshot_at"], name="reportApp_r_organiz_7b2c4d_idx"),
            models.Index(fields=["organization", "source", "snapshot_at"], name="reportApp_r_organiz_9c5e6f_idx"),
        ]

    def __str__(self):
        return f"Metric org={self.organization_id} cves={self.total_cves} @ {self.snapshot_at}"


class Notification(models.Model):
    TYPE_CHOICES = [
        ('drift',        'New CVEs Detected'),
        ('run_complete', 'Scheduled Run Complete'),
        ('run_error',    'Scheduled Run Failed'),
    ]
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name='notifications',
    )
    user         = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        null=True, blank=True, related_name='notifications',
    )
    type         = models.CharField(max_length=32, choices=TYPE_CHOICES)
    title        = models.CharField(max_length=255)
    body         = models.TextField()
    read         = models.BooleanField(default=False)
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "reportApp"
        ordering  = ['-created_at']

    def __str__(self):
        return f"[{self.type}] {self.title} (read={self.read})"
