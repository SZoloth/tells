// Tells content script. The build puts the scanner (compile, scan) and TELLS_RULES above this file.
// It watches the text box you're typing in and marks tells with a red-pencil underline drawn on its own
// layer (the page's DOM is never changed, so editors like Gmail's keep working). Put the caret in a
// marked phrase, or point at it, and a margin note opens beside it with what to write instead.
// Nothing leaves the page: there are no network calls.
(() => {
  if (window.__tellsLoaded) return;
  window.__tellsLoaded = true;

  const engine = compile(TELLS_RULES);
  const settings = { enabled: true, hints: false, off: [] };
  const host = location.hostname;
  let field = null;
  let matches = [];
  let ranges = [];
  let rectsByMatch = [];
  let timer = 0;
  let frame = 0;
  let current = -1; // the tell whose note is open
  let pinned = false; // opened from the count or the arrows, so it stays until dismissed

  // Sam's handwriting, for the fix line. Added to the document so the shadow root can use it.
  try {
    const hand = new FontFace("TellsHand", `url(${chrome.runtime.getURL("myhand.woff2")})`);
    hand.load().then((f) => document.fonts.add(f)).catch(() => {});
  } catch { /* the note falls back to a system hand */ }

  // ---- overlay, isolated from the page's styles ----
  const root = document.createElement("tells-overlay");
  const shadow = root.attachShadow({ mode: "closed" });
  const WAVE = "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4" viewBox="0 0 8 4"><path d="M0 2.6 Q2 0.4 4 2.2 T8 2" fill="none" stroke="#c8392f" stroke-width="1.15" stroke-linecap="round"/></svg>`);
  shadow.innerHTML = `<style>
    :host{all:initial}
    .lines{position:fixed;inset:0;pointer-events:none;z-index:2147483646}
    .u{position:fixed;height:4px;background:url("${WAVE}") repeat-x 0 0/8px 4px;opacity:.9}
    .u.on{opacity:1}
    .u.on::before{content:"";position:absolute;left:-2px;right:-2px;bottom:3px;height:18px;border-radius:3px;background:rgba(200,57,47,.09)}
    .count{position:fixed;z-index:2147483647;display:none;align-items:center;gap:7px;height:28px;padding:0 11px 0 9px;border:0;border-radius:6px;
      background:#fffdf7;color:#1e1c19;font:600 12px/1 -apple-system,system-ui,sans-serif;cursor:pointer;
      box-shadow:0 1px 0 rgba(0,0,0,.05),0 6px 16px -6px rgba(60,40,10,.45),0 0 0 1px rgba(60,40,10,.10)}
    .count:focus-visible{outline:2px solid #c8392f;outline-offset:2px}
    .count svg{width:16px;height:16px;flex:none}
    .count b{font:400 17px/1 TellsHand,"Bradley Hand",cursive;color:#c8392f;margin-right:1px}
    .note{position:fixed;z-index:2147483647;display:none;width:300px;padding:14px 16px 12px;border-radius:4px;background:#fffdf7;color:#1e1c19;
      font:400 13px/1.45 -apple-system,system-ui,sans-serif;
      box-shadow:0 1px 0 rgba(0,0,0,.05),0 22px 44px -18px rgba(60,40,10,.55),0 0 0 1px rgba(60,40,10,.08);
      opacity:0;transform:translateY(4px) scale(.98);transform-origin:var(--ox,20px) top;transition:opacity .14s ease-out,transform .18s cubic-bezier(.22,1,.36,1)}
    .note.show{opacity:1;transform:none}
    .note .top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;font:600 10.5px/1 ui-monospace,Menlo,monospace;letter-spacing:.05em;text-transform:uppercase;color:#6f685e}
    .note .top b{color:#b0332a;font-weight:600}
    .nav{display:flex;gap:2px}
    .nav button{all:unset;display:grid;place-items:center;width:24px;height:24px;border-radius:5px;color:#4b453e;cursor:pointer;font:15px/1 -apple-system,system-ui,sans-serif}
    .nav button:hover{background:#f1ebdf}.nav button:focus-visible{outline:2px solid #c8392f}
    .nav button[disabled]{opacity:.3;cursor:default}
    .fix{margin:2px 0 8px;font:400 22px/1.12 TellsHand,"Bradley Hand",cursive;color:#b0332a;overflow-wrap:anywhere}
    .why{color:#4b453e;overflow-wrap:anywhere}
    .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
    .why q{quotes:"“" "”";color:#1e1c19}
    .fine{margin-top:10px;padding-top:8px;border-top:1px solid #ece4d6;color:#6f685e;font-size:11.5px}
    @media (prefers-reduced-motion:reduce){.note{transition:none}}
  </style>
  <div class="lines"></div>
  <button class="count" type="button" aria-haspopup="dialog" aria-expanded="false">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 11.6C1.6 8.2 3.6 3.4 8.3 3.2c4.1-.2 5.6 3.2 4.6 6.1-1 2.8-4.8 3.9-7.6 2.4" fill="none" stroke="#c8392f" stroke-width="1.4" stroke-linecap="round"/></svg>
    <span><b></b> <span class="lbl">tells</span></span>
  </button>
  <div class="sr" aria-live="polite"></div>
  <div class="note" role="group" aria-label="Tell">
    <div class="top"><span><b class="num"></b> <span class="of"></span></span><span class="nav"><button type="button" class="prev" aria-label="Previous tell">‹</button><button type="button" class="next" aria-label="Next tell">›</button></span></div>
    <div class="fix"></div>
    <div class="why"></div>
    <div class="fine">A tell is how a sentence reads, not proof of who wrote it.</div>
  </div>`;
  const lines = shadow.querySelector(".lines");
  const count = shadow.querySelector(".count");
  const note = shadow.querySelector(".note");
  const live = shadow.querySelector(".sr");
  let hideTimer = 0;
  document.documentElement.appendChild(root);

  const active = () => settings.enabled && !settings.off.includes(host);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function editableRoot(el) {
    if (!el || el === document.body) return null;
    if (el.tagName === "TEXTAREA") return el;
    if (!el.isContentEditable) return null;
    let top = el;
    while (top.parentElement && top.parentElement.isContentEditable) top = top.parentElement;
    return top;
  }

  // ---- read the field's text, keeping a map back to its text nodes ----
  const BLOCK = /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE|TR|BR)$/;
  function readField(el) {
    if (el.tagName === "TEXTAREA") return { text: el.value, nodes: null };
    const nodes = [];
    let text = "";
    let lastBlock = null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      let b = n.parentElement;
      while (b && b !== el && !BLOCK.test(b.tagName)) b = b.parentElement;
      if (lastBlock && b !== lastBlock && text && !text.endsWith("\n")) text += "\n";
      nodes.push({ node: n, start: text.length });
      text += n.data;
      lastBlock = b;
    }
    return { text, nodes };
  }

  function locate(nodes, offset) {
    let lo = 0;
    for (let i = 0; i < nodes.length; i++) if (nodes[i].start <= offset) lo = i;
    const { node, start } = nodes[lo];
    return [node, Math.min(offset - start, node.data.length)];
  }

  function check() {
    if (!field || !active()) return reset();
    const { text, nodes } = readField(field);
    matches = text.trim() ? scan(engine, text, { tiers: settings.hints ? ["flag", "hint"] : ["flag"], limit: 200 }).matches : [];
    ranges = [];
    if (nodes && nodes.length) {
      for (const m of matches) {
        try {
          const r = document.createRange();
          r.setStart(...locate(nodes, m.start));
          r.setEnd(...locate(nodes, m.end));
          ranges.push(r);
        } catch {
          ranges.push(null);
        }
      }
    }
    if (current >= matches.length) current = -1;
    count.querySelector("b").textContent = matches.length;
    count.querySelector(".lbl").textContent = matches.length === 1 ? "tell" : "tells";
    place();
  }

  // ---- draw: underlines from the ranges' rectangles, the count at the field's corner, the open note ----
  function place() {
    frame = 0;
    lines.textContent = "";
    rectsByMatch = [];
    if (!field || !active() || !matches.length) {
      count.style.display = "none";
      hideNote();
      return;
    }
    const box = field.getBoundingClientRect();
    if (box.width === 0 || box.bottom < 0 || box.top > innerHeight) {
      count.style.display = "none";
      hideNote();
      return;
    }
    const frag = document.createDocumentFragment();
    ranges.forEach((r, i) => {
      rectsByMatch[i] = [];
      if (!r) return;
      for (const rect of r.getClientRects()) {
        if (rect.width < 1 || rect.bottom < box.top || rect.top > box.bottom) continue;
        rectsByMatch[i].push(rect);
        const u = document.createElement("div");
        u.className = "u";
        u.dataset.i = i;
        u.style.cssText = `left:${rect.left}px;top:${rect.bottom - 1}px;width:${rect.width}px`;
        frag.appendChild(u);
      }
    });
    lines.appendChild(frag);
    count.style.display = "inline-flex";
    count.style.left = `${Math.min(innerWidth - 100, Math.max(8, box.right - 92))}px`;
    // Just below the field's corner, so it never covers the last line; above it only at the window's edge.
    const below = box.bottom + 6 + 28 <= innerHeight;
    count.style.top = `${below ? box.bottom + 6 : Math.max(8, box.bottom - 36)}px`;
    if (current >= 0) showNote(current);
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };

  // The note opens under the marked phrase (above it near the bottom of the window). For a textarea,
  // whose words can't be measured, it opens above the count instead.
  function showNote(i) {
    const m = matches[i];
    if (!m) return hideNote();
    const opening = current < 0;
    current = i;
    note.querySelector(".num").textContent = `Tell ${i + 1}`;
    note.setAttribute("aria-label", `Tell ${i + 1} of ${matches.length}`);
    live.textContent = `Tell ${i + 1} of ${matches.length}: ${cap(m.fix || m.note)}. ${m.fix ? cap(m.note) + "." : ""}`;
    note.querySelector(".of").textContent = `of ${matches.length}`;
    note.querySelector(".fix").textContent = cap(m.fix || m.note);
    note.querySelector(".why").innerHTML = `${m.fix ? esc(cap(m.note)) + " · " : ""}<q>${esc(m.text.length > 70 ? m.text.slice(0, 67) + "…" : m.text)}</q>`;
    note.querySelector(".prev").disabled = i === 0;
    note.querySelector(".next").disabled = i === matches.length - 1;
    const rect = rectsByMatch[i]?.[0];
    const anchor = rect || count.getBoundingClientRect();
    note.style.display = "block";
    const h = note.offsetHeight;
    const x = Math.max(8, Math.min(innerWidth - 312, anchor.left - 12));
    const below = rect ? rect.bottom + 10 + h < innerHeight : false;
    const y = below ? rect.bottom + 10 : Math.max(8, anchor.top - h - 10);
    note.style.left = `${x}px`;
    note.style.top = `${y}px`;
    note.style.setProperty("--ox", `${Math.max(12, anchor.left - x + 12)}px`);
    if (opening) requestAnimationFrame(() => note.classList.add("show"));
    else note.classList.add("show");
    count.setAttribute("aria-expanded", "true");
    for (const u of lines.children) u.classList.toggle("on", Number(u.dataset.i) === i);
  }
  function hideNote() {
    current = -1;
    pinned = false;
    note.classList.remove("show");
    note.style.display = "none";
    count.setAttribute("aria-expanded", "false");
    for (const u of lines.children) u.classList.remove("on");
  }
  function reset() {
    matches = [];
    ranges = [];
    hideNote();
    place();
  }

  // Which tell, if any, holds this point (the pointer) or the caret.
  const hit = (x, y) => rectsByMatch.findIndex((rs) => rs?.some((r) => x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 4));
  function caretTell() {
    if (field && field.tagName === "TEXTAREA") {
      const pos = field.selectionStart;
      return matches.findIndex((m) => pos >= m.start && pos <= m.end);
    }
    const sel = document.getSelection();
    if (!sel || !sel.rangeCount || !field || !sel.isCollapsed) return -1;
    const at = sel.getRangeAt(0);
    return ranges.findIndex((r) => r && r.isPointInRange(at.startContainer, at.startOffset));
  }

  count.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the field
  count.addEventListener("click", () => {
    if (current >= 0 && pinned) return hideNote();
    pinned = true;
    showNote(Math.max(0, current));
  });
  note.addEventListener("mousedown", (e) => e.preventDefault());
  note.querySelector(".prev").addEventListener("click", () => { pinned = true; showNote(current - 1); });
  note.querySelector(".next").addEventListener("click", () => { pinned = true; showNote(current + 1); });

  // A hover note waits 300 ms before closing, and stays while the pointer is on it, so the pointer can
  // cross the gap from the phrase to the note.
  document.addEventListener("mousemove", (e) => {
    if (!matches.length || pinned) return;
    if (e.composedPath().includes(root)) { clearTimeout(hideTimer); return; }
    const i = hit(e.clientX, e.clientY);
    if (i >= 0) { clearTimeout(hideTimer); if (i !== current) showNote(i); }
    else if (current >= 0 && caretTell() !== current) {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hideNote, 300);
    }
  }, { passive: true });
  document.addEventListener("selectionchange", () => {
    if (field && field.tagName === "TEXTAREA") return;
    if (!field || pinned) return;
    const i = caretTell();
    if (i >= 0 && i !== current) showNote(i);
    else if (i < 0 && current >= 0) hideNote();
  });

  document.addEventListener("focusin", (e) => {
    const el = editableRoot(e.composedPath()[0]);
    if (!el || el === field) return;
    field = el;
    hideNote();
    check();
  }, true);
  document.addEventListener("focusout", () => {
    setTimeout(() => {
      if (document.activeElement === root) return; // focus moved into Tells' own note or count
      if (!editableRoot(document.activeElement) && !pinned) { field = null; reset(); }
    }, 150);
  }, true);
  // In a textarea the caret moves without a selectionchange on the document.
  document.addEventListener("keyup", () => {
    if (!field || field.tagName !== "TEXTAREA" || pinned) return;
    const i = caretTell();
    if (i >= 0 && i !== current) showNote(i);
    else if (i < 0 && current >= 0) hideNote();
  }, true);
  document.addEventListener("input", (e) => {
    if (!field || !field.contains(e.composedPath()[0])) return;
    clearTimeout(timer);
    timer = setTimeout(check, 300);
  }, true);
  addEventListener("scroll", schedule, true);
  addEventListener("resize", schedule);
  // A click outside Tells closes an open note, so it never sits over the page.
  document.addEventListener("mousedown", (e) => {
    if (current >= 0 && !e.composedPath().includes(root)) hideNote();
  }, true);
  // Keyboard: Alt+Shift+T opens the first tell's note and moves focus to it; the arrows step through;
  // Escape closes it and returns to the text without reaching the page (it would close a Gmail draft).
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && current >= 0) {
      e.stopPropagation();
      e.preventDefault();
      const back = field;
      hideNote();
      back?.focus();
      return;
    }
    if (e.altKey && e.shiftKey && e.code === "KeyT" && field && matches.length) {
      e.preventDefault();
      e.stopPropagation();
      pinned = true;
      showNote(Math.max(0, current));
      (note.querySelector(".next:not([disabled])") || note.querySelector(".prev")).focus();
    }
  }, true);

  chrome.storage.sync.get(settings, (s) => {
    Object.assign(settings, s);
    check();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [k, v] of Object.entries(changes)) settings[k] = v.newValue;
    check();
  });
})();
