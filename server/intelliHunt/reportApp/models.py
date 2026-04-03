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
    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "reportApp"

    def __str__(self):
        return f"Schedule for {self.organization.name} ({self.frequency}, enabled={self.enabled})"


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
