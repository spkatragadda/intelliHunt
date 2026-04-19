"""
Populate the knowledge graph from repo scan results.

Extracts dependency packages found by OSV-Scanner and CVE IDs from the
generated scan report markdown.

Integration point: called from views.py run_repo_scan_async() after scan completes.
"""

import json
import logging
import re

from ..graph_writer import (
    upsert_cve_nodes,
    upsert_software_nodes,
    create_affects_edges,
    create_dependency_edges,
)

logger = logging.getLogger("intelliHunt")

_CVE_PATTERN = re.compile(r"CVE-\d{4}-\d{4,}")
_CWE_PATTERN = re.compile(r"CWE-\d+")


def _extract_osv_packages(static_json: str) -> list[dict]:
    """Extract package info from raw OSV-Scanner JSON output."""
    packages = []
    try:
        data = json.loads(static_json)
    except (json.JSONDecodeError, TypeError):
        return packages

    osv = data.get("osv")
    if not isinstance(osv, dict) or "results" not in osv:
        return packages

    seen = set()
    for result_group in osv["results"]:
        for pkg_info in result_group.get("packages") or []:
            pkg = pkg_info.get("package") or {}
            name = pkg.get("name") or ""
            version = pkg.get("version") or "*"
            ecosystem = pkg.get("ecosystem") or ""

            if not name or name in seen:
                continue
            seen.add(name)

            # Derive vendor from ecosystem or package name
            vendor = ecosystem.lower() if ecosystem else "unknown"

            cve_ids = []
            for vuln in pkg_info.get("vulnerabilities") or []:
                vid = vuln.get("id") or ""
                if vid.startswith("CVE-"):
                    cve_ids.append(vid)
                for alias in vuln.get("aliases") or []:
                    if alias.startswith("CVE-"):
                        cve_ids.append(alias)

            packages.append({
                "vendor": vendor,
                "product": name.lower(),
                "version": version,
                "cve_ids": list(set(cve_ids)),
            })

    return packages


def populate_graph_from_scan(org_id: str, report_markdown: str,
                             static_results_json: str = "") -> dict[str, int]:
    """Extract entities from a repo scan and populate the graph.

    Args:
        org_id: Organization UUID string.
        report_markdown: The final scan report markdown.
        static_results_json: Raw JSON from OSV-Scanner + Semgrep (optional).

    Returns:
        Dict of counts.
    """
    counts = {"cves": 0, "software": 0, "affects": 0, "dependencies": 0}

    # Extract CVE IDs from the markdown report
    cve_ids = set(_CVE_PATTERN.findall(report_markdown))
    if cve_ids:
        cve_rows = [{"cve_id": cid} for cid in cve_ids]
        counts["cves"] = upsert_cve_nodes(cve_rows)

    # Extract packages from OSV-Scanner output
    packages = _extract_osv_packages(static_results_json)

    if packages:
        # Create Software nodes for discovered packages
        sw_rows = [{"vendor": p["vendor"], "product": p["product"],
                     "version": p["version"]} for p in packages]
        counts["software"] = upsert_software_nodes(org_id, sw_rows)

        # Create AFFECTS edges for packages with known CVEs
        affects_rows = []
        for pkg in packages:
            for cve_id in pkg["cve_ids"]:
                affects_rows.append({
                    "cve_id": cve_id,
                    "vendor": pkg["vendor"],
                    "product": pkg["product"],
                    "version": pkg["version"],
                })
        counts["affects"] = create_affects_edges(org_id, affects_rows)

    logger.info("repo_scan_populator: org=%s — %s", org_id, counts)
    return counts
