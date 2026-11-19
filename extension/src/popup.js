// The toolbar popup. Gmail, LinkedIn and X are on by default; any other site is turned on here,
// which asks Chrome for access to that one site and then runs Tells there from now on.
const site = document.querySelector("[data-site]");
const hints = document.querySelector("[data-hints]");
const onRow = document.querySelector("[data-on-row]");
const askRow = document.querySelector("[data-ask-row]");
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
let url = null;
try { url = new URL(tab.url); } catch { /* chrome:// and other pages without a site */ }
const web = url && /^https?:$/.test(url.protocol);
const host = web ? url.hostname : "";
const origin = web ? `${url.protocol}//${host}/*` : "";
document.querySelectorAll("[data-host]").forEach((el) => { el.textContent = host || "this page"; });

const BUILT_IN = /^(mail\.google\.com|www\.linkedin\.com|x\.com|twitter\.com)$/;
const granted = web && (BUILT_IN.test(host) || await chrome.permissions.contains({ origins: [origin] }));
onRow.hidden = !granted;
askRow.hidden = !web || granted;
if (!web) onRow.hidden = false;
site.disabled = !web;

const s = await chrome.storage.sync.get({ enabled: true, hints: false, off: [] });
site.checked = web && s.enabled && !s.off.includes(host);
hints.checked = s.hints;
const state = document.querySelector("[data-state]");
const showState = () => { state.textContent = !web ? "" : !granted ? "off here" : site.checked ? "on here" : "off here"; state.classList.toggle("on", web && granted && site.checked); };
showState();
site.addEventListener("change", showState);

site.addEventListener("change", async () => {
  const { off } = await chrome.storage.sync.get({ off: [] });
  const next = site.checked ? off.filter((h) => h !== host) : [...new Set([...off, host])];
  await chrome.storage.sync.set({ off: next, enabled: true });
});
hints.addEventListener("change", () => chrome.storage.sync.set({ hints: hints.checked }));

document.querySelector("[data-ask]").addEventListener("click", async () => {
  if (!(await chrome.permissions.request({ origins: [origin] }))) {
    if (!askRow.querySelector(".err")) askRow.appendChild(Object.assign(document.createElement("p"), { className: "err" }));
    askRow.querySelector(".err").textContent = "Chrome didn’t allow it. Try again, or turn it on in the extension’s settings.";
    return;
  }
  const id = `tells-${host}`;
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (!existing.length) {
    await chrome.scripting.registerContentScripts([{ id, matches: [origin], js: ["content.js"], runAt: "document_idle", persistAcrossSessions: true }]);
  }
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  const { off } = await chrome.storage.sync.get({ off: [] });
  await chrome.storage.sync.set({ off: off.filter((h) => h !== host) });
  window.close();
});
