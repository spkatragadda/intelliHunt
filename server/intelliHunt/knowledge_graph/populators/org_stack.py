"""
Single entry point for populating the knowledge graph + wiki from an
organization's CMDB YAML — regardless of how that YAML was produced
(CMDB integration import, EDR/security-tooling sync, or user YAML upload).

All write paths that produce or modify the per-tenant ``organization_cmdb.yaml``
should call ``populate_org_stack(org_id, yaml_path)`` so the graph and wiki
stay in sync with the source of truth.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from .cpe_populator import populate_graph_from_yaml

logger = logging.getLogger("intelliHunt")


def populate_org_stack(org_id: str, yaml_path: str,
                       trigger_source: str = "cmdb_sync",
                       generate_wiki: bool = True) -> dict[str, int]:
    """Populate the graph (and optionally regenerate wiki pages) from a YAML.

    Args:
        org_id: Organization UUID.
        yaml_path: Absolute path to the tenant's ``organization_cmdb.yaml``.
        trigger_source: Free-form label recorded on the GraphSyncStatus row
            so the admin can see what kicked the sync off (``cmdb_import``,
            ``yaml_upload``, ``manual_trigger``, ``report_run`` …).
        generate_wiki: When True, regenerate wiki pages for every Software
            node the populator wrote.

    Returns:
        ``{"software": N, "wiki_pages": M}``. On any failure, an empty-ish
        dict; the caller must not depend on this for control flow.
    """
    # Late imports keep this module importable even when Django/Neo4j are
    # not yet configured (e.g. during test collection).
    from intelliHunt.reportApp.models import GraphSyncStatus
    from ..connection import verify_connectivity

    counts: dict[str, int] = {"software": 0, "wiki_pages": 0}

    if not verify_connectivity():
        logger.warning("[org_stack] Neo4j unreachable — skipping sync for org %s", org_id)
        return counts

    sync = GraphSyncStatus.objects.create(
        organization_id=org_id,
        sync_type="incremental",
        status="running",
        started_at=datetime.now(timezone.utc),
    )

    try:
        graph_counts = populate_graph_from_yaml(org_id, yaml_path)
        counts["software"] = graph_counts.get("software", 0)

        if generate_wiki and counts["software"] > 0:
            from ..graph_reader import get_software_for_org
            from ..wiki.engine import ingest as wiki_ingest

            software = get_software_for_org(org_id)
            entity_ids = [
                f"{s['vendor']}:{s['product']}:{s.get('version', '*')}"
                for s in software
                if s.get("vendor") and s.get("product")
            ]
            if entity_ids:
                counts["wiki_pages"] = wiki_ingest(
                    org_id, "software", entity_ids, source=trigger_source,
                )

        sync.status = "completed"
        sync.nodes_created = counts["software"]
        sync.pages_updated = counts["wiki_pages"]
    except Exception as exc:
        sync.status = "error"
        sync.errors = str(exc)[:2000]
        logger.exception("[org_stack] sync failed for org %s", org_id)
    finally:
        sync.completed_at = datetime.now(timezone.utc)
        sync.save()

    logger.info("[org_stack] org=%s source=%s — %s", org_id, trigger_source, counts)
    return counts
