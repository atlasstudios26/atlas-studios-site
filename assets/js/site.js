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

  function workOrder(list) {
    const cfg = window.ATLAS_CONFIG || {}, hide = new Set(cfg.hiddenWork || []);
    return list.filter((c) => !hide.has(c.slug)).sort((a, b) => (b.slug === cfg.leadWork) - (a.slug === cfg.leadWork));
  }
  async function getCaseStudies() {
    return workOrder(await getCaseStudiesRaw());
  }
  async function getCaseStudiesRaw() {
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

  // Work page: index of worlds with hover previews, a grid view and service filters.
  async function renderWorkPage() {
    const box = $("[data-work-list]"); if (!box) return;
    const list = await getCaseStudies();
    const peek = $("[data-work-peek]");
    let view = "index", filter = "all";
    const decks = new Set();
    if (db) { const { data } = await db.from("decks").select("case_study_slug").eq("published", true); (data || []).forEach((d) => d.case_study_slug && decks.add(d.case_study_slug)); }
    const soon = (cs) => /coming soon/i.test(cs.category || "");
    const tags = (cs) => el("span", { class: "w-tags" },
      soon(cs) ? el("b", { class: "tag-soon", text: "Coming soon" }) : null,
      decks.has(cs.slug) ? el("b", { class: "tag-lock", text: "🔒︎ Private deck" }) : null);
    const draw = () => {
      const items = list.filter((c) => filter === "all" || (c.services || []).includes(filter));
      box.className = "work-list view-" + view;
      if (!items.length) { box.replaceChildren(el("p", { class: "lede", text: "No worlds here yet. This one could be yours." })); return; }
      if (view === "index") {
        box.replaceChildren(...items.map((cs, i) => el("a", { class: "w-row", href: `/case-study?slug=${encodeURIComponent(cs.slug)}`, "data-slug": cs.slug },
          el("span", { class: "w-num", text: String(i + 1).padStart(2, "0") }),
          el("span", { class: "w-title", text: cs.title }),
          el("span", { class: "w-meta" }, el("span", { text: cs.client || "" }), el("span", { class: "w-stat", text: (cs.stat && !soon(cs)) ? cs.stat : (cs.services || []).join(" · ") }), tags(cs)),
          el("span", { class: "w-go", text: "→" }))));
      } else {
        box.replaceChildren(...items.map((cs) => {
          const fig = el("div", { class: "w-media" });
          if (cs.cover_url) fig.append(el("img", { src: cs.cover_url, alt: cs.title, loading: "lazy" }));
          else fig.append(el("span", { class: "w-media-type", text: cs.title }));
          if (cs.video_url && !reduceMotion()) { const v = el("video", { class: "hover-video", src: cs.video_url, muted: "", loop: "", playsinline: "", preload: "none" }); v.muted = true; fig.append(v); }
          const card = el("a", { class: "w-card", href: `/case-study?slug=${encodeURIComponent(cs.slug)}` }, fig,
            el("span", { class: "label", text: (cs.services || []).join(" · ") }),
            el("h3", { text: cs.title }), el("p", { text: cs.client || "" }), cs.stat && !soon(cs) ? el("p", { class: "w-stat", text: cs.stat }) : null, tags(cs));
          const v = $("video", card);
          if (v) { card.addEventListener("mouseenter", () => { card.classList.add("playing"); v.play().catch(() => {}); }); card.addEventListener("mouseleave", () => { card.classList.remove("playing"); v.pause(); }); }
          return card;
        }));
      }
    };
    // Cursor-following preview for the index.
    const hover = matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!hover) view = "grid";
    let tx = 0, ty = 0, px = 0, py = 0, running = false;
    const loop = () => { px += (tx - px) * 0.18; py += (ty - py) * 0.18; peek.style.transform = `translate(${px}px, ${py}px)`; if (running) requestAnimationFrame(loop); };
    box.addEventListener("pointermove", (e) => { tx = e.clientX + 28; ty = e.clientY - 140; });
    box.addEventListener("pointerover", (e) => {
      const row = e.target.closest(".w-row"); if (!row || view !== "index" || !hover) return;
      const cs = list.find((c) => c.slug === row.dataset.slug);
      peek.replaceChildren();
      if (cs.video_url && !reduceMotion()) { const v = el("video", { src: cs.video_url, muted: "", loop: "", playsinline: "", autoplay: "" }); v.muted = true; peek.append(v); v.play().catch(() => {}); }
      else if (cs.cover_url) peek.append(el("img", { src: cs.cover_url, alt: "" }));
      else peek.append(el("span", { text: "Photos coming soon" }));
      peek.classList.add("show"); box.classList.add("peeking"); row.classList.add("hot");
      if (!running) { running = true; px = tx; py = ty; loop(); }
    });
    box.addEventListener("pointerout", (e) => {
      const row = e.target.closest(".w-row"); if (row && !row.contains(e.relatedTarget)) row.classList.remove("hot");
      if (!box.contains(e.relatedTarget)) { peek.classList.remove("show"); box.classList.remove("peeking"); running = false; }
    });
    $$("[data-filter]").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.filter; $$("[data-filter]").forEach((x) => x.classList.toggle("on", x === b)); draw(); }));
    $$("[data-view]").forEach((b) => { b.classList.toggle("on", b.dataset.view === view); b.addEventListener("click", () => { view = b.dataset.view; $$("[data-view]").forEach((x) => x.classList.toggle("on", x === b)); draw(); }); });
    draw();
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
    const media = (cs, lead) => {
      const fig = el("div", { class: "feature-media" });
      const still = (lead && cs.wide_cover_url) || cs.cover_url;
      if (still) fig.append(el("img", { src: still, alt: cs.title, loading: "lazy" }));
      else fig.append(el("img", { class: "cover-mark", src: "/assets/img/atlas-mark-bone.png", alt: "" }));
      if (cs.video_url && !lead && !reduceMotion()) {
        const v = el("video", { class: "hover-video", src: cs.video_url, muted: "", loop: "", playsinline: "", preload: "metadata", "aria-hidden": "true" });
        v.muted = true; fig.append(v); fig.classList.add("has-video");
      }
      return fig;
    };
    box.replaceChildren(...items.map((cs, i) => el("a", { class: "feature reveal in", href: `/case-study?slug=${encodeURIComponent(cs.slug)}` },
      media(cs, i === 0),
      el("div", { class: "feature-text" },
        el("span", { class: "label", text: String(i + 1).padStart(2, "0") + " · " + (cs.category || "") }),
        el("h3", { class: "display-md", text: cs.title, "data-split": "" }),
        el("p", { class: "feature-client", text: cs.client || "" }),
        el("p", { class: "feature-summary", text: cs.summary || "" }),
        cs.stat ? el("p", { class: "feature-stat", text: cs.stat }) : null,
        el("span", { class: "feature-link", text: "View the world" })
      ))));
    // Size every frame to its own image so nothing is cropped.
    $$(".feature-media img:not(.cover-mark)", box).forEach((img) => {
      const fit = () => { if (img.naturalWidth) img.parentElement.style.aspectRatio = img.naturalWidth + " / " + img.naturalHeight; };
      img.complete ? fit() : img.addEventListener("load", fit);
    });
    // Recap videos play on hover (or while on screen for touch devices).
    const hover = matchMedia("(hover: hover)").matches;
    $$(".feature", box).forEach((card) => {
      const v = $(".hover-video", card); if (!v) return;
      const play = () => { card.classList.add("playing"); const p = v.play(); if (p && p.catch) p.catch(() => {}); };
      const stop = () => { card.classList.remove("playing"); v.pause(); };
      if (hover) { card.addEventListener("mouseenter", play); card.addEventListener("mouseleave", stop); }
      else new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? play() : stop())), { threshold: 0.6 }).observe(card);
    });
    splitWords();
  }

  async function renderGallery() {
    const g = $("[data-gallery]");
    if (!g) return;
    const media = await getMedia();
    if (!media.length) { g.closest("section")?.setAttribute("hidden", ""); return; }
    g.replaceChildren(...media.map(mediaItem));
  }

  // Instagram posts: each one is Instagram's own player in a frame (plays in place;
  // the account name and caption link out to Instagram). Six shown, rest on request.
  const IG_PROFILE = "https://www.instagram.com/edmondshonorbourbon/";
  function igGrid(urls) {
    // Instagram's own embed code: a placeholder card that embed.js turns into the live post.
    const post = (u) => {
      const id = (u.match(/instagram\.com\/(?:p|reel)\/([^/?#]+)/) || [])[1];
      if (!id) return null;
      const link = `https://www.instagram.com/reel/${id}/?utm_source=ig_embed&utm_campaign=loading`;
      return el("blockquote", { class: "instagram-media", "data-instgrm-permalink": link, "data-instgrm-version": "14" },
        el("a", { href: link, target: "_blank", rel: "noopener", text: "View this post on Instagram" }));
    };
    const grid = el("div", { class: "chapter-ig" }, urls.slice(0, 6).map(post).filter(Boolean));
    const actions = el("div", { class: "ig-actions" },
      el("a", { class: "btn", href: IG_PROFILE, target: "_blank", rel: "noopener", text: "Follow @edmondshonorbourbon" }));
    if (urls.length > 6) {
      const more = el("button", { class: "btn", type: "button", text: `Show all ${urls.length} posts` });
      more.addEventListener("click", () => { urls.slice(6).map(post).filter(Boolean).forEach((n) => grid.append(n)); more.remove(); igProcess(); });
      actions.prepend(more);
    }
    setTimeout(igProcess, 0);
    return el("div", { class: "ig-wrap" }, grid, actions);
  }
  function igProcess() {
    if (window.instgrm) { window.instgrm.Embeds.process(); return; }
    if (document.getElementById("ig-embed-js")) return;
    const sc = document.createElement("script"); sc.id = "ig-embed-js"; sc.async = true; sc.src = "https://www.instagram.com/embed.js";
    sc.onload = () => window.instgrm && window.instgrm.Embeds.process();
    document.body.append(sc);
  }
  // Instagram tells each frame how tall its post is; size the frame to fit.
  window.addEventListener("message", (e) => {
    if (!/instagram\.com$/.test(new URL(e.origin).hostname)) return;
    let d = e.data; try { if (typeof d === "string") d = JSON.parse(d); } catch (_) { return; }
    const h = d && d.type === "MEASURE" && d.details && d.details.height;
    if (!h) return;
    document.querySelectorAll(".ig-post iframe").forEach((f) => { if (f.contentWindow === e.source) f.style.height = h + "px"; });
  });

  // The series wall: self-hosted silent loops of each Reel, grouped, each opening Instagram.
  function reelWall(reels) {
    const groups = [];
    reels.forEach((r) => { let g = groups.find((x) => x.name === r.group); if (!g) groups.push(g = { name: r.group, items: [] }); g.items.push(r); });
    const tile = (r) => {
      const v = el("video", { src: r.src, poster: r.poster, muted: "", loop: "", playsinline: "", preload: "none", "aria-hidden": "true" });
      const a = el("a", { class: "reel", href: r.href, target: "_blank", rel: "noopener", "aria-label": `${r.title} on Instagram` },
        el("div", { class: "reel-frame" }, v, el("span", { class: "reel-ig", text: "Watch on Instagram ↗" })),
        el("div", { class: "reel-cap" }, el("strong", { text: r.title }), el("span", { text: r.credit })));
      return a;
    };
    const wall = el("div", { class: "reel-wall" }, groups.map((g) =>
      el("div", { class: "reel-group" }, el("span", { class: "label", text: g.name }),
        el("div", { class: "reel-row n" + g.items.length }, g.items.map(tile)))),
      el("div", { class: "ig-actions" }, el("a", { class: "btn", href: reels[0].href, target: "_blank", rel: "noopener", text: "Watch the full series on Instagram" })));
    // play loops only while on screen
    const io = new IntersectionObserver((es) => es.forEach((e) => { const v = e.target; v.muted = true; if (e.isIntersecting) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } else v.pause(); }), { threshold: 0.35 });
    requestAnimationFrame(() => wall.querySelectorAll("video").forEach((v) => io.observe(v)));
    return wall;
  }

  function chapters(list) {
    const media = (src) => /\.mp4$/i.test(src)
      ? el("video", { src, muted: "", loop: "", playsinline: "", autoplay: "", preload: "metadata" })
      : el("img", { src, alt: "", loading: "lazy" });
    return el("div", { class: "chapters" }, list.map((c) =>
      el("section", { class: "chapter reveal in" },
        el("div", { class: "chapter-text" },
          el("span", { class: "label", text: c.label }),
          el("h2", { class: "display-md", text: c.title, "data-split": "" }),
          el("p", { class: "lede", text: c.body }),
          c.list ? el("ol", { class: "chapter-list" }, c.list.map((li) => el("li", {}, el("strong", { text: li[0] }), el("span", { text: li[1] })))) : null),
        (c.instagram && c.instagram.length) ? igGrid(c.instagram) : null,
        (c.reels && c.reels.length) ? reelWall(c.reels) : null,
        (c.media && c.media.length) ? el("div", { class: "chapter-media count-" + Math.min(c.media.filter((m) => !/-wide/.test(m)).length, 6) }, c.media.map((m) => el("figure", { class: /-wide/.test(m) ? "wide" : null }, media(m)))) : null
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
      cs.chapters && cs.summary ? el("p", { class: "scrub scrub-md", "data-scrub": "", text: cs.summary }) : null,
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
    splitWords(); scrubText();
    if (world) {
      root.closest("section").before(world);
      document.body.classList.add("over-film");
      $$("video", world).forEach((v) => { v.muted = true; const p = v.play(); if (p && p.catch) p.catch(() => {}); });
      headerOverFilm();
    }
    // Private decks for this project appear as locked cards (set up in /admin).
    if (db) db.from("decks").select("slug, title").eq("case_study_slug", cs.slug).eq("published", true).then(({ data }) => {
      (data || []).forEach((d) => root.append(el("a", { class: "deck-lock", href: `/deck?d=${encodeURIComponent(d.slug)}` },
        el("span", { class: "deck-lock-icon", "aria-hidden": "true", text: "🔒︎" }),
        el("div", {}, el("span", { class: "label", text: "Private deck · access code required" }), el("h3", { text: d.title }), el("p", { text: "See the strategy behind the world. Request access or enter your code." })),
        el("span", { class: "deck-lock-go", text: "→" }))));
    });
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

  // Contact: three-step form.
  // The world settles onto Atlas's shoulders when it comes into view.
  function atlasSettle() {
    $$("[data-atlas]").forEach((a) => {
      new IntersectionObserver((es, o) => es.forEach((e) => { if (e.isIntersecting) { setTimeout(() => a.classList.add("in"), 200); o.disconnect(); } }), { threshold: 0.1 }).observe(a);
    });
  }

  function wireSteps() {
    const form = $("[data-steps]"); if (!form) return;
    const steps = $$(".step", form), dots = $$(".step-dots li", form);
    const back = $("[data-step-back]", form), next = $("[data-step-next]", form), send = $("[data-step-send]", form);
    let i = 0;
    const go = (n) => {
      i = n;
      steps.forEach((s, k) => s.classList.toggle("on", k === i));
      dots.forEach((d, k) => d.classList.toggle("on", k <= i));
      back.hidden = i === 0; next.hidden = i === steps.length - 1; send.hidden = i !== steps.length - 1;
      const first = $("input:not(.hp), textarea", steps[i]); if (first && i) first.focus({ preventScroll: true });
    };
    const valid = () => $$("input, textarea, select", steps[i]).every((f) => f.reportValidity());
    next.addEventListener("click", () => { if (valid()) go(i + 1); });
    back.addEventListener("click", () => go(i - 1));
    $$('input[name="project_type"]', form).forEach((r) => r.addEventListener("change", () => setTimeout(() => go(1), 250)));
    form.addEventListener("reset", () => setTimeout(() => go(0)));
  }

  // Email Avery a copy of each new inquiry (Web3Forms). Saved in /admin either way.
  function notify(table, data) {
    const key = (window.ATLAS_CONFIG || {}).notifyKey;
    if (!key || table !== "inquiries") return;
    const body = Object.assign({ access_key: key, subject: `New Atlas inquiry from ${data.name || "the website"}`, from_name: "Atlas website" }, data);
    if (data.email) body.replyto = data.email;
    fetch("https://api.web3forms.com/submit", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) }).catch(() => {});
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
        notify(form.dataset.table, data);
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
              w.href ? el("a", { class: "world-go", href: w.href }, el("span", { text: w.name }), el("b", { text: "Enter →" })) : el("span", { text: w.name }),
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


  // About: the six-layer wheel. Each segment opens a real example.
  function ecoWheel() {
    const box = $("[data-eco-wheel]"), panel = $("[data-eco-panel]");
    const layers = window.ATLAS_LAYERS;
    if (!box || !panel || !layers) return;
    const NS = "http://www.w3.org/2000/svg", cx = 250, cy = 250, R = 220, r = 128, gap = 2.2;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 500 500");
    const pt = (rad, deg) => { const a = (deg - 90) * Math.PI / 180; return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)]; };
    const segs = layers.map((L, i) => {
      const a0 = i * 60 + gap, a1 = (i + 1) * 60 - gap;
      const [x0, y0] = pt(R, a0), [x1, y1] = pt(R, a1), [x2, y2] = pt(r, a1), [x3, y3] = pt(r, a0);
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "eco-seg"); g.setAttribute("tabindex", "0"); g.setAttribute("role", "button");
      g.setAttribute("aria-label", L.name);
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", `M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 0 0 ${x3},${y3} Z`);
      const [tx, ty] = pt((R + r) / 2, i * 60 + 30);
      const num = document.createElementNS(NS, "text");
      num.setAttribute("x", tx); num.setAttribute("y", ty - 9); num.setAttribute("class", "eco-num"); num.textContent = String(i + 1).padStart(2, "0");
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", tx); t.setAttribute("y", ty + 11); t.textContent = L.name;
      g.append(path, num, t);
      g.addEventListener("click", () => { stop(); show(i); });
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); stop(); show(i); } });
      g.addEventListener("mouseenter", () => { if (matchMedia("(hover: hover)").matches) { stop(); show(i); } });
      svg.append(g); return g;
    });
    const core = document.createElementNS(NS, "g"); core.setAttribute("class", "eco-core");
    const c = document.createElementNS(NS, "circle"); c.setAttribute("cx", cx); c.setAttribute("cy", cy); c.setAttribute("r", r - 14);
    const img = document.createElementNS(NS, "image"); img.setAttribute("href", "/assets/img/atlas-mark-bone.png");
    img.setAttribute("x", cx - 34); img.setAttribute("y", cy - 52); img.setAttribute("width", 68); img.setAttribute("height", 68);
    const ct = document.createElementNS(NS, "text"); ct.setAttribute("x", cx); ct.setAttribute("y", cy + 42); ct.textContent = "The story";
    core.append(c, img, ct); svg.append(core);
    box.append(svg);
    let current = -1, timer = null;
    function show(i) {
      if (i === current) return; current = i;
      segs.forEach((g, j) => g.classList.toggle("on", j === i));
      const L = layers[i];
      panel.classList.remove("in");
      panel.replaceChildren(
        el("figure", {}, el("img", { src: L.img, alt: "" })),
        el("span", { class: "label", text: String(i + 1).padStart(2, "0") + " · " + L.name }),
        el("h3", { class: "display-sm", text: L.line }),
        el("p", { text: L.example }),
        el("a", { class: "text-link", href: L.href, text: "See it built" }));
      requestAnimationFrame(() => panel.classList.add("in"));
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    show(0);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Turn the wheel slowly until someone takes over.
      const io = new IntersectionObserver((es) => es.forEach((e) => {
        if (e.isIntersecting && !timer && current !== -2) timer = setInterval(() => show((current + 1) % layers.length), 4200);
        if (!e.isIntersecting) stop();
      }), { threshold: 0.4 });
      io.observe(box);
      box.addEventListener("pointerdown", () => { stop(); current = current; io.disconnect(); }, { once: true });
      segs.forEach((g) => g.addEventListener("click", () => io.disconnect()));
    }
  }

  // About: step-by-step track for how a world gets built.
  function buildTrack() {
    const track = $("[data-build-track]");
    if (!track) return;
    const list = $("ol", track), items = $$("li", list), bar = $("[data-build-bar]");
    const step = () => items[0].getBoundingClientRect().width + parseFloat(getComputedStyle(list).columnGap || 0);
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      if (bar) bar.style.width = (max > 0 ? 18 + 82 * track.scrollLeft / max : 100) + "%";
    };
    track.addEventListener("scroll", update, { passive: true });
    const prev = $("[data-build-prev]"), next = $("[data-build-next]");
    if (prev) prev.addEventListener("click", () => track.scrollBy({ left: -step(), behavior: "smooth" }));
    if (next) next.addEventListener("click", () => track.scrollBy({ left: step(), behavior: "smooth" }));
    update();
  }


  const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Split headings into words that rise into place when they enter the screen.
  function splitWords() {
    $$("[data-split]").forEach((node) => {
      if (node.dataset.splitDone) return;
      node.dataset.splitDone = "1";
      const words = node.textContent.trim().split(/\s+/);
      node.setAttribute("aria-label", node.textContent.trim());
      node.replaceChildren(...words.map((w, i) => {
        const outer = el("span", { class: "w", "aria-hidden": "true" });
        const inner = el("span", { text: w });
        inner.style.transitionDelay = (i * 55) + "ms";
        outer.append(inner); return [outer, document.createTextNode(" ")];
      }).flat());
    });
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("split-in"); io.unobserve(e.target); } }), { threshold: 0.2 });
    $$("[data-split]").forEach((n) => reduceMotion() ? n.classList.add("split-in") : io.observe(n));
  }

  // A paragraph whose words light up as you scroll through it.
  function scrubText() {
    const nodes = $$("[data-scrub]:not([data-scrub-done])");
    if (!nodes.length) return;
    nodes.forEach((n) => n.setAttribute("data-scrub-done", ""));
    nodes.forEach((node) => {
      const words = node.textContent.trim().split(/\s+/);
      node.setAttribute("aria-label", node.textContent.trim());
      node.replaceChildren(...words.map((w) => [el("span", { class: "sw", text: w, "aria-hidden": "true" }), document.createTextNode(" ")]).flat());
    });
    const tick = () => {
      nodes.forEach((node) => {
        const r = node.getBoundingClientRect(), vh = innerHeight;
        const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
        const ws = node.querySelectorAll(".sw"), lit = Math.round(p * ws.length);
        ws.forEach((w, i) => w.classList.toggle("lit", i < lit));
      });
    };
    if (reduceMotion()) { $$(".sw").forEach((w) => w.classList.add("lit")); return; }
    addEventListener("scroll", tick, { passive: true }); tick();
  }

  // The ecosystem as a solar system: six layers orbit the story.
  function orbitSystem() {
    const sys = $("[data-orbit]"), card = $("[data-planet-card]"), layers = window.ATLAS_LAYERS;
    if (!sys || !card || !layers) return;
    const planets = $$("[data-planet]", sys);
    let current = -1;
    function show(i) {
      current = i;
      sys.classList.add("focused");
      planets.forEach((p) => p.classList.toggle("on", +p.dataset.planet === i));
      const L = layers[i];
      card.classList.remove("in");
      card.replaceChildren(
        el("button", { class: "card-close", type: "button", "aria-label": "Close", text: "×" }),
        el("figure", {}, el("img", { src: L.img, alt: "" })),
        el("span", { class: "label", text: String(i + 1).padStart(2, "0") + " · " + L.name }),
        el("h3", { text: L.line }),
        el("p", { text: L.example }),
        el("a", { class: "text-link", href: L.href, text: "See it built" }));
      $(".card-close", card).addEventListener("click", hide);
      requestAnimationFrame(() => card.classList.add("in"));
    }
    function hide() { current = -1; sys.classList.remove("focused"); planets.forEach((p) => p.classList.remove("on")); card.classList.remove("in"); }
    planets.forEach((p) => p.addEventListener("click", () => (+p.dataset.planet === current ? hide() : show(+p.dataset.planet))));
    addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  }

  // How a world gets built: the world forms as you scroll the steps.
  function processScrolly() {
    const sec = $("[data-process]");
    if (!sec) return;
    const steps = $$(".proc-step", sec), num = $("[data-process-num]", sec);
    const set = (n) => {
      sec.style.setProperty("--step", n);
      $$(".wf", sec).forEach((g, i) => g.classList.toggle("on", i < n));
      steps.forEach((s) => s.classList.toggle("active", +s.dataset.step === n));
      if (num) num.textContent = String(n).padStart(2, "0");
    };
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) set(+e.target.dataset.step); }), { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach((s) => io.observe(s));
    set(1);
  }

  // Big numbers count up when they arrive.
  function countUp() {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return; io.unobserve(e.target);
      const n = e.target, to = +n.dataset.count, pre = n.dataset.prefix || "", suf = n.dataset.suffix || "";
      if (reduceMotion()) return;
      const t0 = performance.now(), dur = 1600;
      const step = (t) => { const k = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - k, 3)));
        n.textContent = pre + v.toLocaleString("en-US") + suf; if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }), { threshold: 0.5 });
    $$("[data-count]").forEach((n) => io.observe(n));
  }

  // A small orbit cursor that grows over anything you can click (desktop only).
  function orbitCursor() {
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches || reduceMotion()) return;
    const dot = el("div", { class: "cursor-dot", "aria-hidden": "true" }), ring = el("div", { class: "cursor-ring", "aria-hidden": "true" });
    document.body.append(ring, dot); document.documentElement.classList.add("has-cursor");
    let x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y;
    addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; dot.style.transform = `translate(${x}px,${y}px)`; }, { passive: true });
    const loop = () => { rx += (x - rx) * 0.16; ry += (y - ry) * 0.16; ring.style.transform = `translate(${rx}px,${ry}px)`; requestAnimationFrame(loop); };
    loop();
    document.addEventListener("pointerover", (e) => ring.classList.toggle("big", !!e.target.closest("a, button, [data-planet], video, .feature")));
    document.addEventListener("pointerleave", () => ring.classList.add("hide"));
    document.addEventListener("pointerenter", () => ring.classList.remove("hide"));
  }

  // Images wipe open as they come into view. (A clipped element never counts as visible, so watch its parent.)
  function imageReveal() {
    if (reduceMotion()) return;
    const SEL = ".feature-media, .chapter-media figure, .cs-gallery figure, .lenses video, .founder-full";
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      $$(":scope > .wipe:not(.wipe-in)", e.target).forEach((t) => t.classList.add("wipe-in"));
    }), { threshold: 0.1 });
    const add = (t) => { if (t.classList.contains("wipe")) return; t.classList.add("wipe"); if (t.parentElement) io.observe(t.parentElement); };
    $$(SEL).forEach(add);
    new MutationObserver(() => $$(SEL).forEach(add)).observe(document.body, { childList: true, subtree: true });
  }

  // Capabilities: pick a service, its panel swaps in.
  function serviceTabs() {
    const tabs = $$("[data-svc]"); if (!tabs.length) return;
    const panels = $$("[data-svc-panel]");
    const show = (i) => {
      tabs.forEach((t) => t.classList.toggle("on", t.dataset.svc === i));
      panels.forEach((p) => p.classList.toggle("on", p.dataset.svcPanel === i));
    };
    // Phones: each service name opens and closes its own panel.
    panels.forEach((p) => {
      const name = p.querySelector(".svc-name"); if (!name) return;
      name.setAttribute("role", "button"); name.setAttribute("tabindex", "0"); name.setAttribute("aria-expanded", "false");
      const toggle = () => { const open = p.classList.toggle("open"); name.setAttribute("aria-expanded", String(open)); };
      name.addEventListener("click", toggle);
      name.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    });
    tabs.forEach((t) => {
      t.addEventListener("click", () => show(t.dataset.svc));
      if (matchMedia("(hover: hover)").matches) t.addEventListener("mouseenter", () => show(t.dataset.svc));
    });
  }

  // Ticket buttons switch to the ticket link once it's set in config.js.
  function ticketLinks() {
    $$("[data-ticket-link]").forEach((a) => {
      const url = cfg.houseOfRougeTickets;
      if (a.dataset.ticketLink === "houseOfRouge" && url) { a.href = url; a.textContent = "Get tickets"; a.target = "_blank"; a.rel = "noopener"; }
    });
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
    wireNav(); wireForms(); atlasSettle(); wireSteps(); serviceTabs(); ticketLinks(); fillMarquee(); heroVideo(); worldLabels(); if (matchMedia("(prefers-reduced-motion: reduce)").matches) $$("video[autoplay]").forEach((v) => { v.removeAttribute("autoplay"); v.pause(); }); headerOverFilm(); splitWords(); scrubText(); orbitSystem(); processScrolly(); countUp(); orbitCursor(); imageReveal(); ecoWheel(); buildTrack(); revealOnScroll();
    renderWorkGrids(); renderWorkPage(); renderFeatured(); renderGallery(); renderCaseStudy();
  });
})();
