import os
import glob as glob_module
import yaml
from NVD.nvd_cpe_client import NVDCPEClient
from NVD.cpe_data_processor import CPEDataProcessor
from NVD.vulnerability_processor import VulnerabilityProcessor
from crewClass import cyberCrew
import json
from pathlib import Path
from collections import Counter


def cleanup_old_data_files():
    """Remove old NVD data files (CPE, enhanced crew input, vulnerability data, etc.)
    to ensure fresh data is fetched for each new report generation."""
    crew_dir = Path(__file__).parent
    patterns = [
        "NVD/cpe_data_*.json",
        "NVD/crew_workflow_input_*.json",
        "NVD/enhanced_crew_input_*.json",
        "NVD/vulnerability_data_*.json",
        "NVD/vulnerability_summary_*.md",
    ]
    removed = 0
    for pattern in patterns:
        for f in crew_dir.glob(pattern):
            try:
                f.unlink()
                removed += 1
            except Exception as e:
                print(f"Error removing {f}: {e}")
    if removed:
        print(f"Cleaned up {removed} old data file(s)")


def modify_yaml_with_user_inputs(user_inputs, replace_stack=False):
    """
    Modify the YAML configuration file with user inputs from the frontend.

    Args:
        user_inputs: dict of OS/application entries from the frontend payload.
        replace_stack: When True, the existing software_stack is cleared before
                       applying user entries (used when no YAML was uploaded by
                       the user, so that server-side defaults are not included).
    """
    try:
        yaml_path = Path(__file__).parent / "NVD/config/organization_cmdb.yaml"

        # Load existing YAML configuration (non-stack sections are always preserved)
        if yaml_path.exists():
            with open(yaml_path, 'r') as f:
                yaml_config = yaml.safe_load(f)
        else:
            yaml_config = {}

        # Preserve api_config / update_settings / output from defaults if missing
        yaml_config.setdefault('organization', {'name': 'User Organization', 'description': 'User-configured software stack'})
        yaml_config.setdefault('api_config', {
            'base_url': 'https://services.nvd.nist.gov/rest/json',
            'cpe_endpoint': '/cpes/2.0',
            'cve_endpoint': '/cves/2.0',
            'results_per_page': 500,
            'max_retries': 3,
            'timeout': 30
        })
        yaml_config.setdefault('update_settings', {
            'check_interval_hours': 24,
            'last_modified_days': 7,
            'enable_auto_updates': False
        })
        yaml_config.setdefault('output', {
            'format': 'json',
            'include_metadata': True,
            'include_cpe_details': True,
            'include_vulnerability_links': True
        })

        # When replace_stack is True, wipe any existing (default) software_stack
        # so only the user's own entries drive the report.
        if replace_stack:
            yaml_config['software_stack'] = {
                'operating_systems': [],
                'applications': [],
                'cloud_platforms': []
            }

        # Initialize software_stack if it doesn't exist
        if 'software_stack' not in yaml_config:
            yaml_config['software_stack'] = {
                'operating_systems': [],
                'applications': [],
                'cloud_platforms': []
            }
        
        # Add user OS inputs to YAML
        if 'os' in user_inputs:
            for os_item in user_inputs['os']:
                if os_item.get('vendor') and os_item.get('product'):
                    # Check if vendor already exists
                    vendor_exists = False
                    for existing_os in yaml_config['software_stack']['operating_systems']:
                        if existing_os['vendor'].lower() == os_item['vendor'].lower():
                            # Add product to existing vendor
                            if 'products' not in existing_os:
                                existing_os['products'] = []
                            existing_os['products'].append({'name': os_item['product']})
                            vendor_exists = True
                            break
                    
                    if not vendor_exists:
                        # Add new vendor
                        yaml_config['software_stack']['operating_systems'].append({
                            'vendor': os_item['vendor'].lower(),
                            'products': [{'name': os_item['product']}]
                        })
        
        # Add user application inputs to YAML
        if 'applications' in user_inputs:
            for app_item in user_inputs['applications']:
                if app_item.get('vendor') and app_item.get('products'):
                    # Check if vendor already exists
                    vendor_exists = False
                    for existing_app in yaml_config['software_stack']['applications']:
                        if existing_app['vendor'].lower() == app_item['vendor'].lower():
                            # Add products to existing vendor
                            if 'products' not in existing_app:
                                existing_app['products'] = []
                            for product in app_item['products']:
                                existing_app['products'].append({'name': product})
                            vendor_exists = True
                            break
                    
                    if not vendor_exists:
                        # Add new vendor
                        products = [{'name': product} for product in app_item['products']]
                        yaml_config['software_stack']['applications'].append({
                            'vendor': app_item['vendor'].lower(),
                            'products': products
                        })
        
        # Save the modified YAML configuration
        with open(yaml_path, 'w') as f:
            yaml.dump(yaml_config, f, default_flow_style=False, sort_keys=False)
        
        print(f"Updated YAML configuration with user inputs: {yaml_path}")
        return yaml_path
        
    except Exception as e:
        print(f"Error modifying YAML with user inputs: {e}")
        return None


def load_cpe_data_for_crew():
    """
    Load CPE data and generate crew workflow input with recent vulnerability data.
    This function handles the configuration management database integration.
    """
    try:
        # Check if we have recent CPE data
        crew_dir = Path(__file__).parent
        cpe_files = list(crew_dir.glob("NVD/cpe_data_*.json"))
        enhanced_crew_input_files = list(crew_dir.glob("NVD/enhanced_crew_input_*.json"))
        
        # If no CPE data exists or it's older than 24 hours, fetch new data
        should_fetch_new = True
        if cpe_files:
            latest_cpe_file = max(cpe_files, key=lambda x: x.stat().st_mtime)
            # Check if file is less than 24 hours old
            import time
            if time.time() - latest_cpe_file.stat().st_mtime < 86400:  # 24 hours
                should_fetch_new = False
        
        if should_fetch_new:
            print("Fetching fresh CPE data from NVD API...")
            # Initialize NVD CPE client
            cpe_client = NVDCPEClient()
            
            # Get organization CPE data
            cpe_data = cpe_client.get_organization_cpe_data()
            
            # Save CPE data
            cpe_data_path = cpe_client.save_cpe_data(cpe_data)
            
            # Process CPE data for crew workflow
            processor = CPEDataProcessor(cpe_data_path)
            crew_input_path = processor.save_crew_input()
            
            print(f"Fresh CPE data collected and processed: {crew_input_path}")
        else:
            # Use existing CPE data
            latest_cpe_file = max(cpe_files, key=lambda x: x.stat().st_mtime)
            cpe_data_path = str(latest_cpe_file)
            print(f"Using existing CPE data: {cpe_data_path}")
        
        # Check if we have recent enhanced crew input with vulnerability data
        should_fetch_vulnerabilities = True
        if enhanced_crew_input_files:
            latest_enhanced_input = max(enhanced_crew_input_files, key=lambda x: x.stat().st_mtime)
            # Check if file is less than 6 hours old (vulnerabilities change more frequently)
            import time
            if time.time() - latest_enhanced_input.stat().st_mtime < 21600:  # 6 hours
                should_fetch_vulnerabilities = False
                crew_input_path = str(latest_enhanced_input)
                print(f"Using existing enhanced crew input: {crew_input_path}")
        
        if should_fetch_vulnerabilities:
            print("Fetching recent vulnerability data...")
            # Initialize vulnerability processor
            vuln_processor = VulnerabilityProcessor(cpe_data_path, days_back=7)
            
            # Generate enhanced crew input with vulnerability data
            crew_input_path = vuln_processor.save_enhanced_crew_input()
            
            # Generate vulnerability summary
            summary_path = vuln_processor.save_vulnerability_summary()
            
            print(f"Enhanced crew input with vulnerability data: {crew_input_path}")
            print(f"Vulnerability summary: {summary_path}")
        
        # Load crew workflow input
        with open(crew_input_path, 'r') as f:
            crew_workflow_data = json.load(f)
        
        return crew_workflow_data
        
    except Exception as e:
        print(f"Error loading CPE data: {e}")
        print("Falling back to default software stack...")
        # Fallback to default configuration
        return {
            "software_stack": "microsoft,crowdstrike,apple,linux,sql,aws,azure,apache,python,javascript",
            "url_list": [
                "https://nvd.nist.gov/vuln/search",
                "https://cve.mitre.org/cve/search_cve_list.html",
                "https://msrc.microsoft.com/update-guide/vulnerabilities"
            ],
            "vulnerability_data": {
                "recent_cves": [],
                "high_priority_cves": [],
                "total_cves_found": 0,
                "time_period": "Last 7 days",
                "cve_details": []
            },
            "research_focus": "Recent Vulnerability Analysis",
            "threat_intelligence_priority": "High",
            "analysis_timeframe": "Last 7 days"
        }

def main(payload_file=None):
    """
    Main execution function that integrates CPE data with crew workflow and recent vulnerability data.
    """
    print("Initializing IntelliHunt Crew with Configuration Management Database and Vulnerability Integration...")

    # Clean up old data files to ensure fresh data
    cleanup_old_data_files()

    # Load user inputs from payload file if provided
    user_inputs = None
    if payload_file and os.path.exists(payload_file):
        try:
            with open(payload_file, 'r') as f:
                user_inputs = json.load(f)
            print(f"Loaded user inputs: {user_inputs}")
        except Exception as e:
            print(f"Error loading user inputs: {e}")

    # Require user-provided configuration
    if not user_inputs:
        print("Error: No user inputs provided. Cannot run report without configuration.")
        sys.exit(1)

    yaml_uploaded = user_inputs.get('yaml_uploaded', False)
    has_os = bool(user_inputs.get('os', []))
    has_apps = bool(user_inputs.get('applications', []))
    has_sources = bool(user_inputs.get('sources', []))

    if not yaml_uploaded and not has_os and not has_apps and not has_sources:
        print("Error: No software configurations provided. Please add OS entries, applications, or upload a YAML file.")
        sys.exit(1)

    # Modify the YAML configuration with user inputs.
    # When the user did not upload a YAML file, replace_stack=True clears any
    # pre-existing (default) software stack so only user entries are used.
    print("Modifying YAML configuration with user inputs...")
    yaml_path = modify_yaml_with_user_inputs(user_inputs, replace_stack=not yaml_uploaded)
    if yaml_path:
        print(f"YAML configuration updated: {yaml_path}")
    else:
        print("Warning: Failed to update YAML configuration")
    
    # Load CPE data and vulnerability data for crew workflow
    inputs = load_cpe_data_for_crew()
    
    print(f"Software Stack: {inputs['software_stack']}")
    print(f"URL List: {inputs['url_list']}")
    
    # Display CPE data summary
    if 'cpe_data' in inputs:
        cpe_summary = inputs['cpe_data']
        print(f"CPE Data Summary:")
        print(f"  - Total Records: {cpe_summary.get('total_records', 0)}")
        print(f"  - Vendors: {', '.join(cpe_summary.get('vendors_covered', [])[:5])}")
        print(f"  - Products: {', '.join(cpe_summary.get('products_covered', [])[:5])}")
    
    # Display vulnerability data summary
    if 'vulnerability_data' in inputs:
        vuln_data = inputs['vulnerability_data']
        print(f"Vulnerability Data Summary:")
        print(f"  - Total CVEs Found: {vuln_data.get('total_cves_found', 0)}")
        print(f"  - High Priority CVEs: {len(vuln_data.get('high_priority_cves', []))}")
        print(f"  - Time Period: {vuln_data.get('time_period', 'Unknown')}")
        print(f"  - Research Focus: {inputs.get('research_focus', 'Unknown')}")

    # We only want vulnerability info passed to crew
    try:
        inputs = inputs['vulnerability_data']['cve_details']
        ids = [d['cve_id'] for d in inputs]
        id_counts = Counter(ids)
        inputs = [d for d in inputs if id_counts[d['cve_id']] == 1]
    except Exception as e:
        print(f"Error filtering CVE details: {e}")
        inputs = []
    
    # Initialize crew
    crew = cyberCrew().crew()
    
    # Execute crew workflow with CPE and vulnerability-enhanced inputs
    print("\nExecuting crew workflow with recent vulnerability data...")
    result = crew.kickoff_for_each(inputs=inputs)
    # Generate report
    print("\nGenerating execution report...")
    # generate_crew_report(result, inputs)
    create_threat_report(result)    
    return result

def create_threat_report(crew_output_list):
    """
    Generates a Markdown-formatted cyber threat report from a list of CrewOutput objects.

    Args:
        crew_output_list: A list of CrewOutput objects from a 'for each agent' task run.

    Returns:
        A Markdown string containing the organized report.
    """
    report_parts = ["### Cyber Threat Report 🕵️‍♂️\n---"]

    if len(crew_output_list)==0:
        report_parts.append("No Relevant Vulnerabilities in the Past Week!")
        report_path = Path(__file__).parent / "crew_report.md"
        with open(report_path, "w", encoding='utf-8') as f:
            f.write("\n".join(report_parts))

        return "Report Generated"
    
    for i, output in enumerate(crew_output_list, 1):
        # Extract data from the pydantic output
        if output.pydantic:
            detection_data = output.pydantic
            
            # Find the research task output within the tasks_output list
            research_data = None
            for task_output in output.tasks_output:
                if task_output.name == 'research_task' and task_output.pydantic:
                    research_data = task_output.pydantic.threatList[0]
                    break
            
            # Start a new section for each iteration
            report_parts.append(f"### **Iteration {i}**\n")
            
            if research_data:
                report_parts.append(f"#### **Threat: {research_data.threat_name}**\n")
                report_parts.append(f"* **Description**: {research_data.description}\n")
                report_parts.append("* **Indicators of Compromise (IoCs)**:")
                for ioc in research_data.indicators_of_compromise:
                    report_parts.append(f"    * {ioc}")
                report_parts.append("\n")

            if detection_data:
                report_parts.append("#### **Detection Method**\n")
                report_parts.append(f"* **Query**: `{detection_data.detection_method}`")
                report_parts.append(f"* **Description**: {detection_data.description}\n")
                
                if research_data:
                    report_parts.append("#### **References**")
                    for url in research_data.urlList:
                        report_parts.append(f"* [{url}]({url})")
                    report_parts.append("\n")

            report_parts.append("---\n")

    report_path = Path(__file__).parent / "crew_report.md"
    with open(report_path, "w", encoding='utf-8') as f:
        f.write("\n".join(report_parts))
            
    return "Report Generated"


def generate_crew_report(result, inputs):
    """
    Generate a comprehensive crew execution report including CPE data context.
    """
    try:
        # Extract result data
        final_result = result.raw if hasattr(result, 'raw') else str(result)
        tasks_output = result.tasks_output if hasattr(result, 'tasks_output') else {}
        token_usage = result.token_usage if hasattr(result, 'token_usage') else None
        
        # removed for now
        # ## CPE Data Context
        # - **Organization**: {inputs.get('collection_metadata', {}).get('organization', 'Unknown')}
        # - **Collection Timestamp**: {inputs.get('collection_metadata', {}).get('timestamp', 'Unknown')}
        # - **Software Stack**: {inputs['software_stack']}
        # - **Total CPE Records**: {inputs.get('cpe_data', {}).get('total_records', 'N/A')}

        # Formatting for a document
        document_content = f"""
        # CrewAI Execution Report - Configuration Management Database Integration

        ## Final Result:
        {final_result}

        ## Task Outputs:
        """
        
        # Add task outputs
        if tasks_output:
            if isinstance(tasks_output, list):
                for i, output in enumerate(tasks_output):
                    task_name = f"Task {i+1}"
                    document_content += f"\n### {task_name}:\n{output}\n"
            elif isinstance(tasks_output, dict):
                for task_name, output in tasks_output.items():
                    document_content += f"\n### {task_name}:\n{output}\n"
            else:
                document_content += f"\n### Task Output:\n{tasks_output}\n"
        
        # Add token usage if available
        if token_usage:
            document_content += f"""
        ## Token Usage:
        - Input Tokens: {token_usage.prompt_tokens}
        - Output Tokens: {token_usage.completion_tokens}
        - Total Tokens: {token_usage.total_tokens}
        """
        
        # Add CPE data summary
        if 'cpe_data' in inputs:
            cpe_data = inputs['cpe_data']
            document_content += f"""
            ## CPE Data Summary:
            - **Operating Systems**: {len(cpe_data.get('operating_systems', []))} records
            - **Applications**: {len(cpe_data.get('applications', []))} records
            - **Cloud Platforms**: {len(cpe_data.get('cloud_platforms', []))} records
            - **Vendors Covered**: {', '.join(cpe_data.get('vendors_covered', [])[:10])}
            - **Products Covered**: {', '.join(cpe_data.get('products_covered', [])[:10])}
            """
        
        # Add vulnerability data summary
        if 'vulnerability_data' in inputs:
            vuln_data = inputs['vulnerability_data']
            document_content += f"""
            ## Vulnerability Data Summary:
            - **Total CVEs Found**: {vuln_data.get('total_cves_found', 0)}
            - **High Priority CVEs**: {len(vuln_data.get('high_priority_cves', []))}
            - **Time Period**: {vuln_data.get('time_period', 'Unknown')}
            - **Research Focus**: {inputs.get('research_focus', 'Unknown')}
            - **Analysis Timeframe**: {inputs.get('analysis_timeframe', 'Unknown')}
            """
            
            # Add high priority CVEs
            high_priority_cves = vuln_data.get('high_priority_cves', [])
            if high_priority_cves:
                document_content += f"""
            ### High Priority CVEs:
            """
                for cve in high_priority_cves[:10]:  # Show top 10
                    document_content += f"""
            - **{cve.get('cve_id', 'Unknown')}**: {cve.get('severity', 'Unknown')} - {cve.get('description', 'No description')[:100]}...
            """
        
        # Save report
        report_path = Path(__file__).parent / "crew_report.md"
        with open(report_path, "w") as f:
            f.write(document_content)
        
        print(f"Report saved to: {report_path}")
        
    except Exception as e:
        print(f"Error generating report: {e}")

if __name__ == "__main__":
    import sys
    payload_file = sys.argv[1] if len(sys.argv) > 1 else None
    main(payload_file)
