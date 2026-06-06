"""
LLM-powered transitive dependency expansion.

Discovers dependencies beyond what the user explicitly configured in their
software stack — the key "Karpathy wiki" differentiator.

Integration: called by deep_research tasks and the populate_knowledge_graph
management command.
"""

import json
import logging
import os
import time

from openai import OpenAI

from ..connection import get_session
from ..graph_writer import upsert_software_nodes, create_dependency_edges

logger = logging.getLogger("intelliHunt")

_DEPENDENCY_PROMPT = """You are a software dependency expert. For the given software product,
list its well-known direct dependencies and commonly shared libraries.

Software: {vendor} {product} {version}

Return a JSON object:
{{
  "dependencies": [
    {{
      "vendor": "...",
      "product": "...",
      "version": "*",
      "dependency_type": "direct|shared_lib",
      "confidence": "high|medium|low"
    }}
  ]
}}

Rules:
- Use lowercase for vendor and product names.
- Only include dependencies you are confident about (high or medium confidence).
- Include both direct runtime dependencies and commonly linked shared libraries.
- For version, use "*" unless a specific version range is well-known.
- Limit to 15 most important dependencies.
- Do not include the software itself as a dependency."""


def _get_stack_software(org_id: str) -> list[dict]:
    """Fetch all Software nodes in the org's stack from Neo4j."""
    with get_session() as session:
        result = session.run("""
            MATCH (s:Software {org_id: $org_id})
            WHERE EXISTS { (s)-[:PART_OF_STACK {org_id: $org_id}]->() }
               OR EXISTS { (s)-[:PART_OF_STACK {org_id: $org_id}]->(s) }
            RETURN s.vendor AS vendor, s.product AS product, s.version AS version
        """, org_id=org_id)
        return [dict(r) for r in result]


def _get_existing_deps(org_id: str, vendor: str, product: str) -> set[str]:
    """Return product names that are already known dependencies."""
    with get_session() as session:
        result = session.run("""
            MATCH (s:Software {org_id: $org_id, vendor: $vendor, product: $product})
                  -[:DEPENDS_ON {org_id: $org_id}]->(dep:Software)
            RETURN dep.product AS product
        """, org_id=org_id, vendor=vendor, product=product)
        return {r["product"] for r in result}


def _discover_deps_for_software(vendor: str, product: str,
                                version: str) -> list[dict]:
    """Call LLM to discover dependencies for a single software product."""
    model = os.environ.get("MODEL") or os.environ.get("SPEED_MODEL")
    if not model:
        return []

    if "/" in model:
        model = model.split("/", 1)[1]

    prompt = _DEPENDENCY_PROMPT.format(vendor=vendor, product=product, version=version)

    try:
        client = OpenAI()
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are a software dependency expert."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=2000,
        )

        raw = response.choices[0].message.content or "{}"
        data = json.loads(raw)
        deps = data.get("dependencies") or []

        # Filter to high/medium confidence only
        return [d for d in deps
                if d.get("vendor") and d.get("product")
                and d.get("confidence") in ("high", "medium")]

    except Exception as exc:
        logger.warning("dependency_resolver: LLM call failed for %s/%s — %s",
                       vendor, product, exc)
        return []


def expand_dependencies(org_id: str, depth: int = 2,
                        rate_limit_seconds: float = 1.0) -> dict[str, int]:
    """Expand the dependency graph for all software in the org's stack.

    Args:
        org_id: Organization UUID string.
        depth: How many levels of transitive dependencies to discover.
        rate_limit_seconds: Delay between LLM calls.

    Returns:
        Dict of counts: {software_created, dependencies_created}
    """
    counts = {"software_created": 0, "dependencies_created": 0}

    # Start with stack software
    stack = _get_stack_software(org_id)
    if not stack:
        logger.info("dependency_resolver: no software in org %s stack", org_id)
        return counts

    # Track what we've already processed to avoid cycles
    processed = set()

    # BFS expansion up to requested depth
    frontier = [(sw["vendor"], sw["product"], sw["version"]) for sw in stack]

    for current_depth in range(depth):
        next_frontier = []

        for vendor, product, version in frontier:
            key = (vendor, product)
            if key in processed:
                continue
            processed.add(key)

            # Check what deps already exist
            existing = _get_existing_deps(org_id, vendor, product)

            # Discover new deps via LLM
            discovered = _discover_deps_for_software(vendor, product, version)
            time.sleep(rate_limit_seconds)

            # Filter out already-known deps
            new_deps = [d for d in discovered if d["product"] not in existing]
            if not new_deps:
                continue

            # Create new Software nodes
            sw_rows = [{"vendor": d["vendor"], "product": d["product"],
                        "version": d.get("version") or "*"} for d in new_deps]
            counts["software_created"] += upsert_software_nodes(org_id, sw_rows)

            # Create DEPENDS_ON edges
            dep_rows = [{
                "from_vendor": vendor,
                "from_product": product,
                "from_version": version,
                "to_vendor": d["vendor"],
                "to_product": d["product"],
                "to_version": d.get("version") or "*",
                "dependency_type": d.get("dependency_type") or "direct",
            } for d in new_deps]
            counts["dependencies_created"] += create_dependency_edges(org_id, dep_rows)

            # Add newly discovered deps to the next frontier
            for d in new_deps:
                next_frontier.append((d["vendor"], d["product"],
                                      d.get("version") or "*"))

        frontier = next_frontier
        if not frontier:
            break

        logger.info("dependency_resolver: org=%s depth=%d — frontier=%d",
                     org_id, current_depth + 1, len(frontier))

    logger.info("dependency_resolver: org=%s — %s", org_id, counts)
    return counts
