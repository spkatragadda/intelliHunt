"""
Populate the knowledge graph from CMDB import data.

Integration point: called from views.py import_cmdb_data after writing the YAML config.
"""

import logging

from ..graph_writer import upsert_software_nodes

logger = logging.getLogger("intelliHunt")


def populate_graph_from_cmdb(org_id: str, cmdb_records: list[dict],
                             source: str = "cmdb") -> dict[str, int]:
    """Transform CMDB asset records into Software nodes.

    Args:
        org_id: Organization UUID string.
        cmdb_records: List of asset dicts, each with at least
                      {vendor, product} and optionally {version}.
        source: CMDB source identifier for logging.

    Returns:
        Dict of counts: {software}
    """
    software_rows = []
    for record in cmdb_records:
        vendor = (record.get("vendor") or "").strip().lower()
        product = (record.get("product") or record.get("name") or "").strip().lower()
        version = (record.get("version") or "*").strip()

        if not vendor or not product:
            continue

        software_rows.append({
            "vendor": vendor,
            "product": product,
            "version": version,
        })

    sw_count = upsert_software_nodes(org_id, software_rows)

    logger.info("cmdb_populator: org=%s source=%s — %d software nodes",
                org_id, source, sw_count)
    return {"software": sw_count}
