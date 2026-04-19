"""
Django management command: initialise Neo4j schema (constraints + indexes).

Usage:
    python manage.py init_graph_schema
"""

from django.core.management.base import BaseCommand

from knowledge_graph.connection import verify_connectivity
from knowledge_graph.schema import init_schema


class Command(BaseCommand):
    help = "Create Neo4j constraints, indexes, and full-text indexes for the knowledge graph."

    def handle(self, *args, **options):
        self.stdout.write("Checking Neo4j connectivity...")

        if not verify_connectivity():
            self.stderr.write(self.style.ERROR(
                "Cannot reach Neo4j. Check NEO4J_BOLT_URL and NEO4J_PASSWORD."
            ))
            return

        self.stdout.write("Connected. Initialising schema...")
        init_schema()
        self.stdout.write(self.style.SUCCESS("Graph schema initialised."))
