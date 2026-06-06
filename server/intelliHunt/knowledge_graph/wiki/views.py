"""
Wiki API endpoints.

All endpoints require authentication and scope by organization.
"""

import json
import logging

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from intelliHunt.reportApp.auth import require_auth
from intelliHunt.reportApp.models import WikiPage, WikiLog

from .engine import ingest, query as wiki_query, lint
from .index_manager import get_wiki_index

logger = logging.getLogger("intelliHunt")


@require_auth
@require_http_methods(["GET"])
def wiki_index(request):
    """GET /api/wiki/ — Wiki index with summary stats and recent pages."""
    org_id = request.org_id
    index_data = get_wiki_index(org_id)
    return JsonResponse(index_data)


@require_auth
@require_http_methods(["GET"])
def wiki_list_by_type(request, entity_type):
    """GET /api/wiki/<entity_type>/ — List wiki pages filtered by type."""
    org_id = request.org_id
    page_num = int(request.GET.get("page", 1))
    page_size = min(int(request.GET.get("size", 20)), 100)
    offset = (page_num - 1) * page_size

    pages = WikiPage.objects.filter(
        organization_id=org_id,
        entity_type=entity_type,
    ).order_by("-last_refreshed")

    total = pages.count()
    items = list(pages[offset : offset + page_size].values(
        "entity_type", "entity_id", "title", "last_refreshed", "created_at"
    ))
    for item in items:
        item["last_refreshed"] = item["last_refreshed"].isoformat()
        item["created_at"] = item["created_at"].isoformat()

    return JsonResponse({
        "items": items,
        "total": total,
        "page": page_num,
        "page_size": page_size,
    })


@require_auth
@require_http_methods(["GET"])
def wiki_page_detail(request, entity_type, entity_id):
    """GET /api/wiki/<entity_type>/<entity_id>/ — Single wiki page."""
    org_id = request.org_id

    try:
        page = WikiPage.objects.get(
            organization_id=org_id,
            entity_type=entity_type,
            entity_id=entity_id,
        )
    except WikiPage.DoesNotExist:
        return JsonResponse({"error": "Wiki page not found"}, status=404)

    return JsonResponse({
        "entity_type": page.entity_type,
        "entity_id": page.entity_id,
        "title": page.title,
        "content_markdown": page.content_markdown,
        "links_to": page.links_to,
        "last_refreshed": page.last_refreshed.isoformat(),
        "created_at": page.created_at.isoformat(),
    })


@require_auth
@require_http_methods(["GET"])
def wiki_search(request):
    """GET /api/wiki/search/?q=<query> — Full-text search across wiki pages."""
    org_id = request.org_id
    q = request.GET.get("q", "").strip()
    if not q:
        return JsonResponse({"error": "Missing query parameter 'q'"}, status=400)

    limit = min(int(request.GET.get("limit", 20)), 50)
    results = wiki_query(org_id, q, limit=limit)
    return JsonResponse(results)


@require_auth
@require_http_methods(["GET"])
def wiki_log(request):
    """GET /api/wiki/log/ — Recent wiki operations."""
    org_id = request.org_id
    limit = min(int(request.GET.get("limit", 30)), 100)

    logs = list(WikiLog.objects.filter(
        organization_id=org_id,
    ).order_by("-created_at")[:limit].values(
        "operation", "title", "detail", "pages_affected", "created_at"
    ))
    for log in logs:
        log["created_at"] = log["created_at"].isoformat()

    return JsonResponse({"logs": logs})


@require_auth
@require_http_methods(["POST"])
def wiki_refresh_page(request, entity_type, entity_id):
    """POST /api/wiki/refresh/<entity_type>/<entity_id>/ — Force-refresh a page."""
    org_id = request.org_id

    updated = ingest(org_id, entity_type, [entity_id], source="manual_refresh")
    return JsonResponse({"pages_updated": updated})


@require_auth
@require_http_methods(["POST"])
def wiki_query_endpoint(request):
    """POST /api/wiki/query/ — Natural language query against the wiki."""
    org_id = request.org_id
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    question = body.get("question", "").strip()
    if not question:
        return JsonResponse({"error": "Missing 'question' field"}, status=400)

    results = wiki_query(org_id, question)
    return JsonResponse(results)
