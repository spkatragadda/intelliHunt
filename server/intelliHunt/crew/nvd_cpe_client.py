"""
NVD CPE API Client for Configuration Management Database Integration
This module handles automated pulls from the NVD CPE API for organization-specific software stack tracking.
"""

import requests
import yaml
import json
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from pathlib import Path
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class NVDCPEClient:
    """
    Client for interacting with the NVD CPE API to retrieve configuration management data
    relevant to an organization's software stack.
    """
    
    def __init__(self, config_path: str = None):
        """
        Initialize the NVD CPE client with configuration.
        
        Args:
            config_path: Path to the organization CMDB configuration file
        """
        if config_path is None:
            config_path = Path(__file__).parent / "config" / "organization_cmdb.yaml"
        
        self.config = self._load_config(config_path)
        self.base_url = self.config['api_config']['base_url']
        self.cpe_endpoint = self.config['api_config']['cpe_endpoint']
        self.results_per_page = self.config['api_config']['results_per_page']
        self.max_retries = self.config['api_config']['max_retries']
        self.timeout = self.config['api_config']['timeout']
        
        # Session for connection pooling
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'IntelliHunt-CMDB-Client/1.0',
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
                time.sleep(5)
                
                return response.json()
                
            except requests.exceptions.RequestException as e:
                logger.warning(f"Request attempt {attempt + 1} failed: {e}")
                if attempt < self.max_retries - 1:
                    time.sleep(2 ** attempt)  # Exponential backoff
                else:
                    logger.error(f"All {self.max_retries} attempts failed for URL: {url}")
                    return None
    
    def get_cpe_by_vendor(self, vendor: str, product: str = None) -> List[Dict[str, Any]]:
        """
        Retrieve CPE records for a specific vendor and optionally product.
        
        Args:
            vendor: Vendor name (e.g., 'microsoft', 'oracle')
            product: Optional product name
            
        Returns:
            List of CPE records
        """
        cpe_records = []
        start_index = 0
        
        # Build search pattern
        if product:
            search_pattern = f"cpe:2.3:*:{vendor}:{product}:*"
        else:
            search_pattern = f"cpe:2.3:*:{vendor}:*"
        
        logger.info(f"Searching for CPE records matching: {search_pattern}")
        
        while True:
            url = f"{self.base_url}{self.cpe_endpoint}"
            params = {
                'cpeMatchString': search_pattern,
                'resultsPerPage': self.results_per_page,
                'startIndex': start_index
            }
            
            response_data = self._make_request(url, params)
            if not response_data:
                break
            
            products = response_data.get('products', [])
            if not products:
                break
            
            cpe_records.extend(products)
            logger.info(f"Retrieved {len(products)} CPE records (total: {len(cpe_records)})")
            
            # Check if we have more pages
            if len(products) < self.results_per_page:
                break
            
            start_index += self.results_per_page
        
        return cpe_records
    
    def get_cpe_by_keyword(self, keywords: List[str], exact_match: bool = False) -> List[Dict[str, Any]]:
        """
        Retrieve CPE records by keyword search.
        
        Args:
            keywords: List of keywords to search for
            exact_match: Whether to use exact phrase matching
            
        Returns:
            List of CPE records
        """
        cpe_records = []
        start_index = 0
        
        # here might needs to pass a string
        keyword_string = " ".join(keywords)
        logger.info(f"Searching for CPE records with keywords: {keyword_string}")
        
        while True:
            url = f"{self.base_url}{self.cpe_endpoint}"
            params = {
                'keywordSearch': keyword_string,
                'resultsPerPage': self.results_per_page,
                'startIndex': start_index
            }
            
            if exact_match:
                params['keywordExactMatch'] = ''
            
            response_data = self._make_request(url, params)
            if not response_data:
                break
            
            products = response_data.get('products', [])
            if not products:
                break
            
            cpe_records.extend(products)
            logger.info(f"Retrieved {len(products)} CPE records (total: {len(cpe_records)})")
            
            # Check if we have more pages
            if len(products) < self.results_per_page:
                break
            
            start_index += self.results_per_page
        
        return cpe_records
    
    def get_recent_cpe_updates(self, days: int = 7) -> List[Dict[str, Any]]:
        """
        Retrieve CPE records that have been modified in the last N days.
        
        Args:
            days: Number of days to look back for modifications
            
        Returns:
            List of recently modified CPE records
        """
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Format dates for NVD API (ISO 8601)
        start_date_str = start_date.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        end_date_str = end_date.strftime('%Y-%m-%dT%H:%M:%S.000Z')
        
        logger.info(f"Retrieving CPE records modified between {start_date_str} and {end_date_str}")
        
        cpe_records = []
        start_index = 0
        
        while True:
            url = f"{self.base_url}{self.cpe_endpoint}"
            params = {
                'lastModStartDate': start_date_str,
                'lastModEndDate': end_date_str,
                'resultsPerPage': self.results_per_page,
                'startIndex': start_index
            }
            
            response_data = self._make_request(url, params)
            if not response_data:
                break
            
            products = response_data.get('products', [])
            if not products:
                break
            
            cpe_records.extend(products)
            logger.info(f"Retrieved {len(products)} CPE records (total: {len(cpe_records)})")
            
            # Check if we have more pages
            if len(products) < self.results_per_page:
                break
            
            start_index += self.results_per_page
        
        return cpe_records
    
    def get_organization_cpe_data(self) -> Dict[str, Any]:
        """
        Retrieve CPE data relevant to the organization's software stack.
        
        Returns:
            Dictionary containing all relevant CPE data organized by category
        """
        logger.info("Starting organization CPE data collection")
        
        cpe_data = {
            'organization': self.config['organization'],
            'collection_timestamp': datetime.utcnow().isoformat(),
            'operating_systems': [],
            'applications': [],
            'cloud_platforms': [],
            'recent_updates': [],
            'summary': {
                'total_cpe_records': 0,
                'vendors_covered': set(),
                'products_covered': set()
            }
        }
        
        # Collect OS data
        for os_config in self.config['software_stack']['operating_systems']:
            vendor = os_config['vendor']
            for product in os_config['products']:
                logger.info(f"Collecting CPE data for OS: {vendor} {product}")
                cpe_records = self.get_cpe_by_vendor(vendor, product)
                cpe_data['operating_systems'].extend(cpe_records)
                cpe_data['summary']['vendors_covered'].add(vendor)
                cpe_data['summary']['products_covered'].add(product)
        
        # Collect application data
        for app_config in self.config['software_stack']['applications']:
            vendor = app_config['vendor']
            for product in app_config['products']:
                logger.info(f"Collecting CPE data for application: {vendor} {product}")
                cpe_records = self.get_cpe_by_vendor(vendor, product)
                cpe_data['applications'].extend(cpe_records)
                cpe_data['summary']['vendors_covered'].add(vendor)
                cpe_data['summary']['products_covered'].add(product)
        
        # Collect cloud platform data
        for cloud_config in self.config['software_stack']['cloud_platforms']:
            vendor = cloud_config['vendor']
            for product in cloud_config['products']:
                logger.info(f"Collecting CPE data for cloud platform: {vendor} {product}")
                cpe_records = self.get_cpe_by_vendor(vendor, product)
                cpe_data['cloud_platforms'].extend(cpe_records)
                cpe_data['summary']['vendors_covered'].add(vendor)
                cpe_data['summary']['products_covered'].add(product)
        
        # Get recent updates
        if self.config['update_settings']['enable_auto_updates']:
            days = self.config['update_settings']['last_modified_days']
            logger.info(f"Collecting recent CPE updates from last {days} days")
            recent_updates = self.get_recent_cpe_updates(days)
            cpe_data['recent_updates'] = recent_updates
        
        # Calculate summary statistics
        cpe_data['summary']['total_cpe_records'] = (
            len(cpe_data['operating_systems']) +
            len(cpe_data['applications']) +
            len(cpe_data['cloud_platforms']) +
            len(cpe_data['recent_updates'])
        )
        cpe_data['summary']['vendors_covered'] = list(cpe_data['summary']['vendors_covered'])
        cpe_data['summary']['products_covered'] = list(cpe_data['summary']['products_covered'])
        
        logger.info(f"CPE data collection complete. Total records: {cpe_data['summary']['total_cpe_records']}")
        
        return cpe_data
    
    def save_cpe_data(self, cpe_data: Dict[str, Any], output_path: str = None) -> str:
        """
        Save CPE data to file for crew workflow integration.
        
        Args:
            cpe_data: CPE data dictionary
            output_path: Optional custom output path
            
        Returns:
            Path to the saved file
        """
        if output_path is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_path = Path(__file__).parent / f"cpe_data_{timestamp}.json"
        
        output_format = self.config['output']['format']
        
        if output_format == 'json':
            with open(output_path, 'w') as f:
                json.dump(cpe_data, f, indent=2)
        elif output_format == 'yaml':
            with open(output_path, 'w') as f:
                yaml.dump(cpe_data, f, default_flow_style=False)
        else:
            raise ValueError(f"Unsupported output format: {output_format}")
        
        logger.info(f"CPE data saved to: {output_path}")
        return str(output_path)

def main():
    """Main function for testing the NVD CPE client."""
    try:
        # Initialize client
        client = NVDCPEClient()
        
        # Get organization CPE data
        cpe_data = client.get_organization_cpe_data()
        
        # Save data
        output_path = client.save_cpe_data(cpe_data)
        
        print(f"CPE data collection complete!")
        print(f"Total CPE records: {cpe_data['summary']['total_cpe_records']}")
        print(f"Vendors covered: {', '.join(cpe_data['summary']['vendors_covered'])}")
        print(f"Data saved to: {output_path}")
        
    except Exception as e:
        logger.error(f"Error in main execution: {e}")
        raise

if __name__ == "__main__":
    main()
