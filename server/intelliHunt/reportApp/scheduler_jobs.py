"""
Scheduler jobs for autonomous report runs and drift alerting.
Called by APScheduler (run_scheduler management command).
"""
import re
import logging
import os
import subprocess
import tempfile
import time

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger("intelliHunt")

CVE_PATTERN = re.compile(r'\bCVE-\d{4}-\d{4,}\b', re.IGNORECASE)


def extract_cve_ids(markdown: str) -> set:
    """Return the set of unique CVE IDs found in a markdown string."""
    return set(m.upper() for m in CVE_PATTERN.findall(markdown))


def run_scheduled_report(org_id: str):
    """
    APScheduler calls this function for each org with a schedule enabled.
    Runs the crew pipeline, detects CVE drift vs the previous report, and
    creates Notification rows (+ optional email) for all org members.
    """
    # Lazy imports so this module can be imported before Django fully starts.
    from .models import Organization, Notification
    from .auth import tenant_path

    try:
        org = Organization.objects.get(pk=org_id)
    except Organization.DoesNotExist:
        logger.error("[scheduler] org %s not found — skipping", org_id)
        return

    # ── load previous CVEs for drift comparison ───────────────────────────────
    prev_report_path = tenant_path(org_id, 'crew_report.md')
    prev_cves: set = set()
    if os.path.exists(prev_report_path):
        try:
            with open(prev_report_path, encoding='utf-8') as f:
                prev_cves = extract_cve_ids(f.read())
        except Exception:
            pass

    # ── run the crew pipeline (same subprocess approach as run_report view) ───
    new_markdown = ""
    try:
        yaml_config_path = tenant_path(org_id, 'config.yaml')
        payload = {
            'org_id': str(org_id),
            'yaml_config_path': yaml_config_path if os.path.exists(yaml_config_path) else None,
        }

        import json
        payload_file = tempfile.NamedTemporaryFile(
            mode='w', suffix='.json', delete=False, prefix='sched_payload_'
        )
        json.dump(payload, payload_file)
        payload_file.flush()
        payload_file_path = payload_file.name
        payload_file.close()

        script_path = os.path.join(settings.BASE_DIR, 'intelliHunt', 'crew', 'system.py')
        result = subprocess.run(
            ['python', script_path, '--payload', payload_file_path],
            capture_output=True, text=True, timeout=900,
            cwd=settings.BASE_DIR,
        )

        if os.path.exists(payload_file_path):
            os.unlink(payload_file_path)

        if result.returncode != 0:
            raise RuntimeError(result.stderr or result.stdout or "crew pipeline failed")

        # Read the newly written tenant report
        if os.path.exists(prev_report_path):
            with open(prev_report_path, encoding='utf-8') as f:
                new_markdown = f.read()

        # Archive this scheduled run as a ReportArtifact for historical trending
        try:
            from .reporting import persist_report_artifact
            persist_report_artifact(
                org_id=str(org_id), user_id=None, username="scheduler",
                source="scheduled_report", markdown=new_markdown,
            )
        except Exception:
            logger.exception("[scheduler] persist_report_artifact failed for org %s", org_id)

    except Exception as exc:
        logger.exception("[scheduler] run failed for org %s: %s", org_id, exc)
        _notify_all(org, 'run_error',
                    f'Scheduled report failed for {org.name}',
                    str(exc))
        return

    # ── drift detection ───────────────────────────────────────────────────────
    new_cves = extract_cve_ids(new_markdown)
    added = new_cves - prev_cves

    run_summary = (
        f'Found {len(new_cves)} CVE(s). '
        + (f'New since last run: {", ".join(sorted(added))}' if added else 'No new CVEs since last run.')
    )

    _notify_all(org, 'run_complete',
                f'Scheduled report complete for {org.name}',
                run_summary)

    if added:
        _notify_all(org, 'drift',
                    f'{len(added)} new CVE(s) detected for {org.name}',
                    ', '.join(sorted(added)))
        _send_drift_email(org, added)


# ── helpers ───────────────────────────────────────────────────────────────────

def _notify_all(org, notif_type: str, title: str, body: str):
    """Create a Notification row for every member of the org."""
    from .models import Notification
    from django.contrib.auth import get_user_model
    User = get_user_model()

    member_ids = org.members.values_list('user_id', flat=True)
    users = User.objects.filter(pk__in=member_ids)
    for user in users:
        try:
            Notification.objects.create(
                organization=org,
                user=user,
                type=notif_type,
                title=title,
                body=body,
            )
        except Exception:
            logger.exception("[scheduler] failed to create notification for user %s", user.pk)


def _send_drift_email(org, added_cves: set):
    """Send an email alert for newly detected CVEs if the schedule has email enabled."""
    try:
        config = org.schedule
        if not config.notify_email:
            return
    except Exception:
        return  # no ScheduleConfig row

    recipients = list(
        org.members.select_related('user').values_list('user__email', flat=True)
    )
    recipients = [e for e in recipients if e]
    if not recipients:
        return

    cve_list = '\n'.join(f'  • {c}' for c in sorted(added_cves))
    try:
        send_mail(
            subject=f'[IntelliHunt] {len(added_cves)} new CVE(s) detected — {org.name}',
            message=f'The following CVEs were not present in your previous report:\n\n{cve_list}\n\nLog in to IntelliHunt to view the full report.',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=recipients,
            fail_silently=True,
        )
    except Exception:
        logger.exception("[scheduler] drift email failed for org %s", org.pk)


def run_deep_research(org_id: str):
    """
    APScheduler calls this for each org with GraphResearchConfig enabled.
    Delegates to the knowledge_graph deep research pipeline.
    """
    try:
        from intelliHunt.knowledge_graph.tasks.deep_research import run_deep_research as _run
        _run(org_id)
    except Exception:
        logger.exception("[scheduler] deep research failed for org %s", org_id)


def prune_old_artifacts_job():
    """
    Daily housekeeping job (02:00 UTC). For each org with a ScheduleConfig,
    delete artifacts older than retention_days and trim to retention_max_artifacts.
    Orgs without a ScheduleConfig use default retention (365 days, 200 max).
    """
    from .models import Organization, ScheduleConfig
    from .reporting import prune_old_artifacts

    for org in Organization.objects.all():
        try:
            cfg = ScheduleConfig.objects.filter(organization=org).first()
            retention_days = cfg.retention_days if cfg else 365
            max_artifacts  = cfg.retention_max_artifacts if cfg else 200
            prune_old_artifacts(str(org.pk), retention_days, max_artifacts)
        except Exception:
            logger.exception("[scheduler] prune failed for org %s", org.pk)
