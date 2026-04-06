import os
import json
import requests
import tempfile
import subprocess
from crewai.tools import tool
from git import Repo
from vulnScan.nsjail import run_in_nsjail

# ── Sandbox base-dir guard ───────────────────────────────────────────────────
# Set by run_pipeline() before the crew kicks off so that file-reading tools
# know which directory is the legitimate scan sandbox.
_allowed_base_dir: str | None = None


def set_allowed_base_dir(directory: str):
    global _allowed_base_dir
    _allowed_base_dir = os.path.realpath(directory)

@tool("clone_repo")
def clone_github_repo(repo_url: str) -> str:
    """Clones a GitHub repository to a temporary directory and returns the path.
    If repo_url is a local filesystem path, validates and returns it directly."""
    # Check if this is a local filesystem path
    if os.path.exists(repo_url) and os.path.isdir(repo_url):
        # It's a local directory path - return it directly
        return os.path.abspath(repo_url)

    # It's a Git URL - clone it
    temp_dir = tempfile.mkdtemp()
    Repo.clone_from(repo_url, temp_dir)
    return temp_dir

@tool("run_security_scans")
def run_security_scans(directory: str) -> str:
    """Runs OSV-Scanner and Semgrep on a directory and returns a combined JSON summary."""
    results = {"osv": None, "semgrep": None}

    # Validate directory path
    if not os.path.exists(directory):
        error_msg = f"Directory does not exist: {directory}"
        return json.dumps({"osv": {"error": error_msg}, "semgrep": {"error": error_msg}})

    if not os.path.isdir(directory):
        error_msg = f"Path is not a directory: {directory}"
        return json.dumps({"osv": {"error": error_msg}, "semgrep": {"error": error_msg}})

    # Convert to absolute path for clarity
    directory = os.path.abspath(directory)

    # OSV Scan
    try:
        osv_cmd = ["osv-scanner", "-r", directory, "--json"]
        # Don't use check=True because osv-scanner returns non-zero when vulnerabilities are found
        osv_res = subprocess.run(osv_cmd, capture_output=True, text=True, timeout=300)

        # Try to parse stdout first, even if exit code is non-zero
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
        # Don't use check=True because semgrep returns non-zero when findings are found
        sem_res = subprocess.run(sem_cmd, capture_output=True, text=True, timeout=300)

        # Try to parse stdout first, even if exit code is non-zero
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


# ── File-reading tools (nsjail-sandboxed) ────────────────────────────────────

_SKIP_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "vendor",
    "dist", "build", ".next", ".tox", "coverage", ".mypy_cache",
    ".pytest_cache", "egg-info", ".eggs",
}

_SOURCE_EXTENSIONS = {
    ".py", ".js", ".ts", ".jsx", ".tsx", ".java", ".go", ".rb", ".php",
    ".cs", ".c", ".cpp", ".h", ".rs", ".kt", ".swift", ".vue", ".scala",
    ".sh", ".bash", ".sql", ".yml", ".yaml", ".toml", ".cfg", ".ini",
    ".env", ".conf",
}


@tool("list_repo_files")
def list_repo_files(directory: str, extensions: str = "") -> str:
    """Lists source-code files in a repository directory.
    Runs inside an nsjail sandbox with the repo mounted read-only.

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

    # Run `find /repo -type f` inside nsjail
    raw = run_in_nsjail(
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
    Runs inside an nsjail sandbox with the repo mounted read-only.
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

    # Use head inside nsjail to read the file
    raw = run_in_nsjail(
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
    total_lines_raw = run_in_nsjail(
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