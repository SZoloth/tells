// Sam's corrections as labels: each Margin rule with a sentence-length before and after.
// A useful scanner flags the "before" more often than the "after".
//
//   node eval/margin_pairs.mjs      reads ~/.margin/margin.db; prints counts only, never the text
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { compile, scan } from "../src/tells.js";

const db = `${os.homedir()}/.margin/margin.db`;
const sql = `select json_group_array(json_object('c', category, 'b', example_before, 'a', example_after)) from writing_rules
  where archived_at is null and length(example_before) >= 25 and length(example_after) >= 25`;
const pairs = JSON.parse(execFileSync("sqlite3", [db, sql], { encoding: "utf8" }));
const engine = compile(JSON.parse(fs.readFileSync(new URL("../rules/tells.json", import.meta.url), "utf8")));
const flagged = (t) => scan(engine, t).matches.length > 0;
const slopCats = new Set(["ai-slop", "kill-words"]);
const tally = (rows) => ({
  pairs: rows.length,
  before_flagged: rows.filter((p) => flagged(p.b)).length,
  after_flagged: rows.filter((p) => flagged(p.a)).length,
  fixed: rows.filter((p) => flagged(p.b) && !flagged(p.a)).length,
});
const report = { ai_slop_and_kill_words: tally(pairs.filter((p) => slopCats.has(p.c))), all_other_rules: tally(pairs.filter((p) => !slopCats.has(p.c))) };
fs.writeFileSync(new URL("./margin-pairs.json", import.meta.url), JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify(report, null, 1));
