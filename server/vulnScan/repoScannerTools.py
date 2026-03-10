import os
import json
import requests
import tempfile
import subprocess
from crewai.tools import tool
from git import Repo

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