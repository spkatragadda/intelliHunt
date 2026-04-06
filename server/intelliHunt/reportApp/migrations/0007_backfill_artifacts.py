"""
Data migration: seed one ReportArtifact (+ ReportMetric) per organization
that currently has a `crew_report.md` on disk. Makes the new history/trends
UIs non-empty on day one. Idempotent — reruns skip orgs already seeded.
"""
import hashlib
import os
import uuid
from datetime import datetime, timezone

from django.db import migrations


def _extract_and_backfill(apps, schema_editor):
    Organization  = apps.get_model('reportApp', 'Organization')
    ReportArtifact = apps.get_model('reportApp', 'ReportArtifact')
    ReportMetric   = apps.get_model('reportApp', 'ReportMetric')

    # Import the helpers at runtime so this migration does not depend on
    # module import order during initial migrate.
    from intelliHunt.reportApp.auth import tenant_dir, tenant_path
    from intelliHunt.reportApp.reporting import extract_metrics

    for org in Organization.objects.all():
        # Skip orgs that already have a backfill artifact (idempotency).
        if ReportArtifact.objects.filter(organization=org, task_id='backfill').exists():
            continue

        src_path = tenant_path(str(org.id), 'crew_report.md')
        if not os.path.exists(src_path):
            continue

        try:
            with open(src_path, 'r', encoding='utf-8') as f:
                markdown = f.read()
        except Exception:
            continue

        if not markdown:
            continue

        artifact_id = uuid.uuid4()
        ts = datetime.now(tz=timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        rel_path = os.path.join('reports', f'{artifact_id}_{ts}_backfill.md')
        abs_path = tenant_path(str(org.id), rel_path)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)

        md_bytes = markdown.encode('utf-8')
        try:
            with open(abs_path, 'w', encoding='utf-8') as f:
                f.write(markdown)
        except Exception:
            continue

        artifact = ReportArtifact.objects.create(
            id=artifact_id,
            organization=org,
            username='backfill',
            source='manual_report',
            task_id='backfill',
            storage_kind='file',
            storage_path=rel_path,
            byte_size=len(md_bytes),
            content_sha256=hashlib.sha256(md_bytes).hexdigest(),
            metrics_status='ok',
        )

        metrics = extract_metrics(markdown)
        if '__error__' in metrics:
            artifact.metrics_status = 'failed'
            artifact.metrics_error = metrics['__error__'][:2000]
            artifact.save(update_fields=['metrics_status', 'metrics_error'])
            metrics = {}

        ReportMetric.objects.create(
            artifact=artifact,
            organization=org,
            snapshot_at=artifact.created_at,
            source='manual_report',
            total_cves=metrics.get('total_cves', 0),
            unique_cves=metrics.get('unique_cves', 0),
            critical_count=metrics.get('critical_count', 0),
            high_count=metrics.get('high_count', 0),
            medium_count=metrics.get('medium_count', 0),
            low_count=metrics.get('low_count', 0),
            info_count=metrics.get('info_count', 0),
            unknown_severity_count=metrics.get('unknown_severity_count', 0),
            cvss_avg=metrics.get('cvss_avg'),
            cvss_max=metrics.get('cvss_max'),
            new_cves_count=0,
            resolved_cves_count=0,
            carried_over_count=0,
            affected_products_count=metrics.get('affected_products_count', 0),
            cve_ids=metrics.get('cve_ids', []),
            top_products=metrics.get('top_products', []),
            severity_breakdown=metrics.get('severity_breakdown', {}),
        )


def _remove_backfill(apps, schema_editor):
    ReportArtifact = apps.get_model('reportApp', 'ReportArtifact')
    # Clean up on-disk files too — re-resolve through tenant_path for safety.
    from intelliHunt.reportApp.auth import tenant_dir, tenant_path
    for a in ReportArtifact.objects.filter(task_id='backfill'):
        if a.storage_kind == 'file' and a.storage_path:
            try:
                abs_path = os.path.realpath(tenant_path(str(a.organization_id), a.storage_path))
                root = os.path.realpath(tenant_dir(str(a.organization_id)))
                if abs_path.startswith(root + os.sep) and os.path.exists(abs_path):
                    os.unlink(abs_path)
            except Exception:
                pass
    ReportArtifact.objects.filter(task_id='backfill').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('reportApp', '0006_reportmetric'),
    ]

    operations = [
        migrations.RunPython(_extract_and_backfill, reverse_code=_remove_backfill),
    ]
