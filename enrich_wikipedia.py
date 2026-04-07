#!/usr/bin/env python3
"""
enrich_wikipedia.py

Enrich Wikidata building data with verified tenant/occupant information
from Wikipedia articles. Only extracts info from articles that have at
least one reference (verification signal).

Usage:
    python enrich_wikipedia.py                # all areas
    python enrich_wikipedia.py shinjuku       # single area
    python enrich_wikipedia.py shinjuku la    # multiple areas
"""

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.error

DATA_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "public", "data"
)

USER_AGENT = "VIBLOC-Wiki-Enricher/1.0 (contact@example.com)"
SLEEP_BETWEEN = 0.3
MAX_RETRIES = 3

AREAS = {
    "shinjuku": "jawiki",
    "shibuya": "jawiki",
    "itaewon": "kowiki",
    "gangnam": "kowiki",
    "manhattan": "enwiki",
    "la": "enwiki",
}

INFOBOX_FIELDS = [
    "tenants", "tenant",
    "occupants", "occupant",
    "owner",
    "operator",
    "current_tenants",
    "notable_tenants",
    "architect",
    "developer",
    "floors", "floor_count",
    "height",
    "built", "completed", "completion_date", "start_date",
    "style", "architectural_style", "architecture_style",
    "cost",
    # Address / location — used to rewrite OSM addresses with verified values
    "address",
    "street_address",
    "location",
    "location_city",
    "location_country",
    "location_town",
    "address_location",
    "addr",
    "所在地",  # Japanese: location
    "住所",    # Japanese: address
    "소재지",  # Korean: location
    "주소",    # Korean: address
]


# ---------- HTTP ----------

def http_get_json(url):
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read().decode("utf-8")
                return json.loads(data)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code == 429:
                time.sleep(2 ** attempt + 1)
                continue
            if attempt == MAX_RETRIES - 1:
                return None
            time.sleep(1.0 * (attempt + 1))
        except Exception:
            if attempt == MAX_RETRIES - 1:
                return None
            time.sleep(1.0 * (attempt + 1))
    return None


# ---------- Wikidata -> Wikipedia title ----------

def get_wiki_title(qid, local_wiki):
    url = f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json"
    data = http_get_json(url)
    if not data:
        return None, None
    entities = data.get("entities", {})
    ent = entities.get(qid)
    if not ent:
        return None, None
    sitelinks = ent.get("sitelinks", {})
    # Prefer English, fall back to local language
    for wiki_key in ("enwiki", local_wiki):
        if wiki_key in sitelinks:
            link = sitelinks[wiki_key]
            title = link.get("title")
            if not title:
                continue
            lang = "en" if wiki_key == "enwiki" else wiki_key.replace("wiki", "")
            return title, lang
    return None, None


# ---------- Wikipedia content ----------

def get_wiki_summary(title, lang):
    encoded = urllib.parse.quote(title.replace(" ", "_"), safe="")
    url = f"https://{lang}.wikipedia.org/api/rest_v1/page/summary/{encoded}"
    return http_get_json(url)


def get_wiki_wikitext(title, lang):
    encoded = urllib.parse.quote(title)
    url = (
        f"https://{lang}.wikipedia.org/w/api.php"
        f"?action=parse&format=json&prop=wikitext&page={encoded}&redirects=1"
    )
    data = http_get_json(url)
    if not data:
        return None
    parse = data.get("parse")
    if not parse:
        return None
    wikitext = parse.get("wikitext", {})
    if isinstance(wikitext, dict):
        return wikitext.get("*", "")
    return wikitext or ""


# ---------- Wikitext parsing ----------

CITE_TEMPLATE_RE = re.compile(r"\{\{\s*[Cc]ite[^{}]*\}\}")
SFN_TEMPLATE_RE = re.compile(r"\{\{\s*[Ss]fn[^{}]*\}\}")
REF_TAG_RE = re.compile(r"<ref[^>]*>.*?</ref>", re.DOTALL)
REF_SELFCLOSE_RE = re.compile(r"<ref[^/]*/>")
COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
BR_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)
HTML_TAG_RE = re.compile(r"<[^>]+>")
WIKILINK_RE = re.compile(r"\[\[([^\[\]\|]+)\|([^\[\]]+)\]\]")
WIKILINK_PLAIN_RE = re.compile(r"\[\[([^\[\]]+)\]\]")
EXTLINK_RE = re.compile(r"\[https?://[^\s\]]+\s+([^\]]+)\]")
EXTLINK_BARE_RE = re.compile(r"\[https?://[^\s\]]+\]")
BOLDITAL_RE = re.compile(r"'{2,5}")


def strip_templates_keep_content(text):
    # Repeatedly remove innermost templates
    # Keep content of {{nowrap|X}}, {{convert|...}} etc. by extracting best-effort text.
    prev = None
    safe_inline = {"nowrap", "lang", "small", "nobr", "plainlist", "flatlist"}
    while prev != text:
        prev = text
        def replace(m):
            inner = m.group(1)
            # split by pipe
            parts = inner.split("|")
            name = parts[0].strip().lower()
            if name in safe_inline and len(parts) > 1:
                return parts[-1]
            if name == "convert" and len(parts) >= 3:
                # {{convert|100|m|ft}} -> "100 m"
                return f"{parts[1]} {parts[2]}"
            if name.startswith("start date") or name.startswith("end date"):
                # {{start date|1979|1|1}} -> 1979
                nums = [p for p in parts[1:] if p.strip().isdigit()]
                return nums[0] if nums else ""
            if name in ("ubl", "unbulleted list", "plainlist", "ubl"):
                return "\n".join("* " + p.strip() for p in parts[1:] if p.strip())
            if name in ("flatlist",):
                return "\n".join("* " + p.strip() for p in parts[1:] if p.strip())
            if name in ("hlist",):
                return ", ".join(p.strip() for p in parts[1:] if p.strip())
            # Otherwise drop
            return ""
        text = re.sub(r"\{\{([^{}]*)\}\}", replace, text)
    return text


def clean_wiki_value(val):
    if val is None:
        return ""
    s = val
    s = COMMENT_RE.sub("", s)
    s = REF_TAG_RE.sub("", s)
    s = REF_SELFCLOSE_RE.sub("", s)
    s = CITE_TEMPLATE_RE.sub("", s)
    s = SFN_TEMPLATE_RE.sub("", s)
    s = strip_templates_keep_content(s)
    s = BR_RE.sub("\n", s)
    # Wikilinks
    s = WIKILINK_RE.sub(lambda m: m.group(2), s)
    s = WIKILINK_PLAIN_RE.sub(lambda m: m.group(1).split("|")[-1], s)
    s = EXTLINK_RE.sub(lambda m: m.group(1), s)
    s = EXTLINK_BARE_RE.sub("", s)
    s = BOLDITAL_RE.sub("", s)
    s = HTML_TAG_RE.sub("", s)
    return s.strip()


def split_list_value(cleaned):
    # Split by newlines / bullet markers / commas
    if not cleaned:
        return []
    # normalize bullet markers
    lines = re.split(r"\n+|(?:^|\s)[\*\#]\s*", cleaned)
    items = []
    for line in lines:
        line = line.strip(" \t\r\n-•*·,;")
        if not line:
            continue
        # If the whole line still looks like a single big run, keep as is.
        items.append(line)
    # deduplicate while preserving order
    seen = set()
    out = []
    for it in items:
        if it not in seen:
            seen.add(it)
            out.append(it)
    return out


def extract_infobox(wikitext):
    """Return a dict of field -> raw value (string) from first infobox."""
    if not wikitext:
        return {}
    # Find "{{Infobox" opening
    m = re.search(r"\{\{\s*[Ii]nfobox", wikitext)
    if not m:
        return {}
    start = m.start()
    # Walk braces to find matching close
    i = start
    depth = 0
    end = None
    while i < len(wikitext):
        if wikitext[i:i+2] == "{{":
            depth += 1
            i += 2
            continue
        if wikitext[i:i+2] == "}}":
            depth -= 1
            i += 2
            if depth == 0:
                end = i
                break
            continue
        i += 1
    if end is None:
        return {}
    infobox = wikitext[start:end]
    # Strip the leading {{Infobox name
    inner = infobox[2:-2]  # drop {{ }}
    # Split on top-level pipes
    parts = split_top_level_pipes(inner)
    if not parts:
        return {}
    # First part is the infobox name, skip it
    fields = {}
    for part in parts[1:]:
        if "=" not in part:
            continue
        key, _, val = part.partition("=")
        key = key.strip().lower().replace(" ", "_")
        fields[key] = val.strip()
    return fields


def split_top_level_pipes(text):
    parts = []
    depth_brace = 0
    depth_bracket = 0
    buf = []
    i = 0
    while i < len(text):
        c = text[i]
        nxt = text[i:i+2]
        if nxt == "{{":
            depth_brace += 1
            buf.append(nxt)
            i += 2
            continue
        if nxt == "}}":
            depth_brace -= 1
            buf.append(nxt)
            i += 2
            continue
        if nxt == "[[":
            depth_bracket += 1
            buf.append(nxt)
            i += 2
            continue
        if nxt == "]]":
            depth_bracket -= 1
            buf.append(nxt)
            i += 2
            continue
        if c == "|" and depth_brace == 0 and depth_bracket == 0:
            parts.append("".join(buf))
            buf = []
            i += 1
            continue
        buf.append(c)
        i += 1
    parts.append("".join(buf))
    return parts


def count_references(wikitext):
    if not wikitext:
        return 0
    # Count <ref> tags (both self-closing with name and full)
    count = 0
    count += len(re.findall(r"<ref[^>]*>", wikitext))
    # Also count sfn templates
    count += len(re.findall(r"\{\{\s*[Ss]fn[\s|}]", wikitext))
    return count


# ---------- Per-item enrichment ----------

LIST_FIELDS = {
    "tenants", "tenant",
    "occupants", "occupant",
    "current_tenants", "notable_tenants",
    "architect", "developer", "owner", "operator",
}


def enrich_item(qid, local_wiki):
    title, lang = get_wiki_title(qid, local_wiki)
    time.sleep(SLEEP_BETWEEN)
    if not title:
        return None

    wikitext = get_wiki_wikitext(title, lang)
    time.sleep(SLEEP_BETWEEN)
    if wikitext is None:
        return None

    ref_count = count_references(wikitext)
    if ref_count < 1:
        return None

    infobox = extract_infobox(wikitext)
    result = {
        "id": qid,
        "wiki_title": title,
        "wiki_url": f"https://{lang}.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_")),
        "wiki_lang": lang,
        "references_count": ref_count,
        "verified": True,
    }

    # Address candidates — collect in priority order, flatten to single string later
    ADDRESS_FIELDS_ORDER = [
        "address", "street_address", "addr",
        "주소", "住所",
        "location", "location_city", "location_town", "address_location",
        "소재지", "所在地",
    ]
    address_candidates: list[str] = []

    # Extract fields we care about
    for field in INFOBOX_FIELDS:
        if field not in infobox:
            continue
        raw = infobox[field]
        cleaned = clean_wiki_value(raw)
        if not cleaned:
            continue
        if field in ADDRESS_FIELDS_ORDER:
            # Collapse newlines → commas, strip junk, save candidate
            flat = re.sub(r"\s*\n+\s*", ", ", cleaned).strip(" ,;")
            flat = re.sub(r"\s{2,}", " ", flat)
            if flat and len(flat) <= 200:
                address_candidates.append((field, flat))
            continue
        if field in LIST_FIELDS or field in ("tenants", "occupants"):
            items = split_list_value(cleaned)
            if items:
                # Normalize key names
                out_key = field
                if field == "tenant":
                    out_key = "tenants"
                elif field == "occupant":
                    out_key = "occupants"
                result[out_key] = items
        else:
            # Scalar fields
            out_key = field
            if field in ("floor_count",):
                out_key = "floors"
            if field in ("completion_date", "completed", "start_date"):
                out_key = "built"
            if field in ("architectural_style", "architecture_style"):
                out_key = "style"
            # Take first line only for scalars
            first_line = cleaned.split("\n")[0].strip()
            if first_line:
                result[out_key] = first_line

    # Pick the best address candidate (first non-empty in priority order).
    if address_candidates:
        by_field = {f: v for f, v in address_candidates}
        for pref in ADDRESS_FIELDS_ORDER:
            if pref in by_field:
                result["address"] = by_field[pref]
                break

    return result


# ---------- Area processing ----------

def process_area(area):
    local_wiki = AREAS[area]
    in_path = os.path.join(DATA_DIR, f"{area}_wikidata.json")
    out_path = os.path.join(DATA_DIR, f"{area}_wiki_enriched.json")

    if not os.path.exists(in_path):
        print(f"[{area}] input not found: {in_path}")
        return 0, 0

    with open(in_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    items = data.get("items", [])
    print(f"[{area}] processing {len(items)} items...")

    enriched = []
    total = len(items)
    for idx, item in enumerate(items):
        qid = item.get("id")
        if not qid or not qid.startswith("Q"):
            continue
        try:
            result = enrich_item(qid, local_wiki)
        except Exception as e:
            print(f"[{area}] error on {qid}: {e}")
            result = None
        if result:
            enriched.append(result)

        if (idx + 1) % 10 == 0:
            print(f"[{area}] {idx+1}/{total} checked, {len(enriched)} enriched so far")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"items": enriched}, f, ensure_ascii=False, indent=2)

    print(f"[{area}] done: {len(enriched)} enriched out of {total}")
    return len(enriched), total


def main():
    args = sys.argv[1:]
    if args:
        target_areas = [a for a in args if a in AREAS]
        if not target_areas:
            print(f"No valid areas in args. Available: {', '.join(AREAS)}")
            return
    else:
        target_areas = list(AREAS.keys())

    stats = {}
    for area in target_areas:
        enriched, total = process_area(area)
        stats[area] = (enriched, total)

    print("\n=== Final stats ===")
    for area, (n, t) in stats.items():
        print(f"  {area}: {n} enriched / {t} total")


if __name__ == "__main__":
    main()
