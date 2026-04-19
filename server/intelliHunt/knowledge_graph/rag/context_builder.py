"""
Pre-fetch graph context for CrewAI crew runs.

Builds rich, structured text from graph traversals that gets injected
into crew task descriptions as the {graph_context} variable.
"""

import logging

from ..graph_reader import (
    get_cve_affected_software,
    get_dependencies,
    get_transitive_cve_exposure,
    get_cve_detail,
)
from ..connection import verify_connectivity

logger = logging.getLogger("intelliHunt")


def build_cve_context(org_id: str, cve_id: str) -> str:
    """Build rich graph context for a CVE being analyzed by the crew.

    Returns structured text suitable for injection into a task description.
    """
    if not verify_connectivity():
        return ""

    lines = []

    # 1. Get CVE details
    cve = get_cve_detail(cve_id)
    if not cve:
        return ""

    # 2. Get affected software in the org's stack
    affected = get_cve_affected_software(cve_id, org_id)
    if affected:
        lines.append("### Affected Software in Your Stack")
        for sw in affected[:10]:
            name = f"{sw['vendor']}/{sw['product']}"
            if sw.get("version") and sw["version"] != "*":
                name += f" ({sw['version']})"
            lines.append(f"- {name}")

            # Get dependency chain for each affected software
            deps = get_dependencies(org_id, sw["vendor"], sw["product"],
                                    sw.get("version", "*"), depth=2)
            if deps:
                lines.append(f"  Dependencies of {sw['product']}:")
                for dep in deps[:5]:
                    lines.append(f"  - {dep['vendor']}/{dep['product']}")

    # 3. Transitive CVE exposure
    for sw in affected[:3]:
        exposure = get_transitive_cve_exposure(
            org_id, sw["vendor"], sw["product"],
            sw.get("version", "*"), depth=2
        )
        other_cves = [e for e in exposure if e.get("cve_id") != cve_id]
        if other_cves:
            lines.append(f"\n### Other CVEs in {sw['product']}'s Dependency Chain")
            for exp in other_cves[:5]:
                lines.append(
                    f"- {exp['cve_id']} ({exp.get('severity', '?')}, "
                    f"CVSS {exp.get('cvss_score', '?')}) — "
                    f"via {exp.get('dep_vendor', '?')}/{exp.get('dep_product', '?')}"
                )

    # 4. Threat actors and MITRE techniques from graph
    actors = cve.get("threat_actors") or []
    techniques = cve.get("mitre_techniques") or []

    if actors:
        lines.append("\n### Known Threat Actors")
        for actor in actors:
            lines.append(f"- {actor}")

    if techniques:
        lines.append("\n### MITRE ATT&CK Techniques")
        for tech in techniques:
            lines.append(f"- {tech}")

    # 5. CWE classification
    cwes = cve.get("cwes") or []
    if cwes:
        lines.append("\n### CWE Classification")
        for cwe_id in cwes:
            lines.append(f"- {cwe_id}")

    if not lines:
        return ""

    return "## Knowledge Graph Context\n\n" + "\n".join(lines)


def build_batch_context(org_id: str, cve_ids: list[str]) -> dict[str, str]:
    """Build graph context for multiple CVEs (used before crew kickoff).

    Returns:
        Dict mapping cve_id → context string.
    """
    if not verify_connectivity():
        return {}

    contexts = {}
    for cve_id in cve_ids:
        try:
            ctx = build_cve_context(org_id, cve_id)
            if ctx:
                contexts[cve_id] = ctx
        except Exception as exc:
            logger.warning("context_builder: failed for %s — %s", cve_id, exc)

    return contexts
