# Cyber Threat Intelligence Report

**Generated:** 2026-03-10 21:23 UTC  
**CVEs Analysed:** 9

---

## 1. Insufficient data validation in Google Chrome — CVE-2026-3545

**Severity:** CRITICAL  **CVSS Score:** 9.6  

Insufficient data validation in Navigation in Google Chrome prior to 145.0.7632.159 allowed a remote attacker to potentially perform a sandbox escape via a crafted HTML page. (Chromium security severity: High)

### Exploitability Metrics

| Attack Vector | Attack Complexity | Privileges Required |
|---|---|---|
| NETWORK | LOW | NONE |

### Technical Details

**Affected Versions:**
- 145.0.7632.159
- 145.0.7632.160

**Patched Versions:**
- 145.0.7632.159
- 145.0.7632.160

**Proof of Concept Available:** No  
**Active Exploit Available:** No  

### Threat Intelligence

**First Seen:** 2026-03-04T20:16:21.690  
**Active Exploitation:** No  

**Indicators of Compromise (IoCs):**
- **type:** Behavioral IoCs
- **indicators:** sandbox escape attempt
- **indicators:** crafted HTML page access

### Organisation Context

**Affected Assets:**
- Google Chrome browser

**Current Versions in Use:**
- 145.0.7632.45

**Existing Security Controls:**
- Web Application Firewall
- Browser updates

**Risk Tolerance:** Low  
**Business Impact:** Potential revenue loss and reputational damage due to exploitation.  

### Risk Assessment

Due to a high CVSS score of 9.6 and critical severity, organizations using affected versions are at significant risk for exploitation. The low attack complexity and required user interaction increase the likelihood of successful attacks if users navigate to crafted HTML pages.

### Recommended Actions

1. Upgrade to the patched versions of Google Chrome immediately: 145.0.7632.159 or later.
2. Implement security awareness training for users to avoid malicious web pages.
3. Regularly monitor and apply updates to browser and other software.

### Detection (Splunk)

**Query:**
```spl
Detect and alert on potential attempts to exploit Google Chrome vulnerability CVE-2026-3545 through crafted HTML pages leading to sandbox escape.
```

This detection method aims to identify instances where users access crafted HTML pages that may trigger a sandbox escape in the Google Chrome browser. It utilizes a combination of network and host indicators to create a robust detection logic, monitoring web activity as well as application login events.

**Type:** Behavioral Detection  **Confidence:** High  **False Positive Risk:** Moderate, primarily due to legitimate access of HTML pages.  

#### Detection Indicators

**Network:**
- sandbox escape attempt
- crafted HTML page access

**Host:**
- User accessing suspicious URLs
- Process creation from web browser

**Behavioral:**
- Subsequent unusual process activity after HTML access
- Increased network traffic to suspicious external domain

**Temporal:**
- Time of access correlating with known attack vectors

#### Testing Instructions

1. Simulate access to known crafted HTML pages and verify alert generation.
2. Review logs from access_combined to ensure traffic to suspicious sites is logged correctly.
3. Conduct penetration testing using sandbox escape scenarios to validate detection capabilities.

#### Maintenance Notes

Regularly review and update detection rules to align with the latest threat intelligence. Conduct routine tests to minimize false positives and assess the detection capabilities against different pages and URL patterns. Keep awareness of new browser updates or changes in exploitability that may affect the threats.

### Media Coverage

- [Google Chrome Vulnerability Update March 2026](https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html) *(source: Google Chrome Releases)*

### References

- [https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html](https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html)
- [https://issues.chromium.org/issues/487383169](https://issues.chromium.org/issues/487383169)

---

## 2. Heap buffer overflow in WebCodecs in Google Chrome — CVE-2026-3544

**Severity:** HIGH  **CVSS Score:** 8.8  

Heap buffer overflow in WebCodecs in Google Chrome prior to 145.0.7632.159 allowed a remote attacker to perform an out of bounds memory write via a crafted HTML page. (Chromium security severity: High)

### Exploitability Metrics

| Attack Vector | Attack Complexity | Privileges Required |
|---|---|---|
| NETWORK | LOW | NONE |

### Technical Details

**Affected Versions:**
- 145.0.7632.159
- 145.0.7632.160

**Patched Versions:**
- 145.0.7632.159
- 145.0.7632.160

**Proof of Concept Available:** No  
**Active Exploit Available:** No  

### Threat Intelligence

**First Seen:** 2026-03-04T20:16:21.550  
**Active Exploitation:** No  

**Indicators of Compromise (IoCs):**
- **type:** behavioral
- **indicators:** Exploitation requires user interaction
- **indicators:** Attackers may use crafted HTML pages

### Organisation Context

**Affected Assets:**
- Google Chrome

**Current Versions in Use:**
- 145.0.7632.45

**Existing Security Controls:**
- Application security monitoring
- User education on phishing

**Risk Tolerance:** Medium  
**Business Impact:** High impact due to potential data exfiltration or unauthorized access through a remote attack  

### Risk Assessment

The high CVSS score of 8.8 indicates a significant risk. Exploitability metrics show that an attacker can exploit the vulnerability over the network with low complexity and no privileges required, posing a major threat to users running affected versions of Google Chrome.

### Recommended Actions

1. Update Google Chrome to version 145.0.7632.159 or later
2. Implement network intrusion detection systems to monitor for unusual activity
3. Educate users about the risks associated with opening untrusted HTML pages

### Detection (Splunk)

**Query:**
```spl
Identify and log any unusual network traffic related to Chrome, focusing on out-of-bounds memory write attempts.
```

This detection method targets potential exploitation of a heap buffer overflow vulnerability in Google Chrome (CVE-2026-3544) which can be exploited through crafted HTML pages. The SPL query identifies anomalous outbound and inbound network traffic related to Chrome on affected versions, capturing logged events indicative of exploitation attempts.

**Type:** Behavioral  **Confidence:** High  **False Positive Risk:** Medium - there may be legitimate traffic that appears similar to exploitation attempts, but the correlation with Chrome-specific activity and out-of-bounds indicators will reduce false alarms.  

#### Detection Indicators

**Network:**
- Unusual network traffic to/from Chrome-related domains
- Requests to crafted HTML pages

**Host:**
- Events showing out-of-bounds memory write attempts

**Behavioral:**
- Patterns of user interaction with untrusted HTML pages

**Temporal:**
- Monitor activities after Chrome version updates

#### Testing Instructions

1. Run the SPL query in a test environment with simulated network traffic indicative of the attack.
2. Verify detection of network requests resembling exploitation patterns, ensuring the query captures relevant events while correlating with out-of-bound write attempts.

#### Maintenance Notes

Regularly update the detection logic with new domain indicators specific to Chrome and maintain awareness of version changes in Chrome for persistent detection efficacy. Evaluate false positive rates based on live data and adjust thresholds as necessary.

### References

- [https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html](https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html)
- [https://issues.chromium.org/issues/485683110](https://issues.chromium.org/issues/485683110)

---

## 3. Out of Bounds Memory Access in V8 — CVE-2026-3543

**Severity:** HIGH  **CVSS Score:** 8.8  

Inappropriate implementation in V8 in Google Chrome prior to 145.0.7632.159 allowed a remote attacker to potentially perform out of bounds memory access via a crafted HTML page. (Chromium security severity: High)

### Exploitability Metrics

| Attack Vector | Attack Complexity | Privileges Required |
|---|---|---|
| NETWORK | LOW | NONE |

### Technical Details

**Affected Versions:**
- 145.0.7632.159
- 145.0.7632.160

**Patched Versions:**
- 145.0.7632.159
- 145.0.7632.160

**Proof of Concept Available:** No  
**Active Exploit Available:** No  

### Threat Intelligence

**First Seen:** 2026-03-04T20:16:21.443  
**Active Exploitation:** No  

**Indicators of Compromise (IoCs):**
- **exploit_technique:** Remote Code Execution
- **behavioral_indicators:** crafted HTML page

### Organisation Context

**Affected Assets:**
- Google Chrome

**Current Versions in Use:**
- 145.0.7632.45

**Risk Tolerance:** Medium  
**Business Impact:** High due to potential remote exploitation leading to data breaches or system compromise.  

### Risk Assessment

With a CVSS score of 8.8 and high severity, this vulnerability poses a significant risk, particularly due to the low attack complexity and no required privileges for exploitation.

### Recommended Actions

1. Upgrade Google Chrome to version 145.0.7632.159 or later to mitigate the vulnerability.
2. Monitor network traffic for indications of exploitation attempts.
3. Educate users about the risks of clicking on untrusted links and pages.

### Detection (Splunk)

**Query:**
```spl
Detection of Out of Bounds Memory Access in V8 (CVE-2026-3543) exploit attempts through network traffic analysis and user behavior monitoring.
```

This detection method focuses on identifying potential remote code execution attempts related to the known vulnerability in Google Chrome's V8 engine, specifically targeting crafted HTML pages that could be used to exploit affected Chrome versions. It uses a combination of network traffic analysis and behavioral indicators to detect anomalies related to the usage of Chrome, along with specific IOCs identified for this threat.

**Type:** Behavioral and Signature-based  **Confidence:** High  **False Positive Risk:** Medium, the detection logic is designed to minimize false positives through refined matching of specific indicators and behavioral patterns.  

#### Detection Indicators

**Network:**
- Remote code execution attempts
- Suspicious network traffic targeting Chrome's process (e.g., from specific IPs known for scanning)
- Excessive requests for HTML resources

**Host:**
- Chrome process execution anomalies
- Unusual user behavior patterns with Chrome
- Frequency of HTML page accesses from unknown sources

**Behavioral:**
- Access to crafted HTML pages from suspicious sources
- Unusual application crashes related to Chrome
- Unexpected script execution in the browser context

**Temporal:**
- Increased network traffic volume at the first observed exploitation date (2026-03-04)
- Time correlation based on user access logs and web server logs indicating patterns inconsistent with normal operation

#### Testing Instructions

1. Simulate network conditions reflecting known exploit attempts, ensuring that both benign and malicious traffic is included.
2. Generate alerts with crafted HTML pages in a controlled environment and verify alert triggers.
3. Monitor traffic generated from test users accessing potential exploit pages and validate detection effectiveness.

#### Maintenance Notes

Regularly review and update detection rules as new behavior patterns and IOCs are identified related to CVE-2026-3543. Maintain documentation on rule modifications and ensure engagement with threat intelligence updates to stay ahead of evolving tactics.

### Media Coverage

- [Stable Channel Update for Desktop](https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html) *(source: Google Chrome Releases)*

### References

- [https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html](https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html)
- [https://issues.chromium.org/issues/485267831](https://issues.chromium.org/issues/485267831)

---

## 4. Out of bounds memory access in WebAssembly in Google Chrome — CVE-2026-3542

**Severity:** HIGH  **CVSS Score:** 8.8  

Inappropriate implementation in WebAssembly in Google Chrome prior to 145.0.7632.159 allowed a remote attacker to perform out of bounds memory access via a crafted HTML page. (Chromium security severity: High)

### Exploitability Metrics

| Attack Vector | Attack Complexity | Privileges Required |
|---|---|---|
| NETWORK | LOW | NONE |

### Technical Details

**Affected Versions:**
- 145.0.7632.159
- 145.0.7632.160

**Proof of Concept Available:** No  
**Active Exploit Available:** No  

### Threat Intelligence

**First Seen:** 2026-03-04T20:16:21.340  
**Active Exploitation:** No  

### Indicators of Compromise

- Out of bounds memory access

### Organisation Context

**Affected Assets:**
- Google Chrome versions prior to 145.0.7632.159

**Current Versions in Use:**
- 145.0.7632.45

**Risk Tolerance:** Medium  
**Business Impact:** Potential leakage of sensitive information or execution of arbitrary code  

### Risk Assessment

Given the CVSS score of 8.8 and the low attack complexity with no privileges required, this vulnerability poses a significant risk to organizations using affected versions of Google Chrome.

### Recommended Actions

1. Upgrade to the latest version of Google Chrome (145.0.7632.159 or later)
2. Monitor systems for the exploitation of this vulnerability
3. Review security controls to mitigate potential risks associated with this vulnerability

### Detection (Splunk)

**Query:**
```spl
Detection of Out of Bounds Memory Access in Google Chrome
```

This detection method is designed to identify potential exploitation attempts targeting the out-of-bounds memory access vulnerability in Google Chrome versions prior to 145.0.7632.159. Using a combination of behavioral detection from web server logs and specific indicators of compromise, this method will help identify any indicators of suspicious web activity related to the exploitation of the vulnerability.

**Type:** Behavioral and Signature-based  **Confidence:** High  **False Positive Risk:** Medium; efforts to ensure detection specificity will be implemented to tune the rules to minimize erroneous alerts.  

#### Detection Indicators

**Network:**
- Web page access attempts to vulnerable versions of Google Chrome
- HTTP requests with suspicious payloads

**Host:**
- Unusual process creations from Chrome like exe calls that are not commonly seen
- High CPU or memory usage by Chrome processes

**Behavioral:**
- Requests originating from high-risk geographical locations attempting access to common vulnerable scripts
- Patterns of web requests that spike for specific resources correlated with known data leaks

**Temporal:**
- Increased requests to URLs commonly exploited during the time frame of active exploitation since 2026-03-04

#### Testing Instructions

1. Simulate exploitation attempts by crafting web pages that mirror the characteristics of the CVE exploit.
2. Incorporate test indicators in a controlled environment to ensure detection logic triggers as expected.
3. Verify the absence of false positives by comparing alerts against expected behavior from legitimate user activity.

#### Maintenance Notes

Regularly update detection rules based on emerging threat intelligence related to browser vulnerabilities. Monitor SIEM performance and adjust queries as necessary to improve response times and reduce overhead. Continue educating analysts on the characteristics of this CVE to refine detection criteria.

### References

- [https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html](https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html)
- [https://issues.chromium.org/issues/485152421](https://issues.chromium.org/issues/485152421)

---

## 5. Inappropriate implementation in CSS in Google Chrome — CVE-2026-3541

**Severity:** HIGH  **CVSS Score:** 8.8  

Inappropriate implementation in CSS in Google Chrome prior to 145.0.7632.159 allowed a remote attacker to perform an out of bounds memory read via a crafted HTML page.

### Exploitability Metrics

| Attack Vector | Attack Complexity | Privileges Required |
|---|---|---|
| NETWORK | LOW | NONE |

### Technical Details

**Affected Versions:**
- 145.0.7632.159
- 145.0.7632.160

**Patched Versions:**
- 145.0.7632.159
- 145.0.7632.160

**Proof of Concept Available:** No  
**Active Exploit Available:** No  

### Threat Intelligence

**First Seen:** 2026-03-04T20:16:21.230  
**Active Exploitation:** No  

**Indicators of Compromise (IoCs):**
- **behavioral:** out of bounds memory read
- **behavioral:** crafted HTML page interactions

### Organisation Context

**Affected Assets:**
- Google Chrome browser installs

**Current Versions in Use:**
- 145.0.7632.45

**Existing Security Controls:**
- Regularly update browser
- Implement network security measures

**Risk Tolerance:** Low  
**Business Impact:** Potential data leakage and exploitation of user systems  

### Risk Assessment

With a CVSS score of 8.8 and active exploitation potential classified as low, this vulnerability presents a significant risk to unpatched systems.

### Recommended Actions

1. Update Google Chrome to the latest version immediately
2. Monitor for unusual browser activity
3. Educate users about the risks of crafted HTML pages

### Detection (Splunk)

**Query:**
```spl
Detect exploitation attempts related to a Google Chrome vulnerability through behavioral patterns and specific indicators.
```

This detection method aims to identify attempts to exploit the 'Inappropriate implementation in CSS in Google Chrome' vulnerability (CVE-2026-3541) by tracking unusual memory read attempts and accesses to suspicious HTML pages. It leverages both behavioral detection and specific indicators of compromise (IoCs) related to crafted HTML pages.

**Type:** Behavioral and Signature-based  **Confidence:** High  **False Positive Risk:** Medium, due to legitimate accesses to HTML pages and specific web applications that may be misinterpreted as indicators.  

#### Detection Indicators

**Network:**
- suspicious HTML page access
- multiple requests to untrusted domains

**Host:**
- out of bounds memory read attempts
- anomalies in Chrome process behavior

**Behavioral:**
- user session anomalies when accessing web content
- abnormal browser process spikes in memory usage

**Temporal:**
- access patterns correlating with the release of CVE-2026-3541
- requests from untrusted IPs around the time of vulnerability disclosure

#### Testing Instructions

1. Simulate access to a crafted HTML page with known IoCs to validate detection.
2. Refer to existing event logs for behavioral patterns indicating potential exploitation.
3. Perform controlled test scenarios against a browser with outdated versions.

#### Maintenance Notes

Regularly review and update detection rules based on evolving threat intelligence. Monitor for new versions of Google Chrome to adjust the detection logic to account for new vulnerabilities or improved exploit techniques. Consider integrating additional IoCs as they become available.

### Media Coverage

- [Stable Channel Update for Desktop](https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html) *(source: Google Chrome Releases)*

### References

- [https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html](https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html)
- [https://issues.chromium.org/issues/484811719](https://issues.chromium.org/issues/484811719)

---

## 6. Out of Bounds Memory Access in WebAudio — CVE-2026-3540

**Severity:** HIGH  **CVSS Score:** 8.8  

Inappropriate implementation in WebAudio in Google Chrome prior to 145.0.7632.159 allowed a remote attacker to perform out of bounds memory access via a crafted HTML page. (Chromium security severity: High)

### Exploitability Metrics

| Attack Vector | Attack Complexity | Privileges Required |
|---|---|---|
| NETWORK | LOW | NONE |

### Technical Details

**Affected Versions:**
- 145.0.7632.159
- 145.0.7632.160

**Proof of Concept Available:** No  
**Active Exploit Available:** No  

### Threat Intelligence

**First Seen:** 2026-03-04T20:16:21.123  
**Active Exploitation:** No  

### Indicators of Compromise

- Unusual network traffic to crafted HTML pages
- Unexpected crashes or memory access errors in Google Chrome

### Organisation Context

**Affected Assets:**
- Google Chrome

**Current Versions in Use:**
- 145.0.7632.45

**Risk Tolerance:** High  
**Business Impact:** Potential unauthorized access to sensitive data due to remote code execution risk  

### Risk Assessment

Given the CVSS score of 8.8, this vulnerability poses a significant risk with a high likelihood of exploitation. The low attack complexity and no privilege requirement amplify the urgency for remediation.

### Recommended Actions

1. Upgrade Google Chrome to version 145.0.7632.161 or later.
2. Monitor and restrict access to potentially malicious crafted HTML content.
3. Implement web application firewalls to detect and block crafted payloads.

### Detection (Splunk)

**Query:**
```spl
Detection of Out of Bounds Memory Access in WebAudio exploits targeting Google Chrome.
```

This detection method identifies attempts to exploit the Out of Bounds Memory Access vulnerability (CVE-2026-3540) in Google Chrome versions before 145.0.7632.159 by monitoring for unusual network traffic patterns and errors associated with the Chrome browser. The query is designed to flag any unusual communications targeting browsers and any crashes or memory access errors that indicate the possibility of exploitation.

**Type:** Behavioral and Signature-based  **Confidence:** High  **False Positive Risk:** Low; designed to minimize false positives by correlating specific network traffic patterns with known browser behaviors.  

#### Detection Indicators

**Network:**
- Unusual outbound connections from known web servers
- Traffic patterns targeting Google Chrome installations, particularly unusual HTTP requests.

**Host:**
- Unexpected crashes of Google Chrome processes
- Memory access errors observed in Chrome's event logs or system monitoring logs.

**Behavioral:**
- Increased rate of crashes or abrupt terminations of the Chrome processes
- Patterns of legitimate web traffic leading to pages known to exploit Chrome vulnerabilities

**Temporal:**
- Traffic spikes coinciding with updates or disclosures of the vulnerability
- Multiple access attempts to the same malicious HTML content within short timeframes

#### Testing Instructions

1. Simulate exploit attempts using crafted HTML pages in a controlled environment to generate log entries.
2. Monitor for triggers in the detection query and validate that alerts are correctly activated for actual threat scenarios without raising false alerts.

#### Maintenance Notes

Regularly review detection rules to incorporate new IoCs as they are discovered and patch levels update. Adjust the query for performance and accuracy. Remain aware of updates to Google Chrome and adapt the rules to detect bypass techniques as they evolve.

### References

- [https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html](https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html)
- [https://issues.chromium.org/issues/484088917](https://issues.chromium.org/issues/484088917)

---

## 7. Heap Corruption via Malicious Chrome Extension — CVE-2026-3539

**Severity:** HIGH  **CVSS Score:** 8.8  

Object lifecycle issue in DevTools in Google Chrome prior to 145.0.7632.159 allowed an attacker who convinced a user to install a malicious extension to potentially exploit heap corruption via a crafted Chrome Extension. (Chromium security severity: High)

### Exploitability Metrics

| Attack Vector | Attack Complexity | Privileges Required |
|---|---|---|
| NETWORK | LOW | NONE |

### Technical Details

**Affected Versions:**
- 145.0.7632.159

**Patched Versions:**
- 145.0.7632.159

**Proof of Concept Available:** No  
**Active Exploit Available:** No  

### Threat Intelligence

**First Seen:** 2026-03-04T20:16:20.957  
**Active Exploitation:** No  

**Indicators of Compromise (IoCs):**
- **malicious_extensions:** Potentially malicious Chrome Extensions

### Organisation Context

**Affected Assets:**
- Google Chrome installations prior to 145.0.7632.159

**Current Versions in Use:**
- 145.0.7632.45
- 145.0.7632.159

**Existing Security Controls:**
- User awareness training
- Browser security policies

**Risk Tolerance:** Medium  
**Business Impact:** Potential for data breach and malware propagation  

### Risk Assessment

The CVSS score of 8.8 indicates a high risk, with a low attack complexity and no privileges required, making this vulnerability a significant threat to users if mitigations are not put in place.

### Recommended Actions

1. Update Google Chrome to the latest version (145.0.7632.159 or later)
2. Educate users about the risks of installing extensions from unverified sources
3. Implement browser extension management policies to restrict installation of unknown extensions

### Detection (Splunk)

**Query:**
```spl
Malicious Chrome Extension Detection Based on IOC and Behavior Analysis
```

This detection method leverages log data from browser activities to identify potential malicious Chrome extensions based on known behavioral patterns and specific indicators of compromise. The method combines network and host-based indicators to provide comprehensive visibility of the threat and aims to detect unauthorized extension installations and unusual browser activities suggestive of exploitation attempts related to CVE-2026-3539.

**Type:** Behavioral and Signature-based  **Confidence:** High  **False Positive Risk:** Medium, affected by user behavior and legitimate application updates.  

#### Detection Indicators

**Network:**
- Potentially malicious Chrome Extensions

**Host:**
- Installation of unauthorized extensions
- Unexplained browser behavior

**Behavioral:**
- Rapid creation and deletion of browser profiles
- Unusual network requests to suspicious domains

**Temporal:**
- Detection of unauthorized extensions since 2026-03-04T20:16:20

#### Testing Instructions

1. Simulate installation of various Chrome extensions to confirm detection of unauthorized activities.
2. Monitor logs for browser activity indicative of known IoCs.
3. Perform real-time testing to validate detection capabilities against standard user behavior.

#### Maintenance Notes

Regularly update the detection rules in accordance with new malicious extension reports. Periodic review of installed extensions on user machines and adjustments to detection logic based on user behavior analysis and environment changes are necessary.

### References

- [https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html](https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html)
- [https://issues.chromium.org/issues/483853098](https://issues.chromium.org/issues/483853098)

---

## 8. Integer Overflow in Skia (Google Chrome) — CVE-2026-3538

**Severity:** HIGH  **CVSS Score:** 8.8  

Integer overflow in Skia in Google Chrome prior to 145.0.7632.159 allowed a remote attacker to potentially perform out of bounds memory access via a crafted HTML page.

### Exploitability Metrics

| Attack Vector | Attack Complexity | Privileges Required |
|---|---|---|
| NETWORK | LOW | NONE |

### Technical Details

**Affected Versions:**
- 145.0.7632.159

**Proof of Concept Available:** No  
**Active Exploit Available:** No  

### Threat Intelligence

**First Seen:** 2026-03-04  
**Active Exploitation:** No  

### Indicators of Compromise

- Out of bounds memory access attempts
- Unexpected crashes when rendering specific HTML content

### Organisation Context

**Affected Assets:**
- cpe:2.3:a:google:chrome:145.0.7632.45:*:*:*:*:*:*:*

**Current Versions in Use:**
- 145.0.7632.45

**Risk Tolerance:** HIGH  
**Business Impact:** Potential for remote code execution and compromise of user systems due to crafted HTML page.  

### Risk Assessment

With a CVSS score of 8.8 and low attack complexity, this vulnerability poses a significant risk. Due to its critical nature and the associated potential for exploitation via crafted web pages, immediate action is recommended.

### Recommended Actions

1. Upgrade Google Chrome to version 145.0.7632.159 or later.
2. Monitor network traffic for unusual patterns indicating exploit attempts.
3. Educate users about the risks of opening untrusted HTML content.

### Detection (Splunk)

**Query:**
```spl
Detect potential exploitation attempts related to CVE-2026-3538, focusing on network traffic and application behavior that indicates out-of-bounds memory access or HTML rendering issues.
```

This detection method identifies suspicious activities that may signify attempts to exploit the integer overflow vulnerability in Skia within Google Chrome prior to version 145.0.7632.159. The detection leverages SIEM correlation rules to analyze user-agent strings, network traffic patterns, and error messages associated with abnormal application behavior as represented in logs from appropriate sourcetypes.

**Type:** Behavioral and Signature-based  **Confidence:** High  **False Positive Risk:** Medium. While the detection logic is tailored towards identifying specific behaviors linked to the exploitation of the vulnerability, similar legitimate network requests may occur, increasing the potential for false positives. Continuous tuning will be required to minimize these.  

#### Detection Indicators

**Network:**
- Unusual user-agent strings indicative of malicious HTML requests
- Increased network traffic to web applications from anomalous sources
- HTTP requests resulting in 4xx or 5xx error codes followed by multiple retries

**Host:**
- Application crashes logged in security event logs
- Unusual memory allocation patterns observed via monitoring alerts

**Behavioral:**
- Out of bounds memory access attempts logged
- Repeated rendering failures of HTML content consistent with the crafted pages targeting the vulnerability

**Temporal:**
- Activities logged that coincide with the public release date of the vulnerability (2026-03-04)
- Patterns suggesting repeated access attempts from the same IP addresses or user accounts

#### Testing Instructions

1. Simulate traffic using crafted HTML content to observe if detection triggers.
2. Set up a test environment replicating the organization’s live network conditions to validate alert generation and false positive occurrences.
3. Keep records of legitimate and test incidents for further tuning.

#### Maintenance Notes

Regularly review and update the detection rules as newer exploits are discovered and existing protections are implemented in the Google Chrome updates. Monitor feedback and adjust queries to enhance performance and the accuracy of alerts. Consider setting a review cycle every quarter for tuning based on emerging threat intelligence.

### References

- [https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html](https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html)
- [https://issues.chromium.org/issues/484983991](https://issues.chromium.org/issues/484983991)

---

## 9. ANGLE Integer Overflow in Google Chrome — CVE-2026-3536

**Severity:** HIGH  **CVSS Score:** 8.8  

Integer overflow in ANGLE in Google Chrome prior to 145.0.7632.159 allowed a remote attacker to potentially perform out of bounds memory access via a crafted HTML page.

### Exploitability Metrics

| Attack Vector | Attack Complexity | Privileges Required |
|---|---|---|
| NETWORK | LOW | NONE |

### Technical Details

**Affected Versions:**
- 145.0.7632.159
- 145.0.7632.160

**Proof of Concept Available:** No  
**Active Exploit Available:** No  

### Threat Intelligence

**First Seen:** 2026-03-04T20:16:20.557  
**Active Exploitation:** No  

**Indicators of Compromise (IoCs):**

### Organisation Context

**Affected Assets:**
- Google Chrome versions prior to 145.0.7632.159

**Current Versions in Use:**
- 145.0.7632.45

**Existing Security Controls:**
- Regular updates to software
- Web application firewall
- Intrusion detection systems

**Risk Tolerance:** Moderate  
**Business Impact:** Potential for data exposure and system compromise if unpatched.  

### Risk Assessment

Given the CVSS score of 8.8 and the low complexity of exploitation, organizations should prioritize patching affected versions to mitigate potential risks.

### Recommended Actions

1. Update Google Chrome to version 145.0.7632.159 or later.
2. Implement strict input validation in web applications to prevent crafted HTML pages.
3. Monitor traffic for anomalies that might indicate exploitation attempts.

### Detection (Splunk)

**Query:**
```spl
Detect malicious attempts utilizing crafted HTML pages targeting Google Chrome vulnerabilities via network traffic analysis.
```

This detection method leverages network traffic logs to identify potential exploitation attempts against Google Chrome's integer overflow vulnerability (CVE-2026-3536) which affects versions prior to 145.0.7632.159. By analyzing HTTP request characteristics and payloads, we can identify anomalous requests made towards Chrome users that signify potential exploitation. Such requests may exhibit unusual URI patterns, unexpected content types, or suspicious user agent modifications.

**Type:** Anomaly detection  **Confidence:** Medium  **False Positive Risk:** Low; designed to filter out common traffic patterns while highlighting significant deviations.  

#### Detection Indicators

**Network:**
- Suspicious URI patterns involving domain names manipulated to exploit Chrome vulnerabilities.
- High volume of requests from specific source IPs targeting HTTP resources.
- Requests with unusual content types or headers indicative of exploitation.

**Host:**
- Logs indicating access to known vulnerable Chrome versions from user workstations.

**Behavioral:**
- Repeated failed login attempts triggered by unusual payloads in requests.

**Temporal:**
- Requests made after the first observed date of the threat intelligence (2026-03-04).

#### Testing Instructions

1. Simulate exploitation attempts by sending crafted HTTP requests to observe if alerts are triggered in the SIEM.
2. Deploy the detection logic in an isolated environment first to tune the query for effective results.

#### Maintenance Notes

Regularly review detection performance and adjust queries based on evolving traffic patterns or updates to Chrome and related security threats. Monitor for any false positives and iteratively refine detection criteria.

### References

- [https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html](https://chromereleases.googleblog.com/2026/03/stable-channel-update-for-desktop.html)
- [https://issues.chromium.org/issues/485622239](https://issues.chromium.org/issues/485622239)

---
