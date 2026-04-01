import requests


def fetch_epss_scores(cve_ids: list[str]) -> dict[str, dict]:
    """
    Batch-fetch EPSS scores from api.first.org for a list of CVE IDs.
    Returns: {cve_id: {"epss": float, "percentile": float, "date": str}}
    Silently returns {} on any network/parse failure (EPSS is enrichment, not blocking).
    """
    if not cve_ids:
        return {}

    try:
        url = "https://api.first.org/data/1.0/epss"
        params = {"cve": ",".join(cve_ids)}
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()

        result = {}
        for entry in data.get("data", []):
            cve_id = entry.get("cve")
            if cve_id:
                result[cve_id] = {
                    "epss": float(entry.get("epss", 0)),
                    "percentile": float(entry.get("percentile", 0)),
                    "date": entry.get("date", ""),
                }
        return result
    except Exception:
        return {}
