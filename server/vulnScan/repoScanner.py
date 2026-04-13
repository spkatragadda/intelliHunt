# Kickoff the process
import os
import json
import logging
from vulnScan.repoScannerCrew import get_security_crew
from vulnScan.repoScannerTools import set_allowed_base_dir, _reset_deep_dep_counter, run_static_scans

logger = logging.getLogger(__name__)


def _summarize_static_scans(raw_json: str) -> str:
    """Condense raw OSV/Semgrep JSON into a concise text summary for LLM tasks.

    The full JSON can be 100 KB+; this extracts only the actionable data
    (CVE IDs, package names, severity, Semgrep rule IDs, file paths) so the
    LLM can reason about it without blowing the context window.
    """
    try:
        data = json.loads(raw_json)
    except (json.JSONDecodeError, TypeError):
        return raw_json  # fallback: pass through as-is

    lines = []

    # ── OSV findings ────────────────────────────────────────────────────────
    osv = data.get("osv")
    if isinstance(osv, dict) and "results" in osv:
        vulns_seen = set()
        for result_group in osv["results"]:
            source = result_group.get("source", {}).get("path", "unknown")
            for pkg_info in result_group.get("packages", []):
                pkg = pkg_info.get("package", {})
                pkg_name = pkg.get("name", "?")
                pkg_ver = pkg.get("version", "?")
                for v in pkg_info.get("vulnerabilities", []):
                    vid = v.get("id", "?")
                    if vid in vulns_seen:
                        continue
                    vulns_seen.add(vid)
                    severity = "?"
                    for s in v.get("severity", []):
                        severity = s.get("score", severity)
                        break
                    summary = (v.get("summary") or v.get("details", ""))[:120]
                    aliases = ", ".join(v.get("aliases", [])[:3])
                    lines.append(
                        f"- **{vid}**{f' ({aliases})' if aliases else ''} | "
                        f"{pkg_name}@{pkg_ver} | severity {severity} | {summary}"
                    )
        if not lines:
            lines.append("- OSV-Scanner: no vulnerabilities found.")
    elif isinstance(osv, dict) and "error" in osv:
        lines.append(f"- OSV-Scanner error: {osv['error']}")
    else:
        lines.append("- OSV-Scanner: no vulnerabilities found.")

    osv_section = "\n".join(lines)

    # ── Semgrep findings ────────────────────────────────────────────────────
    sem_lines = []
    semgrep = data.get("semgrep")
    if isinstance(semgrep, dict) and "results" in semgrep:
        for finding in semgrep["results"][:50]:  # cap for brevity
            rule = finding.get("check_id", "?")
            path = finding.get("path", "?")
            line = finding.get("start", {}).get("line", "?")
            sev = finding.get("extra", {}).get("severity", "?")
            msg = finding.get("extra", {}).get("message", "")[:120]
            sem_lines.append(f"- [{sev}] `{rule}` in {path}:{line} — {msg}")
        if not sem_lines:
            sem_lines.append("- Semgrep: no findings.")
    elif isinstance(semgrep, dict) and "error" in semgrep:
        sem_lines.append(f"- Semgrep error: {semgrep['error']}")
    else:
        sem_lines.append("- Semgrep: no findings.")

    sem_section = "\n".join(sem_lines)

    return (
        f"### OSV-Scanner Findings\n{osv_section}\n\n"
        f"### Semgrep Findings\n{sem_section}"
    )


def run_pipeline(repo_path: str, tier: str = "speed"):
    """Run the full scan pipeline on a LOCAL directory path.

    Callers (views.run_repo_scan_async) are responsible for cloning remote
    repos before calling this function.  Accepting only a local path here
    eliminates duplicate cloning.
    """
    repo_path = os.path.realpath(repo_path)
    if not os.path.isdir(repo_path):
        raise ValueError(f"repo_path is not a directory: {repo_path}")

    # Configure the sandbox guard so file-reading tools only access this repo
    set_allowed_base_dir(repo_path)
    # Reset the per-scan call counter for the deep-dep web-search tool
    _reset_deep_dep_counter()

    # Run static scans deterministically — these ALWAYS execute regardless
    # of LLM behaviour.
    logger.info("Running static scans (OSV-Scanner + Semgrep) on %s", repo_path)
    static_results_json = run_static_scans(repo_path)
    logger.info("Static scans complete (%d chars of output)", len(static_results_json))

    # Build a concise summary for the LLM (avoids bloating the prompt with
    # potentially 100 KB+ of raw JSON).
    static_summary = _summarize_static_scans(static_results_json)

    crew = get_security_crew(tier=tier)
    crew_output = crew.kickoff(inputs={
        'repo_url': repo_path,
        'static_scan_results': static_summary,
    })

    return crew_output.raw or ""
