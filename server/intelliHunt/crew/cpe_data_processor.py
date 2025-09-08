"""
CPE Data Processor for Crew Workflow Integration
This module processes CPE data from NVD API and formats it for use in the crew workflow.
"""

import json
import yaml
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
from pathlib import Path

logger = logging.getLogger(__name__)

class CPEDataProcessor:
    """
    Processes CPE data for crew workflow integration.
    Converts raw CPE data into formats suitable for threat intelligence analysis.
    """
    
    def __init__(self, cpe_data_path: str = None):
        """
        Initialize the CPE data processor.
        
        Args:
            cpe_data_path: Path to the CPE data file
        """
        self.cpe_data = None
        if cpe_data_path:
            self.load_cpe_data(cpe_data_path)
    
    def load_cpe_data(self, cpe_data_path: str) -> None:
        """
        Load CPE data from file.
        
        Args:
            cpe_data_path: Path to the CPE data file
        """
        try:
            with open(cpe_data_path, 'r') as f:
                if cpe_data_path.endswith('.json'):
                    self.cpe_data = json.load(f)
                elif cpe_data_path.endswith('.yaml') or cpe_data_path.endswith('.yml'):
                    self.cpe_data = yaml.safe_load(f)
                else:
                    raise ValueError(f"Unsupported file format: {cpe_data_path}")
            
            logger.info(f"Loaded CPE data from: {cpe_data_path}")
            
        except Exception as e:
            logger.error(f"Failed to load CPE data from {cpe_data_path}: {e}")
            raise
    
    def extract_software_stack(self) -> Dict[str, List[str]]:
        """
        Extract software stack information from CPE data for crew workflow.
        
        Returns:
            Dictionary containing software stack organized by category
        """
        if not self.cpe_data:
            raise ValueError("No CPE data loaded")
        
        software_stack = {
            'operating_systems': [],
            'applications': [],
            'cloud_platforms': [],
            'vendors': [],
            'products': []
        }
        
        # Process operating systems
        # print("operating systems: ", self.cpe_data.get('operating_systems'))
        for os_record in self.cpe_data.get('operating_systems', []):
            # print("OS record: ",os_record)
            cpe_name = os_record.get('cpe').get('cpeName', '')
            # print("CPE Name: ",cpe_name)
            if cpe_name:
                #software_stack['operating_systems'].append(cpe_name)
                # Extract vendor and product info
                parts = cpe_name.split(':')
                if len(parts) >= 5:
                    vendor = parts[3]
                    product = parts[4]
                    if vendor not in software_stack['vendors']:
                        software_stack['vendors'].append(vendor)
                    if product not in software_stack['products']:
                        software_stack['products'].append(product)
                    if product not in software_stack['operating_systems']:
                        software_stack['operating_systems'].append(product)

        # Process applications
        for app_record in self.cpe_data.get('applications', []):
            cpe_name = app_record.get('cpe').get('cpeName', '')
            if cpe_name:
                # software_stack['applications'].append(cpe_name)
                # Extract vendor and product info
                parts = cpe_name.split(':')
                if len(parts) >= 5:
                    vendor = parts[3]
                    product = parts[4]
                    if vendor not in software_stack['vendors']:
                        software_stack['vendors'].append(vendor)
                    if product not in software_stack['products']:
                        software_stack['products'].append(product)
                    if product not in software_stack['applications']:
                        software_stack['applications'].append(product)
        
        # Process cloud platforms
        for cloud_record in self.cpe_data.get('cloud_platforms', []):
            cpe_name = cloud_record.get('cpe').get('cpeName', '')
            if cpe_name:
                # software_stack['cloud_platforms'].append(cpe_name)
                # Extract vendor and product info
                parts = cpe_name.split(':')
                if len(parts) >= 5:
                    vendor = parts[3]
                    product = parts[4]
                    if vendor not in software_stack['vendors']:
                        software_stack['vendors'].append(vendor)
                    if product not in software_stack['products']:
                        software_stack['products'].append(product)
                    if product not in software_stack['cloud_platforms']:
                        software_stack['cloud_platforms'].append(product)
        
        return software_stack
    
    def generate_crew_input(self) -> Dict[str, Any]:
        """
        Generate input data for crew workflow based on CPE data.
        
        Returns:
            Dictionary containing crew workflow input parameters
        """
        if not self.cpe_data:
            raise ValueError("No CPE data loaded")
        
        software_stack = self.extract_software_stack()
        
        # Create software stack string for crew input
        all_products = []
        all_products.extend(software_stack['vendors'])
        all_products.extend(software_stack['products'])
        
        # Remove duplicates and create comma-separated string
        unique_products = list(set(all_products))
        software_stack_string = ','.join(unique_products)
        
        # Generate URL list for crew (NVD and vendor-specific URLs)
        url_list = [
            "https://nvd.nist.gov/vuln/search",
            "https://cve.mitre.org/cve/search_cve_list.html"
        ]
        
        # Add vendor-specific URLs
        for vendor in software_stack['vendors']:
            if vendor.lower() == 'microsoft':
                url_list.append("https://msrc.microsoft.com/update-guide/vulnerabilities")
            elif vendor.lower() == 'oracle':
                url_list.append("https://www.oracle.com/security-alerts/")
            elif vendor.lower() == 'apache':
                url_list.append("https://apache.org/security/")
            elif vendor.lower() == 'python':
                url_list.append("https://python.org/security/")
        
        crew_input = {
            'software_stack': software_stack_string,
            'url_list': url_list,
            'cpe_data': {
                'total_records': self.cpe_data.get('summary', {}).get('total_cpe_records', 0),
                'vendors_covered': software_stack['vendors'],
                'products_covered': software_stack['products'],
                'operating_systems': software_stack['operating_systems'],
                'applications': software_stack['applications'],
                'cloud_platforms': software_stack['cloud_platforms']
            },
            'collection_metadata': {
                'timestamp': self.cpe_data.get('collection_timestamp'),
                'organization': self.cpe_data.get('organization', {}).get('name', 'Unknown')
            }
        }
        
        return crew_input
    
    def generate_vulnerability_focus_areas(self) -> List[Dict[str, Any]]:
        """
        Generate vulnerability focus areas based on CPE data for targeted threat hunting.
        
        Returns:
            List of vulnerability focus areas with associated CPE information
        """
        if not self.cpe_data:
            raise ValueError("No CPE data loaded")
        
        focus_areas = []
        
        # Operating System vulnerabilities
        if self.cpe_data.get('operating_systems'):
            focus_areas.append({
                'category': 'Operating Systems',
                'description': 'Vulnerabilities in operating systems used by the organization',
                'cpe_count': len(self.cpe_data['operating_systems']),
                'priority': 'High',
                'search_terms': ['OS vulnerability', 'operating system exploit', 'kernel vulnerability']
            })
        
        # Application vulnerabilities
        if self.cpe_data.get('applications'):
            focus_areas.append({
                'category': 'Applications',
                'description': 'Vulnerabilities in applications and software used by the organization',
                'cpe_count': len(self.cpe_data['applications']),
                'priority': 'High',
                'search_terms': ['application vulnerability', 'software exploit', 'zero-day']
            })
        
        # Cloud platform vulnerabilities
        if self.cpe_data.get('cloud_platforms'):
            focus_areas.append({
                'category': 'Cloud Platforms',
                'description': 'Vulnerabilities in cloud platforms and services',
                'cpe_count': len(self.cpe_data['cloud_platforms']),
                'priority': 'Medium',
                'search_terms': ['cloud vulnerability', 'cloud exploit', 'misconfiguration']
            })
        
        # Recent updates
        if self.cpe_data.get('recent_updates'):
            focus_areas.append({
                'category': 'Recent Updates',
                'description': 'Recently discovered or updated vulnerabilities',
                'cpe_count': len(self.cpe_data['recent_updates']),
                'priority': 'Critical',
                'search_terms': ['recent vulnerability', 'new exploit', 'emerging threat']
            })
        
        return focus_areas
    
    def save_crew_input(self, output_path: str = None) -> str:
        """
        Save processed CPE data as crew workflow input.
        
        Args:
            output_path: Optional custom output path
            
        Returns:
            Path to the saved file
        """
        if not self.cpe_data:
            raise ValueError("No CPE data loaded")
        
        crew_input = self.generate_crew_input()
        vulnerability_focus = self.generate_vulnerability_focus_areas()
        
        # Combine crew input with vulnerability focus areas
        crew_workflow_data = {
            'crew_input': crew_input,
            'vulnerability_focus_areas': vulnerability_focus,
            'processing_timestamp': datetime.utcnow().isoformat()
        }
        
        if output_path is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_path = Path(__file__).parent / f"crew_workflow_input_{timestamp}.json"
        
        with open(output_path, 'w') as f:
            json.dump(crew_workflow_data, f, indent=2)
        
        logger.info(f"Crew workflow input saved to: {output_path}")
        return str(output_path)
    
    def get_summary_report(self) -> str:
        """
        Generate a summary report of the CPE data processing.
        
        Returns:
            Formatted summary report string
        """
        if not self.cpe_data:
            return "No CPE data loaded"
        
        software_stack = self.extract_software_stack()
        summary = self.cpe_data.get('summary', {})
        
        report = f"""
# CPE Data Processing Summary Report

## Organization Information
- **Organization**: {self.cpe_data.get('organization', {}).get('name', 'Unknown')}
- **Collection Timestamp**: {self.cpe_data.get('collection_timestamp', 'Unknown')}

## Software Stack Summary
- **Total CPE Records**: {summary.get('total_cpe_records', 0)}
- **Vendors Covered**: {len(software_stack['vendors'])}
- **Products Covered**: {len(software_stack['products'])}

## Categories
- **Operating Systems**: {len(software_stack['operating_systems'])} records
- **Applications**: {len(software_stack['applications'])} records
- **Cloud Platforms**: {len(software_stack['cloud_platforms'])} records

## Top Vendors
{chr(10).join([f"- {vendor}" for vendor in software_stack['vendors'][:10]])}

## Top Products
{chr(10).join([f"- {product}" for product in software_stack['products'][:10]])}

## Vulnerability Focus Areas
"""
        
        focus_areas = self.generate_vulnerability_focus_areas()
        for area in focus_areas:
            report += f"""
### {area['category']}
- **Priority**: {area['priority']}
- **CPE Records**: {area['cpe_count']}
- **Description**: {area['description']}
- **Search Terms**: {', '.join(area['search_terms'])}
"""
        
        return report

def main():
    """Main function for testing the CPE data processor."""
    try:
        # Find the most recent CPE data file
        crew_dir = Path(__file__).parent
        cpe_files = list(crew_dir.glob("cpe_data_*.json"))
        
        if not cpe_files:
            print("No CPE data files found. Please run the NVD CPE client first.")
            return
        
        # Use the most recent file
        latest_file = max(cpe_files, key=lambda x: x.stat().st_mtime)
        print(f"Processing CPE data from: {latest_file}")
        
        # Initialize processor
        processor = CPEDataProcessor(str(latest_file))
        
        # Generate crew workflow input
        output_path = processor.save_crew_input()
        
        # Generate summary report
        summary = processor.get_summary_report()
        print(summary)
        
        # check summary 

        print(f"\nCrew workflow input saved to: {output_path}")
        
    except Exception as e:
        logger.error(f"Error in main execution: {e}")
        raise

if __name__ == "__main__":
    main()
