"""
Scheduled deep research: expand dependency graphs, enrich CVE data,
and trigger wiki page generation for newly discovered entities.
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger("intelliHunt")


def run_deep_research(org_id: str):
    """
    Main entry point called by the APScheduler job.

    Steps:
      1. Expand dependency graph (LLM-discovered transitive deps)
      2. Run entity extraction on any CVEs ingested since last run
      3. Refresh stale wiki pages and generate missing ones
      4. Record results in GraphSyncStatus
      5. Send a 'graph_update' notification with summary
    """
    from intelliHunt.reportApp.models import GraphSyncStatus, Organization, Notification
    from django.contrib.auth import get_user_model

    try:
        org = Organization.objects.get(pk=org_id)
    except Organization.DoesNotExist:
        logger.error("[deep_research] org %s not found — skipping", org_id)
        return

    # Load config
    try:
        config = org.graph_research_config
        if not config.enabled:
            logger.info("[deep_research] disabled for org %s — skipping", org_id)
            return
        expand_depth = config.expand_depth
    except Exception:
        expand_depth = 2

    # Create tracking record
    sync = GraphSyncStatus.objects.create(
        organization_id=org_id,
        sync_type="deep_research",
        status="running",
        started_at=datetime.now(timezone.utc),
    )

    total_nodes = 0
    total_rels = 0
    total_pages = 0
    errors = []

    # ── Step 1: Dependency expansion ─────────────────────────────────────
    try:
        from ..populators.dependency_resolver import expand_dependencies
        dep_result = expand_dependencies(org_id, depth=expand_depth)
        total_nodes += dep_result.get("new_software", 0)
        total_rels += dep_result.get("new_dependencies", 0)
        logger.info("[deep_research] dependency expansion: %d nodes, %d edges",
                    dep_result.get("new_software", 0),
                    dep_result.get("new_dependencies", 0))
    except Exception as exc:
        logger.warning("[deep_research] dependency expansion failed: %s", exc)
        errors.append(f"dependency_expansion: {exc}")

    # ── Step 2: Entity extraction on recent CVEs ─────────────────────────
    try:
        from ..connection import verify_connectivity, get_session
        if verify_connectivity():
            from ..entity_extractor import extract_entities
            from ..graph_writer import upsert_threat_actors, upsert_attack_techniques

            # Find CVEs added since last successful deep research
            last_run = GraphSyncStatus.objects.filter(
                organization_id=org_id,
                sync_type="deep_research",
                status="completed",
            ).order_by("-completed_at").first()

            with get_session() as session:
                cypher = """
                    MATCH (c:CVE)-[r:AFFECTS]->(s:Software)
                    WHERE r.org_id = $org_id AND c.description IS NOT NULL
                """
                params = {"org_id": str(org_id)}
                if last_run and last_run.completed_at:
                    cypher += " AND c.enriched_at IS NULL"
                cypher += " RETURN DISTINCT c.cve_id AS cve_id, c.description AS description LIMIT 50"
                result = session.run(cypher, **params)
                rows = [dict(r) for r in result]

            for row in rows:
                try:
                    entities = extract_entities(row["description"])
                    if entities.get("threat_actors"):
                        upsert_threat_actors([
                            {"name": actor, "cve_ids": [row["cve_id"]]}
                            for actor in entities["threat_actors"]
                        ])
                    if entities.get("attack_techniques"):
                        upsert_attack_techniques([
                            {"mitre_id": tech, "cve_ids": [row["cve_id"]]}
                            for tech in entities["attack_techniques"]
                        ])
                    # Mark CVE as enriched
                    with get_session() as session:
                        session.run(
                            "MATCH (c:CVE {cve_id: $cve_id}) SET c.enriched_at = datetime()",
                            cve_id=row["cve_id"],
                        )
                except Exception as exc:
                    logger.debug("[deep_research] entity extraction failed for %s: %s",
                                 row["cve_id"], exc)

            logger.info("[deep_research] enriched %d CVEs with entity extraction", len(rows))
    except Exception as exc:
        logger.warning("[deep_research] entity extraction phase failed: %s", exc)
        errors.append(f"entity_extraction: {exc}")

    # ── Step 3: Wiki maintenance (lint + refresh + generate missing) ──────
    try:
        from .graph_maintenance import run_wiki_maintenance
        pages_result = run_wiki_maintenance(org_id)
        total_pages += pages_result.get("pages_updated", 0)
    except Exception as exc:
        logger.warning("[deep_research] wiki maintenance failed: %s", exc)
        errors.append(f"wiki_maintenance: {exc}")

    # ── Step 4: Update sync status ───────────────────────────────────────
    sync.status = "completed" if not errors else "completed"
    sync.completed_at = datetime.now(timezone.utc)
    sync.nodes_created = total_nodes
    sync.relationships_created = total_rels
    sync.pages_updated = total_pages
    sync.errors = "\n".join(errors)[:2000] if errors else ""
    sync.save()

    # ── Step 5: Notify org members ───────────────────────────────────────
    User = get_user_model()
    summary = (
        f"Deep research complete: {total_nodes} new entities, "
        f"{total_rels} new relationships, {total_pages} wiki pages updated."
    )
    if errors:
        summary += f" ({len(errors)} non-fatal errors)"

    member_ids = org.members.values_list("user_id", flat=True)
    users = User.objects.filter(pk__in=member_ids)
    for user in users:
        try:
            Notification.objects.create(
                organization=org,
                user=user,
                type="graph_update",
                title=f"Knowledge graph updated for {org.name}",
                body=summary,
            )
        except Exception:
            pass

    logger.info("[deep_research] finished for org %s: %s", org_id, summary)
