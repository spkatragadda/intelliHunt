# Kickoff the process
from vulnScan.repoScannerCrew import security_crew

def run_pipeline(input_repo: str):
    result = security_crew.kickoff(inputs={'repo_url': input_repo})
    return result.raw

