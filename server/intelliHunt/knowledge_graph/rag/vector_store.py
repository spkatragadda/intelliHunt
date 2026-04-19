"""
Neo4j vector index management for semantic similarity search.

Uses OpenAI embeddings to enable "find CVEs similar to this description"
queries against the knowledge graph.
"""

import logging
import os

from openai import OpenAI

from ..connection import get_session

logger = logging.getLogger("intelliHunt")

_EMBEDDING_MODEL = "text-embedding-3-small"
_VECTOR_DIMENSION = 1536


def create_vector_index():
    """Create the vector index on CVE nodes. Idempotent."""
    with get_session() as session:
        try:
            session.run(f"""
                CREATE VECTOR INDEX cve_embedding_idx IF NOT EXISTS
                FOR (c:CVE) ON (c.embedding)
                OPTIONS {{
                    indexConfig: {{
                        `vector.dimensions`: {_VECTOR_DIMENSION},
                        `vector.similarity_function`: 'cosine'
                    }}
                }}
            """)
            logger.info("Vector index cve_embedding_idx created/verified")
        except Exception as exc:
            logger.warning("Failed to create vector index: %s", exc)


def generate_embedding(text: str) -> list[float] | None:
    """Generate an embedding vector for the given text."""
    if not text or not text.strip():
        return None

    try:
        client = OpenAI()
        response = client.embeddings.create(
            model=_EMBEDDING_MODEL,
            input=text[:8000],
        )
        return response.data[0].embedding
    except Exception as exc:
        logger.warning("Embedding generation failed: %s", exc)
        return None


def store_cve_embeddings(cve_ids: list[str]):
    """Generate and store embeddings for CVE descriptions."""
    with get_session() as session:
        # Fetch CVEs that don't have embeddings yet
        result = session.run("""
            MATCH (c:CVE)
            WHERE c.cve_id IN $cve_ids AND c.embedding IS NULL AND c.description IS NOT NULL
            RETURN c.cve_id AS cve_id, c.description AS description
        """, cve_ids=cve_ids)

        rows = [dict(r) for r in result]

    if not rows:
        return 0

    count = 0
    for row in rows:
        embedding = generate_embedding(row["description"])
        if embedding:
            with get_session() as session:
                session.run("""
                    MATCH (c:CVE {cve_id: $cve_id})
                    SET c.embedding = $embedding
                """, cve_id=row["cve_id"], embedding=embedding)
                count += 1

    logger.info("Stored %d CVE embeddings", count)
    return count


def search_similar_cves(text: str, limit: int = 10) -> list[dict]:
    """Find CVEs with descriptions semantically similar to the given text."""
    embedding = generate_embedding(text)
    if not embedding:
        return []

    with get_session() as session:
        result = session.run("""
            CALL db.index.vector.queryNodes('cve_embedding_idx', $limit, $embedding)
            YIELD node, score
            RETURN node.cve_id AS cve_id, node.description AS description,
                   node.severity AS severity, node.cvss_score AS cvss_score,
                   score
            ORDER BY score DESC
        """, limit=limit, embedding=embedding)

        return [dict(r) for r in result]
