### Cyber Threat Report 🕵️‍♂️
---
### **Iteration 1**

#### **Threat: CVE-2025-11240 - Open Redirect Vulnerability in KNIME Business Hub**

* **Description**: An open redirect vulnerability existed in KNIME Business Hub prior to version 1.16.0. An unauthenticated remote attacker could craft a link to a legitimate KNIME Business Hub installation which, when opened by the user, redirects the user to a page of the attacker's choice. This might open the possibility for fishing or other similar attacks. The problem has been fixed in KNIME Business Hub 1.16.0.

* **Indicators of Compromise (IoCs)**:
    * Presence of unexpected redirects in user logs
    * User reports of phishing attempts


#### **Detection Method**

* **Query**: `CVE-2025-11240 Detection Method`
* **Description**: This detection method focuses on identifying indications of exploitation associated with the CVE-2025-11240 open redirect vulnerability in KNIME Business Hub prior to version 1.16.0. The focus is on capturing attempts to redirect users to unauthorized sites via crafted links.

#### **References**
* [https://www.knime.com/security/advisories](https://www.knime.com/security/advisories)


---

### **Iteration 2**

#### **Threat: Sensitive Information Exposure in KNIME Business Hub**

* **Description**: Potentially sensitive information in jobs on KNIME Business Hub prior to 1.16.0 were visible to all members of the user's team. Starting with KNIME Business Hub 1.16.0 only metadata of jobs is shown to team members.

* **Indicators of Compromise (IoCs)**:


#### **Detection Method**

* **Query**: `Monitor access logs for unusual patterns and user activities in KNIME Business Hub to detect potential unauthorized access to sensitive information.`
* **Description**: This detection method aims to identify unauthorized access attempts to sensitive job data within KNIME Business Hub deployments prior to version 1.16.0 by monitoring authentication and access logs for deviations from expected behavior.

#### **References**
* [https://www.knime.com/security/advisories](https://www.knime.com/security/advisories)


---
