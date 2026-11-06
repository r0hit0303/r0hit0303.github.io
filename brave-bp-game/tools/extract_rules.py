#!/usr/bin/env python3
"""Extract rules from brave-core/docs/best-practices into data/rules.js.

Usage: python3 tools/extract_rules.py /path/to/brave-core/docs/best-practices
"""
import json
import re
import sys
from pathlib import Path

REPO_URL = "https://github.com/brave/brave-core/blob/master/docs/best-practices"
ANCHOR_RE = re.compile(r'<a id="([A-Z]+-\d+)"></a>')
HEADING_RE = re.compile(r"^(#{1,4})\s+(.*)$")
FENCE_RE = re.compile(r"^\s*```")
MAX_BODY = 2500


def classify(title):
    if "❌" in title:
        return "dont"
    if "✅" in title:
        return "do"
    return "info"


def clean_title(title):
    title = title.replace("❌", "").replace("✅", "").strip()
    return re.sub(r"^[-:\s]+", "", title)


def first_paragraph(lines):
    para, in_fence = [], False
    for line in lines:
        if FENCE_RE.match(line):
            if para:
                break
            in_fence = not in_fence
            continue
        if in_fence or ANCHOR_RE.search(line) or line.strip() in ("---",):
            continue
        if line.strip().startswith(">") and not para:
            continue
        if not line.strip():
            if para:
                break
            continue
        para.append(line.strip())
    text = " ".join(para)
    m = re.match(r"^\*\*(.+?)\*\*", text)
    return (m.group(1) if m else text).strip()


def extract_examples(lines):
    """Return (wrong, right) code snippets from fenced blocks."""
    wrong, right = [], []
    in_fence, block = False, []
    for line in lines:
        if FENCE_RE.match(line):
            if in_fence:
                split_block(block, wrong, right)
                block = []
            in_fence = not in_fence
            continue
        if in_fence:
            block.append(line)
    return wrong, right


def split_block(block, wrong, right):
    current, buf = None, []

    def flush():
        code = "\n".join(buf).strip("\n")
        if current and code.strip():
            (wrong if current == "wrong" else right).append(code)

    for line in block:
        stripped = line.strip()
        is_marker = re.match(r"^(//|#|<!--|/\*)\s*(❌|✅)", stripped) or \
            re.match(r"^(❌|✅)", stripped)
        if is_marker:
            flush()
            current = "wrong" if "❌" in stripped[:8] else "right"
            buf = [line]
            continue
        buf.append(line)
    flush()


def normalize_fences(lines):
    """Rewrite fences to balanced ``` pairs.

    A fence closes only on a marker at least as long as its opener (CommonMark),
    and a rule anchor inside an open fence force-closes it, since some docs
    forget to close a fence before the next rule.
    """
    out, open_len = [], 0
    for line in lines:
        m = re.match(r"^\s*(`{3,})(.*)$", line)
        if open_len:
            if ANCHOR_RE.search(line):
                out += ["```", line]
                open_len = 0
            elif m and len(m.group(1)) >= open_len and not m.group(2).strip():
                out.append("```")
                open_len = 0
            else:
                out.append("\u200b" + line if m else line)
        elif m:
            open_len = len(m.group(1))
            out.append(line.replace(m.group(1), "```", 1))
        else:
            out.append(line)
    if open_len:
        out.append("```")
    return out


def doc_title(lines, fallback):
    for line in lines:
        m = HEADING_RE.match(line)
        if m and len(m.group(1)) == 1:
            return m.group(2).strip()
    return fallback


def parse_doc(path):
    lines = normalize_fences(path.read_text(encoding="utf-8").splitlines())
    title = doc_title(lines, path.stem)
    doc = path.stem
    has_ids = any(ANCHOR_RE.search(l) for l in lines)
    prefix = "LOC" if doc == "localization" else doc.upper()[:4]

    sections, pending_ids, in_fence, counter = [], [], False, 0
    for i, line in enumerate(lines):
        if FENCE_RE.match(line):
            in_fence = not in_fence
            continue
        if in_fence:
            continue
        pending_ids += ANCHOR_RE.findall(line)
        m = HEADING_RE.match(line)
        if not m or len(m.group(1)) < 2:
            continue
        if has_ids and not pending_ids:
            continue
        if not has_ids:
            counter += 1
            pending_ids = [f"{prefix}-{counter:03d}"]
        sections.append({"ids": pending_ids, "level": len(m.group(1)),
                         "raw_title": m.group(2).strip(), "start": i})
        pending_ids = []

    rules, parents = [], {}
    for idx, sec in enumerate(sections):
        end = sections[idx + 1]["start"] if idx + 1 < len(sections) else len(lines)
        body_lines = lines[sec["start"] + 1:end]
        while body_lines and (ANCHOR_RE.search(body_lines[-1]) or
                              body_lines[-1].strip() in ("", "---")):
            body_lines.pop()
        body = "\n".join(body_lines).strip()
        level = sec["level"]
        parents = {lvl: t for lvl, t in parents.items() if lvl < level}
        group = parents[max(parents)] if parents else None
        has_children = idx + 1 < len(sections) and sections[idx + 1]["level"] > level
        if has_children and classify(sec["raw_title"]) == "info":
            parents[level] = clean_title(sec["raw_title"])
        if not body:
            continue
        wrong, right = extract_examples(body_lines)
        anchor = sec["ids"][0] if has_ids else ""
        rules.append({
            "id": sec["ids"][0],
            "ids": sec["ids"],
            "doc": doc,
            "docTitle": title,
            "group": group,
            "kind": classify(sec["raw_title"]),
            "title": clean_title(sec["raw_title"]),
            "summary": first_paragraph(body_lines),
            "body": body if len(body) <= MAX_BODY else body[:MAX_BODY] + "\n…",
            "wrong": wrong,
            "right": right,
            "url": f"{REPO_URL}/{doc}.md" + (f"#{anchor}" if anchor else ""),
        })
    return rules


def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/bc/docs/best-practices")
    out = Path(__file__).resolve().parent.parent / "data"
    out.mkdir(exist_ok=True)
    rules = []
    for path in sorted(src.glob("*.md")):
        rules += parse_doc(path)
    (out / "rules.json").write_text(json.dumps(rules, indent=1, ensure_ascii=False))
    (out / "rules.js").write_text(
        "window.BP_RULES = " + json.dumps(rules, ensure_ascii=False) + ";\n")
    docs = sorted({r["doc"] for r in rules})
    print(f"{len(rules)} rules from {len(docs)} docs; "
          f"{sum(1 for r in rules if r['wrong'] and r['right'])} with code pairs")


if __name__ == "__main__":
    main()
