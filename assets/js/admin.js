// Atlas Studios admin: manage case studies, media, inquiries, and subscribers.
document.addEventListener("DOMContentLoaded", async () => {
  const { db, el, asList } = window.ATLAS;
  const $ = (s) => document.querySelector(s);
  const show = (n, on = true) => { if (n) n.hidden = !on; };
  if (!db) { show($("#no-config")); return; }

  const BUCKET = "media";
  let cases = [];

  async function session() { return (await db.auth.getSession()).data.session; }
  async function boot() {
    const s = await session();
    show($("#login"), !s); show($("#app"), !!s); show($("#signout"), !!s);
    if (s) { await loadCases(); loadMedia(); loadInquiries(); loadSubscribers(); }
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#login-status").textContent = "Signing in...";
    const { error } = await db.auth.signInWithPassword({ email: $("#le").value, password: $("#lp").value });
    $("#login-status").textContent = error ? error.message : "";
    boot();
  });
  $("#signout").addEventListener("click", async (e) => { e.preventDefault(); await db.auth.signOut(); boot(); });

  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    document.querySelectorAll("[data-pane]").forEach((p) => show(p, p.dataset.pane === b.dataset.tab));
  }));

  async function upload(file, folder) {
    const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "_");
    const path = `${folder}/${Date.now()}_${safe}`;
    const { error } = await db.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  // ----- Case studies -----
  const form = $("#case-form");
  async function loadCases() {
    const { data, error } = await db.from("case_studies").select("*").order("sort_order");
    if (error) { $("#case-rows").replaceChildren(el("tr", {}, el("td", { colspan: 5, text: error.message }))); return; }
    cases = data;
    $("#case-rows").replaceChildren(...cases.map((c) => el("tr", {},
      el("td", { text: c.sort_order }), el("td", { text: c.title }), el("td", { text: c.category || "" }),
      el("td", { text: c.published ? "Yes" : "No" }),
      el("td", { class: "row-actions" },
        (() => { const b = el("button", { class: "btn", type: "button" }, "Edit"); b.onclick = () => edit(c); return b; })(),
        (() => { const b = el("button", { class: "btn", type: "button" }, "Delete"); b.onclick = () => removeCase(c); return b; })()
      )
    )));
    const sel = $("#media-case");
    sel.replaceChildren(el("option", { value: "" }, "None, archive only"), ...cases.map((c) => el("option", { value: c.id }, c.title)));
  }
  function edit(c = {}) {
    form.reset();
    form.elements.id.value = c.id || "";
    for (const k of ["title", "slug", "client", "category", "summary", "context", "insight"]) form.elements[k].value = c[k] || "";
    for (const k of ["objective", "execution", "results"]) form.elements[k].value = asList(c[k]).join("\n");
    form.elements.sort_order.value = c.sort_order ?? 10;
    form.elements.published.checked = c.published ?? true;
    $("#cover-current").textContent = c.cover_url ? "Current cover kept unless you choose a new file." : "";
    form.dataset.cover = c.cover_url || "";
    show(form); form.scrollIntoView({ behavior: "smooth" });
  }
  async function removeCase(c) {
    if (!confirm(`Delete "${c.title}"? This can't be undone.`)) return;
    await db.from("case_studies").delete().eq("id", c.id);
    loadCases();
  }
  $("#new-case").onclick = () => edit();
  $("#cancel-case").onclick = () => show(form, false);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const st = $("#case-status");
    st.textContent = "Saving...";
    try {
      let cover_url = form.dataset.cover || null;
      if (form.elements.cover.files[0]) cover_url = await upload(form.elements.cover.files[0], "covers");
      const row = {
        title: form.elements.title.value.trim(), slug: form.elements.slug.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), client: form.elements.client.value.trim(),
        category: form.elements.category.value.trim(), summary: form.elements.summary.value.trim(), context: form.elements.context.value.trim(),
        insight: form.elements.insight.value.trim(), objective: asList(form.elements.objective.value), execution: asList(form.elements.execution.value),
        results: asList(form.elements.results.value), sort_order: parseInt(form.elements.sort_order.value || "10", 10),
        published: form.elements.published.checked, cover_url
      };
      const id = form.elements.id.value;
      const { error } = id ? await db.from("case_studies").update(row).eq("id", id) : await db.from("case_studies").insert(row);
      if (error) throw error;
      st.textContent = "Saved."; show(form, false); loadCases();
    } catch (err) { st.textContent = err.message || "Save failed."; }
  });

  // ----- Media -----
  async function loadMedia() {
    const { data } = await db.from("media").select("*").order("created_at", { ascending: false });
    $("#media-list").replaceChildren(...(data || []).map((m) => {
      const fig = el("figure", {}, m.kind === "video" ? el("video", { src: m.url, muted: "", preload: "metadata" }) : el("img", { src: m.url, alt: "" }),
        el("figcaption", { text: m.event_name || m.caption || "" }));
      const del = el("button", { class: "btn", type: "button", style: "padding:4px 10px;margin-top:6px" }, "Remove");
      del.onclick = async () => { if (confirm("Remove this file from the site?")) { await db.from("media").delete().eq("id", m.id); loadMedia(); } };
      fig.append(del); return fig;
    }));
  }
  $("#media-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, st = $("#media-status");
    const files = Array.from(f.elements.files.files);
    try {
      for (let i = 0; i < files.length; i++) {
        st.textContent = `Uploading ${i + 1} of ${files.length}...`;
        const url = await upload(files[i], "library");
        const { error } = await db.from("media").insert({
          url, kind: files[i].type.startsWith("video") ? "video" : "image",
          event_name: f.elements.event_name.value.trim() || null, caption: f.elements.caption.value.trim() || null,
          case_study_id: f.elements.case_study_id.value || null
        });
        if (error) throw error;
      }
      st.textContent = "Uploaded."; f.reset(); loadMedia();
    } catch (err) { st.textContent = err.message || "Upload failed."; }
  });

  // ----- Inquiries & subscribers -----
  const day = (d) => new Date(d).toLocaleDateString();
  async function loadInquiries() {
    const { data } = await db.from("inquiries").select("*").order("created_at", { ascending: false });
    $("#inq-rows").replaceChildren(...(data || []).map((r) => el("tr", {},
      el("td", { text: day(r.created_at) }), el("td", {}, r.name, el("br"), el("a", { href: `mailto:${r.email}` }, r.email)),
      el("td", { text: r.company || "" }), el("td", { text: r.project_type || "" }), el("td", { text: r.budget || "" }),
      el("td", { text: [r.timeline, r.message].filter(Boolean).join(" · ") }))));
  }
  let subs = [];
  async function loadSubscribers() {
    const { data } = await db.from("subscribers").select("*").order("created_at", { ascending: false });
    subs = data || [];
    $("#sub-rows").replaceChildren(...subs.map((r) => el("tr", {}, el("td", { text: day(r.created_at) }), el("td", { text: r.email }))));
  }
  $("#export-subs").onclick = () => {
    const csv = "email,joined\n" + subs.map((r) => `${r.email},${r.created_at}`).join("\n");
    const a = el("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "atlas-email-list.csv" });
    document.body.append(a); a.click(); a.remove();
  };

  db.auth.onAuthStateChange(() => {});
  boot();
});
