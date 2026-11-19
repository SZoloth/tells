// Tells content script. The build puts the scanner (compile, scan) and TELLS_RULES above this file.
// It watches the text box you're typing in, underlines tells in an overlay (the page's own DOM is never
// changed, so editors like Gmail's don't break), and shows a count you can click for the notes.
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
  let timer = 0;
  let frame = 0;
  let open = false;

  // ---- overlay, isolated from the page's styles ----
  const root = document.createElement("tells-overlay");
  const shadow = root.attachShadow({ mode: "closed" });
  shadow.innerHTML = `<style>
    :host{all:initial}
    .lines{position:fixed;inset:0;pointer-events:none;z-index:2147483646}
    .u{position:fixed;height:2px;border-radius:1px;background:repeating-linear-gradient(90deg,#c8392f 0 3px,transparent 3px 5px);opacity:.85}
    .u.on{background:#c8392f;height:3px;opacity:1}
    .badge{position:fixed;z-index:2147483647;display:none;align-items:center;gap:6px;height:26px;padding:0 10px;border:0;border-radius:13px;
      background:#1e1c19;color:#fffdf7;font:600 12px/1 -apple-system,system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.18)}
    .badge:focus-visible{outline:2px solid #c8392f;outline-offset:2px}
    .badge i{display:inline-block;width:8px;height:8px;border-radius:50%;background:#e2665b}
    .panel{position:fixed;z-index:2147483647;display:none;width:320px;max-height:360px;overflow:auto;padding:6px;border-radius:12px;
      background:#fffdf7;color:#1e1c19;font:400 13px/1.45 -apple-system,system-ui,sans-serif;box-shadow:0 18px 40px -12px rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.06)}
    .panel ol{list-style:none;margin:0;padding:0}
    .panel li{display:grid;grid-template-columns:18px 1fr;gap:1px 8px;padding:9px 10px;border-radius:8px;cursor:default}
    .panel li:hover,.panel li.on{background:#f3ede2}
    .n{grid-row:span 3;font:600 11px/1.6 ui-monospace,Menlo,monospace;color:#b0332a}
    .q{font-weight:600}
    .why{color:#4b453e}
    .fix{color:#1e1c19}.fix b{font:600 10px ui-monospace,Menlo,monospace;letter-spacing:.04em;text-transform:uppercase;color:#7c746a;margin-right:6px}
    .foot{padding:8px 10px 4px;color:#7c746a;font-size:12px;border-top:1px solid #e3dccf;margin-top:4px}
    @media (prefers-color-scheme:dark){
      .panel{background:#24211c;color:#efe9df}.panel li:hover,.panel li.on{background:#2e2a24}.why{color:#c4bcb0}.fix{color:#efe9df}.foot{border-color:#38332c;color:#a39b8f}
    }
  </style><div class="lines"></div><button class="badge" type="button" aria-expanded="false"><i></i><span></span></button><div class="panel" role="dialog" aria-label="Tells found"><ol></ol><p class="foot">A tell is a sentence a reader may take as machine-made. It doesn't prove who wrote it.</p></div>`;
  const lines = shadow.querySelector(".lines");
  const badge = shadow.querySelector(".badge");
  const panel = shadow.querySelector(".panel");
  const list = panel.querySelector("ol");
  document.documentElement.appendChild(root);

  const active = () => settings.enabled && !settings.off.includes(host);

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
    if (!field || !active()) return hide();
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
    renderList();
    place();
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function renderList() {
    list.innerHTML = matches.map((m, i) => `<li data-i="${i}"><span class="n">${i + 1}</span>
      <span class="q">“${esc(m.text.length > 60 ? m.text.slice(0, 57) + "…" : m.text)}”</span>
      <span class="why">${esc(cap(m.note))}</span>${m.fix ? `<span class="fix"><b>Try</b>${esc(cap(m.fix))}</span>` : ""}</li>`).join("");
    badge.querySelector("span").textContent = `${matches.length} ${matches.length === 1 ? "tell" : "tells"}`;
  }

  // ---- draw: underlines from the ranges' rectangles, badge at the field's corner ----
  function place() {
    frame = 0;
    lines.textContent = "";
    if (!field || !active() || !matches.length) {
      badge.style.display = "none";
      panel.style.display = "none";
      return;
    }
    const box = field.getBoundingClientRect();
    if (box.width === 0 || box.bottom < 0 || box.top > innerHeight) {
      badge.style.display = "none";
      panel.style.display = "none";
      return;
    }
    const frag = document.createDocumentFragment();
    ranges.forEach((r, i) => {
      if (!r) return;
      for (const rect of r.getClientRects()) {
        if (rect.width < 1 || rect.bottom < box.top || rect.top > box.bottom) continue;
        const u = document.createElement("div");
        u.className = "u";
        u.dataset.i = i;
        u.style.cssText = `left:${rect.left}px;top:${rect.bottom - 1}px;width:${rect.width}px`;
        frag.appendChild(u);
      }
    });
    lines.appendChild(frag);
    badge.style.display = "inline-flex";
    const bx = Math.min(innerWidth - 96, Math.max(8, box.right - 92));
    const by = Math.min(innerHeight - 34, Math.max(8, box.bottom - 32));
    badge.style.left = `${bx}px`;
    badge.style.top = `${by}px`;
    if (open) {
      panel.style.display = "block";
      // Open toward the side with more room, and shrink to fit, so the notes don't cover the text they describe.
      const px = Math.min(innerWidth - 328, Math.max(8, bx + 90 - 320));
      const roomBelow = innerHeight - (by + 34) - 8;
      const roomAbove = by - 16;
      const below = roomBelow >= 200 || roomBelow >= roomAbove;
      panel.style.left = `${px}px`;
      panel.style.maxHeight = `${Math.min(360, below ? roomBelow : roomAbove)}px`;
      panel.style.top = below ? `${by + 34}px` : "";
      panel.style.bottom = below ? "" : `${innerHeight - by + 8}px`;
    } else {
      panel.style.display = "none";
    }
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(place); };

  function hide() {
    matches = [];
    ranges = [];
    open = false;
    badge.setAttribute("aria-expanded", "false");
    place();
  }

  badge.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the field
  badge.addEventListener("click", () => {
    open = !open;
    badge.setAttribute("aria-expanded", String(open));
    place();
  });
  list.addEventListener("mouseover", (e) => {
    const li = e.target.closest("li");
    shadow.querySelectorAll(".u.on").forEach((u) => u.classList.remove("on"));
    if (li) shadow.querySelectorAll(`.u[data-i="${li.dataset.i}"]`).forEach((u) => u.classList.add("on"));
  });

  document.addEventListener("focusin", (e) => {
    const el = editableRoot(e.composedPath()[0]);
    if (!el || el === field) return;
    field = el;
    open = false;
    check();
  }, true);
  document.addEventListener("focusout", () => {
    setTimeout(() => {
      const now = editableRoot(document.activeElement);
      if (!now && !open) { field = null; hide(); }
    }, 150);
  }, true);
  document.addEventListener("input", (e) => {
    if (!field || !field.contains(e.composedPath()[0])) return;
    clearTimeout(timer);
    timer = setTimeout(check, 300);
  }, true);
  addEventListener("scroll", schedule, true);
  addEventListener("resize", schedule);
  // A click anywhere outside Tells closes the notes, so they never sit over the page.
  document.addEventListener("mousedown", (e) => {
    if (open && !e.composedPath().includes(root)) { open = false; badge.setAttribute("aria-expanded", "false"); place(); }
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) { open = false; badge.setAttribute("aria-expanded", "false"); place(); }
  }, true);

  chrome.storage.sync.get(settings, (s) => {
    Object.assign(settings, s);
    check();
  });
  chrome.storage.onChanged.addListener((changes) => {
    for (const [k, v] of Object.entries(changes)) settings[k] = v.newValue;
    check();
  });
})();
