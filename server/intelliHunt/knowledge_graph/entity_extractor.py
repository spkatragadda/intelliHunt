"""
LLM-based entity and relationship extraction from unstructured text.

Uses the existing OpenAI configuration (MODEL env var) with structured
JSON output to extract security entities from CVE descriptions,
scan reports, and advisory text.
"""

import json
import logging
import os
from typing import Any

from openai import OpenAI

logger = logging.getLogger("intelliHunt")

_EXTRACTION_PROMPT = """You are a cybersecurity entity extraction system. Extract structured entities
and relationships from the following security text.

Return a JSON object with these fields:
{
  "software": [{"vendor": "...", "product": "...", "version": "..."}],
  "dependencies": [{"from_product": "...", "to_product": "...", "dependency_type": "direct|transitive|shared_lib"}],
  "threat_actors": ["name1", "name2"],
  "attack_techniques": ["T1059", "T1190"],
  "cwes": ["CWE-79", "CWE-89"],
  "advisories": [{"id": "...", "source": "...", "url": "..."}]
}

Rules:
- For software, extract vendor and product names. Use lowercase. Version is optional.
- For dependencies, only include if the text explicitly mentions one software depending on another.
- For threat_actors, extract named groups (e.g., APT28, Lazarus Group). Skip generic terms.
- For attack_techniques, use MITRE ATT&CK IDs (e.g., T1059, T1190).
- For cwes, use CWE-ID format (e.g., CWE-79).
- For advisories, extract advisory IDs and their sources.
- If a field has no entities, return an empty list.
- Be conservative: only extract entities you're confident about."""


def extract_entities(text: str) -> dict[str, Any]:
    """Extract structured entities from security text using LLM.

    Args:
        text: CVE description, advisory text, or scan report excerpt.

    Returns:
        Dict with keys: software, dependencies, threat_actors,
        attack_techniques, cwes, advisories.
    """
    empty = {
        "software": [],
        "dependencies": [],
        "threat_actors": [],
        "attack_techniques": [],
        "cwes": [],
        "advisories": [],
    }

    if not text or not text.strip():
        return empty

    model = os.environ.get("MODEL") or os.environ.get("SPEED_MODEL")
    if not model:
        logger.warning("entity_extractor: no MODEL env var set, skipping extraction")
        return empty

    # Strip provider prefix for OpenAI SDK (e.g., "openai/gpt-4o-mini" → "gpt-4o-mini")
    if "/" in model:
        model = model.split("/", 1)[1]

    try:
        client = OpenAI()
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _EXTRACTION_PROMPT},
                {"role": "user", "content": text[:4000]},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=2000,
        )

        raw = response.choices[0].message.content or "{}"
        result = json.loads(raw)

        # Validate and normalize
        for key in empty:
            if key not in result or not isinstance(result[key], list):
                result[key] = []

        return result

    except Exception as exc:
        logger.warning("entity_extractor: LLM call failed — %s", exc)
        return empty


def extract_entities_batch(texts: list[str]) -> list[dict[str, Any]]:
    """Extract entities from multiple texts. Calls LLM once per text.

    For efficiency, considers batching short texts together, but falls
    back to individual calls if texts are long.
    """
    results = []
    # Batch short texts together (up to 3000 chars total)
    batch_text = []
    batch_indices = []

    for i, text in enumerate(texts):
        if not text or not text.strip():
            results.append({
                "software": [], "dependencies": [], "threat_actors": [],
                "attack_techniques": [], "cwes": [], "advisories": [],
            })
            continue

        total_len = sum(len(t) for t in batch_text) + len(text)
        if total_len > 3000 and batch_text:
            # Process current batch
            combined = "\n\n---\n\n".join(batch_text)
            extracted = extract_entities(combined)
            for idx in batch_indices:
                results.append(extracted)
            batch_text = []
            batch_indices = []

        batch_text.append(text[:1500])
        batch_indices.append(i)

    # Process remaining batch
    if batch_text:
        combined = "\n\n---\n\n".join(batch_text)
        extracted = extract_entities(combined)
        for idx in batch_indices:
            results.append(extracted)

    return results
