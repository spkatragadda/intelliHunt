import os
import json
import requests
import subprocess
import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from datetime import datetime
from crewai.tools import tool
from vulnScan.nsjail import run_in_sandbox

logger = logging.getLogger(__name__)

# ── Sandbox base-dir guard ───────────────────────────────────────────────────
# Set by run_pipeline() before the crew kicks off so that file-reading tools
# know which directory is the legitimate scan sandbox.
_allowed_base_dir: str | None = None


def set_allowed_base_dir(directory: str):
    global _allowed_base_dir
    _allowed_base_dir = os.path.realpath(directory)

def run_static_scans(directory: str) -> str:
    """Run OSV-Scanner and Semgrep deterministically (no LLM involved).

    Called directly by run_pipeline() — NOT via a CrewAI agent — so the
    static scan results are always produced regardless of LLM behaviour.

    Returns:
        JSON string: ``{"osv": {...}, "semgrep": {...}}``
    """
    results = {"osv": None, "semgrep": None}

    if not os.path.exists(directory):
        error_msg = f"Directory does not exist: {directory}"
        return json.dumps({"osv": {"error": error_msg}, "semgrep": {"error": error_msg}})

    if not os.path.isdir(directory):
        error_msg = f"Path is not a directory: {directory}"
        return json.dumps({"osv": {"error": error_msg}, "semgrep": {"error": error_msg}})

    directory = os.path.abspath(directory)

    # OSV Scan
    try:
        osv_cmd = ["osv-scanner", "-r", directory, "--json"]
        osv_res = subprocess.run(osv_cmd, capture_output=True, text=True, timeout=300)

        if osv_res.stdout and osv_res.stdout.strip():
            try:
                results["osv"] = json.loads(osv_res.stdout)
            except json.JSONDecodeError:
                results["osv"] = {"error": f"Failed to parse OSV output. Exit code: {osv_res.returncode}", "raw_output": osv_res.stdout[:500]}
        elif osv_res.stderr:
            results["osv"] = {"error": f"OSV-Scanner error: {osv_res.stderr[:500]}"}
        else:
            results["osv"] = {"error": "No output from OSV-Scanner"}
    except subprocess.TimeoutExpired:
        results["osv"] = {"error": "OSV-Scanner timed out after 5 minutes"}
    except Exception as e:
        results["osv"] = {"error": f"OSV-Scanner exception: {str(e)}"}

    # Semgrep Scan
    try:
        sem_cmd = ["semgrep", "scan", "--config=auto", directory, "--json"]
        sem_res = subprocess.run(sem_cmd, capture_output=True, text=True, timeout=300)

        if sem_res.stdout and sem_res.stdout.strip():
            try:
                results["semgrep"] = json.loads(sem_res.stdout)
            except json.JSONDecodeError:
                results["semgrep"] = {"error": f"Failed to parse Semgrep output. Exit code: {sem_res.returncode}", "raw_output": sem_res.stdout[:500]}
        elif sem_res.stderr:
            results["semgrep"] = {"error": f"Semgrep error: {sem_res.stderr[:500]}"}
        else:
            results["semgrep"] = {"error": "No output from Semgrep"}
    except subprocess.TimeoutExpired:
        results["semgrep"] = {"error": "Semgrep timed out after 5 minutes"}
    except Exception as e:
        results["semgrep"] = {"error": f"Semgrep exception: {str(e)}"}

    return json.dumps(results)

@tool("search_vulnerability_databases")
def search_vulnerability_databases(keyword: str) -> str:
    """Searches NVD and CISA KEV for information on a specific keyword or CVE."""
    # Simplified search for the agent
    nvd_url = f"https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch={keyword}"
    try:
        res = requests.get(nvd_url, timeout=10)
        return json.dumps(res.json().get("vulnerabilities", [])[:5]) # Return top 5
    except:
        return "Search failed."


# ── File-reading tools (bwrap-sandboxed) ─────────────────────────────────────

_SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "vendor",
    "dist", "build", ".next", ".tox", "coverage", ".mypy_cache",
    ".pytest_cache", "egg-info", ".eggs",
}

# Regex that matches import statements for known LLM / AI SDKs across
# Python and JS/TS.  Used by find_ai_code_files to pre-filter the repo
# so the AI-scan agent only reads relevant code.
_AI_SDK_PATTERN = "|".join([
    # Python imports
    r"from\s+openai\b", r"import\s+openai\b",
    r"from\s+anthropic\b", r"import\s+anthropic\b",
    r"from\s+langchain", r"import\s+langchain",
    r"from\s+llama_index", r"import\s+llama_index",
    r"from\s+crewai\b", r"import\s+crewai\b",
    r"from\s+google\.generativeai", r"import\s+google\.generativeai",
    r"from\s+cohere\b", r"import\s+cohere\b",
    r"from\s+mistralai\b", r"import\s+mistralai\b",
    r"from\s+ollama\b", r"import\s+ollama\b",
    r"from\s+groq\b", r"import\s+groq\b",
    r"from\s+litellm\b", r"import\s+litellm\b",
    r"from\s+instructor\b", r"import\s+instructor\b",
    r"from\s+autogen\b", r"import\s+autogen\b",
    r"from\s+semantic_kernel", r"import\s+semantic_kernel",
    r"from\s+transformers\b", r"import\s+transformers\b",
    # JS/TS imports (require / from … import)
    r"""from\s+['"]@anthropic-ai/sdk""",
    r"""require\(\s*['"]@anthropic-ai/sdk""",
    r"""from\s+['"]openai""",
    r"""require\(\s*['"]openai""",
    r"""from\s+['"]@langchain""",
    r"""require\(\s*['"]@langchain""",
    r"""from\s+['"]@google/generative-ai""",
    r"""from\s+['"]llamaindex""",
    r"""from\s+['"]cohere-ai""",
    r"""from\s+['"]@mistralai""",
    r"""from\s+['"]ai['"]""",
    r"""from\s+['"]@ai-sdk""",
])

_SOURCE_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go", ".rb", ".php",
    ".cs", ".c", ".cpp", ".h", ".rs", ".kt", ".swift", ".vue", ".scala",
    ".sh", ".bash", ".sql", ".yml", ".yaml", ".toml", ".cfg", ".ini",
    ".env", ".conf",
}


@tool("list_repo_files")
def list_repo_files(directory: str, extensions: str = "") -> str:
    """Lists source-code files in a repository directory.
    Runs inside a bwrap sandbox with the repo mounted read-only.

    Args:
        directory: Absolute path to the repo root on the host.
        extensions: Optional comma-separated extensions to filter by (e.g. ".py,.js,.ts").
                    If empty, common source-code extensions are used.
    Returns:
        JSON string with {"total_files": N, "files": [{"path": "relative/path", "size_bytes": N}]}
    """
    if _allowed_base_dir is None:
        return json.dumps({"error": "Sandbox base directory not configured."})

    real_dir = os.path.realpath(directory)
    if not real_dir.startswith(_allowed_base_dir):
        return json.dumps({"error": "Access denied: directory is outside the scan sandbox."})

    # Run `find /repo -type f` inside sandbox
    raw = run_in_sandbox(
        ["find", "/repo", "-type", "f"],
        repo_dir=real_dir,
        timeout=30,
    )

    # Parse extensions filter
    if extensions.strip():
        ext_filter = {e.strip().lower() for e in extensions.split(",") if e.strip()}
    else:
        ext_filter = _SOURCE_EXTENSIONS

    files = []
    for line in raw.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        # line is a path inside the jail like /repo/src/app.py
        # Convert to relative path
        rel = line.removeprefix("/repo/").removeprefix("/repo")
        if not rel:
            continue

        # Skip excluded directories
        parts = rel.split("/")
        if any(p in _SKIP_DIRS for p in parts):
            continue

        # Filter by extension
        _, ext = os.path.splitext(rel)
        if ext.lower() not in ext_filter:
            continue

        # Get file size from the host (the file is the same)
        host_path = os.path.join(real_dir, rel)
        try:
            size = os.path.getsize(host_path)
        except OSError:
            size = 0

        files.append({"path": rel, "size_bytes": size})

    # Sort by size descending, cap at 500
    files.sort(key=lambda f: f["size_bytes"], reverse=True)
    files = files[:500]

    return json.dumps({"total_files": len(files), "files": files})


@tool("read_file_content")
def read_file_content(file_path: str, max_lines: int = 300) -> str:
    """Reads the content of a source file inside the scanned repository.
    Runs inside a bwrap sandbox with the repo mounted read-only.
    Returns file content with line numbers prepended for easy reference.

    Args:
        file_path: Absolute path to the file on the host, or a path relative
                   to the repo root.
        max_lines: Maximum number of lines to return (default 300, hard cap 500).
    Returns:
        File content with line numbers, or an error message.
    """
    if _allowed_base_dir is None:
        return "Error: Sandbox base directory not configured."

    # Normalise: if the path is relative, treat it as relative to the base dir
    if not os.path.isabs(file_path):
        file_path = os.path.join(_allowed_base_dir, file_path)

    real_path = os.path.realpath(file_path)
    if not real_path.startswith(_allowed_base_dir + os.sep) and real_path != _allowed_base_dir:
        return "Error: Access denied. File is outside the scan sandbox."

    if not os.path.isfile(real_path):
        return f"Error: File not found: {file_path}"

    # Binary detection: check first 1KB for null bytes
    try:
        with open(real_path, "rb") as f:
            chunk = f.read(1024)
        if b"\x00" in chunk:
            return "Error: File appears to be binary."
    except OSError as e:
        return f"Error reading file: {e}"

    # Clamp max_lines
    max_lines = min(max(1, max_lines), 500)

    # Translate host path → jailed path
    rel = os.path.relpath(real_path, _allowed_base_dir)
    jailed_path = f"/repo/{rel}"

    # Use head inside sandbox to read the file
    raw = run_in_sandbox(
        ["head", "-n", str(max_lines), jailed_path],
        repo_dir=_allowed_base_dir,
        timeout=15,
    )

    # Prepend line numbers
    lines = raw.splitlines()
    numbered = []
    for i, line in enumerate(lines, 1):
        numbered.append(f"{i:>5} | {line}")

    result = "\n".join(numbered)

    # Check if file was truncated
    total_lines_raw = run_in_sandbox(
        ["wc", "-l", jailed_path],
        repo_dir=_allowed_base_dir,
        timeout=10,
    )
    try:
        total_lines = int(total_lines_raw.strip().split()[0])
    except (ValueError, IndexError):
        total_lines = len(lines)

    if total_lines > max_lines:
        result += f"\n\n[TRUNCATED: file has {total_lines} total lines, showing first {max_lines}]"

    return result


# ── AI/LLM code discovery tool ─────────────────────────────────────────────

@tool("find_ai_code_files")
def find_ai_code_files(directory: str) -> str:
    """Finds source files that import known LLM / AI SDKs (OpenAI, Anthropic,
    LangChain, CrewAI, etc.).  Use this FIRST to decide which files to read
    with read_file_content — it prevents wasting time on non-AI code.

    Args:
        directory: Absolute path to the repository root.
    Returns:
        JSON string with {"total_files": N, "files": [{"path": ..., "size_bytes": ..., "sdk_hint": ...}]}
    """
    if _allowed_base_dir is None:
        return json.dumps({"error": "Sandbox base directory not configured."})

    real_dir = os.path.realpath(directory)
    if not real_dir.startswith(_allowed_base_dir):
        return json.dumps({"error": "Access denied: directory is outside the scan sandbox."})

    # Use grep inside the sandbox to find files matching the AI SDK pattern.
    # grep -rlE returns file paths (one per line) that contain at least one match.
    try:
        raw = run_in_sandbox(
            ["grep", "-rlE", _AI_SDK_PATTERN, "/repo"],
            repo_dir=real_dir,
            timeout=60,
        )
    except Exception as exc:
        logger.warning("find_ai_code_files grep failed: %s", exc)
        return json.dumps({"total_files": 0, "files": [], "note": f"grep error: {exc}"})

    if not raw or not raw.strip():
        return json.dumps({"total_files": 0, "files": []})

    files = []
    for line in raw.strip().splitlines():
        line = line.strip()
        if not line:
            continue

        rel = line.removeprefix("/repo/").removeprefix("/repo")
        if not rel:
            continue

        # Skip excluded directories
        parts = rel.split("/")
        if any(p in _SKIP_DIRS for p in parts):
            continue

        # Only include recognised source-code extensions
        _, ext = os.path.splitext(rel)
        if ext.lower() not in _SOURCE_EXTENSIONS:
            continue

        host_path = os.path.join(real_dir, rel)
        try:
            size = os.path.getsize(host_path)
        except OSError:
            size = 0

        # Determine which SDK was detected (best-effort, first match)
        sdk_hint = ""
        try:
            jailed_path = f"/repo/{rel}"
            hint_raw = run_in_sandbox(
                ["grep", "-oEm1", _AI_SDK_PATTERN, jailed_path],
                repo_dir=real_dir,
                timeout=10,
            )
            if hint_raw and hint_raw.strip():
                sdk_hint = hint_raw.strip().splitlines()[0].strip()
        except Exception:
            pass

        files.append({"path": rel, "size_bytes": size, "sdk_hint": sdk_hint})

    # Sort by size descending, cap at 50
    files.sort(key=lambda f: f["size_bytes"], reverse=True)
    files = files[:50]

    return json.dumps({"total_files": len(files), "files": files})


# ── Deep dependency web-search tool (legend tier only) ─────────────────────

# Hard cap on the number of packages searched per scan run.
_DEEP_DEP_MAX = int(os.environ.get("DEEP_DEP_MAX_PACKAGES", "15"))
_deep_dep_call_count = 0


def _reset_deep_dep_counter():
    """Reset the per-scan call counter.  Called by repoScanner.run_pipeline."""
    global _deep_dep_call_count
    _deep_dep_call_count = 0


def _google_search_safe(query: str, num_results: int = 3, timeout: int = 10):
    """Run googlesearch.search in a thread with a hard timeout."""
    from googlesearch import search as gsearch

    def _do():
        return list(gsearch(query, num_results=num_results))

    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(_do)
        try:
            return future.result(timeout=timeout)
        except (FuturesTimeoutError, Exception) as exc:
            logger.warning("Google search timed out or failed for %r: %s", query, exc)
            return []


@tool("deep_dependency_web_search")
def deep_dependency_web_search(package_name: str, ecosystem: str = "", version: str = "") -> str:
    """Searches Google and NVD for recently-disclosed or unlisted vulnerabilities
    for a specific third-party dependency.  Call once per package.

    Args:
        package_name: Name of the package (e.g. "lodash", "requests").
        ecosystem:    Package ecosystem (e.g. "npm", "PyPI"). Optional.
        version:      Currently-used version string. Optional.
    Returns:
        JSON string with search results, NVD matches, and any errors.
    """
    global _deep_dep_call_count

    if _deep_dep_call_count >= _DEEP_DEP_MAX:
        return json.dumps({
            "package": package_name,
            "skipped": True,
            "reason": f"Package search cap ({_DEEP_DEP_MAX}) reached.",
        })
    _deep_dep_call_count += 1

    current_year = datetime.now().year
    result = {
        "package": package_name,
        "ecosystem": ecosystem,
        "version": version,
        "queries": [],
        "search_results": [],
        "nvd_matches": [],
    }

    # --- Google queries ---
    queries = [
        f'"{package_name}" CVE vulnerability {current_year}',
        f'"{package_name}" security advisory site:github.com',
    ]

    for q in queries:
        result["queries"].append(q)
        urls = _google_search_safe(q, num_results=3, timeout=10)
        for url in urls:
            result["search_results"].append({
                "url": url,
                "query": q,
            })

    # --- NVD lookup ---
    try:
        nvd_keyword = f"{package_name} {version}".strip()
        nvd_url = f"https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch={nvd_keyword}"
        resp = requests.get(nvd_url, timeout=10)
        vulns = resp.json().get("vulnerabilities", [])[:3]
        for v in vulns:
            cve_item = v.get("cve", {})
            result["nvd_matches"].append({
                "cve_id": cve_item.get("id", ""),
                "description": (cve_item.get("descriptions", [{}])[0].get("value", ""))[:300],
            })
    except Exception as exc:
        result["nvd_matches"] = [{"error": str(exc)}]

    return json.dumps(result)