import os
import tempfile
import subprocess
import json
import requests
from git import Repo  # From GitPython
from langchain_openai import OpenAI  # Assuming OpenAI LLM, install langchain-openai
from langchain.agents import create_react_agent, AgentExecutor
from langchain.tools import tool
from langchain.prompts import PromptTemplate
from langchain import hub

# Note: You need to install dependencies:
# pip install gitpython langchain langchain-openai requests
# Also, install CLI tools: go install github.com/google/osv-scanner/cmd/osv-scanner@latest
# pip install semgrep
# Set OPENAI_API_KEY environment variable

@tool
def clone_github_repo(repo_url: str) -> str:
    """Clones a GitHub repository to a temporary directory and returns the path."""
    temp_dir = tempfile.mkdtemp()
    Repo.clone_from(repo_url, temp_dir)
    return temp_dir

@tool
def run_osv_scanner(directory: str) -> dict:
    """Runs OSV-Scanner on the given directory and returns the JSON output."""
    try:
        result = subprocess.run(
            ["osv-scanner", "-r", directory, "--json"],
            capture_output=True,
            text=True,
            check=True
        )
        return json.loads(result.stdout)
    except Exception as e:
        return {"error": str(e)}

@tool
def run_semgrep_scan(directory: str) -> dict:
    """Runs Semgrep security scan on the directory and returns JSON output."""
    try:
        result = subprocess.run(
            ["semgrep", "scan", "--config=auto", directory, "--json"],
            capture_output=True,
            text=True,
            check=True
        )
        return json.loads(result.stdout)
    except Exception as e:
        return {"error": str(e)}

@tool
def fetch_cisa_kev() -> dict:
    """Fetches the CISA Known Exploited Vulnerabilities JSON."""
    url = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    else:
        return {"error": "Failed to fetch KEV"}

@tool
def check_vulns_against_kev(osv_results: dict, kev_data: dict) -> list:
    """Checks CVEs from OSV results against CISA KEV and returns matching ones."""
    matching = []
    if "error" in osv_results or "error" in kev_data:
        return matching
    
    cves = set()
    for result in osv_results.get("results", []):
        for vuln in result.get("packages", []):
            for v in vuln.get("vulnerabilities", []):
                if "id" in v and v["id"].startswith("CVE-"):
                    cves.add(v["id"])
    
    kev_vulns = kev_data.get("vulnerabilities", [])
    for cve in cves:
        for kev in kev_vulns:
            if kev.get("cveID") == cve:
                matching.append(kev)
    return matching

@tool
def search_github_security_advisories(package_name: str, ecosystem: str = "") -> dict:
    """Searches GitHub Security Advisories for vulnerabilities related to the given package and optional ecosystem."""
    url = "https://api.github.com/security-advisories"
    params = {"package_name": package_name}
    if ecosystem:
        params["ecosystem"] = ecosystem.lower()  # Ecosystems like npm, pip, maven, etc.
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    }
    response = requests.get(url, params=params, headers=headers)
    if response.status_code == 200:
        return response.json()
    else:
        return {"error": f"Failed with status {response.status_code}: {response.text}"}

@tool
def search_nvd(keyword: str) -> dict:
    """Searches the National Vulnerability Database (NVD) for vulnerabilities using the given keyword (e.g., package name or CVE)."""
    url = "https://services.nvd.nist.gov/rest/json/cves/2.0"
    params = {
        "keywordSearch": keyword,
        "resultsPerPage": 50  # Adjust as needed, max 2000
    }
    response = requests.get(url, params=params)
    if response.status_code == 200:
        return response.json()
    else:
        return {"error": f"Failed with status {response.status_code}: {response.text}"}

# Pull ReAct prompt from hub
react_prompt = hub.pull("hwchase17/react")

# Initialize LLM (replace with your preferred LLM)
llm = OpenAI(temperature=0)

# Tools list
tools = [
    clone_github_repo, 
    run_osv_scanner, 
    run_semgrep_scan, 
    fetch_cisa_kev, 
    check_vulns_against_kev,
    search_github_security_advisories,
    search_nvd
]

# Create agent
agent = create_react_agent(llm, tools, react_prompt)

# Agent executor
agent_executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

def run_pipeline(input_repo: str):
    """Runs the agentic pipeline on the input repo (local dir or GitHub URL)."""
    prompt = f"""
    Analyze the code repository at '{input_repo}' for known vulnerabilities from NVD, CISA, OSV, and GitHub Advisory Database.
    Also check for potential exploitable vulnerabilities during execution using static analysis.
    Additionally, search the National Vulnerability Database (NVD) and GitHub Security Advisories directly for any additional vulnerabilities related to the repo's dependencies or code.
    
    Steps:
    1. If the input is a GitHub URL (starts with https://github.com/), clone it to a temp dir using clone_github_repo.
    2. If it's a local directory, use it directly.
    3. Run run_osv_scanner on the directory to get dependency vulnerabilities (covers OSV, GitHub, NVD).
    4. Fetch CISA KEV using fetch_cisa_kev.
    5. Check the OSV results against KEV using check_vulns_against_kev.
    6. Run run_semgrep_scan for potential execution vulnerabilities.
    7. Extract key dependencies, packages, or potential vulnerability keywords from the previous results or by analyzing the directory.
       Then, use search_github_security_advisories and search_nvd to query for additional vulnerabilities not covered by OSV-Scanner.
       For example, query by package names and ecosystems (e.g., npm, pip) for GitHub, and keywords for NVD.
    8. Summarize all findings, including any additional ones from direct NVD and GitHub searches.
    """
    response = agent_executor.invoke({"input": prompt})
    return response["output"]

# Example usage
# run_pipeline("https://github.com/someuser/somerepo")
# or
# run_pipeline("/path/to/local/repo")