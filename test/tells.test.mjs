import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { compile, scan, maskQuoted } from "../src/tells.js";

const doc = JSON.parse(fs.readFileSync(new URL("../rules/tells.json", import.meta.url), "utf8"));
const engine = compile(doc);

test("every rule compiles in JavaScript", () => {
  assert.deepEqual(engine.skipped, []);
  assert.equal(engine.compiled.length, doc.rules.length);
});

test("every rule has an id, a tier and QA numbers", () => {
  const ids = new Set();
  for (const r of doc.rules) {
    assert.ok(!ids.has(r.id), `duplicate id ${r.id}`);
    ids.add(r.id);
    assert.ok(["flag", "hint", "off"].includes(r.tier), r.id);
    assert.ok(r.qa && typeof r.qa.human_docs === "number", r.id);
  }
});

test("typography rules stay out: phones insert curly quotes", () => {
  assert.ok(!doc.rules.some((r) => /typography|curly/.test(r.category)));
});

test("no trigger lifted from the maintainer's drafts (list kept in git-ignored build/personal.local.txt)", (t) => {
  const file = new URL("../build/personal.local.txt", import.meta.url);
  if (!fs.existsSync(file)) return t.skip("no local list");
  const terms = fs.readFileSync(file, "utf8").split("\n").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const plain = (p) => p.toLowerCase().replace(/\\b/g, "").replace(/\\s\+/g, " ").replace(/\\/g, "");
  for (const r of doc.rules) for (const term of terms) assert.ok(!plain(r.pattern).includes(term), r.id);
});

test("a stock AI opener is flagged with a fix", () => {
  const r = scan(engine, "Hi Dana, I wanted to reach out because we delve into the rich tapestry of logistics.");
  const ids = r.matches.map((m) => m.text.toLowerCase());
  assert.ok(ids.includes("i wanted to reach out"));
  assert.ok(r.matches.some((m) => m.fix));
});

test("a plain human note passes", () => {
  const r = scan(engine, "Hey, running ten minutes late. Grab a table by the window and order me the soup.");
  assert.equal(r.matches.length, 0);
});

test("overlapping matches collapse to one mark unless overlap is asked for", () => {
  const text = "It is not a tool, it's a movement.";
  const one = scan(engine, text, { tiers: ["flag", "hint"] }).matches;
  const all = scan(engine, text, { tiers: ["flag", "hint"], overlap: true }).matches;
  for (let i = 1; i < one.length; i++) assert.ok(one[i].start >= one[i - 1].end);
  assert.ok(all.length >= one.length);
});

test("quoted text is masked without moving offsets", () => {
  const text = "Plain line.\n> I wanted to reach out\n`delve`";
  const masked = maskQuoted(text);
  assert.equal(masked.length, text.length);
  assert.equal(scan(engine, text).matches.length, 0);
});

test("hint rules only appear when asked for", () => {
  const hint = doc.rules.find((r) => r.tier === "hint" && /^\\b\w+\\b$/.test(r.pattern));
  if (!hint) return;
  const word = hint.pattern.replace(/\\b/g, "");
  assert.ok(!scan(engine, `We ${word} today.`).matches.some((m) => m.id === hint.id));
});

test("one noisy rule can't crowd out earlier matches from other rules", () => {
  const text = "a rich tapestry. ".repeat(3) + "the ecosystem. ".repeat(2100);
  const r = scan(engine, text, { limit: 5000 });
  assert.equal(r.matches.filter((m) => /tapestry/i.test(m.text)).length, 3);
});

test("when two rules mark the same words, the one with a fix wins", () => {
  const m = scan(engine, "Let's delve into it.").matches.find((x) => /delve/i.test(x.text));
  assert.ok(m && m.fix, "delve should come with a fix");
});

test("fixes read as plain advice, not bracketed placeholders", () => {
  assert.ok(!doc.rules.some((r) => r.fix && /^\[.*\]$/.test(r.fix)));
});

test("no rule quotes a maintainer's correction example (checked when ~/.margin/margin.db is present)", async (t) => {
  const { execFileSync } = await import("node:child_process");
  const os = await import("node:os");
  const db = `${os.homedir()}/.margin/margin.db`;
  if (!fs.existsSync(db)) return t.skip("no Margin database");
  const rows = JSON.parse(execFileSync("sqlite3", [db,
    "select json_group_array(x) from (select example_before x from writing_rules union all select example_after from writing_rules) where length(x) >= 25"],
  { encoding: "utf8" }));
  const grams = (s) => {
    const w = s.toLowerCase().match(/[a-z']+/g) || [];
    return w.slice(0, Math.max(0, w.length - 5)).map((_, i) => w.slice(i, i + 6).join(" "));
  };
  const examples = new Set(rows.flatMap(grams));
  for (const r of doc.rules) {
    for (const g of grams(`${r.pattern} ${r.note} ${r.fix || ""}`)) assert.ok(!examples.has(g), `${r.id} quotes "${g}"`);
  }
});

test("the extension builds, its content script parses, and no extension file calls the network", async () => {
  const { execFileSync } = await import("node:child_process");
  const root = new URL("..", import.meta.url).pathname;
  execFileSync("node", ["build/build_extension.mjs"], { cwd: root });
  execFileSync("node", ["--check", "extension/dist/content.js"], { cwd: root });
  const manifest = JSON.parse(fs.readFileSync(new URL("../extension/dist/manifest.json", import.meta.url), "utf8"));
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.version, pkg.version);
  for (const f of fs.readdirSync(new URL("../extension/dist", import.meta.url)).filter((f) => f.endsWith(".js"))) {
    const code = fs.readFileSync(new URL(`../extension/dist/${f}`, import.meta.url), "utf8");
    for (const call of code.match(/fetch\([^)]*\)|XMLHttpRequest|sendBeacon|WebSocket/g) || []) {
      assert.match(call, /chrome\.runtime\.getURL/, `${f} makes a network call: ${call}`);
    }
  }
});
