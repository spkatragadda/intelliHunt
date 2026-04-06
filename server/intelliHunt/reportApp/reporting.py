"""
Report persistence and metrics extraction.

Single entry point (`persist_report_artifact`) used by every code path that
produces a report: manual runs (views.run_report_async), scheduled runs
(scheduler_jobs.run_scheduled_report), and repo scans (views.run_repo_scan_async).
All reads of archived reports route through tenant_path() to enforce per-tenant
isolation.
"""
import hashlib
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Optional

from django.db import transaction

from .auth import tenant_dir, tenant_path
from .scheduler_jobs import extract_cve_ids, CVE_PATTERN

logger = logging.getLogger("intelliHunt")

_SEVERITY_PATTERN = re.compile(
    r'\b(critical|high|medium|moderate|low|info(?:rmational)?)\b', re.IGNORECASE,
)
_CVSS_PATTERN = re.compile(
    r'CVSS(?:v?3\.[01])?\s*[:=]?\s*(\d+(?:\.\d+)?)', re.IGNORECASE,
)
_PRODUCT_HEADING_PATTERN = re.compile(
    r'^\s*#{1,6}\s*(?:Product|Affected|Affected Product)[:\s]+(.+?)\s*$',
    re.MULTILINE | re.IGNORECASE,
)


def _normalize_severity(raw: str) -> str:
    s = raw.lower()
    if s.startswith("info"):
        return "info"
    if s == "moderate":
        return "medium"
    return s  # critical, high, medium, low


def extract_metrics(markdown: str) -> dict:
    """
    Parse a report markdown blob into a metrics dict matching ReportMetric fields.
    Pure function — never raises. Returns {"__error__": "..."} on failure.
    """
    try:
        if not markdown:
            return {
                "total_cves": 0, "unique_cves": 0,
                "critical_count": 0, "high_count": 0, "medium_count": 0,
                "low_count": 0, "info_count": 0, "unknown_severity_count": 0,
                "cvss_avg": None, "cvss_max": None,
                "cve_ids": [], "top_products": [],
                "severity_breakdown": {},
                "affected_products_count": 0,
            }

        # CVE IDs (reuse existing canonical extractor for cross-module consistency)
        cve_id_set = extract_cve_ids(markdown)
        cve_ids_sorted = sorted(cve_id_set)

        # Split markdown into per-CVE blocks using CVE pattern as an anchor so
        # severity terms get attributed to the CVE they appear near.
        matches = list(CVE_PATTERN.finditer(markdown))
        severity_counts = {
            "critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0, "unknown": 0,
        }
        cvss_values = []

        if matches:
            for i, m in enumerate(matches):
                block_start = m.start()
                block_end = matches[i + 1].start() if i + 1 < len(matches) else len(markdown)
                block = markdown[block_start:block_end]

                sev_match = _SEVERITY_PATTERN.search(block)
                if sev_match:
                    sev = _normalize_severity(sev_match.group(1))
                    severity_counts[sev] = severity_counts.get(sev, 0) + 1
                else:
                    severity_counts["unknown"] += 1

                for cvss_match in _CVSS_PATTERN.finditer(block):
                    try:
                        v = float(cvss_match.group(1))
                        if 0.0 <= v <= 10.0:
                            cvss_values.append(v)
                    except ValueError:
                        pass

        cvss_avg = round(sum(cvss_values) / len(cvss_values), 2) if cvss_values else None
        cvss_max = max(cvss_values) if cvss_values else None

        # Products (simple heading-based heuristic)
        products: dict[str, int] = {}
        for ph in _PRODUCT_HEADING_PATTERN.finditer(markdown):
            name = ph.group(1).strip().strip("*_`")
            if name:
                products[name] = products.get(name, 0) + 1

        top_products_list = sorted(
            ({"name": k, "count": v} for k, v in products.items()),
            key=lambda d: d["count"],
            reverse=True,
        )[:20]

        return {
            "total_cves": len(matches),
            "unique_cves": len(cve_id_set),
            "critical_count":         severity_counts["critical"],
            "high_count":             severity_counts["high"],
            "medium_count":           severity_counts["medium"],
            "low_count":              severity_counts["low"],
            "info_count":             severity_counts["info"],
            "unknown_severity_count": severity_counts["unknown"],
            "cvss_avg": cvss_avg,
            "cvss_max": cvss_max,
            "cve_ids": cve_ids_sorted,
            "top_products": top_products_list,
            "severity_breakdown": severity_counts,
            "affected_products_count": len(products),
        }
    except Exception as exc:
        return {"__error__": f"extract_metrics failed: {exc}"}


def persist_report_artifact(
    *,
    org_id: str,
    user_id: Optional[int],
    username: str,
    source: str,
    markdown: str,
    task_id: str = "",
    scan_result=None,
):
    """
    Persist a completed report to disk + DB. Always creates the ReportArtifact;
    if metric extraction fails, creates a zeroed ReportMetric with
    metrics_status='failed' so the timeline remains continuous.
    """
    from .models import ReportArtifact, ReportMetric

    # 1. Write markdown to the per-tenant reports directory
    artifact_id = uuid.uuid4()
    ts = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    rel_path = os.path.join("reports", f"{artifact_id}_{ts}.md")
    abs_path = tenant_path(str(org_id), rel_path)
    os.makedirs(os.path.dirname(abs_path), exist_ok=True)

    md_bytes = (markdown or "").encode("utf-8")
    content_sha = hashlib.sha256(md_bytes).hexdigest()
    with open(abs_path, "w", encoding="utf-8") as f:
        f.write(markdown or "")

    # 2. Create the artifact row
    artifact = ReportArtifact.objects.create(
        id=artifact_id,
        organization_id=org_id,
        user_id=user_id,
        username=username or "",
        source=source,
        task_id=task_id or "",
        scan_result=scan_result,
        storage_kind="file",
        storage_path=rel_path,
        byte_size=len(md_bytes),
        content_sha256=content_sha,
        metrics_status="ok",
    )

    # 3. Extract metrics + compute drift under a row lock
    metrics = extract_metrics(markdown or "")
    metrics_failed = "__error__" in metrics
    if metrics_failed:
        artifact.metrics_status = "failed"
        artifact.metrics_error = metrics["__error__"][:2000]
        artifact.save(update_fields=["metrics_status", "metrics_error"])
        metrics = {}  # fall through to zeroed row

    with transaction.atomic():
        prev = (
            ReportMetric.objects
            .select_for_update()
            .filter(organization_id=org_id, source=source)
            .order_by("-snapshot_at")
            .first()
        )
        prev_cves = set(prev.cve_ids) if prev and prev.cve_ids else set()
        new_cves = set(metrics.get("cve_ids", []))
        added = new_cves - prev_cves
        resolved = prev_cves - new_cves
        carried = new_cves & prev_cves

        ReportMetric.objects.create(
            artifact=artifact,
            organization_id=org_id,
            snapshot_at=artifact.created_at,
            source=source,
            total_cves=metrics.get("total_cves", 0),
            unique_cves=metrics.get("unique_cves", 0),
            critical_count=metrics.get("critical_count", 0),
            high_count=metrics.get("high_count", 0),
            medium_count=metrics.get("medium_count", 0),
            low_count=metrics.get("low_count", 0),
            info_count=metrics.get("info_count", 0),
            unknown_severity_count=metrics.get("unknown_severity_count", 0),
            cvss_avg=metrics.get("cvss_avg"),
            cvss_max=metrics.get("cvss_max"),
            new_cves_count=len(added),
            resolved_cves_count=len(resolved),
            carried_over_count=len(carried),
            affected_products_count=metrics.get("affected_products_count", 0),
            cve_ids=sorted(new_cves),
            top_products=metrics.get("top_products", []),
            severity_breakdown=metrics.get("severity_breakdown", {}),
        )

    logger.info(
        "persist_report_artifact: org=%s source=%s artifact=%s cves=%s new=%s resolved=%s",
        org_id, source, artifact.pk,
        metrics.get("total_cves", 0), 0 if metrics_failed else "n/a", "n/a",
    )
    return artifact


def latest_artifact(org_id: str, source: Optional[str] = None):
    from .models import ReportArtifact
    qs = ReportArtifact.objects.filter(organization_id=org_id)
    if source:
        qs = qs.filter(source=source)
    return qs.order_by("-created_at").first()


def prune_old_artifacts(org_id: str, retention_days: int, max_artifacts: int):
    """
    Delete artifacts older than retention_days AND any beyond max_artifacts most
    recent. Uses ReportArtifact.delete() override so on-disk files are removed.
    """
    from .models import ReportArtifact
    from datetime import timedelta

    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=retention_days)

    # Time-based
    old = ReportArtifact.objects.filter(
        organization_id=org_id, created_at__lt=cutoff,
    )
    for a in old:
        a.delete()

    # Count-based: keep newest max_artifacts
    kept_ids = list(
        ReportArtifact.objects
        .filter(organization_id=org_id)
        .order_by("-created_at")
        .values_list("pk", flat=True)[:max_artifacts]
    )
    excess = ReportArtifact.objects.filter(organization_id=org_id).exclude(pk__in=kept_ids)
    for a in excess:
        a.delete()
