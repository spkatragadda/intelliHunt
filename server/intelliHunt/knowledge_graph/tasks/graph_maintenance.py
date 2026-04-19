"""
Graph and wiki maintenance tasks: lint, prune stale nodes, refresh
wiki pages, and update embeddings.
"""

import logging

logger = logging.getLogger("intelliHunt")


def run_wiki_maintenance(org_id: str) -> dict:
    """
    Run the wiki Lint operation and refresh stale/missing pages.

    Returns:
        Dict with counts: pages_updated, pages_created, stale_found, missing_found.
    """
    result = {
        "pages_updated": 0,
        "pages_created": 0,
        "stale_found": 0,
        "missing_found": 0,
    }

    # Run lint to find stale and missing pages
    try:
        from ..wiki.engine import lint
        lint_result = lint(org_id)
        result["stale_found"] = len(lint_result.get("stale_pages", []))
        result["missing_found"] = len(lint_result.get("missing_pages", []))

        # Refresh stale pages
        from ..wiki.engine import ingest
        for page_info in lint_result.get("stale_pages", [])[:20]:
            try:
                ingest(
                    org_id,
                    page_info["entity_type"],
                    page_info["entity_id"],
                )
                result["pages_updated"] += 1
            except Exception as exc:
                logger.debug("Failed to refresh stale page %s/%s: %s",
                             page_info["entity_type"], page_info["entity_id"], exc)

        # Generate missing pages (limit to 30 per run to avoid overloading LLM)
        for page_info in lint_result.get("missing_pages", [])[:30]:
            try:
                ingest(
                    org_id,
                    page_info["entity_type"],
                    page_info["entity_id"],
                )
                result["pages_created"] += 1
            except Exception as exc:
                logger.debug("Failed to generate page %s/%s: %s",
                             page_info["entity_type"], page_info["entity_id"], exc)

    except Exception as exc:
        logger.warning("Wiki maintenance lint failed: %s", exc)

    logger.info("[graph_maintenance] wiki maintenance for org %s: %s", org_id, result)
    return result


def refresh_embeddings(org_id: str) -> int:
    """Re-embed CVEs whose descriptions changed since last embedding."""
    try:
        from ..connection import verify_connectivity, get_session
        from ..rag.vector_store import generate_embedding

        if not verify_connectivity():
            return 0

        # Find CVEs with stale or missing embeddings
        with get_session() as session:
            result = session.run("""
                MATCH (c:CVE)-[r:AFFECTS]->(s:Software)
                WHERE r.org_id = $org_id
                  AND c.description IS NOT NULL
                  AND c.embedding IS NULL
                RETURN DISTINCT c.cve_id AS cve_id, c.description AS description
                LIMIT 100
            """, org_id=str(org_id))
            rows = [dict(r) for r in result]

        count = 0
        for row in rows:
            embedding = generate_embedding(row["description"])
            if embedding:
                with get_session() as session:
                    session.run("""
                        MATCH (c:CVE {cve_id: $cve_id})
                        SET c.embedding = $embedding
                    """, cve_id=row["cve_id"], embedding=embedding)
                    count += 1

        logger.info("[graph_maintenance] refreshed %d embeddings for org %s", count, org_id)
        return count

    except Exception as exc:
        logger.warning("Embedding refresh failed: %s", exc)
        return 0


def prune_orphaned_nodes(org_id: str) -> int:
    """
    Remove Software nodes that are no longer part of any org's stack
    and have no relationships.
    """
    try:
        from ..connection import verify_connectivity, get_session

        if not verify_connectivity():
            return 0

        with get_session() as session:
            result = session.run("""
                MATCH (s:Software)
                WHERE NOT (s)-[:PART_OF_STACK]->()
                  AND NOT (s)<-[:AFFECTS]-()
                  AND NOT (s)-[:DEPENDS_ON]->()
                  AND NOT (s)<-[:DEPENDS_ON]-()
                DETACH DELETE s
                RETURN count(s) AS deleted
            """)
            deleted = result.single()["deleted"]

        if deleted:
            logger.info("[graph_maintenance] pruned %d orphaned Software nodes", deleted)
        return deleted

    except Exception as exc:
        logger.warning("Node pruning failed: %s", exc)
        return 0
