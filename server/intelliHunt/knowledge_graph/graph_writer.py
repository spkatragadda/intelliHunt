"""
Batch upsert operations for the Neo4j knowledge graph.

All writes use MERGE for idempotency and UNWIND for batch efficiency.
Every org-scoped operation requires an org_id parameter.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from .connection import get_session

logger = logging.getLogger("intelliHunt")

_BATCH_SIZE = 500


def _run_batch(cypher: str, rows: list[dict], label: str) -> int:
    """Execute a batched UNWIND statement. Returns rows processed."""
    total = 0
    with get_session() as session:
        for i in range(0, len(rows), _BATCH_SIZE):
            batch = rows[i : i + _BATCH_SIZE]
            session.run(cypher, rows=batch)
            total += len(batch)
    logger.info("graph_writer.%s: upserted %d rows", label, total)
    return total


# ── Software nodes ───────────────────────────────────────────────────────────

def upsert_software_nodes(org_id: str, software_list: list[dict]) -> int:
    """Upsert Software nodes and create PART_OF_STACK relationships.

    Each item in software_list: {vendor, product, version (optional)}
    """
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for sw in software_list:
        vendor = (sw.get("vendor") or "").strip().lower()
        product = (sw.get("product") or "").strip().lower()
        version = (sw.get("version") or "*").strip()
        if not vendor or not product:
            continue
        rows.append({
            "org_id": org_id,
            "vendor": vendor,
            "product": product,
            "version": version,
            "added_at": now,
        })

    if not rows:
        return 0

    cypher = """
    UNWIND $rows AS row
    MERGE (s:Software {org_id: row.org_id, vendor: row.vendor,
                       product: row.product, version: row.version})
    ON CREATE SET s.created_at = row.added_at
    MERGE (s)-[r:PART_OF_STACK {org_id: row.org_id}]->(s)
    ON CREATE SET r.added_at = row.added_at
    """
    return _run_batch(cypher, rows, "upsert_software_nodes")


# ── CVE nodes ────────────────────────────────────────────────────────────────

def upsert_cve_nodes(cve_list: list[dict]) -> int:
    """Upsert global CVE nodes.

    Each item: {cve_id, description, severity, cvss_score, published, epss_score}
    """
    rows = []
    for cve in cve_list:
        cve_id = (cve.get("cve_id") or "").strip()
        if not cve_id:
            continue
        rows.append({
            "cve_id": cve_id,
            "description": (cve.get("description") or "")[:2000],
            "severity": cve.get("severity") or "UNKNOWN",
            "cvss_score": cve.get("cvss_score"),
            "published": cve.get("published") or "",
            "epss_score": cve.get("epss_score"),
            "epss_percentile": cve.get("epss_percentile"),
        })

    if not rows:
        return 0

    cypher = """
    UNWIND $rows AS row
    MERGE (c:CVE {cve_id: row.cve_id})
    SET c.description    = row.description,
        c.severity       = row.severity,
        c.cvss_score     = row.cvss_score,
        c.published      = row.published,
        c.epss_score     = row.epss_score,
        c.epss_percentile = row.epss_percentile
    """
    return _run_batch(cypher, rows, "upsert_cve_nodes")


# ── CWE nodes ────────────────────────────────────────────────────────────────

def upsert_cwe_nodes(cwe_list: list[dict]) -> int:
    """Upsert global CWE nodes.

    Each item: {cwe_id, name (optional), description (optional)}
    """
    rows = []
    for cwe in cwe_list:
        cwe_id = (cwe.get("cwe_id") or "").strip()
        if not cwe_id:
            continue
        rows.append({
            "cwe_id": cwe_id,
            "name": cwe.get("name") or "",
            "description": (cwe.get("description") or "")[:1000],
        })

    if not rows:
        return 0

    cypher = """
    UNWIND $rows AS row
    MERGE (w:CWE {cwe_id: row.cwe_id})
    SET w.name = CASE WHEN row.name <> '' THEN row.name ELSE w.name END,
        w.description = CASE WHEN row.description <> '' THEN row.description ELSE w.description END
    """
    return _run_batch(cypher, rows, "upsert_cwe_nodes")


# ── CPE nodes ────────────────────────────────────────────────────────────────

def upsert_cpe_nodes(cpe_list: list[dict]) -> int:
    """Upsert global CPE nodes.

    Each item: {cpe_name, vendor, product, version}
    """
    rows = [c for c in cpe_list if c.get("cpe_name")]
    if not rows:
        return 0

    cypher = """
    UNWIND $rows AS row
    MERGE (p:CPE {cpe_name: row.cpe_name})
    SET p.vendor  = row.vendor,
        p.product = row.product,
        p.version = row.version
    """
    return _run_batch(cypher, rows, "upsert_cpe_nodes")


# ── Threat actor nodes ───────────────────────────────────────────────────────

def upsert_threat_actors(actors: list[dict]) -> int:
    """Upsert ThreatActor nodes and EXPLOITS relationships to CVEs.

    Each item: {name, cve_ids: [...], confidence (optional)}
    """
    rows = []
    for actor in actors:
        name = (actor.get("name") or "").strip()
        if not name:
            continue
        for cve_id in actor.get("cve_ids") or []:
            rows.append({
                "name": name,
                "cve_id": cve_id,
                "confidence": actor.get("confidence") or "medium",
            })

    if not rows:
        return 0

    cypher = """
    UNWIND $rows AS row
    MERGE (a:ThreatActor {name: row.name})
    WITH a, row
    MATCH (c:CVE {cve_id: row.cve_id})
    MERGE (a)-[r:EXPLOITS]->(c)
    SET r.confidence = row.confidence
    """
    return _run_batch(cypher, rows, "upsert_threat_actors")


# ── Attack technique nodes ───────────────────────────────────────────────────

def upsert_attack_techniques(techniques: list[dict]) -> int:
    """Upsert AttackTechnique nodes and TECHNIQUE_FOR relationships.

    Each item: {mitre_id, name (optional), cve_ids: [...]}
    """
    rows = []
    for tech in techniques:
        mitre_id = (tech.get("mitre_id") or "").strip()
        if not mitre_id:
            continue
        for cve_id in tech.get("cve_ids") or []:
            rows.append({
                "mitre_id": mitre_id,
                "name": tech.get("name") or "",
                "cve_id": cve_id,
            })

    if not rows:
        return 0

    cypher = """
    UNWIND $rows AS row
    MERGE (t:AttackTechnique {mitre_id: row.mitre_id})
    SET t.name = CASE WHEN row.name <> '' THEN row.name ELSE t.name END
    WITH t, row
    MATCH (c:CVE {cve_id: row.cve_id})
    MERGE (c)-[:TECHNIQUE_FOR]->(t)
    """
    return _run_batch(cypher, rows, "upsert_attack_techniques")


# ── Relationship helpers ─────────────────────────────────────────────────────

def create_affects_edges(org_id: str, pairs: list[dict]) -> int:
    """Create org-scoped AFFECTS relationships (CVE → Software).

    Each pair: {cve_id, vendor, product, version, severity, cvss_score}
    """
    rows = []
    for p in pairs:
        cve_id = (p.get("cve_id") or "").strip()
        vendor = (p.get("vendor") or "").strip().lower()
        product = (p.get("product") or "").strip().lower()
        if not cve_id or not vendor or not product:
            continue
        rows.append({
            "org_id": org_id,
            "cve_id": cve_id,
            "vendor": vendor,
            "product": product,
            "version": (p.get("version") or "*").strip(),
            "severity": p.get("severity") or "UNKNOWN",
            "cvss_score": p.get("cvss_score"),
        })

    if not rows:
        return 0

    cypher = """
    UNWIND $rows AS row
    MATCH (c:CVE {cve_id: row.cve_id})
    MATCH (s:Software {org_id: row.org_id, vendor: row.vendor,
                       product: row.product, version: row.version})
    MERGE (c)-[r:AFFECTS {org_id: row.org_id}]->(s)
    SET r.severity   = row.severity,
        r.cvss_score = row.cvss_score
    """
    return _run_batch(cypher, rows, "create_affects_edges")


def create_dependency_edges(org_id: str, deps: list[dict]) -> int:
    """Create org-scoped DEPENDS_ON relationships (Software → Software).

    Each dep: {from_vendor, from_product, from_version,
               to_vendor, to_product, to_version, dependency_type}
    """
    rows = []
    for d in deps:
        fv = (d.get("from_vendor") or "").strip().lower()
        fp = (d.get("from_product") or "").strip().lower()
        tv = (d.get("to_vendor") or "").strip().lower()
        tp = (d.get("to_product") or "").strip().lower()
        if not fv or not fp or not tv or not tp:
            continue
        rows.append({
            "org_id": org_id,
            "from_vendor": fv,
            "from_product": fp,
            "from_version": (d.get("from_version") or "*").strip(),
            "to_vendor": tv,
            "to_product": tp,
            "to_version": (d.get("to_version") or "*").strip(),
            "dep_type": d.get("dependency_type") or "direct",
        })

    if not rows:
        return 0

    # Ensure the target software node exists (auto-create if new dependency)
    cypher = """
    UNWIND $rows AS row
    MERGE (src:Software {org_id: row.org_id, vendor: row.from_vendor,
                         product: row.from_product, version: row.from_version})
    MERGE (tgt:Software {org_id: row.org_id, vendor: row.to_vendor,
                         product: row.to_product, version: row.to_version})
    MERGE (src)-[r:DEPENDS_ON {org_id: row.org_id}]->(tgt)
    SET r.dependency_type = row.dep_type
    """
    return _run_batch(cypher, rows, "create_dependency_edges")


def create_classified_as_edges(pairs: list[dict]) -> int:
    """Create CLASSIFIED_AS relationships (CVE → CWE).

    Each pair: {cve_id, cwe_id}
    """
    rows = [p for p in pairs if p.get("cve_id") and p.get("cwe_id")]
    if not rows:
        return 0

    cypher = """
    UNWIND $rows AS row
    MATCH (c:CVE {cve_id: row.cve_id})
    MERGE (w:CWE {cwe_id: row.cwe_id})
    MERGE (c)-[:CLASSIFIED_AS]->(w)
    """
    return _run_batch(cypher, rows, "create_classified_as_edges")


def link_software_to_cpe(org_id: str, links: list[dict]) -> int:
    """Create HAS_CPE relationships (Software → CPE).

    Each link: {vendor, product, version, cpe_name}
    """
    rows = []
    for lnk in links:
        if not lnk.get("cpe_name"):
            continue
        rows.append({
            "org_id": org_id,
            "vendor": (lnk.get("vendor") or "").strip().lower(),
            "product": (lnk.get("product") or "").strip().lower(),
            "version": (lnk.get("version") or "*").strip(),
            "cpe_name": lnk["cpe_name"],
        })

    if not rows:
        return 0

    cypher = """
    UNWIND $rows AS row
    MATCH (s:Software {org_id: row.org_id, vendor: row.vendor,
                       product: row.product, version: row.version})
    MERGE (p:CPE {cpe_name: row.cpe_name})
    MERGE (s)-[:HAS_CPE]->(p)
    """
    return _run_batch(cypher, rows, "link_software_to_cpe")


# ── Stats ────────────────────────────────────────────────────────────────────

def get_graph_stats(org_id: str | None = None) -> dict[str, Any]:
    """Return node/relationship counts, optionally scoped to an org."""
    with get_session() as session:
        if org_id:
            result = session.run("""
                MATCH (s:Software {org_id: $org_id})
                WITH count(s) AS sw_count
                OPTIONAL MATCH ()-[r:AFFECTS {org_id: $org_id}]->()
                WITH sw_count, count(r) AS affects_count
                OPTIONAL MATCH ()-[d:DEPENDS_ON {org_id: $org_id}]->()
                RETURN sw_count, affects_count, count(d) AS dep_count
            """, org_id=org_id)
            row = result.single()
            return {
                "software_nodes": row["sw_count"],
                "affects_relationships": row["affects_count"],
                "dependency_relationships": row["dep_count"],
            }
        else:
            result = session.run("""
                MATCH (n) WITH labels(n) AS lbls, count(*) AS cnt
                UNWIND lbls AS lbl
                RETURN lbl, sum(cnt) AS total ORDER BY total DESC
            """)
            return {row["lbl"]: row["total"] for row in result}
