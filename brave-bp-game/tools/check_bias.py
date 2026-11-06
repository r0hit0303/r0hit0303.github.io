#!/usr/bin/env python3
"""Report questions whose correct choice stands out by length.

Usage: python3 tools/check_bias.py [doc ...]   (default: all docs)
"""
import json
import statistics
import sys
from pathlib import Path

QDIR = Path(__file__).resolve().parent.parent / "data" / "questions"


def flagged(q):
    lens = [len(c) for c in q["choices"]]
    correct = lens[q["answer"]]
    others = [l for i, l in enumerate(lens) if i != q["answer"]]
    is_longest = correct > max(others)
    return is_longest and correct > 1.15 * statistics.median(others)


def main():
    docs = sys.argv[1:] or sorted(p.stem for p in QDIR.glob("*.json"))
    total = longest = 0
    for doc in docs:
        qs = json.loads((QDIR / f"{doc}.json").read_text())
        flags = [i for i, q in enumerate(qs) if flagged(q)]
        n_longest = sum(1 for q in qs if len(q["choices"][q["answer"]]) ==
                        max(len(c) for c in q["choices"]))
        total += len(qs)
        longest += n_longest
        print(f"{doc}: {len(qs)} questions, correct is longest in {n_longest} "
              f"({100 * n_longest // max(1, len(qs))}%), flagged {len(flags)}: {flags}")
    print(f"TOTAL: correct is longest in {longest}/{total} "
          f"({100 * longest // max(1, total)}%)")


if __name__ == "__main__":
    main()
