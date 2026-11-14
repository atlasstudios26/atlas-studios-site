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
      if (!error && data && data.length) {
        // Case studies built into the site (pinned) show alongside the ones managed in /admin.
        // Built-in photos and video fill in anything a managed case study is missing.
        data.forEach((c) => {
          const f = fallback.caseStudies.find((x) => x.slug === c.slug);
          if (f) ["cover_url", "hero_url", "video_url", "world_url", "gallery", "chapters", "stat", "served", "quote", "note"].forEach((k) => { if (!c[k] && f[k]) c[k] = f[k]; });
        });
        const have = new Set(data.map((c) => c.slug));
        const pinned = fallback.caseStudies.filter((c) => c.pinned && !have.has(c.slug));
        return data.concat(pinned).sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99));
      }
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
    if (cs.video_url && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      box.append(el("video", { src: cs.video_url, poster: cs.cover_url || null, muted: "", loop: "", playsinline: "", autoplay: "", preload: "metadata", "aria-label": cs.title }));
    } else if (cls === "cs-cover" && cs.hero_url) {
      box.append(el("img", { src: cs.hero_url, alt: cs.title }));
    } else if (cs.cover_url) box.append(el("img", { src: cs.cover_url, alt: cs.title, loading: "lazy" }));
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

  // Home page: a few hand-picked projects as large rows.
  async function renderFeatured() {
    const box = $("[data-featured]");
    if (!box) return;
    const list = await getCaseStudies();
    const want = box.dataset.featured.split(",").map((x) => x.trim());
    const items = want.map((slug) => list.find((c) => c.slug === slug)).filter(Boolean);
    box.replaceChildren(...items.map((cs, i) => el("a", { class: "feature reveal in", href: `/case-study?slug=${encodeURIComponent(cs.slug)}` },
      cover(cs, "feature-media"),
      el("div", { class: "feature-text" },
        el("span", { class: "label", text: String(i + 1).padStart(2, "0") + " · " + (cs.category || "") }),
        el("h3", { class: "display-md", text: cs.title }),
        el("p", { class: "feature-client", text: cs.client || "" }),
        el("p", { class: "feature-summary", text: cs.summary || "" }),
        cs.stat ? el("p", { class: "feature-stat", text: cs.stat }) : null,
        el("span", { class: "feature-link", text: "View the world" })
      ))));
    $$("video", box).forEach((v) => { v.muted = true; const p = v.play(); if (p && p.catch) p.catch(() => {}); });
  }

  async function renderGallery() {
    const g = $("[data-gallery]");
    if (!g) return;
    const media = await getMedia();
    if (!media.length) { g.closest("section")?.setAttribute("hidden", ""); return; }
    g.replaceChildren(...media.map(mediaItem));
  }

  function chapters(list) {
    const media = (src) => /\.mp4$/i.test(src)
      ? el("video", { src, muted: "", loop: "", playsinline: "", autoplay: "", preload: "metadata" })
      : el("img", { src, alt: "", loading: "lazy" });
    return el("div", { class: "chapters" }, list.map((c) =>
      el("section", { class: "chapter reveal in" },
        el("div", { class: "chapter-text" },
          el("span", { class: "label", text: c.label }),
          el("h2", { class: "display-md", text: c.title }),
          el("p", { class: "lede", text: c.body }),
          c.list ? el("ol", { class: "chapter-list" }, c.list.map((li) => el("li", {}, el("strong", { text: li[0] }), el("span", { text: li[1] })))) : null),
        (c.media && c.media.length) ? el("div", { class: "chapter-media count-" + Math.min(c.media.length, 6) }, c.media.map((m) => el("figure", {}, media(m)))) : null
      )));
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
    const world = cs.world_url ? el("section", { class: "hero cs-world" },
      el("div", { class: "hero-media" }, el("video", { class: "hero-video", src: cs.world_url, poster: cs.world_url.replace(/\.mp4$/, ".jpg"), muted: "", loop: "", playsinline: "", autoplay: "", preload: "auto", "aria-hidden": "true" })),
      el("div", { class: "hero-shade", "aria-hidden": "true" }),
      el("div", { class: "wrap hero-row" },
        el("span", { class: "label world-tag", text: "The world" }),
        el("h1", { class: "display hero-title", text: cs.title }))) : null;
    const head = el("header", { class: "cs-head" },
      el("span", { class: "label", text: cs.category || "" }),
      world ? null : el("h1", { class: "display", text: cs.title }),
      el("p", { class: "cs-client", text: cs.client || "" }),
      cs.stat ? el("p", { class: "cs-stat", text: cs.stat }) : null,
      cs.chapters && cs.summary ? el("p", { class: "lede", text: cs.summary }) : null,
      cs.quote ? el("blockquote", { class: "cs-quote display-sm", text: cs.quote }) : null);
    const hasCover = cs.cover_url || cs.video_url;
    root.replaceChildren(...[
      cs.chapters ? (hasCover ? el("div", { class: "cs-top" }, head, cover(cs, "cs-cover tall")) : head) : head,
      cs.chapters ? null : cover(cs, "cs-cover"),
      cs.chapters ? chapters(cs.chapters) : null,
      cs.chapters ? null : el("div", { class: "cs-grid" },
        block("Context", el("p", { text: cs.context || "" })),
        block("Insight", el("p", { text: cs.insight || "" })),
        block("Objective", ul(cs.objective)),
        block("Execution", ul(cs.execution))
      ),
      asList(cs.results).length ? el("div", { class: "cs-results" }, el("span", { class: "label", text: "Results" }), ul(cs.results)) : null,
      cs.note ? el("p", { class: "cs-note label", text: cs.note }) : null,
      cs.served ? el("div", { class: "cs-served" }, el("span", { class: "label", text: "Who it served" }), el("p", { class: "display-sm", text: cs.served })) : null
    ].filter(Boolean));
    if (world) {
      root.closest("section").before(world);
      document.body.classList.add("over-film");
      $$("video", world).forEach((v) => { v.muted = true; const p = v.play(); if (p && p.catch) p.catch(() => {}); });
      headerOverFilm();
    }
    if (cs.gallery && cs.gallery.length) {
      root.append(el("div", { class: "cs-gallery" }, cs.gallery.map((src) => el("figure", {}, el("img", { src, alt: "", loading: "lazy" })))));
    }
    $$("video", root).forEach((v) => { v.muted = true; const p = v.play(); if (p && p.catch) p.catch(() => {}); });
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

  function headerOverFilm() {
    // Home page: header sits clear over the film, turns solid once you scroll past it or open the menu.
    if (!document.body.classList.contains("over-film")) return;
    const header = $(".site-header"), hero = $(".hero");
    if (!header || !hero) return;
    const update = () => {
      const past = hero.getBoundingClientRect().bottom <= header.offsetHeight;
      const menuOpen = $(".site-nav") && $(".site-nav").classList.contains("open");
      header.classList.toggle("solid", past || menuOpen);
    };
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    const btn = $(".nav-toggle"); if (btn) btn.addEventListener("click", () => setTimeout(update));
    update();
  }

  // Names each world in the opening film as it plays.
  function worldLabels() {
    const v = $("[data-hero-film]"), out = $("[data-world-label]");
    if (!v || !out) return;
    const worlds = (window.ATLAS_WORLDS || []);
    let current = -2;
    const tick = () => {
      const t = v.currentTime;
      const i = worlds.findIndex((w) => t >= w.start && t < w.start + w.length);
      if (i !== current) {
        current = i;
        out.classList.remove("show");
        if (i >= 0) {
          const w = worlds[i];
          setTimeout(() => {
            out.replaceChildren(...[
              el("span", { class: "world-num", text: String(i + 1).padStart(2, "0") }),
              w.href ? el("a", { href: w.href, text: w.name }) : el("span", { text: w.name }),
              w.note ? el("span", { class: "world-note", text: w.note }) : null].filter(Boolean));
            out.classList.add("show");
          }, 180);
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Repeat the logo row so the loop never runs out on wide screens.
  function fillMarquee() {
    const track = $(".marquee-track");
    if (!track) return;
    const set = $$("li:not([aria-hidden])", track);
    const fill = () => {
      const setWidth = set.reduce((w, li) => w + li.getBoundingClientRect().width, 0);
      if (!setWidth) return;
      $$("li[aria-hidden]", track).forEach((li) => li.remove());
      const copies = Math.max(1, Math.ceil(innerWidth / setWidth));
      const half = [];
      for (let c = 1; c < copies; c++) set.forEach((li) => half.push(li.cloneNode(true)));
      const clones = [...half.map((n) => n), ...set.map((li) => li.cloneNode(true)), ...half.map((n) => n.cloneNode(true))];
      clones.forEach((n) => { n.setAttribute("aria-hidden", "true"); const i = n.querySelector("img"); if (i) i.alt = ""; track.append(n); });
      track.style.animationDuration = Math.round(track.scrollWidth / 2 / 40) + "s"; // same pace on every screen
    };
    Promise.all($$("img", track).map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))).then(fill);
    let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(fill, 250); });
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
    wireNav(); wireForms(); fillMarquee(); heroVideo(); worldLabels(); if (matchMedia("(prefers-reduced-motion: reduce)").matches) $$("video[autoplay]").forEach((v) => { v.removeAttribute("autoplay"); v.pause(); }); headerOverFilm(); revealOnScroll();
    renderWorkGrids(); renderFeatured(); renderGallery(); renderCaseStudy();
  });
})();
