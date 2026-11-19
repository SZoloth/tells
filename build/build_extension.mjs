// Build the Chrome extension into extension/dist and zip it for a release or the Chrome Web Store.
//   node build/build_extension.mjs
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;
const src = path.join(root, "extension/src");
const dist = path.join(root, "extension/dist");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, "icons"), { recursive: true });

for (const f of fs.readdirSync(src)) if (f !== "content.js") fs.copyFileSync(path.join(src, f), path.join(dist, f));
for (const s of [16, 32, 48, 128]) fs.copyFileSync(path.join(root, `extension/icons/${s}.png`), path.join(dist, `icons/${s}.png`));
const engine = fs.readFileSync(path.join(root, "src/tells.js"), "utf8");
const rules = fs.readFileSync(path.join(root, "rules/tells.json"), "utf8");
fs.copyFileSync(path.join(root, "src/tells.js"), path.join(dist, "tells.js")); // the checker page imports it as a module
fs.copyFileSync(path.join(root, "rules/tells.json"), path.join(dist, "tells.json"));

// Content scripts can't be modules, so the scanner goes in as plain functions with the rules inlined.
const plain = engine.replace(/^export /gm, "");
fs.writeFileSync(path.join(dist, "content.js"),
  `// Built by build/build_extension.mjs from src/tells.js, rules/tells.json and extension/src/content.js.\n` +
  `${plain}\nconst TELLS_RULES = ${rules.trim()};\n\n${fs.readFileSync(path.join(src, "content.js"), "utf8")}`);

const manifest = JSON.parse(fs.readFileSync(path.join(dist, "manifest.json"), "utf8"));
manifest.version = pkg.version;
fs.writeFileSync(path.join(dist, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

const zip = path.join(root, `extension/tells-extension-${pkg.version}.zip`);
fs.rmSync(zip, { force: true });
execFileSync("zip", ["-qr", zip, "."], { cwd: dist });
console.log(`built extension/dist and ${path.relative(root, zip)}`);
