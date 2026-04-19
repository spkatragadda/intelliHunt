"""
CrewAI @tool for querying the knowledge graph during agent execution.

Agents can use this tool to explore the graph: find related CVEs,
dependency chains, threat actors, and wiki page content.
"""

import json
import logging
import os

from crewai.tools import tool
from openai import OpenAI

from ..connection import verify_connectivity, get_session
from ..graph_reader import (
    search_cves_fulltext,
    get_cves_for_software,
    get_dependencies,
    get_transitive_cve_exposure,
    get_threat_actors_for_org,
)

logger = logging.getLogger("intelliHunt")

# Module-level org_id set before crew kickoff
_current_org_id: str | None = None


def set_org_context(org_id: str):
    """Set the organization context for graph queries. Call before crew kickoff."""
    global _current_org_id
    _current_org_id = org_id


_NL_TO_CYPHER_PROMPT = """You are a Cypher query generator for a Neo4j security knowledge graph.

Node labels: Software, CVE, CWE, CPE, ThreatActor, AttackTechnique, Advisory
Relationship types: AFFECTS, DEPENDS_ON, HAS_CPE, EXPLOITS, USES_TECHNIQUE, TECHNIQUE_FOR, CLASSIFIED_AS, MITIGATED_BY, PART_OF_STACK, RELATED_TO

Software properties: org_id, vendor, product, version
CVE properties: cve_id, description, severity, cvss_score, published, epss_score
CWE properties: cwe_id, name, description
ThreatActor properties: name
AttackTechnique properties: mitre_id, name

Org-scoped relationships (AFFECTS, DEPENDS_ON, PART_OF_STACK) have an org_id property.

Convert the user's question to a Cypher query. Always filter org-scoped queries with org_id = $org_id.
Return ONLY the Cypher query, nothing else. Limit results to 20."""


@tool("query_knowledge_graph")
def query_knowledge_graph(query: str) -> str:
    """Query the organization's knowledge graph for vulnerability intelligence.
    Use this to find: related CVEs for a software product, dependency chains,
    threat actors known to exploit a CVE, transitive vulnerability exposure,
    or wiki page summaries.

    Args:
        query: Natural language question about the security knowledge graph.
    Returns:
        Structured text with query results from the knowledge graph.
    """
    if not verify_connectivity():
        return "Knowledge graph is not available."

    org_id = _current_org_id
    if not org_id:
        return "Organization context not set for graph queries."

    # Try structured queries first based on keywords
    q_lower = query.lower()

    # CVE search
    if "cve" in q_lower:
        results = search_cves_fulltext(query, limit=10)
        if results:
            lines = ["## CVE Search Results\n"]
            for r in results:
                lines.append(
                    f"- **{r.get('cve_id')}** ({r.get('severity', '?')}, "
                    f"CVSS {r.get('cvss_score', '?')}): "
                    f"{(r.get('description') or '')[:200]}"
                )
            return "\n".join(lines)

    # Dependency query
    if "depend" in q_lower or "transitive" in q_lower:
        # Try to extract a product name
        for sw in _get_org_software(org_id):
            if sw["product"] in q_lower:
                deps = get_dependencies(org_id, sw["vendor"], sw["product"],
                                        sw.get("version", "*"), depth=3)
                if deps:
                    lines = [f"## Dependencies of {sw['product']}\n"]
                    for d in deps:
                        lines.append(f"- {d['vendor']}/{d['product']} ({d.get('version', '*')})")
                    return "\n".join(lines)

    # Threat actor query
    if "threat" in q_lower or "actor" in q_lower or "attacker" in q_lower:
        actors = get_threat_actors_for_org(org_id)
        if actors:
            lines = ["## Threat Actors Targeting Your Stack\n"]
            for a in actors[:10]:
                lines.append(
                    f"- **{a['name']}**: exploits {a['cve_count']} CVEs "
                    f"({', '.join(a['cve_ids'][:3])})"
                )
            return "\n".join(lines)

    # Fall back to natural language → Cypher translation
    return _nl_to_cypher_query(query, org_id)


def _get_org_software(org_id: str) -> list[dict]:
    """Quick lookup of org software for keyword matching."""
    try:
        from ..graph_reader import get_software_for_org
        return get_software_for_org(org_id)
    except Exception:
        return []


def _nl_to_cypher_query(question: str, org_id: str) -> str:
    """Convert a natural language question to Cypher and execute it."""
    model = os.environ.get("MODEL") or os.environ.get("SPEED_MODEL")
    if not model:
        return "No LLM model configured for graph query translation."

    if "/" in model:
        model = model.split("/", 1)[1]

    try:
        client = OpenAI()
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _NL_TO_CYPHER_PROMPT},
                {"role": "user", "content": question},
            ],
            temperature=0.0,
            max_tokens=500,
        )

        cypher = (response.choices[0].message.content or "").strip()
        if not cypher or not cypher.upper().startswith(("MATCH", "CALL", "OPTIONAL")):
            return "Could not generate a valid graph query for this question."

        # Execute the Cypher query
        with get_session() as session:
            result = session.run(cypher, org_id=org_id)
            rows = [dict(r) for r in result]

        if not rows:
            return "No results found in the knowledge graph."

        # Format results as readable text
        lines = [f"## Graph Query Results ({len(rows)} rows)\n"]
        for row in rows[:20]:
            parts = []
            for k, v in row.items():
                parts.append(f"**{k}**: {v}")
            lines.append("- " + " | ".join(parts))

        return "\n".join(lines)

    except Exception as exc:
        logger.warning("graph_rag_tool: NL-to-Cypher failed — %s", exc)
        return f"Graph query failed: {exc}"
