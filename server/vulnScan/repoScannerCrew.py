from crewai import Agent, Task, Crew, Process, LLM
import os
from dotenv import load_dotenv
load_dotenv()
from vulnScan.repoScannerTools import (
    clone_github_repo, search_vulnerability_databases, run_security_scans,
    list_repo_files, read_file_content,
)

# Set env vars only when the values are present — avoids TypeError at import
# time (e.g. during Docker build) when API keys haven't been injected yet.
_env_map = {
    "MODEL":        os.getenv("MODEL"),
    "GROQ_API_KEY": os.getenv("GROQ_KEY"),
    "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY"),
    "MAX_TOKENS":   os.getenv("MAX_TOKENS"),
    "MAX_RPM":      os.getenv("MAX_RPM"),
}
for key, val in _env_map.items():
    if val is not None:
        os.environ[key] = val


def get_security_crew() -> Crew:
    """
    Build and return the security crew.  Called at request time so the LLM
    and agents are only initialised when all required env vars are present.
    """
    model = os.environ.get("MODEL")
    if not model:
        raise RuntimeError(
            "MODEL env var is not set. "
            "Add MODEL=<provider>/<model-name> to your .env file."
        )

    llm = LLM(model=model)

    researcher = Agent(
        role='Security Researcher',
        goal='Identify external vulnerabilities and exploit intelligence for specific packages.',
        backstory='Expert in NVD, CISA KEV, and GitHub Advisories. You know where the bugs hide.',
        tools=[search_vulnerability_databases],
        llm=llm,
        verbose=True,
    )

    analyst = Agent(
        role='Code Security Analyst',
        goal='Analyze local source code and dependency trees for security flaws.',
        backstory='Specialist in Static Analysis (SAST) and Software Composition Analysis (SCA).',
        tools=[clone_github_repo, run_security_scans],
        llm=llm,
        verbose=True,
    )

    code_reviewer = Agent(
        role='Runtime Vulnerability Analyst',
        goal='Read source code files and identify runtime vulnerabilities that static analysis tools miss.',
        backstory=(
            'You are an expert code auditor specializing in runtime and logic vulnerabilities. '
            'You find flaws that automated scanners cannot: authentication bypasses, race conditions, '
            'TOCTOU issues, insecure deserialization, SSRF, business logic flaws, and improper error '
            'handling. You read code carefully, trace data flows, and reason about exploitability.'
        ),
        tools=[list_repo_files, read_file_content],
        llm=llm,
        verbose=True,
        max_iter=20,
    )

    task_scan = Task(
        description='For {repo_url}: if it is a Git URL, clone it; if it is a local directory path, use it directly. Then run OSV and Semgrep scans, and extract a list of all CVE IDs found.',
        expected_output='A JSON list of unique CVE IDs and a summary of code-level vulnerabilities.',
        agent=analyst,
    )

    task_code_review = Task(
        description=(
            'Analyze the source code in {repo_url} for runtime vulnerabilities that static '
            'analysis tools miss. Follow this strategy:\n'
            '1. Use list_repo_files to get the repository file listing.\n'
            '2. Prioritize files that handle: HTTP routes/views, authentication, '
            'database queries, file I/O, deserialization, subprocess calls, and configuration.\n'
            '3. Also review any files flagged by the static scan results from context.\n'
            '4. Use read_file_content to read the most security-critical files (aim for 8-15 files).\n'
            '5. For each vulnerability found, report: file path, line number(s), vulnerability type '
            '(CWE if applicable), severity (Critical/High/Medium/Low), description, and remediation.\n'
            '6. Focus on: SQL injection, command injection, SSRF, path traversal, auth/authz bypasses, '
            'race conditions, TOCTOU, insecure deserialization, hardcoded secrets, business logic flaws, '
            'and improper error handling that exposes internals.\n'
            '7. If uncertain whether something is vulnerable, flag it as "Potential/Needs Manual Review" '
            'rather than asserting it is definitely a flaw.'
        ),
        expected_output=(
            'A JSON array of runtime vulnerability findings. Each finding should have: '
            'file_path, line_numbers, vulnerability_type, cwe_id, severity, description, '
            'remediation, and detection_method set to "llm_code_review".'
        ),
        agent=code_reviewer,
        context=[task_scan],
    )

    task_enrich = Task(
        description='Take the CVE IDs and vulnerability findings from the scan and code review, and check them against CISA KEV and NVD to prioritize exploited vulnerabilities.',
        expected_output='A prioritized report of vulnerabilities, highlighting those known to be exploited in the wild, combining both static scan and code review findings.',
        agent=researcher,
        context=[task_scan, task_code_review],
    )

    return Crew(
        agents=[analyst, code_reviewer, researcher],
        tasks=[task_scan, task_code_review, task_enrich],
        process=Process.sequential,
        verbose=True,
    )


# Backwards-compatible alias so existing callers that do
#   from vulnScan.repoScannerCrew import security_crew
# continue to work — the crew is built on first access.
class _LazyCrew:
    def __getattr__(self, name):
        return getattr(get_security_crew(), name)

    def kickoff(self, *args, **kwargs):
        return get_security_crew().kickoff(*args, **kwargs)


security_crew = _LazyCrew()
