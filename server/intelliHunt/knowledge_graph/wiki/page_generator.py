"""
Generate wiki page markdown from graph data + optional LLM summarization.

Each entity type has its own template that assembles data from graph queries.
"""

import logging
from typing import Any

from ..graph_reader import (
    get_cves_for_software,
    get_dependencies,
    get_dependents,
    get_cve_detail,
    get_cve_affected_software,
    get_transitive_cve_exposure,
)

logger = logging.getLogger("intelliHunt")


def generate_page(org_id: str, entity_type: str,
                  entity_id: str) -> tuple[str, str, list[str]]:
    """Generate a wiki page for an entity.

    Args:
        org_id: Organization UUID.
        entity_type: One of software, cve, cwe, threat_actor.
        entity_id: The entity identifier.

    Returns:
        Tuple of (markdown_content, title, links_to_entity_ids).
    """
    generators = {
        "software": _generate_software_page,
        "cve": _generate_cve_page,
        "cwe": _generate_cwe_page,
        "threat_actor": _generate_threat_actor_page,
    }

    gen = generators.get(entity_type)
    if not gen:
        return f"# {entity_id}\n\nNo generator for entity type: {entity_type}", entity_id, []

    return gen(org_id, entity_id)


def _generate_software_page(org_id: str, entity_id: str) -> tuple[str, str, list[str]]:
    """Generate a wiki page for a Software entity.

    entity_id format: vendor:product:version
    """
    parts = entity_id.split(":", 2)
    if len(parts) < 2:
        return f"# {entity_id}\n\nInvalid software entity ID.", entity_id, []

    vendor = parts[0]
    product = parts[1]
    version = parts[2] if len(parts) > 2 else "*"
    title = f"{vendor.title()} {product.title()}"
    if version != "*":
        title += f" {version}"

    links = []
    lines = [f"# {title}", ""]

    # Known Vulnerabilities
    cves = get_cves_for_software(org_id, vendor, product, version)
    lines.append("## Known Vulnerabilities")
    lines.append("")
    if cves:
        lines.append("| CVE ID | Severity | CVSS | EPSS | Published |")
        lines.append("|--------|----------|------|------|-----------|")
        for cve in cves[:30]:
            cve_id = cve.get("cve_id") or "?"
            severity = cve.get("severity") or "?"
            cvss = cve.get("cvss_score") or "?"
            epss = cve.get("epss_score")
            epss_str = f"{float(epss) * 100:.1f}%" if epss is not None else "?"
            published = (cve.get("published") or "?")[:10]
            lines.append(f"| {cve_id} | {severity} | {cvss} | {epss_str} | {published} |")
            links.append(f"cve:{cve_id}")
        lines.append("")
    else:
        lines.append("*No known vulnerabilities affecting this software.*")
        lines.append("")

    # Dependencies
    deps = get_dependencies(org_id, vendor, product, version, depth=2)
    lines.append("## Dependencies")
    lines.append("")
    if deps:
        for dep in deps[:20]:
            dep_name = f"{dep['vendor']}/{dep['product']}"
            if dep.get("version") and dep["version"] != "*":
                dep_name += f" ({dep['version']})"
            lines.append(f"- {dep_name}")
            links.append(f"software:{dep['vendor']}:{dep['product']}:{dep.get('version', '*')}")
        lines.append("")
    else:
        lines.append("*No known dependencies.*")
        lines.append("")

    # Dependents (reverse)
    dependents = get_dependents(org_id, vendor, product, version)
    lines.append("## Depended On By")
    lines.append("")
    if dependents:
        for dep in dependents[:20]:
            dep_name = f"{dep['vendor']}/{dep['product']}"
            lines.append(f"- {dep_name}")
            links.append(f"software:{dep['vendor']}:{dep['product']}:{dep.get('version', '*')}")
        lines.append("")
    else:
        lines.append("*No software in your stack depends on this.*")
        lines.append("")

    # Transitive exposure
    exposure = get_transitive_cve_exposure(org_id, vendor, product, version, depth=2)
    if exposure:
        lines.append("## Transitive Vulnerability Exposure")
        lines.append("")
        lines.append("CVEs affecting this software's dependencies:")
        lines.append("")
        lines.append("| CVE ID | Severity | CVSS | Via Dependency |")
        lines.append("|--------|----------|------|----------------|")
        for exp in exposure[:20]:
            cve_id = exp.get("cve_id") or "?"
            via = f"{exp.get('dep_vendor', '?')}/{exp.get('dep_product', '?')}"
            lines.append(f"| {cve_id} | {exp.get('severity', '?')} | {exp.get('cvss_score', '?')} | {via} |")
            links.append(f"cve:{cve_id}")
        lines.append("")

    return "\n".join(lines), title, list(set(links))


def _generate_cve_page(org_id: str, entity_id: str) -> tuple[str, str, list[str]]:
    """Generate a wiki page for a CVE entity."""
    cve = get_cve_detail(entity_id)
    if not cve:
        return f"# {entity_id}\n\n*CVE not found in knowledge graph.*", entity_id, []

    title = entity_id
    links = []
    lines = [f"# {entity_id}", ""]

    # Details
    desc = cve.get("description") or "*No description available.*"
    lines.append(desc)
    lines.append("")

    severity = cve.get("severity") or "?"
    cvss = cve.get("cvss_score") or "?"
    epss = cve.get("epss_score")
    epss_str = f"{float(epss) * 100:.1f}%" if epss is not None else "N/A"
    published = (cve.get("published") or "?")[:10]

    lines.append(f"**Severity:** {severity} | **CVSS:** {cvss} | **EPSS:** {epss_str} | **Published:** {published}")
    lines.append("")

    # CWE Classification
    cwes = cve.get("cwes") or []
    if cwes:
        lines.append("## CWE Classification")
        lines.append("")
        for cwe_id in cwes:
            lines.append(f"- {cwe_id}")
            links.append(f"cwe:{cwe_id}")
        lines.append("")

    # Affected Software
    affected = get_cve_affected_software(entity_id, org_id)
    lines.append("## Affected Software in Your Stack")
    lines.append("")
    if affected:
        for sw in affected:
            name = f"{sw['vendor']}/{sw['product']}"
            if sw.get("version") and sw["version"] != "*":
                name += f" ({sw['version']})"
            lines.append(f"- {name}")
            links.append(f"software:{sw['vendor']}:{sw['product']}:{sw.get('version', '*')}")
        lines.append("")
    else:
        lines.append("*No software in your stack is directly affected.*")
        lines.append("")

    # Threat Intelligence
    actors = cve.get("threat_actors") or []
    techniques = cve.get("mitre_techniques") or []

    if actors:
        lines.append("## Threat Actors")
        lines.append("")
        for actor in actors:
            lines.append(f"- {actor}")
            links.append(f"threat_actor:{actor}")
        lines.append("")

    if techniques:
        lines.append("## MITRE ATT&CK Techniques")
        lines.append("")
        for tech in techniques:
            lines.append(f"- {tech}")
        lines.append("")

    return "\n".join(lines), title, list(set(links))


def _generate_cwe_page(org_id: str, entity_id: str) -> tuple[str, str, list[str]]:
    """Generate a wiki page for a CWE entity."""
    from ..connection import get_session

    title = entity_id
    links = []
    lines = [f"# {entity_id}", ""]

    # Get CWE details and related CVEs from graph
    with get_session() as session:
        result = session.run("""
            MATCH (w:CWE {cwe_id: $cwe_id})
            OPTIONAL MATCH (c:CVE)-[:CLASSIFIED_AS]->(w)
            RETURN w.name AS name, w.description AS description,
                   collect(c.cve_id) AS cve_ids
        """, cwe_id=entity_id)
        row = result.single()

    if not row:
        return f"# {entity_id}\n\n*CWE not found in knowledge graph.*", entity_id, []

    name = row.get("name") or ""
    if name:
        lines[0] = f"# {entity_id}: {name}"
        title = f"{entity_id}: {name}"

    desc = row.get("description") or ""
    if desc:
        lines.append(desc)
        lines.append("")

    cve_ids = row.get("cve_ids") or []
    if cve_ids:
        lines.append("## Related CVEs")
        lines.append("")
        for cve_id in cve_ids[:30]:
            lines.append(f"- {cve_id}")
            links.append(f"cve:{cve_id}")
        lines.append("")

    return "\n".join(lines), title, list(set(links))


def _generate_threat_actor_page(org_id: str, entity_id: str) -> tuple[str, str, list[str]]:
    """Generate a wiki page for a ThreatActor entity."""
    from ..connection import get_session

    title = entity_id
    links = []
    lines = [f"# {entity_id}", ""]

    with get_session() as session:
        result = session.run("""
            MATCH (a:ThreatActor {name: $name})
            OPTIONAL MATCH (a)-[:EXPLOITS]->(c:CVE)
            OPTIONAL MATCH (a)-[:USES_TECHNIQUE]->(t:AttackTechnique)
            RETURN collect(DISTINCT c.cve_id) AS cve_ids,
                   collect(DISTINCT t.mitre_id) AS technique_ids
        """, name=entity_id)
        row = result.single()

    if not row:
        return f"# {entity_id}\n\n*Threat actor not found in knowledge graph.*", entity_id, []

    cve_ids = row.get("cve_ids") or []
    technique_ids = row.get("technique_ids") or []

    if cve_ids:
        lines.append("## Exploited Vulnerabilities")
        lines.append("")
        for cve_id in cve_ids[:30]:
            lines.append(f"- {cve_id}")
            links.append(f"cve:{cve_id}")
        lines.append("")

    if technique_ids:
        lines.append("## MITRE ATT&CK Techniques")
        lines.append("")
        for tech in technique_ids:
            lines.append(f"- {tech}")
        lines.append("")

    # Show affected software in the org's stack
    with get_session() as session:
        result = session.run("""
            MATCH (a:ThreatActor {name: $name})-[:EXPLOITS]->(c:CVE)
                  -[:AFFECTS {org_id: $org_id}]->(s:Software)
            RETURN DISTINCT s.vendor AS vendor, s.product AS product
        """, name=entity_id, org_id=org_id)
        affected = [dict(r) for r in result]

    if affected:
        lines.append("## Affected Software in Your Stack")
        lines.append("")
        for sw in affected:
            lines.append(f"- {sw['vendor']}/{sw['product']}")
            links.append(f"software:{sw['vendor']}:{sw['product']}:*")
        lines.append("")

    return "\n".join(lines), title, list(set(links))
