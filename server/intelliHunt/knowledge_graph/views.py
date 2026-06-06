"""
Knowledge Graph API endpoints (non-wiki).

Graph statistics, neighborhood queries, and sync status.
"""

import json
import logging
import threading

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from intelliHunt.reportApp.auth import require_auth
from intelliHunt.reportApp.models import GraphResearchConfig, GraphSyncStatus

from .connection import verify_connectivity
from .graph_writer import get_graph_stats
from .graph_reader import get_neighborhood, get_software_for_org, get_threat_actors_for_org

logger = logging.getLogger("intelliHunt")


@require_auth
@require_http_methods(["GET"])
def graph_stats(request):
    """GET /api/graph/stats/ — Node and relationship counts for the org."""
    org_id = request.org_id

    if not verify_connectivity():
        return JsonResponse({"error": "Knowledge graph is not available"}, status=503)

    stats = get_graph_stats(org_id)

    # Add wiki page count
    from .wiki.index_manager import get_wiki_index
    wiki = get_wiki_index(org_id)

    return JsonResponse({
        "graph": stats,
        "wiki_pages": wiki["total_pages"],
        "wiki_by_type": wiki["by_type"],
        "connected": True,
    })


@require_auth
@require_http_methods(["GET"])
def node_neighbors(request, node_type, node_id):
    """GET /api/graph/neighbors/<node_type>/<node_id>/ — Node neighborhood for visualization."""
    depth = min(int(request.GET.get("depth", 1)), 2)
    limit = min(int(request.GET.get("limit", 50)), 100)

    result = get_neighborhood(node_type, node_id, depth=depth, limit=limit)
    return JsonResponse(result)


@require_auth
@require_http_methods(["GET"])
def graph_software(request):
    """GET /api/graph/software/ — All software in the org's stack."""
    org_id = request.org_id
    software = get_software_for_org(org_id)
    return JsonResponse({"software": software})


@require_auth
@require_http_methods(["GET"])
def graph_threat_actors(request):
    """GET /api/graph/threat-actors/ — Threat actors linked to the org's stack."""
    org_id = request.org_id
    actors = get_threat_actors_for_org(org_id)
    return JsonResponse({"threat_actors": actors})


@require_auth
@require_http_methods(["GET"])
def sync_status(request):
    """GET /api/graph/sync/ — Recent graph sync statuses."""
    org_id = request.org_id
    statuses = list(GraphSyncStatus.objects.filter(
        organization_id=org_id,
    ).order_by("-started_at")[:10].values())

    for s in statuses:
        s["id"] = str(s["id"])
        s["organization_id"] = str(s["organization_id"])
        if s.get("started_at"):
            s["started_at"] = s["started_at"].isoformat()
        if s.get("completed_at"):
            s["completed_at"] = s["completed_at"].isoformat()

    return JsonResponse({"statuses": statuses})


_RESEARCH_DEFAULTS = {
    "enabled": False,
    "frequency": "weekly",
    "day_of_week": 0,
    "hour": 2,
    "expand_depth": 2,
}

_VALID_FREQUENCIES = {"daily", "weekly", "biweekly"}


@csrf_exempt
@require_auth
@require_http_methods(["GET", "PUT"])
def graph_research_config(request):
    """
    GET  /api/graph/research-config/  — current config (or defaults if unset).
    PUT  /api/graph/research-config/  — upsert + push to the live scheduler.

    Body (PUT) — all optional, merged onto the existing row:
      { enabled, frequency, day_of_week, hour, expand_depth }
    """
    org_id = request.org_id

    if request.method == "GET":
        try:
            cfg = GraphResearchConfig.objects.get(organization_id=org_id)
        except GraphResearchConfig.DoesNotExist:
            return JsonResponse(_RESEARCH_DEFAULTS)
        return JsonResponse({
            "enabled":      cfg.enabled,
            "frequency":    cfg.frequency,
            "day_of_week":  cfg.day_of_week,
            "hour":         cfg.hour,
            "expand_depth": cfg.expand_depth,
        })

    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, TypeError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    if "frequency" in data and data["frequency"] not in _VALID_FREQUENCIES:
        return JsonResponse(
            {"error": f"frequency must be one of {sorted(_VALID_FREQUENCIES)}"},
            status=400,
        )
    if "day_of_week" in data and not 0 <= int(data["day_of_week"]) <= 6:
        return JsonResponse({"error": "day_of_week must be 0-6"}, status=400)
    if "hour" in data and not 0 <= int(data["hour"]) <= 23:
        return JsonResponse({"error": "hour must be 0-23"}, status=400)
    if "expand_depth" in data and not 1 <= int(data["expand_depth"]) <= 5:
        return JsonResponse({"error": "expand_depth must be 1-5"}, status=400)

    cfg, _ = GraphResearchConfig.objects.get_or_create(organization_id=org_id)
    if "enabled" in data:      cfg.enabled      = bool(data["enabled"])
    if "frequency" in data:    cfg.frequency    = data["frequency"]
    if "day_of_week" in data:  cfg.day_of_week  = int(data["day_of_week"])
    if "hour" in data:         cfg.hour         = int(data["hour"])
    if "expand_depth" in data: cfg.expand_depth = int(data["expand_depth"])
    cfg.save()

    # Push to the running APScheduler if this process has a reference
    # (only the scheduler process; gunicorn workers no-op silently).
    try:
        from intelliHunt.reportApp import _scheduler_ref
        if _scheduler_ref.scheduler is not None:
            from intelliHunt.reportApp.schedule_sync import upsert_deep_research_job
            upsert_deep_research_job(_scheduler_ref.scheduler, cfg)
    except Exception:
        logger.exception("[graph_research_config] live scheduler sync failed for org %s", org_id)

    return JsonResponse({
        "status":       "saved",
        "enabled":      cfg.enabled,
        "frequency":    cfg.frequency,
        "day_of_week":  cfg.day_of_week,
        "hour":         cfg.hour,
        "expand_depth": cfg.expand_depth,
    })


@require_auth
@require_http_methods(["POST"])
def trigger_sync(request):
    """POST /api/graph/sync/trigger/ — Trigger a manual graph sync."""
    org_id = str(request.org_id)

    # Resolve the per-tenant YAML — populate_org_stack records its own
    # GraphSyncStatus row, so we don't pre-create one here.
    from intelliHunt.reportApp.auth import tenant_path
    yaml_path = tenant_path(org_id, "organization_cmdb.yaml")

    def _run_sync():
        try:
            from .populators.org_stack import populate_org_stack
            populate_org_stack(org_id, yaml_path, trigger_source="manual_trigger")
        except Exception:
            logger.exception("Manual graph sync failed for org %s", org_id)

    threading.Thread(target=_run_sync, daemon=True).start()

    return JsonResponse({
        "status": "running",
        "message": "Graph sync started",
    })
