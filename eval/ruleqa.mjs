// Rule QA, after SpamAssassin's mass-check: run every rule over a human corpus and a
// machine corpus, measure how often each fires, and set its tier from the evidence.
//
//   node eval/ruleqa.mjs            rewrites rules/tells.json tiers and writes eval/report.json
//
// Human corpus: mail written before ChatGPT launched, so every hit there is a false positive.
// Machine corpus: plain requests to four model families. Both stay on this Mac.

import fs from "node:fs";
import { compile, scan, countWords } from "../src/tells.js";

const RULES = new URL("../rules/tells.json", import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l));
// Tiers are set on even-numbered messages and the result is reported on odd-numbered ones,
// so the report doesn't grade rules on the same text that tuned them.
const split = (rows, k) => rows.filter((_, i) => i % 2 === k);
const allHam = read("./corpus/ham.jsonl");
const allAi = read("./corpus/ai.jsonl");
const ham = split(allHam, 0);
const ai = split(allAi, 0);
const hamTest = split(allHam, 1);
const aiTest = split(allAi, 1);

// Word-level slop lists were curated by hand from real AI text; with no hits either way they stay on.
const CURATED = /^(opener|closer|kill-word|margin-|slop|chatbot|stock-phrase|significance|vague-attribution|conclusion-tag|transition|gap-fill)/;
const HAM_OFF = 0.08; // fires in more than 8% of human messages: off
const HAM_HINT = 0.01; // more than 1%: hint only
const MIN_RATIO = 0.75; // share of a rule's per-document rate that comes from machine text

const doc = JSON.parse(fs.readFileSync(RULES, "utf8"));
for (const r of doc.rules) r.tier = "flag";
const engine = compile(doc);

function docRates(corpus) {
  const hits = new Map();
  let words = 0;
  for (const { text } of corpus) {
    words += countWords(text);
    const seen = new Set(scan(engine, text, { tiers: ["flag"], limit: 5000, overlap: true }).matches.map((m) => m.id));
    for (const id of seen) hits.set(id, (hits.get(id) || 0) + 1);
  }
  return { hits, words };
}

const H = docRates(ham);
const A = docRates(ai);
const counts = { flag: 0, hint: 0, off: 0 };
for (const r of doc.rules) {
  const h = (H.hits.get(r.id) || 0) / ham.length;
  const a = (A.hits.get(r.id) || 0) / ai.length;
  const ratio = a + h > 0 ? a / (a + h) : null;
  let tier;
  if (h > HAM_OFF) tier = "off";
  else if (h > HAM_HINT) tier = "hint";
  else if (ratio === null) tier = CURATED.test(r.category) ? "flag" : "hint";
  else tier = ratio >= MIN_RATIO ? "flag" : "hint";
  r.tier = tier;
  r.qa = { human_docs: +(h * 100).toFixed(1), machine_docs: +(a * 100).toFixed(1) };
  counts[tier]++;
}
doc.qa = {
  method: "Per-rule document hit rates on two corpora; see eval/ruleqa.mjs",
  tuned_on: { human_messages: ham.length, machine_messages: ai.length },
  reported_on: { human_messages: hamTest.length, machine_messages: aiTest.length },
  thresholds: { off_above_human_pct: HAM_OFF * 100, hint_above_human_pct: HAM_HINT * 100, min_machine_share: MIN_RATIO },
  tiers: counts,
};
fs.writeFileSync(RULES, JSON.stringify(doc, null, 1) + "\n");

// Document-level result with the tiers just set.
const tuned = compile(doc);
function docScore(corpus) {
  return corpus.map(({ text }) => scan(tuned, text).matches.length);
}
const hs = docScore(hamTest);
const as = docScore(aiTest);
const at = (k) => ({
  machine_caught: +(as.filter((n) => n >= k).length / as.length * 100).toFixed(1),
  human_flagged: +(hs.filter((n) => n >= k).length / hs.length * 100).toFixed(1),
});
const MODEL_NAMES = { "openai:gpt-6-luna@low": "GPT-6 Luna", "anthropic:claude-sonnet-5-5@low": "Claude Sonnet 5.5",
  "claude2:opus@low": "Claude Opus 5.5", "openrouter:z-ai/glm-5.3": "GLM 5.3" };
const byModel = {};
for (const [i, row] of aiTest.entries()) {
  const name = MODEL_NAMES[row.model] || row.model;
  byModel[name] ??= { n: 0, caught: 0 };
  byModel[name].n++;
  if (as[i] >= 1) byModel[name].caught++;
}
const halves = {};
for (const [i, row] of hamTest.entries()) {
  halves[row.half] ??= { n: 0, flagged: 0 };
  halves[row.half].n++;
  if (hs[i] >= 1) halves[row.half].flagged++;
}
const worst = doc.rules.filter((r) => r.tier === "off").sort((a, b) => b.qa.human_docs - a.qa.human_docs).slice(0, 15)
  .map((r) => `${r.id} (${r.note.slice(0, 50)}) fires on ${r.qa.human_docs}% of human messages`);
const report = { tuned_on: doc.qa.tuned_on, reported_on: doc.qa.reported_on, tiers: counts, at_least_1: at(1), at_least_2: at(2), at_least_3: at(3), by_model: byModel, human_halves: halves, turned_off: worst };
fs.writeFileSync(new URL("./report.json", import.meta.url), JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify(report, null, 1));
