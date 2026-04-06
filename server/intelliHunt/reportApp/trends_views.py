"""
Read-side API for historical trending, report archive, and CISO executive
summary. All endpoints are tenant-scoped via require_auth + org_id filter.

Endpoints:
  GET  /api/reports/history/                — paginated list of artifacts
  GET  /api/reports/history/<artifact_id>/  — single artifact + markdown
  GET  /api/trends/                         — time series for one metric
  GET  /api/trends/executive-summary/       — aggregated blob for CISO page
  POST /api/reports/export/ciso/            — admin-only PDF via reportlab
"""
import io
import json
import logging
import os
from datetime import datetime, timedelta, timezone

from django.db.models import Avg, Max, Sum
from django.db.models.functions import TruncDay, TruncMonth, TruncWeek
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

from .auth import require_auth, tenant_dir, tenant_path
from .admin_views import require_admin
from .models import ReportArtifact, ReportMetric

logger = logging.getLogger("intelliHunt")


# ── helpers ──────────────────────────────────────────────────────────────────

def _parse_iso(value):
    """Parse an ISO 8601 datetime (with or without Z) → aware datetime, or None."""
    if not value:
        return None
    try:
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        dt = datetime.fromisoformat(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def _clamp_int(raw, default, lo, hi):
    try:
        v = int(raw)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, v))


def _metric_summary(m):
    """Inline metric fields for the history list view."""
    if not m:
        return None
    return {
        "total_cves":            m.total_cves,
        "unique_cves":           m.unique_cves,
        "critical_count":        m.critical_count,
        "high_count":            m.high_count,
        "medium_count":          m.medium_count,
        "low_count":             m.low_count,
        "info_count":            m.info_count,
        "cvss_max":              m.cvss_max,
        "cvss_avg":              m.cvss_avg,
        "new_cves_count":        m.new_cves_count,
        "resolved_cves_count":   m.resolved_cves_count,
        "carried_over_count":    m.carried_over_count,
    }


def _artifact_row(a):
    return {
        "id":             str(a.id),
        "source":         a.source,
        "username":       a.username,
        "task_id":        a.task_id,
        "byte_size":      a.byte_size,
        "metrics_status": a.metrics_status,
        "created_at":     a.created_at.isoformat(),
        "metrics":        _metric_summary(getattr(a, "metric", None)),
    }


def _read_artifact_markdown(artifact):
    """Safely read an artifact's markdown (file or DB-backed)."""
    if artifact.storage_kind == "db":
        return artifact.markdown_blob or ""
    if not artifact.storage_path:
        return ""
    abs_path = os.path.realpath(tenant_path(str(artifact.organization_id), artifact.storage_path))
    tenant_root = os.path.realpath(tenant_dir(str(artifact.organization_id)))
    if not abs_path.startswith(tenant_root + os.sep):
        logger.warning("artifact %s path escapes tenant dir", artifact.pk)
        return ""
    if not os.path.exists(abs_path):
        return ""
    try:
        with open(abs_path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        logger.exception("failed reading artifact %s", artifact.pk)
        return ""


# ── /api/reports/history/ ────────────────────────────────────────────────────

@csrf_exempt
@require_auth
def report_history(request):
    if request.method != "GET":
        return JsonResponse({"error": "GET required"}, status=405)

    qs = (
        ReportArtifact.objects
        .filter(organization_id=request.org_id)
        .select_related("metric")
    )

    source = request.GET.get("source")
    if source:
        qs = qs.filter(source=source)

    dt_from = _parse_iso(request.GET.get("from"))
    dt_to   = _parse_iso(request.GET.get("to"))
    if dt_from:
        qs = qs.filter(created_at__gte=dt_from)
    if dt_to:
        qs = qs.filter(created_at__lte=dt_to)

    total  = qs.count()
    limit  = _clamp_int(request.GET.get("limit"),  25, 1, 200)
    offset = _clamp_int(request.GET.get("offset"),  0, 0, 10_000_000)

    items = [_artifact_row(a) for a in qs.order_by("-created_at")[offset:offset + limit]]
    return JsonResponse({
        "total":  total,
        "limit":  limit,
        "offset": offset,
        "items":  items,
    })


# ── /api/reports/history/<id>/ ───────────────────────────────────────────────

@csrf_exempt
@require_auth
def report_history_detail(request, artifact_id):
    if request.method != "GET":
        return JsonResponse({"error": "GET required"}, status=405)

    try:
        artifact = (
            ReportArtifact.objects
            .select_related("metric")
            .get(pk=artifact_id, organization_id=request.org_id)
        )
    except ReportArtifact.DoesNotExist:
        return JsonResponse({"error": "Not found"}, status=404)

    markdown = _read_artifact_markdown(artifact)
    m = getattr(artifact, "metric", None)
    full_metrics = None
    if m:
        full_metrics = {
            **(_metric_summary(m) or {}),
            "cve_ids":            m.cve_ids,
            "top_products":       m.top_products,
            "severity_breakdown": m.severity_breakdown,
            "affected_products_count": m.affected_products_count,
            "snapshot_at":        m.snapshot_at.isoformat(),
        }

    return JsonResponse({
        "id":             str(artifact.id),
        "source":         artifact.source,
        "username":       artifact.username,
        "task_id":        artifact.task_id,
        "byte_size":      artifact.byte_size,
        "content_sha256": artifact.content_sha256,
        "metrics_status": artifact.metrics_status,
        "metrics_error":  artifact.metrics_error,
        "created_at":     artifact.created_at.isoformat(),
        "markdown":       markdown,
        "metrics":        full_metrics,
    })


# ── /api/trends/ ─────────────────────────────────────────────────────────────

_BUCKET_TRUNC = {
    "day":   TruncDay,
    "week":  TruncWeek,
    "month": TruncMonth,
}

_METRIC_FIELDS = {
    "cve_count":   ("total_cves",     "sum"),
    "unique_cves": ("unique_cves",    "sum"),
    "critical":    ("critical_count", "sum"),
    "high":        ("high_count",     "sum"),
    "medium":      ("medium_count",   "sum"),
    "low":         ("low_count",      "sum"),
    "cvss_max":    ("cvss_max",       "max"),
    "cvss_avg":    ("cvss_avg",       "avg"),
    "drift":       ("new_cves_count", "sum"),  # new minus resolved handled below
}


@csrf_exempt
@require_auth
def trends(request):
    if request.method != "GET":
        return JsonResponse({"error": "GET required"}, status=405)

    metric = request.GET.get("metric", "cve_count")
    bucket = request.GET.get("bucket", "week")
    source = request.GET.get("source")

    if bucket not in _BUCKET_TRUNC:
        return JsonResponse({"error": f"invalid bucket '{bucket}'"}, status=400)
    if metric == "severity":
        return _trends_severity(request, bucket, source)
    if metric == "mttr":
        # Phase 5 (CVEObservation) — stub zero series for now.
        return JsonResponse({"metric": "mttr", "bucket": bucket, "series": []})
    if metric not in _METRIC_FIELDS:
        return JsonResponse({"error": f"invalid metric '{metric}'"}, status=400)

    qs = ReportMetric.objects.filter(organization_id=request.org_id)
    if source:
        qs = qs.filter(source=source)

    dt_from = _parse_iso(request.GET.get("from"))
    dt_to   = _parse_iso(request.GET.get("to"))
    if dt_from:
        qs = qs.filter(snapshot_at__gte=dt_from)
    if dt_to:
        qs = qs.filter(snapshot_at__lte=dt_to)

    trunc = _BUCKET_TRUNC[bucket]
    field, agg = _METRIC_FIELDS[metric]

    aggs = {"sum": Sum, "max": Max, "avg": Avg}[agg]

    buckets = (
        qs.annotate(bucket=trunc("snapshot_at"))
          .values("bucket")
          .annotate(value=aggs(field))
          .order_by("bucket")
    )
    series = [
        {"t": b["bucket"].isoformat() if b["bucket"] else None, "v": b["value"]}
        for b in buckets
    ]

    if metric == "drift":
        # Augment with resolved counts for the same bucket so the client can
        # render (new - resolved).
        resolved_buckets = (
            qs.annotate(bucket=trunc("snapshot_at"))
              .values("bucket")
              .annotate(value=Sum("resolved_cves_count"))
              .order_by("bucket")
        )
        resolved_map = {
            (b["bucket"].isoformat() if b["bucket"] else None): b["value"] or 0
            for b in resolved_buckets
        }
        for pt in series:
            pt["resolved"] = resolved_map.get(pt["t"], 0)
            pt["new"] = pt["v"] or 0
            pt["v"] = (pt["v"] or 0) - (pt["resolved"] or 0)

    return JsonResponse({"metric": metric, "bucket": bucket, "series": series})


def _trends_severity(request, bucket, source):
    qs = ReportMetric.objects.filter(organization_id=request.org_id)
    if source:
        qs = qs.filter(source=source)

    dt_from = _parse_iso(request.GET.get("from"))
    dt_to   = _parse_iso(request.GET.get("to"))
    if dt_from:
        qs = qs.filter(snapshot_at__gte=dt_from)
    if dt_to:
        qs = qs.filter(snapshot_at__lte=dt_to)

    trunc = _BUCKET_TRUNC[bucket]
    rows = (
        qs.annotate(bucket=trunc("snapshot_at"))
          .values("bucket")
          .annotate(
              critical=Sum("critical_count"),
              high=Sum("high_count"),
              medium=Sum("medium_count"),
              low=Sum("low_count"),
              info=Sum("info_count"),
          )
          .order_by("bucket")
    )
    series = [
        {
            "t":        r["bucket"].isoformat() if r["bucket"] else None,
            "critical": r["critical"] or 0,
            "high":     r["high"]     or 0,
            "medium":   r["medium"]   or 0,
            "low":      r["low"]      or 0,
            "info":     r["info"]     or 0,
        }
        for r in rows
    ]
    return JsonResponse({"metric": "severity", "bucket": bucket, "series": series})


# ── /api/trends/executive-summary/ ───────────────────────────────────────────

@csrf_exempt
@require_auth
def executive_summary(request):
    if request.method != "GET":
        return JsonResponse({"error": "GET required"}, status=405)

    org_id = request.org_id
    dt_from = _parse_iso(request.GET.get("from"))
    dt_to   = _parse_iso(request.GET.get("to"))
    if dt_to is None:
        dt_to = datetime.now(tz=timezone.utc)
    if dt_from is None:
        dt_from = dt_to - timedelta(days=90)

    latest = (
        ReportMetric.objects
        .filter(organization_id=org_id)
        .order_by("-snapshot_at")
        .first()
    )
    prev = None
    if latest:
        prev = (
            ReportMetric.objects
            .filter(organization_id=org_id, snapshot_at__lt=latest.snapshot_at)
            .order_by("-snapshot_at")
            .first()
        )

    def _kpi(cur_val, prev_val):
        if cur_val is None:
            cur_val = 0
        if prev_val is None:
            prev_val = 0
        return {"value": cur_val, "delta": cur_val - prev_val}

    kpis = {
        "total_cves":     _kpi(getattr(latest, "total_cves",      0), getattr(prev, "total_cves",      0)),
        "critical_count": _kpi(getattr(latest, "critical_count",  0), getattr(prev, "critical_count",  0)),
        "high_count":     _kpi(getattr(latest, "high_count",      0), getattr(prev, "high_count",      0)),
        "cvss_max":       _kpi(getattr(latest, "cvss_max",     None), getattr(prev, "cvss_max",     None)),
        "new_cves":       {"value": getattr(latest, "new_cves_count", 0)},
        "resolved_cves":  {"value": getattr(latest, "resolved_cves_count", 0)},
        "affected_products": {
            "value": getattr(latest, "affected_products_count", 0),
        },
    }

    # 90d weekly series (reuse existing helpers via internal dict build).
    window_qs = ReportMetric.objects.filter(
        organization_id=org_id,
        snapshot_at__gte=dt_from,
        snapshot_at__lte=dt_to,
    )

    trend_buckets = (
        window_qs.annotate(bucket=TruncWeek("snapshot_at"))
        .values("bucket")
        .annotate(
            total_cves=Sum("total_cves"),
            critical=Sum("critical_count"),
            high=Sum("high_count"),
            medium=Sum("medium_count"),
            low=Sum("low_count"),
            new_cves=Sum("new_cves_count"),
            resolved_cves=Sum("resolved_cves_count"),
            cvss_max=Max("cvss_max"),
        )
        .order_by("bucket")
    )
    trends_series = [
        {
            "t":             r["bucket"].isoformat() if r["bucket"] else None,
            "total_cves":    r["total_cves"]    or 0,
            "critical":      r["critical"]      or 0,
            "high":          r["high"]          or 0,
            "medium":        r["medium"]        or 0,
            "low":           r["low"]           or 0,
            "new_cves":      r["new_cves"]      or 0,
            "resolved_cves": r["resolved_cves"] or 0,
            "cvss_max":      r["cvss_max"],
        }
        for r in trend_buckets
    ]

    # Per-source breakdown for the window (how much activity each pipeline contributes).
    sources_breakdown = list(
        window_qs.values("source")
        .annotate(count=Sum("total_cves"))
        .order_by("-count")
    )

    # Top products + top CVEs — latest snapshot wins to avoid cross-run duplication.
    top_products = latest.top_products if latest else []
    top_cves = (latest.cve_ids[:20] if latest and latest.cve_ids else [])

    return JsonResponse({
        "from":              dt_from.isoformat(),
        "to":                dt_to.isoformat(),
        "latest_snapshot_at": latest.snapshot_at.isoformat() if latest else None,
        "kpis":              kpis,
        "trends":            trends_series,
        "sources":           sources_breakdown,
        "top_products":      top_products,
        "top_cves":          top_cves,
        "mttr":              None,  # populated in phase 5 via CVEObservation
    })


# ── /api/reports/export/ciso/ ────────────────────────────────────────────────

@csrf_exempt
@require_admin
def export_ciso_pdf(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST required"}, status=405)

    try:
        body = json.loads(request.body) if request.body else {}
    except (json.JSONDecodeError, ValueError):
        body = {}

    org_id = request.org_id
    dt_to   = _parse_iso(body.get("to"))   or datetime.now(tz=timezone.utc)
    dt_from = _parse_iso(body.get("from")) or dt_to - timedelta(days=90)

    from django.http import HttpResponse as DjangoHttpResponse

    try:
        pdf_bytes = _build_ciso_pdf(org_id, dt_from, dt_to)
    except Exception:
        logger.exception("CISO PDF generation failed org=%s", org_id)
        return JsonResponse({"error": "PDF generation failed"}, status=500)

    response = DjangoHttpResponse(pdf_bytes, content_type="application/pdf")
    fname = f"ciso-report-{dt_from.strftime('%Y%m%d')}-{dt_to.strftime('%Y%m%d')}.pdf"
    response["Content-Disposition"] = f'attachment; filename="{fname}"'
    return response


def _build_ciso_pdf(org_id, dt_from, dt_to):
    """Generate a CISO board-level PDF report using reportlab."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
    )

    from .models import Organization

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        topMargin=0.75 * inch, bottomMargin=0.75 * inch,
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CISOTitle", parent=styles["Title"],
        fontSize=22, spaceAfter=6, textColor=colors.HexColor("#1a1a2e"),
    )
    heading_style = ParagraphStyle(
        "CISOHeading", parent=styles["Heading2"],
        fontSize=14, spaceBefore=16, spaceAfter=8,
        textColor=colors.HexColor("#1a1a2e"),
    )
    body_style = styles["BodyText"]
    small_style = ParagraphStyle(
        "CISOSmall", parent=body_style, fontSize=9, textColor=colors.grey,
    )

    story = []

    # ── Header ────────────────────────────────────────────────────────────
    try:
        org = Organization.objects.get(pk=org_id)
        org_name = org.name
    except Organization.DoesNotExist:
        org_name = str(org_id)

    story.append(Paragraph(f"CISO Board Report — {org_name}", title_style))
    story.append(Paragraph(
        f"Period: {dt_from.strftime('%b %d, %Y')} – {dt_to.strftime('%b %d, %Y')}",
        small_style,
    ))
    story.append(Paragraph(
        f"Generated: {datetime.now(tz=timezone.utc).strftime('%b %d, %Y %H:%M UTC')}",
        small_style,
    ))
    story.append(Spacer(1, 12))
    story.append(HRFlowable(width="100%", color=colors.HexColor("#ddd")))
    story.append(Spacer(1, 12))

    # ── Fetch data ────────────────────────────────────────────────────────
    latest = (
        ReportMetric.objects
        .filter(organization_id=org_id)
        .order_by("-snapshot_at")
        .first()
    )
    prev = None
    if latest:
        prev = (
            ReportMetric.objects
            .filter(organization_id=org_id, snapshot_at__lt=latest.snapshot_at)
            .order_by("-snapshot_at")
            .first()
        )

    window_qs = ReportMetric.objects.filter(
        organization_id=org_id,
        snapshot_at__gte=dt_from,
        snapshot_at__lte=dt_to,
    )
    from django.db.models.functions import TruncWeek
    trend_rows = list(
        window_qs.annotate(bucket=TruncWeek("snapshot_at"))
        .values("bucket")
        .annotate(
            total_cves=Sum("total_cves"),
            critical=Sum("critical_count"),
            high=Sum("high_count"),
            medium=Sum("medium_count"),
            low=Sum("low_count"),
            new_cves=Sum("new_cves_count"),
            resolved=Sum("resolved_cves_count"),
            cvss_max=Max("cvss_max"),
        )
        .order_by("bucket")
    )

    # ── KPI Summary ───────────────────────────────────────────────────────
    story.append(Paragraph("Key Performance Indicators", heading_style))

    def _delta(cur, prv):
        if cur is None:
            cur = 0
        if prv is None:
            prv = 0
        d = cur - prv
        return f" ({'+' if d >= 0 else ''}{d})" if d != 0 else ""

    kpi_data = [
        ["Metric", "Current", "Previous", "Delta"],
        [
            "Total CVEs",
            str(getattr(latest, "total_cves", 0)),
            str(getattr(prev, "total_cves", 0)),
            _delta(getattr(latest, "total_cves", 0), getattr(prev, "total_cves", 0)),
        ],
        [
            "Critical",
            str(getattr(latest, "critical_count", 0)),
            str(getattr(prev, "critical_count", 0)),
            _delta(getattr(latest, "critical_count", 0), getattr(prev, "critical_count", 0)),
        ],
        [
            "High",
            str(getattr(latest, "high_count", 0)),
            str(getattr(prev, "high_count", 0)),
            _delta(getattr(latest, "high_count", 0), getattr(prev, "high_count", 0)),
        ],
        [
            "CVSS Max",
            str(getattr(latest, "cvss_max", "—") or "—"),
            str(getattr(prev, "cvss_max", "—") or "—"),
            "",
        ],
        [
            "New CVEs",
            str(getattr(latest, "new_cves_count", 0)),
            "", "",
        ],
        [
            "Resolved CVEs",
            str(getattr(latest, "resolved_cves_count", 0)),
            "", "",
        ],
    ]

    kpi_table = Table(kpi_data, colWidths=[2.2 * inch, 1.3 * inch, 1.3 * inch, 1.5 * inch])
    kpi_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
        ("TOPPADDING", (0, 0), (-1, 0), 8),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#ddd")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f8fc")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(kpi_table)
    story.append(Spacer(1, 16))

    # ── Severity Breakdown (latest) ───────────────────────────────────────
    story.append(Paragraph("Severity Breakdown (Latest Snapshot)", heading_style))
    sev_data = [
        ["Severity", "Count"],
        ["Critical", str(getattr(latest, "critical_count", 0))],
        ["High", str(getattr(latest, "high_count", 0))],
        ["Medium", str(getattr(latest, "medium_count", 0))],
        ["Low", str(getattr(latest, "low_count", 0))],
        ["Info", str(getattr(latest, "info_count", 0))],
    ]
    sev_table = Table(sev_data, colWidths=[3 * inch, 2 * inch])
    sev_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#ddd")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f8fc")]),
        # Colour-code severity rows
        ("TEXTCOLOR", (0, 1), (0, 1), colors.HexColor("#c0392b")),  # Critical
        ("TEXTCOLOR", (0, 2), (0, 2), colors.HexColor("#e67e22")),  # High
        ("TEXTCOLOR", (0, 3), (0, 3), colors.HexColor("#2980b9")),  # Medium
        ("TEXTCOLOR", (0, 4), (0, 4), colors.HexColor("#27ae60")),  # Low
    ]))
    story.append(sev_table)
    story.append(Spacer(1, 16))

    # ── Weekly Trend Table ────────────────────────────────────────────────
    if trend_rows:
        story.append(Paragraph("Weekly Trend", heading_style))
        trend_header = ["Week", "Total", "Crit", "High", "Med", "Low", "New", "Resolved", "CVSS Max"]
        trend_data = [trend_header]
        for r in trend_rows:
            week_label = r["bucket"].strftime("%b %d") if r["bucket"] else "—"
            trend_data.append([
                week_label,
                str(r["total_cves"] or 0),
                str(r["critical"] or 0),
                str(r["high"] or 0),
                str(r["medium"] or 0),
                str(r["low"] or 0),
                str(r["new_cves"] or 0),
                str(r["resolved"] or 0),
                str(r["cvss_max"] or "—"),
            ])
        col_w = 0.78 * inch
        trend_table = Table(trend_data, colWidths=[col_w] * len(trend_header))
        trend_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#ddd")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f8fc")]),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ]))
        story.append(trend_table)
        story.append(Spacer(1, 16))

    # ── Top Products ──────────────────────────────────────────────────────
    top_products = latest.top_products if latest and latest.top_products else []
    if top_products:
        story.append(Paragraph("Top Affected Products", heading_style))
        prod_data = [["Product", "Mentions"]]
        for p in top_products[:15]:
            prod_data.append([p.get("name", "—"), str(p.get("count", 0))])
        prod_table = Table(prod_data, colWidths=[4.5 * inch, 1.5 * inch])
        prod_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#ddd")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8f8fc")]),
        ]))
        story.append(prod_table)
        story.append(Spacer(1, 16))

    # ── Top CVEs ──────────────────────────────────────────────────────────
    top_cves = latest.cve_ids[:25] if latest and latest.cve_ids else []
    if top_cves:
        story.append(Paragraph("Notable CVE IDs (Latest Snapshot)", heading_style))
        cve_text = ", ".join(top_cves)
        if latest and latest.cve_ids and len(latest.cve_ids) > 25:
            cve_text += f" … and {len(latest.cve_ids) - 25} more"
        story.append(Paragraph(cve_text, body_style))
        story.append(Spacer(1, 12))

    # ── Footer ────────────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", color=colors.HexColor("#ddd")))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "Confidential — generated by IntelliHunt",
        small_style,
    ))

    doc.build(story)
    return buf.getvalue()
