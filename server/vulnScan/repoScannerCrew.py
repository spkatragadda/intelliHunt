from crewai import Agent, Task, Crew, Process, LLM
from langchain_openai import ChatOpenAI
import os
from dotenv import load_dotenv
load_dotenv()
from vulnScan.repoScannerTools import clone_github_repo, search_vulnerability_databases, run_security_scans 
# Initialize LLM


os.environ["MODEL"] = os.getenv("MODEL")
os.environ["GROQ_API_KEY"] = os.getenv("GROQ_KEY")
os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY")
os.environ["MAX_TOKENS"] = os.getenv("MAX_TOKENS")
os.environ["MAX_RPM"] = os.getenv("MAX_RPM")
llm = LLM(model=os.environ["MODEL"])

## Agents
researcher = Agent(
    role='Security Researcher',
    goal='Identify external vulnerabilities and exploit intelligence for specific packages.',
    backstory='Expert in NVD, CISA KEV, and GitHub Advisories. You know where the bugs hide.',
    tools=[search_vulnerability_databases],
    llm=llm,
    verbose=True
)

analyst = Agent(
    role='Code Security Analyst',
    goal='Analyze local source code and dependency trees for security flaws.',
    backstory='Specialist in Static Analysis (SAST) and Software Composition Analysis (SCA).',
    tools=[clone_github_repo, run_security_scans],
    llm=llm,
    verbose=True
)

## Tasks
task_scan = Task(
    description='For {repo_url}: if it is a Git URL, clone it; if it is a local directory path, use it directly. Then run OSV and Semgrep scans, and extract a list of all CVE IDs found.',
    expected_output='A JSON list of unique CVE IDs and a summary of code-level vulnerabilities.',
    agent=analyst
)

task_enrich = Task(
    description='Take the CVE IDs found in the scan and check them against CISA KEV and NVD to prioritize exploited vulnerabilities.',
    expected_output='A prioritized report of vulnerabilities, highlighting those known to be exploited in the wild.',
    agent=researcher,
    context=[task_scan] # This links the output of task_scan to this task
)

## The Crew
security_crew = Crew(
    agents=[analyst, researcher],
    tasks=[task_scan, task_enrich],
    process=Process.sequential, # Tasks run one after another
    verbose=True
)