from crewai import Agent, Task, Crew, Process, LLM
import os
from dotenv import load_dotenv
load_dotenv()
from vulnScan.repoScannerTools import clone_github_repo, search_vulnerability_databases, run_security_scans

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

    task_scan = Task(
        description='For {repo_url}: if it is a Git URL, clone it; if it is a local directory path, use it directly. Then run OSV and Semgrep scans, and extract a list of all CVE IDs found.',
        expected_output='A JSON list of unique CVE IDs and a summary of code-level vulnerabilities.',
        agent=analyst,
    )

    task_enrich = Task(
        description='Take the CVE IDs found in the scan and check them against CISA KEV and NVD to prioritize exploited vulnerabilities.',
        expected_output='A prioritized report of vulnerabilities, highlighting those known to be exploited in the wild.',
        agent=researcher,
        context=[task_scan],
    )

    return Crew(
        agents=[analyst, researcher],
        tasks=[task_scan, task_enrich],
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
