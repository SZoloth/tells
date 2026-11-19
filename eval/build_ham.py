"""Build the human corpus: mail written before ChatGPT launched (2022-11-30).

    python3 eval/build_ham.py      writes eval/corpus/ham.jsonl (git-ignored, never published)

Two halves: Sam's own sent mail, and personal mail people sent him in threads he replied to.
Bulk and automated mail is skipped. Every hit a rule makes here is a false positive.

Published for reference: it reads Gmail through a private helper (pull.py, a wrapper around the
gog CLI) that isn't in this repo. Point TELLS_GMAIL_HELPER at your own copy to run it.
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.environ.get("TELLS_GMAIL_HELPER", ""))
import pull  # noqa: E402  (gog wrapper with rate-limit retries, header and body helpers)

OUT = Path(__file__).resolve().parent / "corpus" / "ham.jsonl"
BEFORE = "2022/11/30"
PER_HALF = 300


def main():
    OUT.parent.mkdir(exist_ok=True)
    rows, seen = [], set()
    sent = pull.search_all(f"in:sent before:{BEFORE} after:2016/01/01", 900)
    print(f"sent threads: {len(sent)}", file=sys.stderr)
    mine = theirs = 0
    for s in sent:
        if mine >= PER_HALF and theirs >= PER_HALF:
            break
        try:
            msgs = pull.gog("thread", "get", s["id"])["thread"]["messages"]
        except RuntimeError as e:
            print("skip", e, file=sys.stderr)
            continue
        for m in msgs:
            sender = pull.header(m, "from")
            if pull.bulk(m) or pull.work_mail(sender):
                continue
            text = pull.body(m).strip()
            if len(text.split()) < 25 or text in seen:
                continue
            seen.add(text)
            if pull.is_me(sender) and mine < PER_HALF:
                rows.append({"half": "sam", "text": text}); mine += 1
            elif not pull.is_me(sender) and theirs < PER_HALF and not pull.NOISE.search(sender):
                rows.append({"half": "people", "text": text}); theirs += 1
    OUT.write_text("".join(json.dumps(r) + "\n" for r in rows))
    print(f"ham: {mine} by Sam, {theirs} by people he wrote back to", file=sys.stderr)


if __name__ == "__main__":
    main()
