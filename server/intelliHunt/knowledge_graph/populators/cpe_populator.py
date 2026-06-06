"""
Populate the knowledge graph from the organization's software stack YAML.

Integration point: called from crew/system.py after modify_yaml_with_user_inputs().
"""

import logging
from pathlib import Path
from typing import Any

import yaml

from ..graph_writer import upsert_software_nodes, upsert_cpe_nodes, link_software_to_cpe

logger = logging.getLogger("intelliHunt")


def populate_graph_from_yaml(org_id: str, yaml_path: str | None = None) -> dict[str, int]:
    """Read the organization_cmdb.yaml and create Software + CPE nodes.

    Args:
        org_id: Organization UUID string.
        yaml_path: Explicit path to the YAML file. If None, uses the default.

    Returns:
        Dict of counts: {software, cpe, links}
    """
    if yaml_path is None:
        yaml_path = str(
            Path(__file__).resolve().parent.parent.parent
            / "crew" / "NVD" / "config" / "organization_cmdb.yaml"
        )

    try:
        with open(yaml_path, "r") as f:
            config = yaml.safe_load(f)
    except Exception as exc:
        logger.warning("cpe_populator: cannot read YAML %s — %s", yaml_path, exc)
        return {"software": 0, "cpe": 0, "links": 0}

    stack = config.get("software_stack") or {}
    software_rows = []

    # Operating systems
    for os_entry in stack.get("operating_systems") or []:
        vendor = (os_entry.get("vendor") or "").strip().lower()
        for product in os_entry.get("products") or []:
            name = (product.get("name") or "").strip().lower()
            version = (product.get("version") or "*").strip()
            if vendor and name:
                software_rows.append({
                    "vendor": vendor,
                    "product": name,
                    "version": version,
                })

    # Applications
    for app_entry in stack.get("applications") or []:
        vendor = (app_entry.get("vendor") or "").strip().lower()
        for product in app_entry.get("products") or []:
            name = (product.get("name") or "").strip().lower()
            version = (product.get("version") or "*").strip()
            if vendor and name:
                software_rows.append({
                    "vendor": vendor,
                    "product": name,
                    "version": version,
                })

    # Cloud platforms
    for cloud_entry in stack.get("cloud_platforms") or []:
        vendor = (cloud_entry.get("vendor") or "").strip().lower()
        for product in cloud_entry.get("products") or []:
            name = (product.get("name") or "").strip().lower()
            version = (product.get("version") or "*").strip()
            if vendor and name:
                software_rows.append({
                    "vendor": vendor,
                    "product": name,
                    "version": version,
                })

    sw_count = upsert_software_nodes(org_id, software_rows)

    logger.info("cpe_populator: org=%s — %d software nodes from YAML", org_id, sw_count)
    return {"software": sw_count, "cpe": 0, "links": 0}


def populate_graph_from_cpe_data(org_id: str, cpe_data: dict) -> dict[str, int]:
    """Populate the graph from processed CPE data (JSON from nvd_cpe_client).

    Args:
        org_id: Organization UUID string.
        cpe_data: The CPE data dict (from cpe_data_*.json files).

    Returns:
        Dict of counts: {software, cpe, links}
    """
    software_rows = []
    cpe_rows = []
    link_rows = []

    for category in ("operating_systems", "applications", "cloud_platforms", "recent_updates"):
        for record in cpe_data.get(category) or []:
            cpe_info = record.get("cpe") or {}
            cpe_name = cpe_info.get("cpeName") or ""
            if not cpe_name:
                continue

            # Parse the CPE name
            parts = cpe_name.split(":")
            if len(parts) < 6:
                continue

            vendor = parts[3]
            product = parts[4]
            version = parts[5] if parts[5] != "*" else "*"

            software_rows.append({
                "vendor": vendor,
                "product": product,
                "version": version,
            })
            cpe_rows.append({
                "cpe_name": cpe_name,
                "vendor": vendor,
                "product": product,
                "version": version,
            })
            link_rows.append({
                "vendor": vendor,
                "product": product,
                "version": version,
                "cpe_name": cpe_name,
            })

    sw_count = upsert_software_nodes(org_id, software_rows)
    cpe_count = upsert_cpe_nodes(cpe_rows)
    link_count = link_software_to_cpe(org_id, link_rows)

    logger.info("cpe_populator: org=%s — sw=%d, cpe=%d, links=%d",
                org_id, sw_count, cpe_count, link_count)
    return {"software": sw_count, "cpe": cpe_count, "links": link_count}
