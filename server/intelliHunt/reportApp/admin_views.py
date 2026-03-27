"""
Admin dashboard API endpoints.
Requires the requesting user to have is_staff=True.

To promote a user to staff:
  python manage.py shell -c "from django.contrib.auth.models import User; User.objects.filter(username='yourname').update(is_staff=True)"
"""
import json
import logging
from functools import wraps

from django.contrib.auth.models import User
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

logger = logging.getLogger("intelliHunt")

from .auth import require_auth
from .models import ActivityLog, Organization, ScanResult, UserProfile


ADMIN_EMAIL = "admin@admin.com"


def require_admin(view_func):
    """
    Decorator: JWT auth + is_staff check + email whitelist.
    Only the admin@admin.com account may call admin endpoints.
    """
    @require_auth
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        try:
            user = User.objects.get(pk=request.user_id)
            if not user.is_staff or user.email.lower() != ADMIN_EMAIL:
                logger.warning(
                    "ADMIN_ACCESS_DENIED user=%s email=%s path=%s",
                    getattr(request, "username", "?"), user.email, request.path,
                )
                return JsonResponse({"error": "Admin access required"}, status=403)
        except User.DoesNotExist:
            return JsonResponse({"error": "User not found"}, status=404)
        logger.info("ADMIN_ACCESS user=%s path=%s", getattr(request, "username", "?"), request.path)
        return view_func(request, *args, **kwargs)
    return wrapper


@csrf_exempt
@require_admin
def admin_summary(request):
    """
    GET /api/admin/summary/
    Per-org and per-user rollup for the admin dashboard.
    """
    if request.method != "GET":
        return JsonResponse({"error": "GET required"}, status=405)

    orgs = []
    for org in Organization.objects.all().order_by("name"):
        logs = ActivityLog.objects.filter(organization=org)
        last = logs.order_by("-created_at").values_list("created_at", flat=True).first()
        orgs.append({
            "id":            str(org.id),
            "name":          org.name,
            "created_at":    org.created_at.isoformat(),
            "member_count":  org.members.count(),
            "total_actions": logs.count(),
            "report_runs":   logs.filter(action="report_run", status="completed").count(),
            "repo_scans":    ScanResult.objects.filter(organization=org).count(),
            "cmdb_imports":  logs.filter(action="cmdb_import", status="completed").count(),
            "last_active":   last.isoformat() if last else None,
        })

    users = []
    for profile in UserProfile.objects.select_related("user", "organization").all():
        u = profile.user
        logs = ActivityLog.objects.filter(user=u)
        last = logs.order_by("-created_at").values_list("created_at", flat=True).first()
        users.append({
            "id":            str(u.pk),
            "username":      u.username,
            "email":         u.email,
            "org_id":        str(profile.organization.id),
            "org_name":      profile.organization.name,
            "total_actions": logs.count(),
            "report_runs":   logs.filter(action="report_run").count(),
            "repo_scans":    logs.filter(action="repo_scan").count(),
            "last_active":   last.isoformat() if last else None,
        })

    return JsonResponse({"orgs": orgs, "users": users})


@csrf_exempt
@require_admin
def delete_user(request, user_id):
    """
    DELETE /api/admin/users/<user_id>/
    Permanently removes a user account and their profile.
    The org is preserved (historical data / other members may exist).
    Guards: cannot delete the admin@admin.com account or any other staff user.
    """
    if request.method != "DELETE":
        return JsonResponse({"error": "DELETE required"}, status=405)

    try:
        target = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return JsonResponse({"error": "User not found"}, status=404)

    if target.email.lower() == ADMIN_EMAIL:
        return JsonResponse({"error": "Cannot delete the admin account"}, status=403)

    if target.is_staff:
        return JsonResponse({"error": "Cannot delete a staff account"}, status=403)

    username = target.username
    email    = target.email

    # Note whether this leaves the org empty (useful for the UI to show a hint)
    org_now_empty = False
    try:
        org = target.profile.organization
        org_now_empty = org.members.exclude(user=target).count() == 0
    except UserProfile.DoesNotExist:
        pass

    target.delete()  # UserProfile cascades; ActivityLog/ScanResult FKs become NULL

    logger.info(
        "ADMIN_DELETE_USER by=%s target=%s email=%s",
        getattr(request, "username", "?"), username, email,
    )

    return JsonResponse({
        "message":       f"User '{username}' deleted.",
        "org_now_empty": org_now_empty,
    })


@csrf_exempt
@require_admin
def admin_activity(request):
    """
    GET /api/admin/activity/?org_id=<uuid>&action=<action>&limit=50&offset=0
    Paginated activity log, optionally filtered by org or action type.
    """
    if request.method != "GET":
        return JsonResponse({"error": "GET required"}, status=405)

    org_id  = request.GET.get("org_id")
    action  = request.GET.get("action")
    limit   = min(int(request.GET.get("limit",  50)), 200)
    offset  = int(request.GET.get("offset", 0))

    qs = ActivityLog.objects.select_related("organization").order_by("-created_at")
    if org_id:
        qs = qs.filter(organization_id=org_id)
    if action:
        qs = qs.filter(action=action)

    total   = qs.count()
    records = qs[offset: offset + limit]

    rows = [{
        "id":          str(r.id),
        "username":    r.username,
        "org_id":      str(r.organization_id),
        "org_name":    r.organization.name,
        "action":      r.action,
        "status":      r.status,
        "detail":      r.detail,
        "duration_ms": r.duration_ms,
        "created_at":  r.created_at.isoformat(),
    } for r in records]

    return JsonResponse({"total": total, "rows": rows})
