// The extension's checker page: the same galley as szoloth.com/tells. Text from "Check with Tells" in the
// right-click menu arrives through session storage, which stays on this device.
import { compile } from "./tells.js";
import { mountGalley } from "./galley.js";

const sum = document.querySelector("[data-sum]");
const hints = document.querySelector("[data-hints]");
const engine = compile(await (await fetch(chrome.runtime.getURL("tells.json"))).json());
const { pending } = await chrome.storage.session.get("pending");
if (pending) await chrome.storage.session.remove("pending");
hints.checked = (await chrome.storage.sync.get({ hints: false })).hints;

const galley = mountGalley(document.querySelector("[data-galley]"), { engine, text: pending || "", label: "Your draft" });
const nf = new Intl.NumberFormat();
const live = document.querySelector("[data-live]");
let said = -1;
let idle = 0;
const report = ({ matches, words }) => {
  sum.textContent = !words ? "Paste a draft, an email or a message."
    : matches.length ? `${nf.format(matches.length)} ${matches.length === 1 ? "tell" : "tells"} in ${nf.format(words)} words`
    : `No tells in ${nf.format(words)} words. That doesn’t prove a person wrote it.`;
  // Screen readers hear the count only when it changes, after a pause in typing.
  clearTimeout(idle);
  idle = setTimeout(() => { if (matches.length !== said) { said = matches.length; live.textContent = sum.textContent; } }, 1000);
};
galley.onChange = report;
galley.setTiers(hints.checked ? ["flag", "hint"] : ["flag"]);
hints.addEventListener("change", () => galley.setTiers(hints.checked ? ["flag", "hint"] : ["flag"]));
galley.focus();
