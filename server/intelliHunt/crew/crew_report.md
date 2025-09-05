
# CrewAI Execution Report
## Final Result:
Splunk Query:
index=sharepoint sourcetype=sharepoint_admin_logs (cmd IN ("*PowerShell*", "*powershell*") OR CommandLine LIKE "%PowerShell%") AND (user NOT IN (["admin1", "admin2"])) 
| join event_id [search index=sharepoint sourcetype=file_activity_logs (file_ext="DLL" OR file_ext="EXE") | fields event_id] 
| transaction maxspan=1m event_id
| where time >= relative_time(now(), "-30d@d") AND time <= relative_time(now(), "+1d@d")
| sort - _time
| rename user as SharePointUser, CommandLine as CommandExecuted, user as FileUser, file_name as MaliciousFile
| fields SharePointUser CommandExecuted FileUser MaliciousFile _time
| tag CVE-2025-XXXXX SharePoint-ZeroDay

Description: 
This query detects SharePoint Zero-Day Exploitation (CVE-2025-XXXXX) by identifying unusual PowerShell script executions in SharePoint administrative logs and correlating them with unauthorized .DLL/.EXE file uploads in SharePoint libraries. It filters out known admin accounts, checks for anomalous file types, and spans a 30-day window to align with attack timelines. The transaction correlates events within 1 minute to identify multi-stage attacks. It leverages sourcetypes "sharepoint_admin_logs" and "file_activity_logs" from the organization's database.
Processed after kickoff.
## Task Outputs:

## Token Usage:
Input Tokens: 4275
Output Tokens: 6475
Total Tokens: 10750

## Token Usage:
Input Tokens: 4275
Output Tokens: 6475
Total Tokens: 10750
