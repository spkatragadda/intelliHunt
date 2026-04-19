"""
Neo4j driver singleton for the IntelliHunt knowledge graph.

Usage:
    from knowledge_graph.connection import get_driver, get_session

    with get_session() as session:
        result = session.run("MATCH (n:CVE) RETURN count(n)")
"""

import logging
import threading
from typing import Optional

from django.conf import settings
from neo4j import GraphDatabase, Driver

logger = logging.getLogger("intelliHunt")

_driver: Optional[Driver] = None
_lock = threading.Lock()


def get_driver() -> Driver:
    """Return the shared Neo4j driver instance (created on first call)."""
    global _driver
    if _driver is not None:
        return _driver

    with _lock:
        if _driver is not None:
            return _driver

        bolt_url = getattr(settings, "NEO4J_BOLT_URL", "bolt://localhost:7687")
        user = getattr(settings, "NEO4J_USER", "neo4j")
        password = getattr(settings, "NEO4J_PASSWORD", "")

        if not password:
            logger.warning("NEO4J_PASSWORD is empty — graph features will fail")

        _driver = GraphDatabase.driver(
            bolt_url,
            auth=(user, password),
            max_connection_pool_size=50,
            connection_acquisition_timeout=30,
        )
        logger.info("Neo4j driver initialised (%s)", bolt_url)
        return _driver


def get_session(database: str = "neo4j"):
    """Return a new Neo4j session. Use as a context manager."""
    return get_driver().session(database=database)


def verify_connectivity() -> bool:
    """Quick connectivity check. Returns True if Neo4j is reachable."""
    try:
        get_driver().verify_connectivity()
        return True
    except Exception as exc:
        logger.warning("Neo4j connectivity check failed: %s", exc)
        return False


def close():
    """Shut down the driver. Call during Django shutdown."""
    global _driver
    with _lock:
        if _driver is not None:
            _driver.close()
            _driver = None
            logger.info("Neo4j driver closed")
