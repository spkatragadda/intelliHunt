"""
Wiki index manager — maintains the equivalent of Karpathy's index.md.

Provides summary statistics and categorized entity listings.
"""

import logging
from collections import Counter

logger = logging.getLogger("intelliHunt")


def _get_models():
    from intelliHunt.reportApp.models import WikiPage, WikiLog
    return WikiPage, WikiLog


def get_wiki_index(org_id: str) -> dict:
    """Build the wiki index for an organization.

    Returns:
        Dict with {total_pages, by_type, hot_entities, last_updated, stats}
    """
    WikiPage, WikiLog = _get_models()

    pages = WikiPage.objects.filter(organization_id=org_id)
    total = pages.count()

    # Count by entity type
    by_type = dict(Counter(
        pages.values_list("entity_type", flat=True)
    ))

    # Hot entities (most recently updated)
    hot = list(pages.order_by("-last_refreshed")[:10].values(
        "entity_type", "entity_id", "title", "last_refreshed"
    ))
    for item in hot:
        item["last_refreshed"] = item["last_refreshed"].isoformat()

    # Last log entries
    recent_logs = list(WikiLog.objects.filter(
        organization_id=org_id
    ).order_by("-created_at")[:10].values(
        "operation", "title", "created_at"
    ))
    for log in recent_logs:
        log["created_at"] = log["created_at"].isoformat()

    return {
        "total_pages": total,
        "by_type": by_type,
        "hot_entities": hot,
        "recent_activity": recent_logs,
    }
