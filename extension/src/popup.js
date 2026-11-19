// The toolbar popup: turn Tells off for one site, and show weaker tells everywhere.
const site = document.querySelector("[data-site]");
const hints = document.querySelector("[data-hints]");
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
let host = "";
try { host = new URL(tab.url).hostname; } catch { /* a chrome:// page has no site */ }
document.querySelector("[data-host]").textContent = host || "this page";
const s = await chrome.storage.sync.get({ enabled: true, hints: false, off: [] });
site.checked = s.enabled && !s.off.includes(host);
site.disabled = !host;
hints.checked = s.hints;
site.addEventListener("change", async () => {
  const { off } = await chrome.storage.sync.get({ off: [] });
  const next = site.checked ? off.filter((h) => h !== host) : [...new Set([...off, host])];
  await chrome.storage.sync.set({ off: next, enabled: true });
});
hints.addEventListener("change", () => chrome.storage.sync.set({ hints: hints.checked }));
