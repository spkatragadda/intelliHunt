"""
Knowledge Graph API endpoints (non-wiki).

Graph statistics, neighborhood queries, and sync status.
"""

import logging
import threading

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from intelliHunt.reportApp.auth import require_auth
from intelliHunt.reportApp.models import GraphSyncStatus

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
