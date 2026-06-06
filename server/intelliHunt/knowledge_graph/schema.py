"""
Neo4j schema initialisation — constraints, indexes, and vector indexes.

Run via: python manage.py init_graph_schema
"""

import logging

from .connection import get_session

logger = logging.getLogger("intelliHunt")

# Cypher statements executed in order. Each is idempotent (IF NOT EXISTS).
_SCHEMA_STATEMENTS = [
    # ── Node uniqueness constraints ──────────────────────────────────────────
    "CREATE CONSTRAINT cve_id_unique IF NOT EXISTS FOR (n:CVE) REQUIRE n.cve_id IS UNIQUE",
    "CREATE CONSTRAINT cwe_id_unique IF NOT EXISTS FOR (n:CWE) REQUIRE n.cwe_id IS UNIQUE",
    "CREATE CONSTRAINT cpe_name_unique IF NOT EXISTS FOR (n:CPE) REQUIRE n.cpe_name IS UNIQUE",
    "CREATE CONSTRAINT threat_actor_name_unique IF NOT EXISTS FOR (n:ThreatActor) REQUIRE n.name IS UNIQUE",
    "CREATE CONSTRAINT attack_technique_id_unique IF NOT EXISTS FOR (n:AttackTechnique) REQUIRE n.mitre_id IS UNIQUE",

    # ── Software composite index (not a uniqueness constraint because the
    #    same vendor+product+version can appear in multiple orgs) ─────────────
    "CREATE INDEX software_org_vendor_product IF NOT EXISTS FOR (n:Software) ON (n.org_id, n.vendor, n.product, n.version)",
    "CREATE INDEX software_vendor_product IF NOT EXISTS FOR (n:Software) ON (n.vendor, n.product)",

    # ── Advisory composite uniqueness ────────────────────────────────────────
    "CREATE CONSTRAINT advisory_id_source_unique IF NOT EXISTS FOR (n:Advisory) REQUIRE (n.advisory_id, n.source) IS UNIQUE",

    # ── Full-text search index on CVE descriptions ───────────────────────────
    """
    CREATE FULLTEXT INDEX cve_description_ft IF NOT EXISTS
    FOR (n:CVE) ON EACH [n.description]
    """,

    # ── Relationship property indexes for org-scoped traversals ──────────────
    "CREATE INDEX affects_org IF NOT EXISTS FOR ()-[r:AFFECTS]-() ON (r.org_id)",
    "CREATE INDEX depends_on_org IF NOT EXISTS FOR ()-[r:DEPENDS_ON]-() ON (r.org_id)",
    "CREATE INDEX part_of_stack_org IF NOT EXISTS FOR ()-[r:PART_OF_STACK]-() ON (r.org_id)",
]


def init_schema():
    """Create all constraints and indexes. Safe to call repeatedly."""
    with get_session() as session:
        for stmt in _SCHEMA_STATEMENTS:
            try:
                session.run(stmt.strip())
                logger.info("Schema OK: %s", stmt.strip()[:80])
            except Exception as exc:
                logger.warning("Schema statement failed (may already exist): %s — %s",
                               stmt.strip()[:80], exc)


def drop_all_data(confirm: bool = False):
    """Remove ALL nodes and relationships. Use only for testing."""
    if not confirm:
        raise RuntimeError("Pass confirm=True to wipe the graph")
    with get_session() as session:
        session.run("MATCH (n) DETACH DELETE n")
        logger.warning("All graph data deleted")
