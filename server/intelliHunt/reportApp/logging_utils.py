"""
Thread-safe logging helpers.

All functions swallow every exception so logging never crashes a caller,
and always close the DB connection afterwards to avoid SQLite file-handle
leaks from daemon threads.
"""
import logging

from django.db import connection as _db_conn

logger = logging.getLogger("intelliHunt")


def _close():
    try:
        _db_conn.close()
    except Exception:
        pass


def log_action(
    org_id: str,
    user_id,
    username: str,
    action: str,
    status: str = "completed",
    detail: str = "",
    duration_ms: int = None,
):
    """Write one ActivityLog row.  Safe to call from any thread."""
    try:
        from .models import ActivityLog, Organization
        from django.contrib.auth.models import User

        org  = Organization.objects.get(id=org_id)
        user = User.objects.get(pk=user_id) if user_id else None
        ActivityLog.objects.create(
            organization=org,
            user=user,
            username=username,
            action=action,
            status=status,
            detail=str(detail)[:2000],
            duration_ms=duration_ms,
        )
        logger.info("[%s] org=%s user=%s action=%s status=%s detail=%s",
                    action, org_id, username, action, status, str(detail)[:200])
    except Exception as exc:
        logger.warning("[ActivityLog] write failed: %s", exc)
    finally:
        _close()


def create_scan_result(org_id, user_id, username, task_id, target, input_type, scan_level="speed"):
    """Insert a ScanResult row at scan start.  Safe to call from any thread."""
    try:
        from .models import ScanResult, Organization
        from django.contrib.auth.models import User

        org  = Organization.objects.get(id=org_id)
        user = User.objects.get(pk=user_id) if user_id else None
        ScanResult.objects.create(
            organization=org,
            user=user,
            username=username,
            task_id=task_id,
            target=target,
            input_type=input_type,
            scan_level=scan_level,
            status="running",
        )
    except Exception as exc:
        logger.warning("[ScanResult] create failed: %s", exc)
    finally:
        _close()


def complete_scan_result(task_id, status, report_markdown="", duration_ms=None):
    """Update a ScanResult on completion or error.  Safe to call from any thread."""
    try:
        from .models import ScanResult
        from django.utils import timezone

        fields = {
            "status": status,
            "report_markdown": report_markdown,
            "completed_at": timezone.now(),
        }
        if duration_ms is not None:
            fields["duration_ms"] = duration_ms
        ScanResult.objects.filter(task_id=task_id).update(**fields)
    except Exception as exc:
        logger.warning("[ScanResult] complete failed: %s", exc)
    finally:
        _close()
