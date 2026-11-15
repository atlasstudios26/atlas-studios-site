// Atlas private decks: request access, redeem a personal code, view the PDF on-site with a watermark.
import * as pdfjs from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

const $ = (s, r = document) => r.querySelector(s);
const start = async () => {
  const { db } = window.ATLAS || {};
  const slug = new URLSearchParams(location.search).get("d") || "";
  const gate = $("[data-deck-gate]"), view = $("[data-deck-view]");
  if (!db || !slug) { $("[data-deck-title]").textContent = "Deck not found."; return; }

  // Title for the gate
  const { data: deck } = await db.from("decks").select("id, title, storage_path").eq("slug", slug).maybeSingle();
  if (!deck) { $("[data-deck-title]").textContent = "This deck is being prepared."; $(".gate-grid").hidden = true; return; }
  $("[data-deck-title]").textContent = deck.title;
  document.title = deck.title + " · Private deck · Atlas Studios";

  // Every visitor gets a quiet anonymous session so a redeemed code stays tied to this browser.
  let { data: { session } } = await db.auth.getSession();
  if (!session) { const r = await db.auth.signInAnonymously(); session = r.data.session; }

  const open = async (info) => {
    gate.hidden = true; view.hidden = false;
    $("[data-deck-viewtitle]").textContent = info.title;
    $("[data-deck-shared]").textContent = `Shared with ${info.name} (${info.email}).`;
    const { data: signed, error } = await db.storage.from("decks").createSignedUrl(info.path, 120);
    if (error) { $("[data-deck-pages]").textContent = "This deck couldn't be opened. Please contact Atlas."; return; }
    await render(signed.signedUrl, info);
  };

  // Already redeemed on this browser? Admin preview?
  const { data: mine } = await db.rpc("my_deck", { p_deck: slug });
  if (mine) return open(mine);
  if (session && !session.user.is_anonymous) {
    const { data: admin } = await db.rpc("is_admin");
    if (admin) return open({ title: deck.title, path: deck.storage_path, name: "Atlas admin preview", email: session.user.email });
  }

  // Redeem a code
  $("[data-deck-code]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget, st = $(".form-status", f);
    st.textContent = "Checking…";
    const { data, error } = await db.rpc("claim_deck", { p_deck: slug, p_code: f.elements.code.value });
    if (error) { st.textContent = "Something went wrong. Try again."; return; }
    if (!data) { st.textContent = "That code isn't valid for this deck."; return; }
    if (data.error === "limit") { st.textContent = "This code has been used on too many devices. Ask Avery for a new one."; return; }
    open(data);
  });

  // Request access
  $("[data-deck-request]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget, st = $(".form-status", f);
    if (f.elements.website.value) return;
    st.textContent = "Sending…";
    const { error } = await db.from("deck_requests").insert({
      deck_id: deck.id, name: f.elements.name.value.trim(), email: f.elements.email.value.trim(),
      company: f.elements.company.value.trim() || null, reason: f.elements.reason.value.trim() || null });
    st.textContent = error ? "Something went wrong. Try again." : "Request sent. If approved, you'll receive a personal access code.";
    if (!error) f.reset();
  });
};

// Draw each page onto a canvas with the viewer's watermark burned in.
async function render(url, info) {
  const box = $("[data-deck-pages]");
  const pdf = await pdfjs.getDocument({ url, disableAutoFetch: true }).promise;
  box.replaceChildren();
  const logo = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = "/assets/img/atlas-mark-charcoal.png"; });
  const width = Math.min(box.clientWidth || 1200, 1600);
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = (width / base.width) * Math.min(window.devicePixelRatio || 1, 2);
    const vp = page.getViewport({ scale });
    const c = document.createElement("canvas");
    c.width = vp.width; c.height = vp.height; c.className = "deck-page";
    const ctx = c.getContext("2d");
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    // Watermark: repeated diagonal line with the viewer's email, plus the Atlas mark.
    ctx.save();
    ctx.globalAlpha = 0.13; ctx.fillStyle = "#292420";
    const fs = Math.max(14, vp.width / 60);
    ctx.font = `500 ${fs}px Jost, Arial, sans-serif`;
    ctx.translate(vp.width / 2, vp.height / 2); ctx.rotate(-Math.PI / 7);
    const text = `CONFIDENTIAL · VIEW ONLY · ${info.email}   `;
    const w = ctx.measureText(text).width;
    for (let y = -vp.height; y < vp.height; y += fs * 6) for (let x = -vp.width * 1.2; x < vp.width * 1.2; x += w) ctx.fillText(text, x, y);
    ctx.restore();
    if (logo) { ctx.globalAlpha = 0.5; const h = vp.height * 0.06; ctx.drawImage(logo, vp.width - h * 1.4, vp.height - h * 1.3, h, h); ctx.globalAlpha = 1; }
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.setAttribute("draggable", "false");
    box.append(c);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
