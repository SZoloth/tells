// Adds "Check with Tells" to the right-click menu for selected text.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "tells-check", title: "Check with Tells", contexts: ["selection"] });
});
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "tells-check") return;
  await chrome.storage.session.set({ pending: info.selectionText || "" });
  await chrome.tabs.create({ url: chrome.runtime.getURL("check.html") });
});
