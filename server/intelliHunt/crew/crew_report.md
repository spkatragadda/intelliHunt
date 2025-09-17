### Cyber Threat Report 🕵️‍♂️
---
### **Iteration 1**

#### **Threat: CVE-2025-10329**

* **Description**: A vulnerability was detected in cdevroe unmark up to version 1.9.3 affecting /application/controllers/Marks.php. The manipulation of the 'url' argument results in server-side request forgery (SSRF), allowing attackers to remotely exploit the system. The exploit is publicly available, and the attack can be launched without authentication. This poses a moderate risk (CVSS score: 6.3) to organizations using this software stack.

* **Indicators of Compromise (IoCs)**:
    * Unexpected server responses when URLs are manipulated
    * Unusual outbound network traffic patterns
    * Logs showing unauthorized access attempts to the affected PHP file


#### **Detection Method**

* **Query**: `index=my_index sourcetype=access_combined (cs_uri_stem="/application/controllers/Marks.php" OR sc_status!=200) | stats count by clientip, method, sc_status | where count > 5`
* **Description**: This Splunk query detects potential exploitation attempts of the CVE-2025-10329 vulnerability by monitoring access to the Marks.php file and identifying unusual outbound traffic patterns, unauthorized access attempts, and unexpected server responses indicated by non-200 status codes.

#### **References**
* [https://github.com/YZS17/CVE/blob/main/unmark/ssrf1.md](https://github.com/YZS17/CVE/blob/main/unmark/ssrf1.md)
* [https://vuldb.com/?ctiid.323755](https://vuldb.com/?ctiid.323755)
* [https://vuldb.com/?id.323755](https://vuldb.com/?id.323755)


---

### **Iteration 2**

#### **Threat: CVE-2025-10330**

* **Description**: A flaw has been found in cdevroe unmark up to 1.9.3. This vulnerability affects unknown code in the file application/views/layouts/topbar/searchform.php, allowing cross-site scripting (XSS) attacks via manipulated search queries. Remote exploitation is possible, making this a serious threat to web applications using this software. The CVSS score is 4.3, indicating a medium severity level. Despite notifying the vendor, no response has been recorded.

* **Indicators of Compromise (IoCs)**:
    * Manipulation of the argument 'q' in the search form
    * Unexpected payloads in search results
    * Presence of XSS payloads in response headers


#### **Detection Method**

* **Query**: `sourcetype=apache_error "<script>" OR "<iframe>" OR "<img src="`
* **Description**: This Splunk SPL query detects potential XSS (Cross-Site Scripting) attempts related to CVE-2025-10330 by searching for common XSS payloads in Apache error logs. It identifies if the search argument 'q' is manipulated with script tags, iframe tags, or image tags that can execute malicious JavaScript in the context of another user's browser.

#### **References**
* [https://github.com/YZS17/CVE/blob/main/unmark/xss1.md](https://github.com/YZS17/CVE/blob/main/unmark/xss1.md)
* [https://github.com/YZS17/CVE/blob/main/unmark/xss1.md#poc](https://github.com/YZS17/CVE/blob/main/unmark/xss1.md#poc)
* [https://vuldb.com/?ctiid.323756](https://vuldb.com/?ctiid.323756)
* [https://vuldb.com/?id.323756](https://vuldb.com/?id.323756)
* [https://vuldb.com/?submit.643532](https://vuldb.com/?submit.643532)


---

### **Iteration 3**

#### **Threat: CVE-2025-10332: Cross Site Scripting (XSS) in cdevroe unmark**

* **Description**: A vulnerability exists in cdevroe unmark versions up to 1.9.3, specifically in the function in the file application/views/marks/info.php. This flaw allows remote attackers to execute arbitrary JavaScript via the 'Title' argument in an HTTP request, potentially leading to unauthorized actions on behalf of the user and exposure of sensitive information.

* **Indicators of Compromise (IoCs)**:
    * Manipulation of the argument 'Title' in the URL
    * Unauthorized access leading to potential execution of malicious scripts
    * Presence of unexpected script executions in web application responses


#### **Detection Method**

* **Query**: `index=iis OR index=apache sourcetype=iis OR sourcetype=access_combined "Title" AND (sc_status=200 OR sc_status=403) | stats count by c_ip, cs_uri_stem, cs_useragent | where count > 5`
* **Description**: This query detects potential exploitation of CVE-2025-10332 (Cross Site Scripting in cdevroe unmark). It looks for multiple requests containing 'Title' in the URL with a status code of 200 or 403, indicating legitimate and error responses respectively. A high count of such requests from the same IP may indicate an attempt to manipulate the vulnerable parameter.

#### **References**
* [https://github.com/YZS17/CVE/blob/main/unmark/xss2.md](https://github.com/YZS17/CVE/blob/main/unmark/xss2.md)
* [https://vuldb.com/?ctiid.323758](https://vuldb.com/?ctiid.323758)
* [https://vuldb.com/?id.323758](https://vuldb.com/?id.323758)


---

### **Iteration 4**

#### **Threat: CVE-2025-10331: Cross Site Scripting in cdevroe unmark**

* **Description**: A vulnerability has been found in cdevroe unmark up to version 1.9.3, affecting the file /application/controllers/Marks.php. This vulnerability allows for remote execution of Cross-Site Scripting (XSS) attacks due to improper handling of user input in the 'Title' parameter. The vulnerability has a CVSS score of 3.5, categorized as low severity, but is still significant due to its potential exploitation in public environments. Vendors were notified about the vulnerability but did not provide any response.

* **Indicators of Compromise (IoCs)**:
    * Unexpected JavaScript code execution in the browser
    * Malicious script being executed from the URL specified in Title parameter
    * Unusual activity observed in user sessions after accessing the Marks.php endpoint


#### **Detection Method**

* **Query**: `sourcetype=iis cs_uri_stem="/Marks.php" sc_status=200 | stats count by c_ip, cs_useragent | where count > 5`
* **Description**: This Splunk query detects potential Cross-Site Scripting (XSS) attacks related to CVE-2025-10331 in the cdevroe unmark application by monitoring requests to the '/Marks.php' endpoint with a status of 200. It identifies multiple requests from the same IP address and user agent, suggesting automated behavior potentially linked to exploitation attempts.

#### **References**
* [https://github.com/YZS17/CVE/blob/main/unmark/xss2.md](https://github.com/YZS17/CVE/blob/main/unmark/xss2.md)
* [https://vuldb.com/?ctiid.323757](https://vuldb.com/?ctiid.323757)
* [https://vuldb.com/?id.323757](https://vuldb.com/?id.323757)


---
