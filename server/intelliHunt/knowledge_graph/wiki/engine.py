"""
Karpathy-style Knowledge Wiki engine.

Three core operations:
- Ingest: process new data, update affected wiki pages
- Query: search wiki + graph, synthesize answers
- Lint: find stale pages, contradictions, orphans
"""

import hashlib
import json
import logging

from django.db import transaction

from ..graph_reader import (
    get_cves_for_software,
    get_dependencies,
    get_dependents,
    get_cve_detail,
    get_cve_affected_software,
    get_threat_actors_for_org,
    search_cves_fulltext,
)
from .page_generator import generate_page

logger = logging.getLogger("intelliHunt")


def _get_models():
    """Late import to avoid circular dependency with Django models."""
    from intelliHunt.reportApp.models import WikiPage, WikiLog
    return WikiPage, WikiLog


def _fingerprint(content: str, title: str, links: list[str]) -> str:
    """Fingerprint the rendered page so the hash changes iff the page would.

    The hash is derived from the exact output of ``generate_page`` —
    rendered markdown, title, and the deduplicated/sorted links list.
    Two ingests producing identical bytes get identical fingerprints,
    regardless of wall-clock time. Used for cache-invalidation + lint.
    """
    payload = "\x1f".join([
        content,
        title,
        "\n".join(sorted(set(links))),
    ])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# ── Ingest ───────────────────────────────────────────────────────────────────

def ingest(org_id: str, entity_type: str, entity_ids: list[str],
           source: str = "pipeline") -> int:
    """Process new data by regenerating affected wiki pages.

    Args:
        org_id: Organization UUID.
        entity_type: Type of entities being ingested (software, cve, etc.).
        entity_ids: List of entity IDs that were updated.
        source: What triggered the ingest (pipeline, scan, deep_research).

    Returns:
        Number of pages updated.
    """
    WikiPage, WikiLog = _get_models()
    pages_updated = 0

    for entity_id in entity_ids:
        try:
            content, title, links = generate_page(org_id, entity_type, entity_id)
            ctx_hash = _fingerprint(content, title, links)

            with transaction.atomic():
                page, created = WikiPage.objects.update_or_create(
                    organization_id=org_id,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    defaults={
                        "title": title,
                        "content_markdown": content,
                        "links_to": links,
                        "graph_context_hash": ctx_hash,
                    },
                )
            pages_updated += 1

        except Exception as exc:
            logger.warning("wiki.ingest: failed for %s:%s — %s",
                           entity_type, entity_id, exc)

    # Log the ingest operation
    if pages_updated > 0:
        WikiLog.objects.create(
            organization_id=org_id,
            operation="ingest",
            title=f"Ingested {pages_updated} {entity_type} pages from {source}",
            detail=json.dumps({"entity_ids": entity_ids[:20], "source": source}),
            pages_affected=entity_ids[:50],
        )

    logger.info("wiki.ingest: org=%s type=%s — %d pages updated",
                org_id, entity_type, pages_updated)
    return pages_updated


# ── Query ────────────────────────────────────────────────────────────────────

def query(org_id: str, question: str, limit: int = 10) -> dict:
    """Search wiki pages and return relevant results.

    Args:
        org_id: Organization UUID.
        question: Natural language query.
        limit: Max results to return.

    Returns:
        Dict with {pages: [...], graph_results: [...]}.
    """
    WikiPage, WikiLog = _get_models()

    # Search wiki pages by content
    pages = WikiPage.objects.filter(
        organization_id=org_id,
        content_markdown__icontains=question[:100],
    ).order_by("-last_refreshed")[:limit]

    page_results = [{
        "entity_type": p.entity_type,
        "entity_id": p.entity_id,
        "title": p.title,
        "excerpt": p.content_markdown[:500],
        "last_refreshed": p.last_refreshed.isoformat(),
    } for p in pages]

    # Also search the graph directly
    graph_results = search_cves_fulltext(question, limit=limit)

    # Log the query
    WikiLog.objects.create(
        organization_id=org_id,
        operation="query",
        title=f"Query: {question[:200]}",
        detail=json.dumps({"results_count": len(page_results)}),
    )

    return {"pages": page_results, "graph_results": graph_results}


# ── Lint ─────────────────────────────────────────────────────────────────────

def lint(org_id: str) -> dict:
    """Health-check the wiki for stale pages, orphans, and missing pages.

    Returns:
        Dict with {stale: [...], orphaned: [...], missing: [...], total_checked: int}
    """
    WikiPage, WikiLog = _get_models()

    stale = []
    orphaned = []
    missing = []

    # Find stale pages: re-render and compare fingerprint. A page is stale
    # iff regenerating it now would produce different bytes than what's stored.
    for page in WikiPage.objects.filter(organization_id=org_id):
        try:
            content, title, links = generate_page(
                org_id, page.entity_type, page.entity_id,
            )
        except Exception as exc:
            logger.debug("wiki.lint: regenerate failed for %s:%s — %s",
                         page.entity_type, page.entity_id, exc)
            continue

        current_hash = _fingerprint(content, title, links)
        if page.graph_context_hash != current_hash:
            stale.append({
                "entity_type": page.entity_type,
                "entity_id": page.entity_id,
                "title": page.title,
            })

    # Find missing pages (graph entities without wiki pages)
    from ..graph_reader import get_software_for_org
    stack_software = get_software_for_org(org_id)
    existing_sw_pages = set(
        WikiPage.objects.filter(
            organization_id=org_id, entity_type="software"
        ).values_list("entity_id", flat=True)
    )

    for sw in stack_software:
        entity_id = f"{sw['vendor']}:{sw['product']}:{sw['version']}"
        if entity_id not in existing_sw_pages:
            missing.append({
                "entity_type": "software",
                "entity_id": entity_id,
                "title": f"{sw['vendor']} {sw['product']} {sw['version']}",
            })

    total_checked = WikiPage.objects.filter(organization_id=org_id).count()

    # Log the lint operation
    WikiLog.objects.create(
        organization_id=org_id,
        operation="lint",
        title=f"Lint: {len(stale)} stale, {len(missing)} missing",
        detail=json.dumps({
            "stale_count": len(stale),
            "orphaned_count": len(orphaned),
            "missing_count": len(missing),
        }),
    )

    logger.info("wiki.lint: org=%s — stale=%d, orphaned=%d, missing=%d",
                org_id, len(stale), len(orphaned), len(missing))

    return {
        "stale": stale[:50],
        "orphaned": orphaned[:50],
        "missing": missing[:50],
        "total_checked": total_checked,
    }
