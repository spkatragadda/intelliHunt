### Cyber Threat Report 🕵️‍♂️
---
### **Iteration 1**

#### **Threat: CVE-2025-10329: Server-Side Request Forgery in cdevroe unmark**

* **Description**: A vulnerability was detected in cdevroe unmark up to version 1.9.3 which affects the Marks.php file. The vulnerability allows for server-side request forgery (SSRF) through manipulation of the 'url' argument. This attack can be initiated remotely, posing a significant threat to the organization as attackers can potentially access restricted internal systems and data. The exploit has been made public and can be utilized by adversaries. The CVSS score for this vulnerability is 6.3, classified as medium severity.

* **Indicators of Compromise (IoCs)**:
    * Unexpected outbound requests
    * HTTP calls to internal services or localhost
    * Abnormal access logs showing unauthorized data access


#### **Detection Method**

* **Query**: `sourcetype=access_combined AND (uri_path="*local*" OR uri_path="*internal*" OR method IN ("POST", "GET") AND status!=200) | stats count by clientip`
* **Description**: This Splunk query detects potential Server-Side Request Forgery (SSRF) attempts related to CVE-2025-10329 by looking for unexpected outbound requests to internal services or localhost. It focuses on web access logs (sourcetype=access_combined) where the request uri_path indicates an attempt to reach internal resources, particularly if the request method is HTTP GET or POST and results in non-200 status codes.

#### **References**
* [https://github.com/YZS17/CVE/blob/main/unmark/ssrf1.md](https://github.com/YZS17/CVE/blob/main/unmark/ssrf1.md)
* [https://vuldb.com/?ctiid.323755](https://vuldb.com/?ctiid.323755)


---

### **Iteration 2**

#### **Threat: CVE-2025-10330: Cross Site Scripting in Cdevroe Unmark**

* **Description**: A flaw has been found in Cdevroe Unmark versions up to 1.9.3, where a cross site scripting vulnerability allows remote exploitation via crafted search queries. The vulnerability, located in 'application/views/layouts/topbar/searchform.php', can lead to arbitrary script execution in the context of the victim's browser, thereby compromising user data and potentially allowing additional attacks.

* **Indicators of Compromise (IoCs)**:
    * Unusual alerts in web application logs indicating malformed requests containing script tags or JavaScript code in parameter 'q'.
    * Detection of payloads resembling XSS vectors (e.g., <script>alert('XSS')</script>) being sent to the affected endpoint.
    * Increased traffic originating from malicious sources aiming to exploit the vulnerable search functionality.


#### **Detection Method**

* **Query**: `index=web sourcetype=iis OR sourcetype=apache_error "<script>" OR "alert('XSS')" | stats count by src_ip, cs_uri_stem, sc_status | where count > 5`
* **Description**: This Splunk query detects potential cross-site scripting (XSS) attempts targeting the Cdevroe Unmark vulnerability (CVE-2025-10330) by searching for log entries that contain script tags or XSS-like payloads in either IIS or Apache logs. The count of occurrences is used to flag suspicious activity, where a high count might indicate an attack attempt.

#### **References**
* [https://github.com/YZS17/CVE/blob/main/unmark/xss1.md](https://github.com/YZS17/CVE/blob/main/unmark/xss1.md)
* [https://github.com/YZS17/CVE/blob/main/unmark/xss1.md#poc](https://github.com/YZS17/CVE/blob/main/unmark/xss1.md#poc)
* [https://vuldb.com/?ctiid.323756](https://vuldb.com/?ctiid.323756)
* [https://vuldb.com/?id.323756](https://vuldb.com/?id.323756)


---

### **Iteration 3**

#### **Threat: CVE-2025-10332 - Cross Site Scripting in cdevroe unmark**

* **Description**: A vulnerability was found in cdevroe unmark versions up to 1.9.3. An unknown function of the file application/views/marks/info.php is susceptible to Cross Site Scripting (XSS). This flaw allows for remote attackers to exploit the vulnerable application by manipulating the 'Title' argument, potentially leading to the execution of arbitrary scripts in the context of victims’ sessions. The CVE was published on September 13, 2025, and has a CVSS score of 3.5, considered LOW severity. The vendor has been contacted about this vulnerability but has not responded.

* **Indicators of Compromise (IoCs)**:
    * Remote manipulation of the Title argument in application/views/marks/info.php
    * Unexpected behavior in the application after inputting malicious data in the Title field


#### **Detection Method**

* **Query**: `index=web sourcetype=access_combined "Title=" | search Title="*<script>*" OR Title="*%3Cscript*" OR Title="*%3Ciframe*" | stats count by clientip, Title`
* **Description**: This Splunk query detects potential attempts to exploit the CVE-2025-10332 vulnerability through Cross Site Scripting (XSS) by searching for user inputs in the Title field that include common XSS patterns such as '<script>' or URL-encoded '<iframe>'.

#### **References**
* [https://github.com/YZS17/CVE/blob/main/unmark/xss2.md](https://github.com/YZS17/CVE/blob/main/unmark/xss2.md)
* [https://vuldb.com/?ctiid.323758](https://vuldb.com/?ctiid.323758)
* [https://vuldb.com/?id.323758](https://vuldb.com/?id.323758)


---

### **Iteration 4**

#### **Threat: CVE-2025-10331 - Cross Site Scripting in cdevroe unmark**

* **Description**: A vulnerability has been found in cdevroe unmark up to 1.9.3 resulting in a cross-site scripting (XSS) issue when manipulating the 'Title' argument in the /application/controllers/Marks.php file. This vulnerability can be exploited remotely, allowing attackers to execute arbitrary scripts in the context of the victim's browser. The CVSS score is noted as 3.5, indicating a low severity level, but the public disclosure may still pose a risk to the affected systems as the vendor has not responded to the vulnerability report.

* **Indicators of Compromise (IoCs)**:
    * Unusual HTTP requests targeting /application/controllers/Marks.php
    * Unexpected input in the argument 'Title' causing script execution
    * Presence of XSS payloads in web application logs


#### **Detection Method**

* **Query**: `sourcetype="access_combined" ("Marks.php" AND "Title") OR ("XSS payload" AND "Title") | stats count by uri_path, clientip, useragent`
* **Description**: This Splunk query is designed to detect attempts of Cross Site Scripting (XSS) in the cdevroe unmark application by looking for unusual HTTP requests specifically targeting the Marks.php file involving the Title argument. It aggregates data to identify possibly malicious activity related to CVE-2025-10331.

#### **References**
* [https://github.com/YZS17/CVE/blob/main/unmark/xss2.md](https://github.com/YZS17/CVE/blob/main/unmark/xss2.md)
* [https://vuldb.com/?ctiid.323757](https://vuldb.com/?ctiid.323757)
* [https://vuldb.com/?id.323757](https://vuldb.com/?id.323757)


---
