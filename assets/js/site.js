// Atlas Studios: shared site behavior (data loading, rendering, forms).
(function () {
  const cfg = window.ATLAS_CONFIG || {};
  const fallback = window.ATLAS_FALLBACK || { caseStudies: [], media: [] };
  const hasSupabase = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const db = hasSupabase ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else n.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null) n.append(k.nodeType ? k : document.createTextNode(k));
    return n;
  };
  const asList = (v) => Array.isArray(v) ? v : (v ? String(v).split("\n").map((s) => s.trim()).filter(Boolean) : []);

  async function getCaseStudies() {
    if (db) {
      const { data, error } = await db.from("case_studies").select("*").eq("published", true).order("sort_order", { ascending: true });
      if (!error && data && data.length) return data;
    }
    return fallback.caseStudies.slice().sort((a, b) => a.sort_order - b.sort_order);
  }
  async function getMedia(caseStudyId) {
    if (!db) return [];
    let q = db.from("media").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false });
    if (caseStudyId) q = q.eq("case_study_id", caseStudyId);
    const { data, error } = await q;
    return error ? [] : (data || []);
  }

  function cover(cs, cls) {
    const box = el("div", { class: cls || "card-cover" });
    if (cs.cover_url) box.append(el("img", { src: cs.cover_url, alt: cs.title, loading: "lazy" }));
    else box.append(el("img", { src: "/assets/img/atlas-mark-bone.png", alt: "", class: "cover-mark" }));
    return box;
  }

  function caseCard(cs, i) {
    const a = el("a", { class: "case-card", href: `/case-study?slug=${encodeURIComponent(cs.slug)}` },
      cover(cs),
      el("div", { class: "case-meta" },
        el("span", { class: "label" }, String(i + 1).padStart(2, "0") + " · " + (cs.category || "")),
        el("h3", { text: cs.title }),
        el("p", { text: cs.summary || "" })
      )
    );
    return a;
  }

  function mediaItem(m) {
    const fig = el("figure", { class: "media-item" });
    if (m.kind === "video") fig.append(el("video", { src: m.url, controls: "", playsinline: "", preload: "metadata" }));
    else fig.append(el("img", { src: m.url, alt: m.caption || m.event_name || "", loading: "lazy" }));
    if (m.caption || m.event_name) fig.append(el("figcaption", { text: [m.event_name, m.caption].filter(Boolean).join(" · ") }));
    return fig;
  }

  async function renderWorkGrids() {
    const grids = $$("[data-case-grid]");
    if (!grids.length) return;
    const list = await getCaseStudies();
    grids.forEach((g) => {
      const limit = parseInt(g.dataset.limit || "0", 10);
      const items = limit ? list.slice(0, limit) : list;
      g.replaceChildren(...items.map(caseCard));
    });
  }

  async function renderGallery() {
    const g = $("[data-gallery]");
    if (!g) return;
    const media = await getMedia();
    if (!media.length) { g.closest("section")?.setAttribute("hidden", ""); return; }
    g.replaceChildren(...media.map(mediaItem));
  }

  async function renderCaseStudy() {
    const root = $("[data-case-study]");
    if (!root) return;
    const slug = new URLSearchParams(location.search).get("slug");
    const list = await getCaseStudies();
    const i = Math.max(0, list.findIndex((c) => c.slug === slug));
    const cs = list[i];
    if (!cs) { root.replaceChildren(el("p", { text: "Case study not found." })); return; }
    document.title = `${cs.title} · Atlas Studios`;
    const block = (label, body) => el("div", { class: "cs-block" }, el("span", { class: "label", text: label }), body);
    const ul = (items) => el("ul", { class: "cs-list" }, asList(items).map((t) => el("li", { text: t })));
    root.replaceChildren(
      el("header", { class: "cs-head" },
        el("span", { class: "label", text: cs.category || "" }),
        el("h1", { class: "display", text: cs.title }),
        el("p", { class: "cs-client", text: cs.client || "" })
      ),
      cover(cs, "cs-cover"),
      el("div", { class: "cs-grid" },
        block("Context", el("p", { text: cs.context || "" })),
        block("Insight", el("p", { text: cs.insight || "" })),
        block("Objective", ul(cs.objective)),
        block("Execution", ul(cs.execution))
      ),
      el("div", { class: "cs-results" }, el("span", { class: "label", text: "Results" }), ul(cs.results))
    );
    if (cs.id) {
      const media = await getMedia(cs.id);
      if (media.length) root.append(el("div", { class: "gallery" }, media.map(mediaItem)));
    }
    const next = list[(i + 1) % list.length];
    if (next && next !== cs) {
      root.append(el("a", { class: "cs-next", href: `/case-study?slug=${encodeURIComponent(next.slug)}` },
        el("span", { class: "label", text: "Next" }), el("span", { class: "display-sm", text: next.title })));
    }
  }

  function wireForms() {
    $$("form[data-table]").forEach((form) => {
      const status = $(".form-status", form);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        if (data.website) return; // spam trap
        delete data.website;
        if (!db) { status.textContent = "Thanks. The form goes live once the database is connected."; return; }
        const btn = $("button[type=submit]", form);
        btn.disabled = true;
        status.textContent = "Sending...";
        const { error } = await db.from(form.dataset.table).insert(data);
        btn.disabled = false;
        if (error) {
          console.error("Atlas form error", error);
          status.textContent = error.code === "23505" ? "You're already on the list." : `Something went wrong. Please try again. (${error.code || error.message || "error"})`;
          return;
        }
        form.reset();
        status.textContent = form.dataset.success || "Received. Thank you.";
      });
    });
  }

  function wireNav() {
    const btn = $(".nav-toggle");
    const nav = $(".site-nav");
    if (btn && nav) btn.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
    });
    const path = location.pathname.replace(/\/$/, "") || "/";
    $$(".site-nav a").forEach((a) => { if (a.getAttribute("href") === path) a.setAttribute("aria-current", "page"); });
    $$("[data-config-link]").forEach((a) => {
      const v = cfg[a.dataset.configLink];
      if (v) { a.href = a.dataset.configLink === "email" ? `mailto:${v}` : v; if (a.dataset.configLink === "email") a.textContent = v; }
      else a.remove();
    });
    const year = $("[data-year]"); if (year) year.textContent = new Date().getFullYear();
  }

  function heroVideo() {
    // Widescreen film on computers, tall film on phones. Reduced motion: poster only.
    const v = $("[data-hero-film]");
    if (!v) return;
    const tall = matchMedia("(max-aspect-ratio: 1/1)").matches;
    v.poster = tall ? v.dataset.tallPoster : v.dataset.widePoster;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { v.removeAttribute("autoplay"); return; }
    v.src = (cfg.heroVideo && !tall) ? cfg.heroVideo : (tall ? v.dataset.tall : v.dataset.wide);
    v.muted = true;
    const p = v.play(); if (p && p.catch) p.catch(() => {});
  }

  function revealOnScroll() {
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.documentElement.classList.add("anim");
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    }), { threshold: 0.12 });
    $$(".reveal").forEach((n) => io.observe(n));
  }

  window.ATLAS = { db, hasSupabase, el, asList };
  document.addEventListener("DOMContentLoaded", () => {
    wireNav(); wireForms(); heroVideo(); revealOnScroll();
    renderWorkGrids(); renderGallery(); renderCaseStudy();
  });
})();
