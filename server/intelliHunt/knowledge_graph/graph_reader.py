"""
Parameterized read queries for the Neo4j knowledge graph.

All queries that return org-specific data require an org_id parameter.
"""

import logging
from typing import Any

from .connection import get_session

logger = logging.getLogger("intelliHunt")


def get_software_for_org(org_id: str) -> list[dict]:
    """Return all Software nodes in an organization's stack."""
    with get_session() as session:
        result = session.run("""
            MATCH (s:Software)-[:PART_OF_STACK {org_id: $org_id}]->()
            RETURN s.vendor AS vendor, s.product AS product,
                   s.version AS version, s.created_at AS created_at
            ORDER BY s.vendor, s.product
        """, org_id=org_id)
        return [dict(r) for r in result]


def get_cves_for_software(org_id: str, vendor: str, product: str,
                          version: str = "*") -> list[dict]:
    """Return CVEs that AFFECT a specific Software node (org-scoped)."""
    with get_session() as session:
        result = session.run("""
            MATCH (c:CVE)-[r:AFFECTS {org_id: $org_id}]->(s:Software {
                org_id: $org_id, vendor: $vendor, product: $product, version: $version
            })
            RETURN c.cve_id AS cve_id, c.description AS description,
                   c.severity AS severity, c.cvss_score AS cvss_score,
                   c.epss_score AS epss_score, c.published AS published
            ORDER BY c.cvss_score DESC
        """, org_id=org_id, vendor=vendor.lower(), product=product.lower(),
             version=version)
        return [dict(r) for r in result]


def get_dependencies(org_id: str, vendor: str, product: str,
                     version: str = "*", depth: int = 3) -> list[dict]:
    """Return the dependency chain for a Software node (up to `depth` hops)."""
    with get_session() as session:
        result = session.run("""
            MATCH path = (s:Software {
                org_id: $org_id, vendor: $vendor, product: $product, version: $version
            })-[:DEPENDS_ON {org_id: $org_id}*1..%d]->(dep:Software)
            UNWIND nodes(path) AS node
            WITH DISTINCT node
            RETURN node.vendor AS vendor, node.product AS product,
                   node.version AS version
        """ % min(depth, 5), org_id=org_id, vendor=vendor.lower(),
             product=product.lower(), version=version)
        return [dict(r) for r in result]


def get_dependents(org_id: str, vendor: str, product: str,
                   version: str = "*") -> list[dict]:
    """Return Software nodes that depend on the given software (reverse deps)."""
    with get_session() as session:
        result = session.run("""
            MATCH (parent:Software)-[:DEPENDS_ON {org_id: $org_id}]->(s:Software {
                org_id: $org_id, vendor: $vendor, product: $product, version: $version
            })
            RETURN parent.vendor AS vendor, parent.product AS product,
                   parent.version AS version
        """, org_id=org_id, vendor=vendor.lower(), product=product.lower(),
             version=version)
        return [dict(r) for r in result]


def get_cve_detail(cve_id: str) -> dict[str, Any] | None:
    """Return full details for a single CVE node."""
    with get_session() as session:
        result = session.run("""
            MATCH (c:CVE {cve_id: $cve_id})
            OPTIONAL MATCH (c)-[:CLASSIFIED_AS]->(w:CWE)
            OPTIONAL MATCH (c)-[:TECHNIQUE_FOR]->(t:AttackTechnique)
            OPTIONAL MATCH (a:ThreatActor)-[:EXPLOITS]->(c)
            RETURN c.cve_id AS cve_id, c.description AS description,
                   c.severity AS severity, c.cvss_score AS cvss_score,
                   c.published AS published, c.epss_score AS epss_score,
                   collect(DISTINCT w.cwe_id) AS cwes,
                   collect(DISTINCT t.mitre_id) AS mitre_techniques,
                   collect(DISTINCT a.name) AS threat_actors
        """, cve_id=cve_id)
        row = result.single()
        return dict(row) if row else None


def get_cve_affected_software(cve_id: str, org_id: str) -> list[dict]:
    """Return Software in the org's stack affected by a CVE."""
    with get_session() as session:
        result = session.run("""
            MATCH (c:CVE {cve_id: $cve_id})-[:AFFECTS {org_id: $org_id}]->(s:Software)
            RETURN s.vendor AS vendor, s.product AS product, s.version AS version
        """, cve_id=cve_id, org_id=org_id)
        return [dict(r) for r in result]


def get_transitive_cve_exposure(org_id: str, vendor: str, product: str,
                                version: str = "*", depth: int = 3) -> list[dict]:
    """Find all CVEs that affect the software or any of its transitive deps."""
    with get_session() as session:
        result = session.run("""
            MATCH (root:Software {
                org_id: $org_id, vendor: $vendor, product: $product, version: $version
            })
            OPTIONAL MATCH (root)-[:DEPENDS_ON {org_id: $org_id}*0..%d]->(dep:Software)
            WITH DISTINCT dep
            MATCH (c:CVE)-[:AFFECTS {org_id: $org_id}]->(dep)
            RETURN DISTINCT c.cve_id AS cve_id, c.severity AS severity,
                   c.cvss_score AS cvss_score, dep.vendor AS dep_vendor,
                   dep.product AS dep_product, dep.version AS dep_version
            ORDER BY c.cvss_score DESC
        """ % min(depth, 5), org_id=org_id, vendor=vendor.lower(),
             product=product.lower(), version=version)
        return [dict(r) for r in result]


def get_threat_actors_for_org(org_id: str) -> list[dict]:
    """Return threat actors linked to CVEs affecting the org's software stack."""
    with get_session() as session:
        result = session.run("""
            MATCH (a:ThreatActor)-[:EXPLOITS]->(c:CVE)-[:AFFECTS {org_id: $org_id}]->(s:Software)
            RETURN DISTINCT a.name AS name,
                   collect(DISTINCT c.cve_id) AS cve_ids,
                   count(DISTINCT c) AS cve_count
            ORDER BY cve_count DESC
        """, org_id=org_id)
        return [dict(r) for r in result]


def search_cves_fulltext(query: str, limit: int = 20) -> list[dict]:
    """Full-text search across CVE descriptions."""
    with get_session() as session:
        result = session.run("""
            CALL db.index.fulltext.queryNodes('cve_description_ft', $query)
            YIELD node, score
            RETURN node.cve_id AS cve_id, node.description AS description,
                   node.severity AS severity, node.cvss_score AS cvss_score,
                   score
            ORDER BY score DESC
            LIMIT $limit
        """, query=query, limit=limit)
        return [dict(r) for r in result]


def get_neighborhood(node_type: str, node_id: str, depth: int = 1,
                     limit: int = 50) -> dict[str, Any]:
    """Return the neighborhood of a node for graph visualization.

    Returns {nodes: [...], edges: [...]}.
    """
    # Map node_type to label and key property
    type_map = {
        "software": ("Software", "product"),
        "cve": ("CVE", "cve_id"),
        "cwe": ("CWE", "cwe_id"),
        "threat_actor": ("ThreatActor", "name"),
        "attack_technique": ("AttackTechnique", "mitre_id"),
        "cpe": ("CPE", "cpe_name"),
    }

    if node_type not in type_map:
        return {"nodes": [], "edges": []}

    label, key_prop = type_map[node_type]
    depth = min(depth, 2)

    with get_session() as session:
        result = session.run(f"""
            MATCH (start:{label} {{{key_prop}: $node_id}})
            CALL apoc.path.subgraphAll(start, {{maxLevel: $depth, limit: $limit}})
            YIELD nodes, relationships
            RETURN nodes, relationships
        """, node_id=node_id, depth=depth, limit=limit)

        row = result.single()
        if not row:
            return {"nodes": [], "edges": []}

        nodes = []
        for n in row["nodes"]:
            nodes.append({
                "id": n.element_id,
                "labels": list(n.labels),
                "properties": dict(n),
            })

        edges = []
        for r in row["relationships"]:
            edges.append({
                "id": r.element_id,
                "type": r.type,
                "start": r.start_node.element_id,
                "end": r.end_node.element_id,
                "properties": dict(r),
            })

        return {"nodes": nodes, "edges": edges}
