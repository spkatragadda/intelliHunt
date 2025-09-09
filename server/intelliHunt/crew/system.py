from crewClass import cyberCrew
import json
import os
from pathlib import Path
from nvd_cpe_client import NVDCPEClient
from cpe_data_processor import CPEDataProcessor
from vulnerability_processor import VulnerabilityProcessor


def load_cpe_data_for_crew():
    """
    Load CPE data and generate crew workflow input with recent vulnerability data.
    This function handles the configuration management database integration.
    """
    try:
        # Check if we have recent CPE data
        crew_dir = Path(__file__).parent
        cpe_files = list(crew_dir.glob("cpe_data_*.json"))
        enhanced_crew_input_files = list(crew_dir.glob("enhanced_crew_input_*.json"))
        
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

def main():
    """
    Main execution function that integrates CPE data with crew workflow and recent vulnerability data.
    """
    print("Initializing IntelliHunt Crew with Configuration Management Database and Vulnerability Integration...")
    
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
    
    # Initialize crew
    crew = cyberCrew().crew()
    
    # Execute crew workflow with CPE and vulnerability-enhanced inputs
    print("\nExecuting crew workflow with recent vulnerability data...")
    result = crew.kickoff(inputs=inputs)
    
    # Generate report
    print("\nGenerating execution report...")
    generate_crew_report(result, inputs)
    
    return result

def generate_crew_report(result, inputs):
    """
    Generate a comprehensive crew execution report including CPE data context.
    """
    try:
        # Extract result data
        final_result = result.raw if hasattr(result, 'raw') else str(result)
        tasks_output = result.tasks_output if hasattr(result, 'tasks_output') else {}
        token_usage = result.token_usage if hasattr(result, 'token_usage') else None
        
        # Formatting for a document
        document_content = f"""
        # CrewAI Execution Report - Configuration Management Database Integration

        ## CPE Data Context
        - **Organization**: {inputs.get('collection_metadata', {}).get('organization', 'Unknown')}
        - **Collection Timestamp**: {inputs.get('collection_metadata', {}).get('timestamp', 'Unknown')}
        - **Software Stack**: {inputs['software_stack']}
        - **Total CPE Records**: {inputs.get('cpe_data', {}).get('total_records', 'N/A')}

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
    main()
