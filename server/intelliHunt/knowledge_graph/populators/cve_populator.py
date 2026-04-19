"""
Populate the knowledge graph from the existing CVE/CPE pipeline output.

Integration point: called from vulnerability_processor.py after
generate_crew_input_with_vulnerabilities() returns.
"""

import logging
import re
from typing import Any

from ..graph_writer import (
    upsert_cve_nodes,
    upsert_software_nodes,
    create_affects_edges,
    upsert_cwe_nodes,
    create_classified_as_edges,
)

logger = logging.getLogger("intelliHunt")

# Regex to extract CWE IDs from CVE descriptions or weakness data
_CWE_PATTERN = re.compile(r"CWE-(\d+)")


def _parse_cpe_uri(cpe_name: str) -> dict | None:
    """Parse a CPE 2.3 URI into vendor/product/version.

    Example: cpe:2.3:a:apache:http_server:2.4.51:*:*:*:*:*:*:*
    """
    parts = cpe_name.split(":")
    if len(parts) < 6:
        return None
    return {
        "vendor": parts[3],
        "product": parts[4],
        "version": parts[5] if parts[5] != "*" else "*",
    }


def populate_graph_from_cve_data(org_id: str, vulnerability_data: dict) -> dict[str, int]:
    """Transform CVE pipeline output into graph nodes and relationships.

    Args:
        org_id: Organization UUID string.
        vulnerability_data: The 'vulnerability_data' dict from the enhanced
                            crew input (contains cve_details, recent_cves, etc.)

    Returns:
        Dict of counts: {cves, software, affects, cwes, classified_as}
    """
    counts = {"cves": 0, "software": 0, "affects": 0, "cwes": 0, "classified_as": 0}

    cve_details = vulnerability_data.get("cve_details") or []
    if not cve_details:
        logger.info("cve_populator: no CVE details to process")
        return counts

    # 1. Upsert CVE nodes
    cve_rows = []
    for cve in cve_details:
        cve_rows.append({
            "cve_id": cve.get("cve_id"),
            "description": cve.get("description"),
            "severity": cve.get("severity"),
            "cvss_score": cve.get("cvss_score"),
            "published": cve.get("published"),
            "epss_score": cve.get("epss_score"),
            "epss_percentile": cve.get("epss_percentile"),
        })
    counts["cves"] = upsert_cve_nodes(cve_rows)

    # 2. Parse CPE names → Software nodes + AFFECTS edges
    software_rows = []
    affects_rows = []
    cpe_software_seen = set()

    for cve in cve_details:
        cve_id = cve.get("cve_id")
        cpe_name = cve.get("cpe_name") or ""

        parsed = _parse_cpe_uri(cpe_name) if cpe_name.startswith("cpe:") else None
        if not parsed:
            continue

        key = (parsed["vendor"], parsed["product"], parsed["version"])
        if key not in cpe_software_seen:
            cpe_software_seen.add(key)
            software_rows.append({
                "vendor": parsed["vendor"],
                "product": parsed["product"],
                "version": parsed["version"],
            })

        affects_rows.append({
            "cve_id": cve_id,
            "vendor": parsed["vendor"],
            "product": parsed["product"],
            "version": parsed["version"],
            "severity": cve.get("severity"),
            "cvss_score": cve.get("cvss_score"),
        })

    counts["software"] = upsert_software_nodes(org_id, software_rows)
    counts["affects"] = create_affects_edges(org_id, affects_rows)

    # 3. Extract CWE IDs from CVE data
    cwe_rows = []
    classified_rows = []
    cwe_seen = set()

    for cve in cve_details:
        cve_id = cve.get("cve_id")
        # Check description for CWE references
        desc = cve.get("description") or ""
        for match in _CWE_PATTERN.finditer(desc):
            cwe_id = f"CWE-{match.group(1)}"
            if cwe_id not in cwe_seen:
                cwe_seen.add(cwe_id)
                cwe_rows.append({"cwe_id": cwe_id})
            classified_rows.append({"cve_id": cve_id, "cwe_id": cwe_id})

        # Check configurations for CWE data (some NVD responses include it)
        for config in cve.get("configurations") or []:
            for node in config.get("nodes") or []:
                for cpe_match in node.get("cpeMatch") or []:
                    criteria = cpe_match.get("criteria") or ""
                    # Some CPE criteria embed CWE references
                    for match in _CWE_PATTERN.finditer(criteria):
                        cwe_id = f"CWE-{match.group(1)}"
                        if cwe_id not in cwe_seen:
                            cwe_seen.add(cwe_id)
                            cwe_rows.append({"cwe_id": cwe_id})
                        classified_rows.append({"cve_id": cve_id, "cwe_id": cwe_id})

    counts["cwes"] = upsert_cwe_nodes(cwe_rows)
    counts["classified_as"] = create_classified_as_edges(classified_rows)

    logger.info("cve_populator: org=%s — %s", org_id, counts)
    return counts
