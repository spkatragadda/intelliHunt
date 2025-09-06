#!/usr/bin/env python3
"""
Test script for Configuration Management Database integration.
This script tests the NVD CPE API integration and crew workflow integration.
"""

import sys
import os
from pathlib import Path

# Add the crew directory to the Python path
crew_dir = Path(__file__).parent
sys.path.insert(0, str(crew_dir))

def test_nvd_cpe_client():
    """Test the NVD CPE client functionality."""
    print("Testing NVD CPE Client...")
    
    try:
        from nvd_cpe_client import NVDCPEClient
        
        # Initialize client
        client = NVDCPEClient()
        print("✓ NVD CPE Client initialized successfully")
        
        # Test a small CPE query (Microsoft Windows)
        print("Testing CPE query for Microsoft Windows...")
        cpe_records = client.get_cpe_by_vendor("microsoft", "windows_10")
        print(f"✓ Retrieved {len(cpe_records)} CPE records for Microsoft Windows 10")
        
        # Test keyword search
        print("Testing keyword search for 'python'...")
        python_records = client.get_cpe_by_keyword(["python"])
        print(f"✓ Retrieved {len(python_records)} CPE records for Python")
        
        return True
        
    except Exception as e:
        print(f"✗ NVD CPE Client test failed: {e}")
        return False

def test_cpe_data_processor():
    """Test the CPE data processor functionality."""
    print("\nTesting CPE Data Processor...")
    
    try:
        from cpe_data_processor import CPEDataProcessor
        
        # Create a sample CPE data structure for testing
        sample_cpe_data = {
            'organization': {'name': 'Test Organization'},
            'collection_timestamp': '2024-01-01T00:00:00Z',
            'operating_systems': [
                {'cpeName': 'cpe:2.3:o:microsoft:windows_10:*:*:*:*:*:*:*'},
                {'cpeName': 'cpe:2.3:o:apple:macos:*:*:*:*:*:*:*'}
            ],
            'applications': [
                {'cpeName': 'cpe:2.3:a:microsoft:office:*:*:*:*:*:*:*'},
                {'cpeName': 'cpe:2.3:a:python:python:*:*:*:*:*:*:*'}
            ],
            'cloud_platforms': [
                {'cpeName': 'cpe:2.3:a:amazon:aws:*:*:*:*:*:*:*'}
            ],
            'summary': {
                'total_cpe_records': 5,
                'vendors_covered': ['microsoft', 'apple', 'python', 'amazon'],
                'products_covered': ['windows_10', 'macos', 'office', 'python', 'aws']
            }
        }
        
        # Save sample data to a temporary file
        import json
        sample_file = crew_dir / "test_cpe_data.json"
        with open(sample_file, 'w') as f:
            json.dump(sample_cpe_data, f)
        
        # Test processor
        processor = CPEDataProcessor(str(sample_file))
        print("✓ CPE Data Processor initialized successfully")
        
        # Test software stack extraction
        software_stack = processor.extract_software_stack()
        print(f"✓ Extracted software stack: {len(software_stack['vendors'])} vendors, {len(software_stack['products'])} products")
        
        # Test crew input generation
        crew_input = processor.generate_crew_input()
        print(f"✓ Generated crew input with software stack: {crew_input['software_stack'][:50]}...")
        
        # Test vulnerability focus areas
        focus_areas = processor.generate_vulnerability_focus_areas()
        print(f"✓ Generated {len(focus_areas)} vulnerability focus areas")
        
        # Clean up test file
        sample_file.unlink()
        
        return True
        
    except Exception as e:
        print(f"✗ CPE Data Processor test failed: {e}")
        return False

def test_crew_integration():
    """Test the crew system integration."""
    print("\nTesting Crew System Integration...")
    
    try:
        from system import load_cpe_data_for_crew
        
        # Test the CPE data loading function
        print("Testing CPE data loading for crew...")
        inputs = load_cpe_data_for_crew()
        print(f"✓ Loaded crew inputs with software stack: {inputs['software_stack'][:50]}...")
        print(f"✓ URL list contains {len(inputs['url_list'])} URLs")
        
        return True
        
    except Exception as e:
        print(f"✗ Crew System Integration test failed: {e}")
        return False

def main():
    """Run all tests."""
    print("=" * 60)
    print("Configuration Management Database Integration Tests")
    print("=" * 60)
    
    tests = [
        test_nvd_cpe_client,
        test_cpe_data_processor,
        test_crew_integration
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        if test():
            passed += 1
        print()
    
    print("=" * 60)
    print(f"Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! Configuration Management Database integration is ready.")
    else:
        print("⚠️  Some tests failed. Please check the error messages above.")
    
    print("=" * 60)

if __name__ == "__main__":
    main()
