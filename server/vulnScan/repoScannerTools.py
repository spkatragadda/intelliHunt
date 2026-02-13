import os
import json
import requests
import tempfile
import subprocess
from crewai.tools import tool
from git import Repo

@tool("clone_repo")
def clone_github_repo(repo_url: str) -> str:
    """Clones a GitHub repository to a temporary directory and returns the path."""
    temp_dir = tempfile.mkdtemp()
    Repo.clone_from(repo_url, temp_dir)
    return temp_dir

@tool("run_security_scans")
def run_security_scans(directory: str) -> str:
    """Runs OSV-Scanner and Semgrep on a directory and returns a combined JSON summary."""
    results = {"osv": None, "semgrep": None}
    
    # OSV Scan
    try:
        osv_cmd = ["osv-scanner", "-r", directory, "--json"]
        osv_res = subprocess.run(osv_cmd, capture_output=True, text=True)
        results["osv"] = json.loads(osv_res.stdout) if osv_res.stdout else {"error": "No output"}
    except Exception as e:
        results["osv"] = {"error": str(e)}

    # Semgrep Scan
    try:
        sem_cmd = ["semgrep", "scan", "--config=auto", directory, "--json"]
        sem_res = subprocess.run(sem_cmd, capture_output=True, text=True)
        results["semgrep"] = json.loads(sem_res.stdout) if sem_res.stdout else {"error": "No output"}
    except Exception as e:
        results["semgrep"] = {"error": str(e)}

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