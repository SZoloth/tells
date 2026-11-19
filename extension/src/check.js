// The extension's own checker page. Text from "Check with Tells" in the right-click menu arrives
// through session storage, which stays on this device.
import { compile, scan } from "./tells.js";

const input = document.querySelector("#t-in");
const hints = document.querySelector("[data-hints]");
const sum = document.querySelector("[data-sum]");
const notes = document.querySelector("[data-notes]");
const engine = compile(await (await fetch(chrome.runtime.getURL("tells.json"))).json());
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function render() {
  const text = input.value;
  if (!text.trim()) { sum.textContent = ""; notes.innerHTML = ""; return; }
  const { matches, words } = scan(engine, text, { tiers: hints.checked ? ["flag", "hint"] : ["flag"] });
  sum.textContent = matches.length
    ? `${matches.length} ${matches.length === 1 ? "tell" : "tells"} in ${words} words.`
    : `No tells found in ${words} words. That doesn’t prove a person wrote it.`;
  notes.innerHTML = matches.map((m, i) => `<li><span class="n">${i + 1}</span><span class="q">“${esc(m.text)}”</span>
    <span class="why">${esc(cap(m.note))}</span>${m.fix ? `<span class="fix"><b>Try</b>${esc(cap(m.fix))}</span>` : ""}</li>`).join("");
}

const { pending } = await chrome.storage.session.get("pending");
if (pending) {
  input.value = pending;
  await chrome.storage.session.remove("pending");
}
hints.checked = (await chrome.storage.sync.get({ hints: false })).hints;
let timer = 0;
input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(render, 120); });
hints.addEventListener("change", render);
render();
input.focus();
