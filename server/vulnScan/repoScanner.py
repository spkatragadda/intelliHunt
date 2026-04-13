# Kickoff the process
import os
import shutil
import tempfile
import logging
from git import Repo
from vulnScan.repoScannerCrew import get_security_crew
from vulnScan.repoScannerTools import set_allowed_base_dir, _reset_deep_dep_counter, run_static_scans

logger = logging.getLogger(__name__)


def run_pipeline(input_repo: str, tier: str = "speed"):
    # Pre-clone once if the input is a Git URL so that every task in the crew
    # receives a local directory path via {repo_url}.  This prevents the
    # analyst agent from cloning repeatedly and fixes path-based tools
    # (list_repo_files, find_ai_code_files) that fail on raw URLs.
    cloned_dir = None
    if os.path.isdir(input_repo):
        repo_path = os.path.realpath(input_repo)
    else:
        cloned_dir = tempfile.mkdtemp(prefix="intellihunt-scan-")
        logger.info("Cloning %s → %s", input_repo, cloned_dir)
        Repo.clone_from(input_repo, cloned_dir)
        repo_path = cloned_dir

    # Configure the sandbox guard so file-reading tools only access this repo
    set_allowed_base_dir(repo_path)
    # Reset the per-scan call counter for the deep-dep web-search tool
    _reset_deep_dep_counter()

    try:
        # Run static scans deterministically — these ALWAYS execute regardless
        # of LLM behaviour.  Results are injected into every crew task via the
        # {static_scan_results} template variable.
        logger.info("Running static scans (OSV-Scanner + Semgrep) on %s", repo_path)
        static_results = run_static_scans(repo_path)
        logger.info("Static scans complete (%d chars of output)", len(static_results))

        crew = get_security_crew(tier=tier)
        result = crew.kickoff(inputs={
            'repo_url': repo_path,
            'static_scan_results': static_results,
        })
        return result.raw
    finally:
        # Clean up the cloned temp directory (if we created one)
        if cloned_dir and os.path.isdir(cloned_dir):
            shutil.rmtree(cloned_dir, ignore_errors=True)
