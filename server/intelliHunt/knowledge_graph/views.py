"""
Knowledge Graph API endpoints (non-wiki).

Graph statistics, neighborhood queries, and sync status.
"""

import json
import logging
import threading
from datetime import datetime, timezone

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
    org_id = request.org_id

    # Create sync status record
    sync = GraphSyncStatus.objects.create(
        organization_id=org_id,
        sync_type="incremental",
        status="running",
        started_at=datetime.now(timezone.utc),
    )

    def _run_sync():
        try:
            from .populators.cpe_populator import populate_graph_from_yaml
            counts = populate_graph_from_yaml(org_id)
            sync.nodes_created = counts.get("software", 0)
            sync.status = "completed"
        except Exception as exc:
            sync.status = "error"
            sync.errors = str(exc)[:2000]
            logger.exception("Manual graph sync failed for org %s", org_id)
        finally:
            sync.completed_at = datetime.now(timezone.utc)
            sync.save()

    thread = threading.Thread(target=_run_sync, daemon=True)
    thread.start()

    return JsonResponse({
        "sync_id": str(sync.id),
        "status": "running",
        "message": "Graph sync started",
    })
