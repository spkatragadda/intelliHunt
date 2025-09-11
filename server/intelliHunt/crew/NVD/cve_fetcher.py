"""
CVE Fetcher for Recent Vulnerabilities
This module fetches CVE entries from the NVD API for CPEs from the past week.
"""

import requests
import json
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from pathlib import Path
import yaml

# Configure logging to write to logs.txt file
def setup_logging():
    """Setup logging to write to logs.txt file in the same format as crew logs."""
    logger = logging.getLogger(__name__)
    logger.setLevel(logging.INFO)
    
    # Remove any existing handlers
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # Create file handler for logs.txt
    log_file = Path(__file__).parent / "logs.txt"
    file_handler = logging.FileHandler(log_file, mode='a')
    file_handler.setLevel(logging.INFO)
    
    # Create formatter that matches crew log format
    formatter = logging.Formatter('%(asctime)s: %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
    file_handler.setFormatter(formatter)
    
    # Add handler to logger
    logger.addHandler(file_handler)
    
    return logger

logger = setup_logging()

class CVEFetcher:
    """
    Client for fetching CVE entries from the NVD API for specific CPEs.
    """
    
    def __init__(self, config_path: str = None):
        """
        Initialize the CVE fetcher with configuration.
        
        Args:
            config_path: Path to the organization CMDB configuration file
        """
        if config_path is None:
            config_path = Path(__file__).parent / "config" / "organization_cmdb.yaml"
        
        self.config = self._load_config(config_path)
        self.base_url = self.config['api_config']['base_url']
        self.cve_endpoint = self.config['api_config']['cve_endpoint']
        self.results_per_page = self.config['api_config']['results_per_page']
        self.max_retries = self.config['api_config']['max_retries']
        self.timeout = self.config['api_config']['timeout']
        
        # Session for connection pooling
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'IntelliHunt-CVE-Client/1.0',
            'Accept': 'application/json'
        })
    
    def _load_config(self, config_path: str) -> Dict[str, Any]:
        """Load configuration from YAML file."""
        try:
            with open(config_path, 'r') as f:
                return yaml.safe_load(f)
        except Exception as e:
            logger.error(f"Failed to load configuration from {config_path}: {e}")
            raise
    
    def _make_request(self, url: str, params: Dict[str, Any] = None) -> Optional[Dict[str, Any]]:
        """
        Make HTTP request to NVD API with retry logic.
        
        Args:
            url: API endpoint URL
            params: Query parameters
            
        Returns:
            JSON response data or None if failed
        """
        for attempt in range(self.max_retries):
            try:
                logger.info(f"Making request to: {url}")
                response = self.session.get(url, params=params, timeout=self.timeout)
                response.raise_for_status()
                
                # Rate limiting - NVD recommends 0.6 seconds between requests
                # Increase delay to avoid 429 errors
                time.sleep(2.0)
                
                return response.json()
                
            except requests.exceptions.RequestException as e:
                logger.warning(f"Request attempt {attempt + 1} failed: {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(2 ** attempt)  # Exponential backoff
                else:
                    logger.error(f"All {self.max_retries} attempts failed for URL: {url}")
                    return None
    
    def get_cves_for_cpe(self, cpe_name: str, days_back: int = 7) -> List[Dict[str, Any]]:
        """
        Retrieve CVE entries for a specific CPE from the past N days.
        
        Args:
            cpe_name: CPE name to search for
            days_back: Number of days to look back for CVEs
            
        Returns:
            List of CVE records
        """
        # Calculate date range
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days_back)
        
        # Format dates for NVD API (ISO 8601)
        start_date_str = start_date.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        end_date_str = end_date.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        
        logger.info(f"Searching for CVEs for CPE {cpe_name} between {start_date_str} and {end_date_str}")
        
        cve_records = []
        start_index = 0
        
        while True:
            url = f"{self.base_url}{self.cve_endpoint}"
            params = {
                'cpeName': cpe_name,
                'pubStartDate': start_date_str,
                'pubEndDate': end_date_str,
                'resultsPerPage': self.results_per_page,
                'startIndex': start_index
            }
            
            response_data = self._make_request(url, params)
            if not response_data:
                break
            
            vulnerabilities = response_data.get('vulnerabilities', [])
            if not vulnerabilities:
                break
            
            cve_records.extend(vulnerabilities)
            logger.info(f"Retrieved {len(vulnerabilities)} CVE records for {cpe_name} (total: {len(cve_records)})")
            
            # Check if we have more pages
            if len(vulnerabilities) < self.results_per_page:
                break
            
            start_index += self.results_per_page
        
        return cve_records
    
    def get_recent_cves_by_date(self, days_back: int = 7) -> List[Dict[str, Any]]:
        """
        Retrieve all CVE entries published in the past N days.
        
        Args:
            days_back: Number of days to look back for CVEs
            
        Returns:
            List of CVE records
        """
        # Calculate date range
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days_back)
        
        # Format dates for NVD API (ISO 8601)
        start_date_str = start_date.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        end_date_str = end_date.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        
        logger.info(f"Searching for all CVEs published between {start_date_str} and {end_date_str}")
        
        cve_records = []
        start_index = 0
        
        while True:
            url = f"{self.base_url}{self.cve_endpoint}"
            params = {
                'pubStartDate': start_date_str,
                'pubEndDate': end_date_str,
                'resultsPerPage': self.results_per_page,
                'startIndex': start_index
            }
            
            response_data = self._make_request(url, params)
            if not response_data:
                break
            
            vulnerabilities = response_data.get('vulnerabilities', [])
            if not vulnerabilities:
                break
            
            cve_records.extend(vulnerabilities)
            logger.info(f"Retrieved {len(vulnerabilities)} CVE records (total: {len(cve_records)})")
            
            # Check if we have more pages
            if len(vulnerabilities) < self.results_per_page:
                break
            
            start_index += self.results_per_page
        
        return cve_records
    
    def get_cves_for_cpe_list(self, cpe_list: List[str], days_back: int = 7, max_cpes: int = 50) -> Dict[str, List[Dict[str, Any]]]:
        """
        Retrieve CVE entries for a list of CPEs from the past N days.
        
        Args:
            cpe_list: List of CPE names to search for
            days_back: Number of days to look back for CVEs
            max_cpes: Maximum number of CPEs to process (to avoid API rate limits)
            
        Returns:
            Dictionary mapping CPE names to their CVE records
        """
        cve_data = {}
        
        # unique cpe's
        cpe_list = list(set(cpe_list))
        # Limit the number of CPEs to process to avoid overwhelming the API
        limited_cpe_list = cpe_list[:max_cpes]
        
        if len(cpe_list) > max_cpes:
            logger.info(f"Limiting CPE processing to {max_cpes} out of {len(cpe_list)} total CPEs to avoid API rate limits")
        
        for i, cpe_name in enumerate(limited_cpe_list):
            logger.info(f"Fetching CVEs for CPE {i+1}/{len(limited_cpe_list)}: {cpe_name}")
            cves = self.get_cves_for_cpe(cpe_name, days_back)
            cve_data[cpe_name] = cves
            logger.info(f"Found CVE's: {cves}")
            
            # Add a longer delay between CPE searches to be respectful to the API
            time.sleep(3)
        
        return cve_data
    
    def extract_cpe_names_from_data(self, cpe_data: Dict[str, Any]) -> List[str]:
        """
        Extract unique CPE names from the CPE data structure.
        
        Args:
            cpe_data: CPE data dictionary
            
        Returns:
            List of unique CPE names
        """
        cpe_names = set()
        
        # Extract from operating systems
        for os_record in cpe_data.get('operating_systems', []):
            cpe_name = os_record.get('cpe', {}).get('cpeName')
            if cpe_name:
                cpe_names.add(cpe_name)
        
        # Extract from applications
        for app_record in cpe_data.get('applications', []):
            cpe_name = app_record.get('cpe', {}).get('cpeName')
            if cpe_name:
                cpe_names.add(cpe_name)
        
        # Extract from cloud platforms
        for cloud_record in cpe_data.get('cloud_platforms', []):
            cpe_name = cloud_record.get('cpe', {}).get('cpeName')
            if cpe_name:
                cpe_names.add(cpe_name)
        
        # Extract from recent updates
        for update_record in cpe_data.get('recent_updates', []):
            cpe_name = update_record.get('cpe', {}).get('cpeName')
            if cpe_name:
                cpe_names.add(cpe_name)
        
        return list(cpe_names)
    #
    def fetch_recent_vulnerabilities(self, cpe_data_path: str = None, days_back: int = 7) -> Dict[str, Any]:
        """
        Fetch recent vulnerabilities for all CPEs in the organization's data.
        
        Args:
            cpe_data_path: Path to CPE data file (if None, finds latest)
            days_back: Number of days to look back for CVEs
            
        Returns:
            Dictionary containing vulnerability data organized by CPE
        """
        # Load CPE data
        if cpe_data_path is None:
            crew_dir = Path(__file__).parent
            cpe_files = list(crew_dir.glob("cpe_data_*.json"))
            if not cpe_files:
                raise FileNotFoundError("No CPE data files found")
            cpe_data_path = str(max(cpe_files, key=lambda x: x.stat().st_mtime))
        
        logger.info(f"Loading CPE data from: {cpe_data_path}")
        with open(cpe_data_path, 'r') as f:
            cpe_data = json.load(f)
        
        # Extract CPE names
        cpe_names = self.extract_cpe_names_from_data(cpe_data)
        logger.info(f"Found {len(cpe_names)} unique CPE names")
        
        # Fetch CVEs for each CPE
        cve_data = self.get_cves_for_cpe_list(cpe_names, days_back)
        
        # Organize results
        vulnerability_data = {
            'organization': cpe_data.get('organization', {}),
            'collection_timestamp': datetime.utcnow().isoformat(),
            'search_period_days': days_back,
            'cpe_vulnerabilities': cve_data,
            'summary': {
                'total_cpes_searched': len(cpe_names),
                'total_cves_found': sum(len(cves) for cves in cve_data.values()),
                'cpes_with_vulnerabilities': len([cpe for cpe, cves in cve_data.items() if cves]),
                'cpe_names': cpe_names
            }
        }
        
        return vulnerability_data
    
    def save_vulnerability_data(self, vulnerability_data: Dict[str, Any], output_path: str = None) -> str:
        """
        Save vulnerability data to file.
        
        Args:
            vulnerability_data: Vulnerability data dictionary
            output_path: Optional custom output path
            
        Returns:
            Path to the saved file
        """
        if output_path is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_path = Path(__file__).parent / f"vulnerability_data_{timestamp}.json"
        
        with open(output_path, 'w') as f:
            json.dump(vulnerability_data, f, indent=2)
        
        logger.info(f"Vulnerability data saved to: {output_path}")
        return str(output_path)
    
    def generate_research_agent_input(self, vulnerability_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate input data for the research agent based on vulnerability data.
        
        Args:
            vulnerability_data: Vulnerability data dictionary
            
        Returns:
            Dictionary containing research agent input parameters
        """
        # Extract all CVEs and organize by severity/type
        all_cves = []
        cve_details = []
        
        for cpe_name, cves in vulnerability_data['cpe_vulnerabilities'].items():
            for cve_record in cves:
                cve = cve_record.get('cve', {})
                cve_id = cve.get('id', '')
                
                if cve_id:
                    all_cves.append(cve_id)
                    
                    # Extract CVE details
                    descriptions = cve.get('descriptions', [])
                    description = ''
                    for desc in descriptions:
                        if desc.get('lang') == 'en':
                            description = desc.get('value', '')
                            break
                    
                    # Extract CVSS scores
                    metrics = cve.get('metrics', {})
                    cvss_score = None
                    severity = 'UNKNOWN'
                    
                    if 'cvssMetricV31' in metrics:
                        cvss_data = metrics['cvssMetricV31'][0].get('cvssData', {})
                        cvss_score = cvss_data.get('baseScore')
                        severity = cvss_data.get('baseSeverity', 'UNKNOWN')
                    elif 'cvssMetricV30' in metrics:
                        cvss_data = metrics['cvssMetricV30'][0].get('cvssData', {})
                        cvss_score = cvss_data.get('baseScore')
                        severity = cvss_data.get('baseSeverity', 'UNKNOWN')
                    elif 'cvssMetricV2' in metrics:
                        cvss_data = metrics['cvssMetricV2'][0].get('cvssData', {})
                        cvss_score = cvss_data.get('baseScore')
                        severity = cvss_data.get('baseSeverity', 'UNKNOWN')
                    
                    # Extract published date
                    published = cve.get('published', '')
                    
                    cve_details.append({
                        'cve_id': cve_id,
                        'description': description,
                        'cvss_score': cvss_score,
                        'severity': severity,
                        'published': published,
                        'cpe_name': cpe_name,
                        'references': cve.get('references', [])
                    })
        
        # Sort by CVSS score (highest first) and then by published date (newest first)
        cve_details.sort(key=lambda x: (
            x['cvss_score'] if x['cvss_score'] is not None else 0,
            x['published']
        ), reverse=True)
        
        # Create research agent input
        research_input = {
            'vulnerability_focus': 'Recent CVE Analysis',
            'time_period': f"Last {vulnerability_data['search_period_days']} days",
            'total_cves': len(all_cves),
            'unique_cves': len(set(all_cves)),
            'cve_list': all_cves,
            'cve_details': cve_details,
            'high_priority_cves': [cve for cve in cve_details if cve['severity'] in ['CRITICAL', 'HIGH']],
            'organization_context': vulnerability_data.get('organization', {}),
            'search_metadata': {
                'collection_timestamp': vulnerability_data['collection_timestamp'],
                'cpes_searched': vulnerability_data['summary']['total_cpes_searched'],
                'cpes_with_vulnerabilities': vulnerability_data['summary']['cpes_with_vulnerabilities']
            }
        }
        
        return research_input

def main():
    """Main function for testing the CVE fetcher."""
    try:
        # Initialize CVE fetcher
        fetcher = CVEFetcher()
        
        # Fetch recent vulnerabilities
        vulnerability_data = fetcher.fetch_recent_vulnerabilities(days_back=7)
        
        # Save vulnerability data
        output_path = fetcher.save_vulnerability_data(vulnerability_data)
        
        # Generate research agent input
        research_input = fetcher.generate_research_agent_input(vulnerability_data)
        
        # Save research agent input
        research_output_path = Path(__file__).parent / f"research_agent_input_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(research_output_path, 'w') as f:
            json.dump(research_input, f, indent=2)
        
        print(f"CVE data collection complete!")
        print(f"Total CVEs found: {vulnerability_data['summary']['total_cves_found']}")
        print(f"CPEs with vulnerabilities: {vulnerability_data['summary']['cpes_with_vulnerabilities']}")
        print(f"High priority CVEs: {len(research_input['high_priority_cves'])}")
        print(f"Vulnerability data saved to: {output_path}")
        print(f"Research agent input saved to: {research_output_path}")
        
    except Exception as e:
        logger.error(f"Error in main execution: {e}")
        raise

if __name__ == "__main__":
    main()
