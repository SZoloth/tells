#!/usr/bin/env node
// tells FILE|-  [--hints] [--json]
// Prints each tell with its line, the matched words, what the rule says and a fix when it has one.
import fs from "node:fs";
import { compile, scan } from "../src/tells.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: tells FILE|- [--hints] [--json]");
  process.exit(2);
}
const text = fs.readFileSync(file === "-" ? 0 : file, "utf8");
const rules = JSON.parse(fs.readFileSync(new URL("../rules/tells.json", import.meta.url), "utf8"));
const result = scan(compile(rules), text, { tiers: args.includes("--hints") ? ["flag", "hint"] : ["flag"] });
if (args.includes("--json")) {
  console.log(JSON.stringify(result, null, 1));
} else {
  for (const m of result.matches) {
    const line = text.slice(0, m.start).split("\n").length;
    console.log(`${line}: "${m.text}" ${m.note}${m.fix ? ` → ${m.fix}` : ""} [${m.id}]`);
  }
  console.log(`${result.matches.length} tells in ${result.words} words`);
}
