// The galley: a draft on paper that you can type into, with each tell circled in red pencil and a
// margin note in handwriting beside it, the way an editor marks up a proof. Used by szoloth.com/tells
// and by the extension's checker page.
//
//   import { mountGalley } from "./galley.js";
//   const g = mountGalley(root, { engine, placeholder, text });
//   g.setText(str); g.setTiers(["flag","hint"]); g.onChange = (result) => {};
//
// How it works: a textarea with transparent text sits exactly over a "proof" div with the same type and
// wrapping. The proof shows the text and wraps each tell in a <mark>; an SVG layer draws a pencil loop
// around each mark's line boxes and numbers it to match its note. Notes are a real <ol>, so screen
// readers get them in order. Nothing leaves the page.
import { scan } from "./tells.js";

const SVGNS = "http://www.w3.org/2000/svg";
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// A small seeded random, so a mark keeps the same wobble every time it is redrawn.
function rng(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}

// A loop drawn by hand around a box: it starts low on the left, goes over the top, around, and overshoots
// past where it began.
function pencilLoop(r, rand) {
  const j = (n) => (rand() - 0.5) * n;
  const pad = 6;
  const x0 = r.left - pad, x1 = r.right + pad, y0 = r.top - 5, y1 = r.bottom + 4;
  const my = (y0 + y1) / 2;
  return `M ${x0 + 6 + j(3)} ${y1 + j(2)}`
    + ` C ${x0 - 6 + j(3)} ${my + j(3)}, ${x0 + 2 + j(3)} ${y0 + j(2)}, ${(x0 + x1) / 2 + j(8)} ${y0 - 1 + j(2)}`
    + ` S ${x1 + 6 + j(3)} ${y0 + 4 + j(3)}, ${x1 + 2 + j(2)} ${my + j(2)}`
    + ` S ${(x0 + x1) / 2 + j(8)} ${y1 + 3 + j(2)}, ${x0 + 2 + j(3)} ${y1 - 3 + j(2)}`;
}

export function mountGalley(root, { engine, placeholder = "Paste a draft or a message…", text = "", label = "Your draft" }) {
  root.classList.add("galley");
  root.innerHTML = `
    <div class="g-sheet">
      <div class="g-paper">
        <div class="g-proof" aria-hidden="true"></div>
        <textarea class="g-input" spellcheck="false" autocomplete="off" aria-label="${esc(label)}" placeholder="${esc(placeholder)}"></textarea>
      </div>
      <svg class="g-pencil" aria-hidden="true"><defs><filter id="g-graphite" x="-5%" y="-20%" width="110%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3"/>
        <feDisplacementMap in="SourceGraphic" scale="1.6"/></filter></defs><g class="g-loops"></g></svg>
    </div>
    <ol class="g-notes" role="list" aria-label="Tells found" hidden></ol>`;
  const sheet = root.querySelector(".g-sheet");
  const paper = root.querySelector(".g-paper");
  const proof = root.querySelector(".g-proof");
  const input = root.querySelector(".g-input");
  const svg = root.querySelector(".g-pencil");
  const loops = root.querySelector(".g-loops");
  const notes = root.querySelector(".g-notes");
  const seen = new Set();
  let tiers = ["flag"];
  let result = { matches: [], words: 0 };
  const narrow = matchMedia("(max-width: 859.98px)");
  let current = -1;
  let keys = [];
  let composing = false;

  const api = { onChange: null, setText, setTiers, focus: () => input.focus(), get result() { return result; } };

  function setText(value, { animate = true } = {}) {
    input.value = value;
    if (!animate) for (const k of [...seen]) seen.delete(k);
    render();
  }
  function setTiers(next) { tiers = next; render(); }

  function render() {
    const text = input.value;
    result = text.trim() ? scan(engine, text, { tiers }) : { matches: [], words: 0 };
    let html = "";
    let at = 0;
    result.matches.forEach((m, i) => {
      html += esc(text.slice(at, m.start)) + `<mark data-i="${i}">${esc(m.text)}</mark>`;
      at = m.end;
    });
    // a trailing newline needs a character after it, or the proof ends one line short of the textarea
    proof.innerHTML = html + esc(text.slice(at)) + "​";
    const occurrences = new Map();
    keys = result.matches.map((m) => {
      const base = `${m.id}|${m.text}`;
      const n = (occurrences.get(base) || 0) + 1;
      occurrences.set(base, n);
      return `${base}|${n}`;
    });
    notes.innerHTML = result.matches.map((m, i) => `<li data-i="${i}"><button type="button" class="g-go" data-go="${i}">
      <span class="g-n">${i + 1}</span>
      <span class="g-fix">${esc(cap(m.fix || m.note))}</span>
      <span class="g-why">${m.fix ? esc(cap(m.note)) + " · " : ""}<q>${esc(m.text.length > 48 ? m.text.slice(0, 45) + "…" : m.text)}</q></span></button></li>`).join("");
    notes.hidden = !result.matches.length;
    root.classList.toggle("is-empty", !text.trim());
    root.classList.toggle("is-clean", !!text.trim() && !result.matches.length);
    draw();
    caretTell();
    api.onChange?.(result);
  }

  // Lay the pencil and the notes over what the proof rendered.
  function draw() {
    const box = sheet.getBoundingClientRect();
    input.style.height = "0px";
    input.style.height = `${Math.max(proof.scrollHeight, paper.clientHeight)}px`;
    svg.setAttribute("width", box.width);
    svg.setAttribute("height", sheet.scrollHeight);
    loops.textContent = "";
    const wide = !narrow.matches;
    const placed = [];
    const animateNow = !reduced();
    proof.querySelectorAll("mark").forEach((mark) => {
      const i = Number(mark.dataset.i);
      const m = result.matches[i];
      const key = keys[i];
      const rand = rng(key);
      const all = [...mark.getClientRects()];
      const rects = all.filter((r) => r.width > 12); // skip the sliver a wrapped space leaves at a line end
      if (!rects.length) rects.push(...all.filter((r) => r.width > 0));
      const fresh = !seen.has(key);
      seen.add(key);
      rects.forEach((r, k) => {
        const rel = { left: r.left - box.left, right: r.right - box.left, top: r.top - box.top, bottom: r.bottom - box.top };
        const p = document.createElementNS(SVGNS, "path");
        p.setAttribute("d", pencilLoop(rel, rand));
        p.setAttribute("class", "g-loop");
        p.dataset.i = i;
        loops.appendChild(p);
        if (fresh && animateNow) {
          const len = p.getTotalLength();
          p.style.strokeDasharray = `${len}`;
          p.style.strokeDashoffset = `${len}`;
          p.style.animationDelay = `${Math.min(i, 8) * 110 + k * 60}ms`;
          p.classList.add("draw");
        }
      });
      if (rects.length) {
        const end = rects[rects.length - 1];
        const num = document.createElementNS(SVGNS, "text");
        num.setAttribute("x", end.right - box.left + 7);
        num.setAttribute("y", end.top - box.top - 4);
        num.setAttribute("class", "g-num");
        num.dataset.i = i;
        num.textContent = i + 1;
        loops.appendChild(num);
      }
      placed.push({ i, fresh, top: rects.length ? rects[0].top - box.top - 6 : 0 });
    });
    // Notes sit level with their marks unless the note above is still in the way. Read every height
    // first, then write every position, so the browser lays out once.
    const items = placed.map((p) => ({ ...p, el: notes.querySelector(`li[data-i="${p.i}"]`) })).filter((p) => p.el);
    const heights = items.map((p) => p.el.offsetHeight);
    let floor = 0;
    items.forEach((p, k) => {
      if (!wide) { p.el.style.top = ""; return; }
      const top = Math.max(p.top, floor);
      p.el.style.top = `${top}px`;
      floor = top + heights[k] + 10;
      if (p.fresh && animateNow) {
        p.el.classList.add("enter");
        p.el.style.animationDelay = `${Math.min(p.i, 8) * 110 + 300}ms`;
      }
    });
    if (wide) sheet.style.minHeight = `${floor}px`;
    else sheet.style.minHeight = "";
  }

  function highlight(i) {
    current = i;
    root.querySelectorAll(".is-on").forEach((el) => el.classList.remove("is-on"));
    if (i < 0) return;
    root.querySelectorAll(`[data-i="${i}"]`).forEach((el) => el.classList.add("is-on"));
  }

  notes.addEventListener("pointerover", (e) => {
    const li = e.target.closest("li");
    highlight(li ? Number(li.dataset.i) : -1);
  });
  notes.addEventListener("pointerleave", () => highlight(-1));
  // When the caret sits inside a tell, light up its note.
  function caretTell() {
    const pos = input.selectionStart;
    const i = result.matches.findIndex((m) => pos >= m.start && pos <= m.end);
    highlight(i);
  }
  input.addEventListener("keyup", caretTell);
  input.addEventListener("click", caretTell);
  // Render on every keystroke so the visible text never lags the caret; skip while an input method is
  // composing, and show the textarea's own text until it commits.
  // Past 20,000 characters (a whole essay), wait for a pause instead, so typing doesn't stutter.
  let slow = 0;
  input.addEventListener("input", () => {
    if (composing) return;
    clearTimeout(slow);
    if (input.value.length > 20000) slow = setTimeout(render, 200);
    else render();
  });
  input.addEventListener("compositionstart", () => { composing = true; root.classList.add("is-composing"); });
  input.addEventListener("compositionend", () => { composing = false; root.classList.remove("is-composing"); render(); });
  notes.addEventListener("click", (e) => {
    const b = e.target.closest("[data-go]");
    if (!b) return;
    const m = result.matches[Number(b.dataset.go)];
    input.focus();
    input.setSelectionRange(m.start, m.end);
    highlight(Number(b.dataset.go));
  });
  notes.addEventListener("focusin", (e) => {
    const b = e.target.closest("[data-go]");
    if (b) highlight(Number(b.dataset.go));
  });
  new ResizeObserver(() => draw()).observe(root);
  narrow.addEventListener("change", draw);
  document.fonts?.ready.then(draw);

  input.value = text;
  render();
  return api;
}
