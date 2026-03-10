# intelliHunt

**IntelliHunt** is a containerized, AI-driven platform designed to automate Cyber Threat Intelligence (CTI) and Threat Hunting (CTH). By correlating an organization's software stack with real-time NVD vulnerability data and an autonomous agentic pipeline, IntelliHunt transforms raw vulnerability feeds into actionable hunting strategies and detection queries.

IntelliHunt is designed to be run **daily or on an ad hoc basis** — kick it off each morning or whenever you want an up-to-date picture of your exposure, and the pipeline handles the rest.

---

## Key Features

- **Automated Vulnerability Aggregation** — Pulls CVEs from the National Vulnerability Database (NVD) scoped to your organization's CPE inventory, covering the last 24 hours by default.
- **Agentic AI Enrichment** — Uses [CrewAI](https://www.crewai.com/) to orchestrate agents that research CVEs, analyze exploit URLs, and synthesize context-aware threat assessments.
- **Automated Detection Queries** — Generates organization-specific Splunk queries (more SIEM integrations planned) to detect active exploitation within your environment.
- **Repository Scanner** — Analyzes source code repositories (GitHub URL or zip upload) to automatically identify vulnerable dependencies and map them to CVEs.
- **CMDB Integrations** — Pulls your live asset inventory directly from ServiceNow, BMC Helix, Atlassian Assets, or a custom API endpoint to auto-populate your software stack.
- **Flexible Input** — Supports manual entry, YAML configuration files, or CMDB-driven inventory sync.
- **Scan History** — Completed repository scan reports persist across sessions; click any row in the history table to re-open the full report.

---

## Getting Started

### Prerequisites
- Docker and Docker Compose
- An API key for a supported LLM provider (OpenAI or Groq)

### Installation & Deployment

1. **Configure environment:**
   Rename `example.env` to `.env` and populate it with your provider, model selection, and API keys.

2. **Launch containers:**
   ```bash
   docker-compose up --build
   ```

3. **Access the interface:**
   Navigate to `http://localhost:3000` in your web browser.

---

## Feature Deep Dive

### Recommended Usage Pattern

IntelliHunt is built for **daily or on-demand** runs:

- **Daily** — Schedule a morning run (or a cron job against the `/api/generate/` endpoint) to ingest the previous 24 hours of NVD disclosures against your stack. The dashboard will reflect any new critical or high findings waiting for your attention.
- **Ad hoc** — Trigger a scan after a major vendor advisory, a software update, or a new repository merge to get an immediate exposure snapshot.

Because the pipeline targets a 1-day CVE window by default, runs complete faster and produce focused, actionable output rather than exhaustive historical noise.

---

### Repository Scanner

The **Repo Scanner** assesses your attack surface by scanning source code for vulnerable dependencies and exposed secrets.

- **GitHub / GitLab / Bitbucket URL** — Paste any public repository URL to kick off a remote scan.
- **Zip Upload** — Upload a `.zip` archive of a local repository for offline or private codebases.
- **Automated Dependency Mapping** — Parses `requirements.txt`, `package.json`, `pom.xml`, `go.mod`, and other manifest files to identify software versions and map them to CPEs and CVEs.
- **Persistent Scan History** — All completed scans are stored in browser local storage. Navigate away and come back — the Recent Scans table lists every previous run, and clicking any completed row restores its full threat detection report without a server round-trip.
- **Downloadable Reports** — Every scan report can be exported as a `.md` file directly from the results panel.

---

### CMDB Integrations

The **Settings → CMDB** panel lets you connect IntelliHunt directly to your asset inventory so you never have to manually enter your software stack.

Supported integrations:

| Provider | Auth Method |
|---|---|
| **ServiceNow** | Basic (username / password) |
| **BMC Helix ITSM** | JWT login |
| **Atlassian Assets** | Basic (email / API token) |
| **Custom API** | None, Basic, Bearer token, or API key header |

**Workflow:**
1. Add and configure an integration in Settings.
2. Click **Test** to verify connectivity.
3. Click **Import** to pull CI records, which are written to `organization_cmdb.yaml` and immediately available for report generation.
4. The last sync timestamp is recorded per integration so you always know how fresh your inventory is.

---

### The Agentic Pipeline

IntelliHunt doesn't just list vulnerabilities — it investigates them. The pipeline:

1. **Fetches** CVEs from NVD for each CPE in your stack, scoped to the last 24 hours.
2. **Parallelizes** NVD API calls across up to 5 workers to minimize wait time.
3. **Prioritizes** the top 10 CVEs by CVSS score before handing off to agents, so the most critical findings always get full analysis.
4. **Enriches** each CVE via CrewAI agents: exploit research, URL analysis, and threat contextualization.
5. **Generates** a structured markdown report with per-CVE analysis, mitigation steps, and Splunk detection queries.

Results are cached for 12 hours so repeated runs within the same day don't re-hit the NVD API unnecessarily.

---

### Performance Optimizations

Several backend optimizations keep runs fast enough for daily use:

| Area | Change |
|---|---|
| CVE window | 1-day lookback (was 7 days) |
| NVD API requests | Parallel fetching with `ThreadPoolExecutor(max_workers=5)` |
| Per-request sleep | Reduced from 5 s → 0.6 s between NVD calls |
| CPE limit per run | Capped at 15 CPEs (was 50) |
| Agent iterations | `max_iter=1` on CTH analyst agent |
| CVE prioritization | Top 10 by CVSS score fed to agents (was unbounded) |
| Result cache TTL | 12 hours (was 6 hours) |
| Task status writes | Batched every 10 log lines (was every line) |

---

## User Interface

### Home Page
![screenshot](imageFolder/intellihunt_mainpage.png)

### Report Generation
![screenshot](imageFolder/intellihunt_generate.png)

### Vulnerability Information
![screenshot](imageFolder/intellihunt_vulnerabilities.png)

### Repo Scanner
![screenshot](imageFolder/intellihunt_reposcanner.png)

### Settings
![screenshot](imageFolder/intellihunt_settings.png)

---

## Roadmap

- **Local Inference** — Support for local models to keep data on-premise.
- **Expanded Data Sources** — Integration with OSINT feeds and ISAC databases.
- **Advanced Detection Logic** — Sigma rules and KQL (Microsoft Sentinel) output.
- **Scheduled Runs** — Built-in cron scheduler to automate daily pipeline execution from the UI.
- **Additional SIEM Integrations** — Elastic SIEM, Microsoft Sentinel, and Splunk ES support.
