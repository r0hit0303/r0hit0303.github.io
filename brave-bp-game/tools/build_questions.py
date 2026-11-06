#!/usr/bin/env python3
"""Validate data/questions/*.json and bundle them into data/questions.js."""
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"


def main():
    rules = {r["id"]: r for r in json.loads((DATA / "rules.json").read_text())}
    questions, errors = [], []
    for path in sorted((DATA / "questions").glob("*.json")):
        try:
            items = json.loads(path.read_text())
        except json.JSONDecodeError as e:
            errors.append(f"{path.name}: invalid JSON: {e}")
            continue
        for i, q in enumerate(items):
            where = f"{path.name}[{i}]"
            if q.get("rule") not in rules:
                errors.append(f"{where}: unknown rule {q.get('rule')}")
            choices = q.get("choices", [])
            if not (3 <= len(choices) <= 4) or len(set(choices)) != len(choices):
                errors.append(f"{where}: need 3-4 distinct choices")
            if not isinstance(q.get("answer"), int) or not 0 <= q["answer"] < len(choices):
                errors.append(f"{where}: bad answer index")
            if not q.get("prompt") or not q.get("explain"):
                errors.append(f"{where}: missing prompt/explain")
            questions.append(q)
    covered = {q.get("rule") for q in questions}
    missing = sorted(set(rules) - covered)
    print(f"{len(questions)} questions, {len(covered & set(rules))}/{len(rules)} rules covered")
    if missing:
        print("missing:", " ".join(missing))
    for e in errors:
        print("ERROR", e)
    (DATA / "questions.js").write_text(
        "window.BP_QUESTIONS = " + json.dumps(questions, ensure_ascii=False) + ";\n")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
