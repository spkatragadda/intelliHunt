# Kickoff the process
import os
from vulnScan.repoScannerCrew import get_security_crew
from vulnScan.repoScannerTools import set_allowed_base_dir


def run_pipeline(input_repo: str, tier: str = "speed"):
    # Configure the sandbox guard so file-reading tools only access this repo
    set_allowed_base_dir(os.path.realpath(input_repo))

    crew = get_security_crew(tier=tier)
    result = crew.kickoff(inputs={'repo_url': input_repo})
    return result.raw
