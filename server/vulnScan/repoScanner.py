# import os
# import tempfile
# import subprocess
# import json
# import requests
# import re
# import time
# import random
# from git import Repo  # From GitPython
# from langchain_openai import OpenAI  # Assuming OpenAI LLM, install langchain-openai
# from langchain_openai.chat_models import ChatOpenAI
# from langchain.agents import create_react_agent, AgentExecutor
# from langchain.tools import tool
# from langchain.prompts import PromptTemplate
# from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
# from langchain import hub
# from prompt import prompt
# from dotenv import load_dotenv
# from pathlib import Path
# import uuid
# from langchain.agents import create_openai_tools_agent
# load_dotenv()

# # Global dictionary to track temp files for vulnerability data
# vulnerability_temp_files = {} 

# # Global storage for current scan results (OSV and Semgrep)
# current_scan_results = {} 

# os.environ["MODEL"] = os.getenv("MODEL")
# os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY")

# # Note: You need to install dependencies:
# # pip install gitpython langchain langchain-openai requests
# # Also, install CLI tools: go install github.com/google/osv-scanner/cmd/osv-scanner@latest
# # pip install semgrep
# # Set OPENAI_API_KEY environment variable

# def count_vulnerabilities(data) -> int:
#     """Counts the number of vulnerabilities in different response formats."""
#     if isinstance(data, dict) and "error" in data:
#         return 0
    
#     # GitHub Security Advisories format: list of advisories
#     if isinstance(data, list):
#         return len(data)
    
#     if not isinstance(data, dict):
#         return 0
    
#     # CISA KEV format: {"vulnerabilities": [...]}
#     if "vulnerabilities" in data and isinstance(data["vulnerabilities"], list):
#         return len(data["vulnerabilities"])
    
#     # NVD format: {"vulnerabilities": [...]}
#     if "vulnerabilities" in data and isinstance(data["vulnerabilities"], list):
#         return len(data["vulnerabilities"])
    
#     # NVD format: {"result": {"CVE_Items": [...]}}
#     if "result" in data and "CVE_Items" in data["result"]:
#         return len(data["result"]["CVE_Items"])
    
#     return 0

# def extract_vulnerabilities_list(data) -> list:
#     """Extracts the list of vulnerabilities from different response formats."""
#     if isinstance(data, dict) and "error" in data:
#         return []
    
#     # GitHub Security Advisories format: list of advisories
#     if isinstance(data, list):
#         return data
    
#     if not isinstance(data, dict):
#         return []
    
#     # CISA KEV format
#     if "vulnerabilities" in data and isinstance(data["vulnerabilities"], list):
#         return data["vulnerabilities"]
    
#     # NVD format: {"vulnerabilities": [...]}
#     if "vulnerabilities" in data and isinstance(data["vulnerabilities"], list):
#         return data["vulnerabilities"]
    
#     # NVD format: {"result": {"CVE_Items": [...]}}
#     if "result" in data and "CVE_Items" in data["result"]:
#         return data["result"]["CVE_Items"]
    
#     return []

# @tool
# def clone_github_repo(repo_url: str) -> str:
#     """Clones a GitHub repository to a temporary directory and returns the path."""
#     temp_dir = tempfile.mkdtemp()
#     Repo.clone_from(repo_url, temp_dir)
#     return temp_dir

# def run_osv_scanner(directory: str) -> dict:
#     """Runs OSV-Scanner on the given directory and returns the JSON output.
#     This is a programmatic function, not an agent tool."""
#     try:
#         import shutil
        
#         # Clean and validate directory path
#         directory = directory.strip().replace("'", "").replace('"', "")
#         # Normalize the path (resolve any .., ., etc.)
#         directory = os.path.normpath(directory)
#         # Convert to absolute path for clarity
#         directory = os.path.abspath(directory)
        
#         # Check if directory exists
#         if not os.path.exists(directory):
#             return {"error": f"Directory does not exist: {directory}"}
        
#         if not os.path.isdir(directory):
#             return {"error": f"Path is not a directory: {directory}"}
        
#         # Find osv-scanner binary - try multiple locations
#         osv_scanner_path = None
#         possible_paths = [
#             "/usr/local/bin/osv-scanner",
#             "/usr/bin/osv-scanner",
#             shutil.which("osv-scanner"),
#             "osv-scanner"  # Fallback to PATH
#         ]
        
#         for path in possible_paths:
#             if path and (path == "osv-scanner" or os.path.exists(path)):
#                 # Check if it's executable
#                 if path == "osv-scanner" or os.access(path, os.X_OK):
#                     osv_scanner_path = path
#                     break
        
#         if not osv_scanner_path:
#             return {"error": "osv-scanner binary not found. Please ensure osv-scanner is installed and in PATH."}
        
#         # Run osv-scanner - try different flag formats
#         # Different versions may use different flag formats
#         result = None
#         error = None
#         flag_formats = [
#             ["-r", directory, "--json"],  # Most common format
#             ["-r", directory, "--format", "json"],  # Alternative format
#             ["--json", "-r", directory],  # Different argument order
#         ]
        
#         for flag_format in flag_formats:
#             try:
#                 result = subprocess.run(
#                     [osv_scanner_path] + flag_format,
#                     capture_output=True,
#                     text=True,
#                     check=True,
#                     timeout=300  # 5 minute timeout
#                 )
#                 error = None
#                 break  # Success, exit loop
#             except subprocess.CalledProcessError as e:
#                 error = e
#                 continue  # Try next format
        
#         if error:
#             error_msg = f"osv-scanner failed with exit code {error.returncode}"
#             if error.stderr:
#                 error_msg += f": {error.stderr}"
#             if error.stdout:
#                 error_msg += f"\nOutput: {error.stdout}"
#             return {"error": error_msg}
        
#         if not result or not result.stdout.strip():
#             return {"error": "osv-scanner returned empty output"}
        
#         return json.loads(result.stdout)
#     except subprocess.TimeoutExpired:
#         return {"error": "osv-scanner timed out after 5 minutes"}
#     except json.JSONDecodeError as e:
#         return {"error": f"Failed to parse osv-scanner JSON output: {str(e)}"}
#     except Exception as e:
#         return {"error": f"Unexpected error running osv-scanner: {str(e)}"}

# def run_semgrep_scan(directory: str) -> dict:
#     """Runs Semgrep security scan on the directory and returns JSON output.
#     This is a programmatic function, not an agent tool."""
#     try:
#         import shutil
        
#         # Clean and validate directory path
#         directory = directory.strip().replace("'", "").replace('"', "")
#         # Normalize the path (resolve any .., ., etc.)
#         directory = os.path.normpath(directory)
#         # Convert to absolute path for clarity
#         directory = os.path.abspath(directory)
        
#         # Check if directory exists
#         if not os.path.exists(directory):
#             return {"error": f"Directory does not exist: {directory}"}
        
#         if not os.path.isdir(directory):
#             return {"error": f"Path is not a directory: {directory}"}
        
#         # Find semgrep binary - try multiple locations
#         semgrep_path = None
#         possible_paths = [
#             "/usr/local/bin/semgrep",
#             "/usr/bin/semgrep",
#             shutil.which("semgrep"),
#             "semgrep"  # Fallback to PATH
#         ]
        
#         for path in possible_paths:
#             if path and (path == "semgrep" or os.path.exists(path)):
#                 # Check if it's executable
#                 if path == "semgrep" or os.access(path, os.X_OK):
#                     semgrep_path = path
#                     break
        
#         if not semgrep_path:
#             return {"error": "semgrep binary not found. Please ensure semgrep is installed and in PATH."}
        
#         # Run semgrep
#         result = subprocess.run(
#             [semgrep_path, "scan", "--config=auto", directory, "--json"],
#             capture_output=True,
#             text=True,
#             check=True,
#             timeout=300  # 5 minute timeout
#         )
        
#         if not result.stdout.strip():
#             return {"error": "semgrep returned empty output"}
        
#         return json.loads(result.stdout)
#     except subprocess.TimeoutExpired:
#         return {"error": "semgrep timed out after 5 minutes"}
#     except subprocess.CalledProcessError as e:
#         error_msg = f"semgrep failed with exit code {e.returncode}"
#         if e.stderr:
#             error_msg += f": {e.stderr}"
#         if e.stdout:
#             error_msg += f"\nOutput: {e.stdout}"
#         return {"error": error_msg}
#     except json.JSONDecodeError as e:
#         return {"error": f"Failed to parse semgrep JSON output: {str(e)}"}
#     except Exception as e:
#         return {"error": f"Unexpected error running semgrep: {str(e)}"}

# @tool
# def fetch_cisa_kev() -> dict:
#     """Fetches the CISA Known Exploited Vulnerabilities JSON. If more than 10 vulnerabilities are found, they are written to a temp file for chunked processing."""
#     url = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
#     response = requests.get(url)
#     if response.status_code == 200:
#         data = response.json()
#         vuln_count = count_vulnerabilities(data)
        
#         # If more than 10 vulnerabilities, write to temp file
#         if vuln_count > 10:
#             file_id = str(uuid.uuid4())
#             temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json', prefix=f'cisa_kev_{file_id}_')
#             json.dump(data, temp_file, indent=2)
#             temp_file.close()
#             vulnerability_temp_files[file_id] = {
#                 "file_path": temp_file.name,
#                 "total_count": vuln_count,
#                 "source": "cisa_kev"
#             }
#             return {
#                 "message": f"Found {vuln_count} vulnerabilities (more than 10). Data written to temp file.",
#                 "file_id": file_id,
#                 "total_count": vuln_count,
#                 "chunked": True,
#                 "instruction": "Use read_vulnerability_chunk tool with this file_id to process vulnerabilities in chunks of 10."
#             }
#         else:
#             return data
#     else:
#         return {"error": "Failed to fetch KEV"}

# @tool
# def get_kev_data(file_id: str = None) -> dict:
#     """Gets the full CISA KEV data. If file_id is provided (from a chunked fetch_cisa_kev response), 
#     loads the data from the temp file. Otherwise, fetches fresh data from CISA."""
#     if file_id:
#         # Load from temp file
#         if file_id not in vulnerability_temp_files:
#             return {"error": f"File ID {file_id} not found. Make sure to use a file_id returned from fetch_cisa_kev."}
        
#         file_info = vulnerability_temp_files[file_id]
#         file_path = file_info["file_path"]
        
#         try:
#             with open(file_path, 'r') as f:
#                 return json.load(f)
#         except FileNotFoundError:
#             return {"error": f"Temp file not found at {file_path}"}
#         except json.JSONDecodeError as e:
#             return {"error": f"Failed to parse JSON from temp file: {str(e)}"}
#         except Exception as e:
#             return {"error": f"Error reading file: {str(e)}"}
#     else:
#         # Fetch fresh data
#         return fetch_cisa_kev()

# def fetch_cisa_kev_full() -> dict:
#     """Deterministically fetch the full KEV dataset (handles chunked responses automatically)."""
#     kev_response = fetch_cisa_kev()
#     # If not chunked, return directly
#     if not (isinstance(kev_response, dict) and kev_response.get("chunked")):
#         return kev_response

#     file_id = kev_response.get("file_id")
#     if not file_id or file_id not in vulnerability_temp_files:
#         return {"error": "KEV response was chunked but file_id is missing or not found."}

#     file_info = vulnerability_temp_files[file_id]
#     file_path = file_info["file_path"]
#     try:
#         with open(file_path, "r") as f:
#             return json.load(f)
#     except FileNotFoundError:
#         return {"error": f"Temp file not found at {file_path}"}
#     except json.JSONDecodeError as e:
#         return {"error": f"Failed to parse JSON from temp file: {str(e)}"}
#     except Exception as e:
#         return {"error": f"Error reading KEV file: {str(e)}"}

# def check_vulns_against_kev_internal(osv_results: dict, kev_data: dict) -> dict:
#     """Deterministically check CVEs from OSV results against KEV data."""
#     if not isinstance(osv_results, dict) or "error" in osv_results:
#         return {"error": f"Invalid OSV results: {osv_results.get('error') if isinstance(osv_results, dict) else 'unknown error'}"}
#     if not isinstance(kev_data, dict) or "error" in kev_data:
#         return {"error": f"Invalid KEV data: {kev_data.get('error') if isinstance(kev_data, dict) else 'unknown error'}"}

#     cves = set()
#     for result in osv_results.get("results", []):
#         for package in result.get("packages", []):
#             for vuln in package.get("vulnerabilities", []):
#                 if "id" in vuln and vuln["id"].startswith("CVE-"):
#                     cves.add(vuln["id"])

#     kev_vulns = kev_data.get("vulnerabilities", []) or kev_data.get("all_vulnerabilities", [])
#     matching = []
#     for cve in cves:
#         for kev in kev_vulns:
#             cve_id = None
#             if isinstance(kev, dict):
#                 cve_id = kev.get("cveID") or kev.get("cve") or kev.get("id")
#             elif isinstance(kev, str):
#                 cve_id = kev
#             if cve_id and cve_id == cve:
#                 matching.append(kev)

#     return {
#         "matched_count": len(matching),
#         "matched_vulnerabilities": matching,
#         "cves_checked": list(cves),
#         "total_kev_vulnerabilities": len(kev_vulns),
#         "message": f"Found {len(matching)} CVEs from the scan that are in CISA KEV (out of {len(kev_vulns)} total KEV entries)"
#     }

# @tool
# def process_all_chunks(file_id: str) -> dict:
#     """Automatically processes ALL chunks from a chunked vulnerability file and returns a comprehensive summary.
#     This tool reads through all chunks automatically, so you don't need to manually iterate.
#     Args:
#         file_id: The file ID returned from fetch_cisa_kev, search_github_security_advisories, or search_nvd when chunked=True
#     Returns a summary with total count, all vulnerabilities, and key statistics."""
#     # Clean file_id
#     file_id = str(file_id).strip().strip("'\"")
    
#     if file_id not in vulnerability_temp_files:
#         return {"error": f"File ID '{file_id}' not found. Make sure to use a file_id returned from fetch_cisa_kev, search_github_security_advisories, or search_nvd."}
    
#     file_info = vulnerability_temp_files[file_id]
#     file_path = file_info["file_path"]
#     total_count = file_info["total_count"]
#     source = file_info["source"]
    
#     try:
#         # Load the entire file (it's already saved, so we can load it all at once)
#         with open(file_path, 'r') as f:
#             data = json.load(f)
        
#         vulnerabilities = extract_vulnerabilities_list(data)
        
#         # Extract key information for summary
#         summary = {
#             "source": source,
#             "total_vulnerabilities": len(vulnerabilities),
#             "file_id": file_id,
#             "message": f"Successfully processed all {len(vulnerabilities)} vulnerabilities from {source}",
#             "all_vulnerabilities": vulnerabilities,
#             "statistics": {}
#         }
        
#         # Add statistics based on source type
#         if source == "cisa_kev":
#             # Count by vendor/product
#             vendor_counts = {}
#             for vuln in vulnerabilities:
#                 vendor = vuln.get("vendorProject", "Unknown")
#                 vendor_counts[vendor] = vendor_counts.get(vendor, 0) + 1
#             summary["statistics"]["by_vendor"] = vendor_counts
#             summary["statistics"]["top_vendors"] = sorted(vendor_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        
#         elif source in ["github_advisories", "nvd"]:
#             # Count CVEs
#             cve_count = sum(1 for v in vulnerabilities if isinstance(v, dict) and ("id" in v or "cve" in str(v).lower()))
#             summary["statistics"]["cve_count"] = cve_count
        
#         return summary
        
#     except FileNotFoundError:
#         return {"error": f"Temp file not found at {file_path}"}
#     except json.JSONDecodeError as e:
#         return {"error": f"Failed to parse JSON from temp file: {str(e)}"}
#     except Exception as e:
#         return {"error": f"Error processing chunks: {str(e)}"}

# @tool
# def check_vulns_against_kev(kev_file_id: str = None, use_current_scan: bool = True) -> dict:
#     """Checks CVEs from the current OSV scan results against CISA KEV and returns matching ones.
#     This function automatically handles chunked data - if you provide a file_id, it will load all the data.
#     Args:
#         kev_file_id: Optional file_id from fetch_cisa_kev if the data was chunked. If not provided, will fetch fresh KEV data.
#         use_current_scan: If True (default), uses the pre-computed OSV results from the current scan.
#     Returns a dictionary with matched_count, matched_vulnerabilities, cves_checked, and message."""
#     matching = []
    
#     # Get OSV results from current scan
#     osv_results = current_scan_results.get("osv_results", {})
    
#     if "error" in osv_results:
#         return {"error": f"Cannot check against KEV: {osv_results['error']}"}
    
#     # Get KEV data - automatically handle chunked data
#     if kev_file_id:
#         # Clean file_id
#         kev_file_id = str(kev_file_id).strip().strip("'\"")
#         # Load full data from file (handles chunked data automatically)
#         kev_data = get_kev_data(kev_file_id)
#     else:
#         kev_data = fetch_cisa_kev()
#         # If it's chunked, extract the file_id and load the full data
#         if isinstance(kev_data, dict) and "chunked" in kev_data and kev_data.get("chunked"):
#             file_id = kev_data.get("file_id")
#             if file_id:
#                 kev_data = get_kev_data(file_id)
    
#     if "error" in kev_data:
#         return {"error": f"Cannot check against KEV: {kev_data['error']}"}
    
#     # Extract CVEs from OSV results
#     cves = set()
#     for result in osv_results.get("results", []):
#         for package in result.get("packages", []):
#             for vuln in package.get("vulnerabilities", []):
#                 if "id" in vuln and vuln["id"].startswith("CVE-"):
#                     cves.add(vuln["id"])
    
#     # Get vulnerabilities from KEV data (handle both direct format and processed format)
#     if "all_vulnerabilities" in kev_data:
#         # Data came from process_all_chunks
#         kev_vulns = kev_data.get("all_vulnerabilities", [])
#     else:
#         # Standard format
#         kev_vulns = kev_data.get("vulnerabilities", [])
    
#     for cve in cves:
#         for kev in kev_vulns:
#             # Handle different KEV data formats
#             cve_id = None
#             if isinstance(kev, dict):
#                 cve_id = kev.get("cveID") or kev.get("cve") or kev.get("id")
#             elif isinstance(kev, str):
#                 cve_id = kev
            
#             if cve_id and cve_id == cve:
#                 matching.append(kev)
    
#     return {
#         "matched_count": len(matching),
#         "matched_vulnerabilities": matching,
#         "cves_checked": list(cves),
#         "total_kev_vulnerabilities": len(kev_vulns),
#         "message": f"Found {len(matching)} CVEs from the scan that are in CISA KEV (out of {len(kev_vulns)} total KEV entries)"
#     }

# @tool
# def search_github_security_advisories(package_name: str, ecosystem: str = "") -> dict:
#     """Searches GitHub Security Advisories for vulnerabilities related to the given package and optional ecosystem. If more than 10 vulnerabilities are found, they are written to a temp file for chunked processing."""
#     url = "https://api.github.com/security-advisories"
#     params = {"package_name": package_name}
#     if ecosystem:
#         params["ecosystem"] = ecosystem.lower()  # Ecosystems like npm, pip, maven, etc.
#     headers = {
#         "Accept": "application/vnd.github+json",
#         "X-GitHub-Api-Version": "2022-11-28"
#     }
#     response = requests.get(url, params=params, headers=headers)
#     if response.status_code == 200:
#         data = response.json()
#         vuln_count = count_vulnerabilities(data)
        
#         # If more than 10 vulnerabilities, write to temp file
#         if vuln_count > 10:
#             file_id = str(uuid.uuid4())
#             temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json', prefix=f'github_advisories_{file_id}_')
#             json.dump(data, temp_file, indent=2)
#             temp_file.close()
#             vulnerability_temp_files[file_id] = {
#                 "file_path": temp_file.name,
#                 "total_count": vuln_count,
#                 "source": "github_advisories"
#             }
#             return {
#                 "message": f"Found {vuln_count} vulnerabilities (more than 10). Data written to temp file.",
#                 "file_id": file_id,
#                 "total_count": vuln_count,
#                 "chunked": True,
#                 "instruction": "Use read_vulnerability_chunk tool with this file_id to process vulnerabilities in chunks of 10."
#             }
#         else:
#             return data
#     else:
#         return {"error": f"Failed with status {response.status_code}: {response.text}"}

# @tool
# def search_nvd(keyword: str) -> dict:
#     """Searches the National Vulnerability Database (NVD) for vulnerabilities using the given keyword (e.g., package name or CVE). If more than 10 vulnerabilities are found, they are written to a temp file for chunked processing."""
#     url = "https://services.nvd.nist.gov/rest/json/cves/2.0"
#     params = {
#         "keywordSearch": keyword,
#         "resultsPerPage": 50  # Adjust as needed, max 2000
#     }
#     response = requests.get(url, params=params)
#     if response.status_code == 200:
#         data = response.json()
#         vuln_count = count_vulnerabilities(data)
        
#         # If more than 10 vulnerabilities, write to temp file
#         if vuln_count > 10:
#             file_id = str(uuid.uuid4())
#             temp_file = tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.json', prefix=f'nvd_{file_id}_')
#             json.dump(data, temp_file, indent=2)
#             temp_file.close()
#             vulnerability_temp_files[file_id] = {
#                 "file_path": temp_file.name,
#                 "total_count": vuln_count,
#                 "source": "nvd"
#             }
#             return {
#                 "message": f"Found {vuln_count} vulnerabilities (more than 10). Data written to temp file.",
#                 "file_id": file_id,
#                 "total_count": vuln_count,
#                 "chunked": True,
#                 "instruction": "Use read_vulnerability_chunk tool with this file_id to process vulnerabilities in chunks of 10."
#             }
#         else:
#             return data
#     else:
#         return {"error": f"Failed with status {response.status_code}: {response.text}"}

# @tool
# def read_vulnerability_chunk(file_id: str, chunk_index: str = "0") -> dict:
#     """Reads a chunk of 10 vulnerabilities from a temp file created by fetch_cisa_kev, search_github_security_advisories, or search_nvd. 
#     Args:
#         file_id: The file ID returned from fetch_cisa_kev, search_github_security_advisories, or search_nvd (as a string)
#         chunk_index: The chunk index as a string (e.g., "0" for first 10, "1" for next 10, etc.)
#     Returns the chunk and indicates if there are more chunks."""
#     # Clean and parse file_id (handle cases where agent passes extra text or combines parameters)
#     file_id_str = str(file_id).strip()
    
#     # If file_id contains a comma, it might have chunk_index combined - extract just the file_id part
#     if ',' in file_id_str:
#         # Try to extract UUID pattern (8-4-4-4-12 hex digits)
#         uuid_pattern = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
#         match = re.search(uuid_pattern, file_id_str, re.IGNORECASE)
#         if match:
#             file_id = match.group(0)
#         else:
#             # Fallback: take first part before comma
#             file_id = file_id_str.split(',')[0].strip().strip("'\"")
#     else:
#         file_id = file_id_str.strip().strip("'\"")
    
#     # Parse chunk_index (handle string input and cases where it might be in file_id)
#     chunk_index_str = str(chunk_index).strip()
    
#     # If chunk_index looks like it contains file_id info, try to extract just the number
#     if ',' in chunk_index_str or not chunk_index_str.isdigit():
#         # Try to extract a number from the string
#         numbers = re.findall(r'\d+', chunk_index_str)
#         if numbers:
#             chunk_index = int(numbers[0])
#         else:
#             chunk_index = 0
#     else:
#         try:
#             chunk_index = int(chunk_index_str)
#         except (ValueError, AttributeError):
#             chunk_index = 0
    
#     if file_id not in vulnerability_temp_files:
#         return {"error": f"File ID '{file_id}' not found. Make sure to use a file_id returned from fetch_cisa_kev, search_github_security_advisories, or search_nvd."}
    
#     file_info = vulnerability_temp_files[file_id]
#     file_path = file_info["file_path"]
#     total_count = file_info["total_count"]
#     source = file_info["source"]
    
#     try:
#         with open(file_path, 'r') as f:
#             data = json.load(f)
        
#         vulnerabilities = extract_vulnerabilities_list(data)
        
#         # Calculate chunk boundaries
#         chunk_size = 10
#         start_idx = chunk_index * chunk_size
#         end_idx = min(start_idx + chunk_size, len(vulnerabilities))
        
#         if start_idx >= len(vulnerabilities):
#             return {
#                 "error": f"Chunk index {chunk_index} is out of range. Total chunks available: {(len(vulnerabilities) + chunk_size - 1) // chunk_size}"
#             }
        
#         chunk = vulnerabilities[start_idx:end_idx]
#         has_more = end_idx < len(vulnerabilities)
#         next_chunk_index = chunk_index + 1 if has_more else None
        
#         result = {
#             "chunk_index": chunk_index,
#             "chunk": chunk,
#             "chunk_size": len(chunk),
#             "start_index": start_idx + 1,  # 1-based for readability
#             "end_index": end_idx,
#             "total_count": total_count,
#             "has_more": has_more,
#             "source": source
#         }
        
#         if has_more:
#             result["next_chunk_index"] = next_chunk_index
#             result["instruction"] = f"Call read_vulnerability_chunk again with chunk_index={next_chunk_index} to get the next chunk."
        
#         return result
        
#     except FileNotFoundError:
#         return {"error": f"Temp file not found at {file_path}"}
#     except json.JSONDecodeError as e:
#         return {"error": f"Failed to parse JSON from temp file: {str(e)}"}
#     except Exception as e:
#         return {"error": f"Error reading chunk: {str(e)}"}

# # Pull ReAct prompt from hub
# # react_prompt = hub.pull("hwchase17/openai-tools-agent")#"hwchase17/react"

# # Initialize LLM (replace with your preferred LLM)
# llm = ChatOpenAI(api_key=os.environ["OPENAI_API_KEY"],model="gpt-4o-mini",temperature=.3)

# # Tools list (osv-scanner, semgrep, and KEV processing are programmatic; agent only needs search tools)
# tools = [
#     search_github_security_advisories,
#     search_nvd
# ]

# # Create agent
# agent = create_openai_tools_agent(llm, tools, prompt)#create_react_agent(llm, tools, react_prompt)

# # Agent executor with increased limits and retry handling
# agent_executor = AgentExecutor(
#     agent=agent, 
#     tools=tools, 
#     verbose=True,
#     max_iterations=50,  # Increased from default (usually 15)
#     max_execution_time=600,  # 10 minutes max execution time
#     handle_parsing_errors=True,  # Handle parsing errors gracefully
#     return_intermediate_steps=False
# )

# def invoke_agent_with_retry(executor, input_data, max_retries=5, base_delay=1, max_delay=60):
#     """
#     Invokes the agent executor with retry logic for rate limiting and other transient errors.
    
#     Args:
#         executor: The AgentExecutor instance
#         input_data: Input data dictionary for the agent
#         max_retries: Maximum number of retry attempts
#         base_delay: Base delay in seconds for exponential backoff
#         max_delay: Maximum delay in seconds between retries
    
#     Returns:
#         The agent response
#     """
#     last_exception = None
#     last_response = None
    
#     for attempt in range(max_retries + 1):
#         try:
#             print(f"Agent invocation attempt {attempt + 1}/{max_retries + 1}")
#             response = executor.invoke(input_data)
#             return response
        
#         except Exception as e:
#             last_exception = e
#             error_str = str(e).lower()
#             error_type = type(e).__name__
            
#             # Check if it's a rate limit error
#             is_rate_limit = any(keyword in error_str for keyword in [
#                 'rate limit',
#                 'rate_limit',
#                 '429',
#                 'too many requests',
#                 'quota',
#                 'overloaded',
#                 'server is overloaded',
#                 'requests per minute',
#                 'rpm',
#                 'tpm'  # tokens per minute
#             ])
            
#             # Check if it's an iteration limit error
#             is_iteration_limit = any(keyword in error_str for keyword in [
#                 'iteration limit',
#                 'max_iterations',
#                 'max iterations',
#                 'stopped due to iteration limit',
#                 'agent stopped due to iteration limit'
#             ])
            
#             # Check if it's a timeout error
#             is_timeout = any(keyword in error_str for keyword in [
#                 'timeout',
#                 'time limit',
#                 'max_execution_time',
#                 'execution time'
#             ])
            
#             # Check for OpenAI API errors that might be retryable
#             is_openai_error = 'openai' in error_str or 'api' in error_str
            
#             # If it's a rate limit, retry with backoff
#             if is_rate_limit and attempt < max_retries:
#                 # Calculate exponential backoff delay
#                 delay = min(base_delay * (2 ** attempt), max_delay)
                
#                 # Add jitter to avoid thundering herd
#                 jitter = random.uniform(0, delay * 0.1)
#                 total_delay = delay + jitter
                
#                 print(f"Rate limit detected. Waiting {total_delay:.2f} seconds before retry...")
#                 print(f"Error details: {str(e)[:300]}")
                
#                 time.sleep(total_delay)
#                 continue
            
#             # If it's an iteration limit, try with a simplified prompt or return partial results
#             elif is_iteration_limit:
#                 print(f"Iteration limit reached. Attempt: {attempt + 1}")
                
#                 # Try to get partial results if available
#                 try:
#                     # Check if executor has intermediate steps we can use
#                     if hasattr(executor, 'intermediate_steps'):
#                         print("Attempting to extract partial results...")
#                 except:
#                     pass
                
#                 # If we haven't exhausted retries, wait a bit and try again with a more focused prompt
#                 if attempt < max_retries:
#                     delay = min(base_delay * (2 ** attempt), max_delay)
#                     print(f"Waiting {delay:.2f} seconds before retry with adjusted approach...")
#                     time.sleep(delay)
                    
#                     # Modify prompt to be more focused (ask for summary of what's been done so far)
#                     if attempt == max_retries - 1:  # Last retry attempt
#                         original_prompt = input_data.get("input", "")
#                         input_data["input"] = original_prompt + "\n\nIMPORTANT: Provide a summary of your findings so far. Focus on the most critical vulnerabilities first."
#                     continue
#                 else:
#                     # Last attempt failed, return error with context
#                     return {
#                         "output": f"Agent stopped due to iteration limit after {max_retries + 1} attempts. This may indicate the task is too complex or the agent is stuck in a loop. Error: {str(e)[:500]}"
#                     }
            
#             # If it's a timeout, retry with backoff
#             elif is_timeout and attempt < max_retries:
#                 delay = min(base_delay * (2 ** attempt), max_delay)
#                 print(f"Timeout detected. Waiting {delay:.2f} seconds before retry...")
#                 time.sleep(delay)
#                 continue
            
#             # If it's a general OpenAI/API error, retry with backoff
#             elif is_openai_error and attempt < max_retries:
#                 delay = min(base_delay * (2 ** attempt), max_delay)
#                 print(f"API error detected. Waiting {delay:.2f} seconds before retry...")
#                 print(f"Error: {str(e)[:300]}")
#                 time.sleep(delay)
#                 continue
            
#             else:
#                 # If it's not a retryable error, or we've exhausted retries, raise it
#                 print(f"Non-retryable error or max retries reached: {error_type}: {str(e)[:500]}")
#                 raise e
    
#     # If we've exhausted all retries, raise the last exception
#     if last_exception:
#         raise last_exception
#     else:
#         raise Exception("Agent execution failed after all retry attempts")

# def run_pipeline(input_repo: str):
#     """Runs the agentic pipeline on the input repo (local dir or GitHub URL).
#     OSV-Scanner and Semgrep are run programmatically before the agent is invoked."""
    
#     # Clear previous scan results
#     current_scan_results.clear()
    
#     # Step 1: Determine the repository directory
#     repo_directory = None
#     temp_dir_to_cleanup = None
    
#     try:
#         if input_repo.startswith("https://github.com/") or input_repo.startswith("http://github.com/"):
#             # Clone GitHub repository
#             temp_dir = tempfile.mkdtemp()
#             temp_dir_to_cleanup = temp_dir
#             Repo.clone_from(input_repo, temp_dir)
#             repo_directory = temp_dir
#         else:
#             # Use local directory directly
#             repo_directory = os.path.abspath(os.path.normpath(input_repo))
#             if not os.path.exists(repo_directory):
#                 return f"Error: Directory does not exist: {repo_directory}"
#             if not os.path.isdir(repo_directory):
#                 return f"Error: Path is not a directory: {repo_directory}"
        
#         # Step 2: Run OSV-Scanner programmatically
#         print(f"Running OSV-Scanner on {repo_directory}...")
#         osv_results = run_osv_scanner(repo_directory)
        
#         # Step 3: Run Semgrep programmatically
#         print(f"Running Semgrep on {repo_directory}...")
#         semgrep_results = run_semgrep_scan(repo_directory)
        
#         # Store results globally for agent tools to access
#         current_scan_results["osv_results"] = osv_results
#         current_scan_results["semgrep_results"] = semgrep_results

#         # Step 4: Deterministically fetch and expand KEV data, and check matches
#         kev_data = fetch_cisa_kev_full()
#         current_scan_results["kev_data"] = kev_data
#         kev_match_result = check_vulns_against_kev_internal(osv_results, kev_data)
#         current_scan_results["kev_matches"] = kev_match_result
        
#         # Step 4: Prepare scan results summary for the agent
#         osv_summary = "OSV-Scanner Results:\n"
#         if "error" in osv_results:
#             osv_summary += f"  Error: {osv_results['error']}\n"
#         else:
#             # Extract key information from OSV results
#             vuln_count = 0
#             packages = set()
#             cves = set()
            
#             for result in osv_results.get("results", []):
#                 for package in result.get("packages", []):
#                     pkg_name = package.get("package", {}).get("name", "unknown")
#                     packages.add(pkg_name)
#                     for vuln in package.get("vulnerabilities", []):
#                         vuln_count += 1
#                         vuln_id = vuln.get("id", "")
#                         if vuln_id.startswith("CVE-"):
#                             cves.add(vuln_id)
            
#             osv_summary += f"  Found {vuln_count} vulnerabilities across {len(packages)} packages\n"
#             osv_summary += f"  Packages scanned: {', '.join(list(packages)[:10])}" + (f" (and {len(packages)-10} more)" if len(packages) > 10 else "") + "\n"
#             osv_summary += f"  CVEs found: {', '.join(list(cves)[:10])}" + (f" (and {len(cves)-10} more)" if len(cves) > 10 else "") + "\n"
        
#         semgrep_summary = "Semgrep Results:\n"
#         if "error" in semgrep_results:
#             semgrep_summary += f"  Error: {semgrep_results['error']}\n"
#         else:
#             findings = semgrep_results.get("results", [])
#             semgrep_summary += f"  Found {len(findings)} potential security issues\n"
#             if findings:
#                 # Show first few findings
#                 for i, finding in enumerate(findings[:5]):
#                     rule_id = finding.get("check_id", "unknown")
#                     path = finding.get("path", "unknown")
#                     message = finding.get("message", "")
#                     semgrep_summary += f"  - [{rule_id}] {path}: {message[:100]}\n"
#                 if len(findings) > 5:
#                     semgrep_summary += f"  ... and {len(findings) - 5} more findings\n"
        
#         # KEV summary (deterministic)
#         kev_summary = "CISA KEV Summary:\n"
#         if isinstance(kev_data, dict) and "error" in kev_data:
#             kev_summary += f"  Error fetching KEV: {kev_data['error']}\n"
#         else:
#             kev_total = count_vulnerabilities(kev_data)
#             kev_summary += f"  Total KEV vulnerabilities: {kev_total}\n"
#             if isinstance(kev_match_result, dict) and "matched_count" in kev_match_result:
#                 kev_summary += f"  Matched CVEs with OSV: {kev_match_result['matched_count']}\n"
#                 if kev_match_result.get("cves_checked"):
#                     kev_summary += f"  CVEs checked: {', '.join(kev_match_result['cves_checked'][:10])}"
#                     if len(kev_match_result['cves_checked']) > 10:
#                         kev_summary += f" (and {len(kev_match_result['cves_checked']) - 10} more)"
#                 kev_summary += "\n"

#         # Step 5: Create prompt with pre-computed scan results
#         prompt = f"""
#                     Analyze the vulnerability scan results for the repository at '{repo_directory}' and provide a comprehensive security assessment.

#                     SCAN RESULTS ALREADY COMPLETED:
#                     {osv_summary}
#                     {semgrep_summary}
#                     {kev_summary}

#                     YOUR TASKS:
#                     1. KEV data has been fully fetched and expanded deterministically. Use the provided KEV summary above; do NOT fetch or iterate KEV data.
#                     2. Check additional vulnerabilities by querying search_github_security_advisories and search_nvd for dependencies and keywords derived from the OSV and Semgrep results.
#                     3. Provide a comprehensive summary that includes:
#                     - Critical vulnerabilities from OSV-Scanner
#                     - Potential execution vulnerabilities from Semgrep
#                     - Matches against CISA KEV (already provided above)
#                     - Additional findings from NVD and GitHub Security Advisories searches
#                     - Recommendations for remediation

#                     Note: The OSV-Scanner and Semgrep scans have already been completed. Focus on analyzing their results and cross-referencing with additional vulnerability databases.
#                     """
        
#         # Step 6: Invoke the agent with the prompt (with retry logic for rate limits)
#         response = invoke_agent_with_retry(agent_executor, {"input": prompt})
        
#         # Step 7: Cleanup temporary directory if created
#         if temp_dir_to_cleanup and os.path.exists(temp_dir_to_cleanup):
#             try:
#                 import shutil
#                 shutil.rmtree(temp_dir_to_cleanup)
#             except Exception as e:
#                 print(f"Warning: Could not clean up temp directory {temp_dir_to_cleanup}: {e}")
        
#         return response["output"]
    
#     except Exception as e:
#         # Cleanup on error
#         if temp_dir_to_cleanup and os.path.exists(temp_dir_to_cleanup):
#             try:
#                 import shutil
#                 shutil.rmtree(temp_dir_to_cleanup)
#             except:
#                 pass
#         return f"Error in pipeline: {str(e)}"
    

# Kickoff the process
from vulnScan.repoScannerCrew import security_crew

def run_pipeline(input_repo: str):
    result = security_crew.kickoff(inputs={'repo_url': input_repo})
    return result.raw

# print("######################")
# print("FINAL SECURITY REPORT:")
# print(result)