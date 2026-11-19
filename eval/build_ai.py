"""Build the machine corpus: plain requests to four model families, no style instructions.

    python3 eval/build_ai.py      writes eval/corpus/ai.jsonl (git-ignored)

Uses the maintainer's `ask` command, which sends one prompt to a named model route.
"""
import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

OUT = Path(__file__).resolve().parent / "corpus" / "ai.jsonl"
MODELS = ["openai:gpt-6-luna@low", "anthropic:claude-sonnet-5-5@low", "claude2:opus@low", "openrouter:z-ai/glm-5.3"]
TASKS = [
    "Write a short cold email from a seed-stage founder to a venture investor they have never met, asking for a 20-minute call about their B2B logistics startup.",
    "Write a LinkedIn connection note from a product manager to a hiring manager at a fintech company about an open Senior PM role.",
    "Write a cold sales email offering an AI-powered meeting-notes tool to a head of operations.",
    "Write three paragraphs for a blog post about why small teams should write design docs.",
    "Write a pull request description for a change that adds retry logic with exponential backoff to an HTTP client.",
    "Write a short cover letter paragraph explaining why you want to join a climate-tech startup as a product designer.",
    "Write a product update announcement for a note-taking app that just added offline sync.",
    "Write a friendly follow-up email to someone you met at a conference last week, suggesting coffee.",
]


def ask(args):
    model, task, n = args
    env = dict(os.environ, ASK_CALLER="tells-eval")
    out = subprocess.run(["ask", "fast", "--via", model, task + f" (Variant {n}.) Reply with the text only."],
                         capture_output=True, text=True, timeout=300, env=env)
    return {"model": model, "task": task, "n": n, "text": out.stdout.strip()} if out.returncode == 0 and len(out.stdout.split()) > 30 else None


def main():
    OUT.parent.mkdir(exist_ok=True)
    old = [json.loads(l) for l in OUT.read_text().splitlines()] if OUT.exists() else []
    have = {(r["model"], r["task"], r.get("n")) for r in old}
    jobs = [(m, t, n) for m in MODELS for t in TASKS for n in (1, 2, 3) if (m, t, n) not in have]
    with ThreadPoolExecutor(6) as pool:
        rows = old + [r for r in pool.map(ask, jobs) if r]
    OUT.write_text("".join(json.dumps(r) + "\n" for r in rows))
    by = {}
    for r in rows:
        by[r["model"]] = by.get(r["model"], 0) + 1
    print(f"ai samples: {len(rows)} of {len(jobs)} {by}")


if __name__ == "__main__":
    main()
