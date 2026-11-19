"""Merge Sam's three tell sources into rules/tells.json.

    python3 build/build_rules.py

Sources:
  1. declauding's linter (MIT, Oskar Austegard; github.com/oaustegard/claude-skills)
  2. ~/.claude/scripts/ai-slop-check.py (Sam's kill words, bans and AI tells)
  3. Margin's writing rules (~/.margin/margin.db): general AI-slop and kill-word rules
     whose trigger is a short phrase. Long examples come from Sam's drafts and stay out.

Typography rules (curly quotes, dashes as characters) are left out on purpose: phones
and Macs insert them, so they fire on people.
"""
import importlib.util
import json
import re
import sqlite3
from pathlib import Path

HOME = Path.home()
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "rules" / "tells.json"


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:40]


def word_rx(phrase):
    return r"\b" + re.escape(phrase).replace(r"\ ", r"\s+") + r"\b"


rules, seen = [], set()


def add(source, category, pattern, note, fix=None, flags="gi"):
    inline = re.match(r"^\(\?([imsx]+)\)", pattern)  # JavaScript has no inline flags
    if inline:
        pattern = pattern[inline.end():]
        flags = "".join(sorted(set(flags + inline.group(1).replace("x", ""))))
    key = pattern.lower()
    if key in seen:
        return
    seen.add(key)
    try:
        re.compile(pattern)
    except re.error:
        return
    if fix:  # the kill list writes some fixes as "[delete]"; show them as plain advice
        fix = fix.strip()
        if fix.startswith("[") and fix.endswith("]"):
            fix = fix[1:-1]
    n = sum(1 for r in rules if r["category"] == category) + 1
    rules.append({"id": f"{category}-{n:03d}", "category": category, "pattern": pattern, "flags": flags,
                  "note": note, "fix": fix, "source": source})


# 1. declauding
lint = load(HOME / ".agents/skills/declauding/scripts/declaude_lint.py", "declaude_lint")
for category, pattern, note in lint.RULES:
    flags = "gim"
    add("declauding", category, pattern, note, flags=flags)

# 2. ai-slop-check
slop = load(HOME / ".claude/scripts/ai-slop-check.py", "ai_slop_check")
for word, fix in slop.KILL_WORDS.items():
    add("ai-slop-check", "kill-word", word_rx(word), "reads machine-made", fix)
for phrase, fix in slop.SAM_SPECIFIC_BANS.items():
    add("ai-slop-check", "stock-phrase", word_rx(phrase), "stock phrase", fix)
for phrase in slop.TRANSITION_PADDING:
    add("ai-slop-check", "transition", word_rx(phrase), "padding transition", "cut it, or use a plain connective")
for phrase in slop.CHATBOT_ARTIFACTS:
    add("ai-slop-check", "chatbot", re.escape(phrase).replace(r"\ ", r"\s+"), "chatbot residue", "delete it")
for phrase in slop.SIGNIFICANCE_INFLATION:
    add("ai-slop-check", "significance", word_rx(phrase), "significance inflation", "show the evidence instead of labeling it")
for phrase in slop.VAGUE_ATTRIBUTION:
    add("ai-slop-check", "vague-attribution", word_rx(phrase), "vague attribution", "name the source")
for phrase in slop.CONCLUSION_TAGS:
    add("ai-slop-check", "conclusion-tag", word_rx(phrase), "conclusion tag", "cut it; end on the point")
for word in slop.FILLER_INTENSIFIERS:
    add("ai-slop-check", "filler-intensifier", word_rx(word), "filler intensifier", "cut it")

# 3. Margin: short trigger phrases only
# Triggers lifted from the maintainer's own drafts, not general tells. The list is git-ignored.
_personal = ROOT / "build" / "personal.local.txt"
_terms = [t.strip() for t in _personal.read_text().splitlines() if t.strip()] if _personal.exists() else []
PERSONAL = re.compile("|".join(map(re.escape, _terms)), re.I) if _terms else re.compile(r"(?!)")
NAMEISH = re.compile(r"\b[A-Z][a-z]+\s+[A-Z][a-z]+\b")
db = sqlite3.connect(HOME / ".margin/margin.db")
rows = db.execute("""select category, rule_text, example_before, detection_pattern from writing_rules
                     where writing_type='general' and archived_at is null and category in ('ai-slop','kill-words')""").fetchall()
kept_margin = 0
for category, rule_text, before, detection in rows:
    trigger = detection or before
    if not trigger or len(trigger) > 40 or "\n" in trigger or NAMEISH.search(trigger) or PERSONAL.search(trigger):
        continue
    pattern = detection if detection else (word_rx(trigger) if re.fullmatch(r"[\w' -]+", trigger) else trigger)
    note = rule_text if len(rule_text) <= 110 else rule_text[:107] + "..."
    before_n = len(rules)
    add("margin", "margin-" + ("kill-word" if category == "kill-words" else "ai-slop"), pattern, note)
    kept_margin += len(rules) > before_n

# 4. Tells' own rules: classic openers and shapes the three sources miss, plus word forms
# ("empowers", "resonates") that the sources list only in one form.
OWN = [
    ("opener", r"\bI\s+hope\s+(?:this|my)\s+(?:email|message|note)\s+finds\s+you\s+well\b", "stock email opener", "start with why you're writing"),
    ("opener", r"\bI\s+hope\s+you(?:'re|\s+are)\s+(?:doing\s+)?well\b", "stock email opener", "start with why you're writing"),
    ("opener", r"\bI\s+came\s+across\s+your\s+(?:profile|work|company|post)\b", "stock cold opener", "say what you saw and what it made you think"),
    ("opener", r"\b(?:truly|really|deeply)\s+resonate[sd]?\b", "claimed resonance with nothing behind it", "name the specific thing and why it matters to you"),
    ("negation-first", r"\b(?:is|are|was|isn't|aren't|wasn't)\s+(?:not\s+)?just\s+(?:a|an|another|the)\s+[^,.;]{2,40}[,;—–-]\s*(?:it|they|this|we)(?:'s|'re|\s+is|\s+are)\b", "'not just X, it's Y' pivot", "say what it is"),
    ("slop", r"\bempower(?:s|ed|ing|ment)?\b", "marketing verb", "say what people can now do"),
    ("slop", r"\b(?:unlock|unleash|realize)\s+(?:the\s+|your\s+|their\s+)?(?:full\s+)?potential\b", "potential-unlocking cliché", "say what changes, with a number if you have one"),
    ("slop", r"\bin\s+today'?s\s+(?:fast[- ]paced|ever[- ]changing|rapidly\s+evolving|digital|competitive)\s+(?:world|landscape|environment|market|age|era)\b", "era-setting opener", "cut it; start with the point"),
    ("slop", r"\bgame[- ]chang(?:er|ing)\b", "hype phrase", "say what changes"),
    ("slop", r"\b(?:seamless(?:ly)?|frictionless)\s+(?:experience|integration|workflow)s?\b", "smoothness claim", "say what step goes away"),
    ("closer", r"\b(?:looking\s+forward\s+to\s+(?:hearing\s+from\s+you|connecting)|excited\s+to\s+(?:connect|explore))\b", "stock closer", "end with the one question you want answered"),
    ("closer", r"\bwould\s+(?:you\s+)?(?:love|be\s+happy)\s+to\s+(?:connect|chat|explore)\b", "stock closer", "propose a specific time or a specific question"),
]
for category, pattern, note, fix in OWN:
    add("tells", category, pattern, note, fix)

doc = {
    "name": "tells",
    "version": "0.2.0",
    "about": "Phrases and sentence shapes that make prose read machine-made. Each rule is a candidate for a reader to judge, not proof of who wrote the text.",
    "credits": [
        "declauding linter by Oskar Austegard (MIT): https://github.com/oaustegard/claude-skills",
        "Sam Zoloth's kill-word list and Margin writing rules: https://szoloth.com",
    ],
    "rules": rules,
}
OUT.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
by = {}
for r in rules:
    by[r["source"]] = by.get(r["source"], 0) + 1
print(f"{len(rules)} rules: {by} (margin kept {kept_margin} of {len(rows)})")
