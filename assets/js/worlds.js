/* Atlas · signature interactions for case-study worlds.
   Each world gets one: Nightmare = flashlight in the dark, Park 100 = harbor water that ripples.
   Respects reduced motion; falls back to the plain film if anything is unsupported. */
(function () {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function hint(world, text) {
    const h = document.createElement("span");
    h.className = "world-hint label"; h.textContent = text;
    world.append(h);
    const hide = () => h.classList.add("gone");
    world.addEventListener("pointermove", hide, { once: true });
    world.addEventListener("touchstart", hide, { once: true, passive: true });
    setTimeout(hide, 6000);
  }
  const touchy = matchMedia("(hover: none)").matches;

  // ---------- Flashlight: the scene is dark; your cursor (or finger) is the light ----------
  function flashlight(world) {
    const media = world.querySelector(".hero-media");
    const dark = document.createElement("div");
    dark.className = "world-dark"; dark.setAttribute("aria-hidden", "true");
    media.append(dark);
    let tx = 0.5, ty = 0.45, x = 0.5, y = 0.45, last = 0, t0 = performance.now();
    const set = (cx, cy) => {
      const r = media.getBoundingClientRect();
      tx = (cx - r.left) / r.width; ty = (cy - r.top) / r.height; last = performance.now();
    };
    world.addEventListener("pointermove", (e) => set(e.clientX, e.clientY));
    world.addEventListener("touchmove", (e) => { const t = e.touches[0]; if (t) set(t.clientX, t.clientY); }, { passive: true });
    function frame(now) {
      if (now - last > 2600) { // idle: the light wanders, like someone searching the dark
        const s = (now - t0) / 1000;
        tx = 0.5 + 0.32 * Math.sin(s * 0.45); ty = 0.48 + 0.18 * Math.sin(s * 0.8 + 1);
      }
      x += (tx - x) * 0.12; y += (ty - y) * 0.12;
      const flick = Math.random() < 0.025 ? 0.7 + Math.random() * 0.2 : 1; // the bulb stutters now and then
      const rect = media.getBoundingClientRect();
      const r = Math.max(rect.width, rect.height) * (touchy ? 0.26 : 0.2) * flick;
      dark.style.setProperty("--x", (x * 100).toFixed(2) + "%");
      dark.style.setProperty("--y", (y * 100).toFixed(2) + "%");
      dark.style.setProperty("--r", r.toFixed(0) + "px");
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    hint(world, touchy ? "Drag to look around" : "Move to look around");
  }

  // ---------- Water: the harbor ripples wherever you move ----------
  function water(world) {
    const media = world.querySelector(".hero-media");
    const video = media.querySelector("video");
    const canvas = document.createElement("canvas");
    canvas.className = "world-gl"; canvas.setAttribute("aria-hidden", "true");
    const gl = canvas.getContext("webgl", { premultipliedAlpha: false, antialias: false });
    if (!gl || !video) return;
    media.append(canvas);

    const GW = 192, GH = 108; // ripple grid
    let a = new Float32Array(GW * GH), b = new Float32Array(GW * GH);
    const bytes = new Uint8Array(GW * GH * 4);

    const vs = `attribute vec2 p; varying vec2 v; void main(){ v = p*0.5+0.5; v.y = 1.0-v.y; gl_Position = vec4(p,0.,1.); }`;
    const fs = `precision mediump float; varying vec2 v;
      uniform sampler2D vid; uniform sampler2D h; uniform vec2 scale; uniform vec2 px;
      float H(vec2 q){ return texture2D(h,q).r*2.0-1.0; }
      void main(){
        float l=H(v-vec2(px.x,0.)), r=H(v+vec2(px.x,0.)), u=H(v-vec2(0.,px.y)), d=H(v+vec2(0.,px.y));
        vec2 g = vec2(r-l, d-u);
        vec2 uv = (v-0.5)*scale+0.5 + g*0.022;
        vec3 c = texture2D(vid, clamp(uv,0.001,0.999)).rgb;
        float spec = pow(max(0., dot(normalize(vec3(-g*6.0,1.)), normalize(vec3(-0.4,-0.5,1.)))), 40.);
        c += spec*0.35*smoothstep(0.0,0.15,length(g));
        gl_FragColor = vec4(c,1.);
      }`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return; }
    gl.useProgram(prog);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
    const tVid = tex(0), tH = tex(1);
    gl.uniform1i(gl.getUniformLocation(prog, "vid"), 0);
    gl.uniform1i(gl.getUniformLocation(prog, "h"), 1);
    const uScale = gl.getUniformLocation(prog, "scale");
    gl.uniform2f(gl.getUniformLocation(prog, "px"), 1 / GW, 1 / GH);

    function size() {
      const r = media.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      const va = (video.videoWidth || 16) / (video.videoHeight || 9), ca = r.width / r.height; // cover fit, like the film
      gl.uniform2f(uScale, ca > va ? 1 : ca / va, ca > va ? va / ca : 1);
    }
    addEventListener("resize", size);

    function drop(gx, gy, rad, str) {
      for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) {
        const X = gx + i, Y = gy + j; if (X < 1 || Y < 1 || X >= GW - 1 || Y >= GH - 1) continue;
        const d = Math.sqrt(i * i + j * j); if (d > rad) continue;
        a[Y * GW + X] += str * (Math.cos(d / rad * Math.PI) * 0.5 + 0.5);
      }
    }
    let lx = -1, ly = -1;
    const stir = (cx, cy) => {
      const r = media.getBoundingClientRect();
      const gx = Math.round((cx - r.left) / r.width * GW), gy = Math.round((cy - r.top) / r.height * GH);
      if (gx === lx && gy === ly) return; lx = gx; ly = gy;
      drop(gx, gy, 3, 0.45);
    };
    world.addEventListener("pointermove", (e) => stir(e.clientX, e.clientY));
    world.addEventListener("pointerdown", (e) => { const r = media.getBoundingClientRect(); drop(Math.round((e.clientX - r.left) / r.width * GW), Math.round((e.clientY - r.top) / r.height * GH), 6, 1.6); });
    world.addEventListener("touchmove", (e) => { const t = e.touches[0]; if (t) stir(t.clientX, t.clientY); }, { passive: true });

    let started = false, visible = true;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(world);
    function step() {
      for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
        const i = y * GW + x;
        b[i] = ((a[i - 1] + a[i + 1] + a[i - GW] + a[i + GW]) * 0.5 - b[i]) * 0.975;
      }
      const t = a; a = b; b = t;
      if (Math.random() < 0.03) drop(2 + (Math.random() * (GW - 4)) | 0, 2 + (Math.random() * (GH - 4)) | 0, 2, 0.35); // a light breeze
    }
    function frame() {
      requestAnimationFrame(frame);
      if (!visible || video.readyState < 2) return;
      if (!started) { started = true; size(); media.classList.add("gl-on"); }
      step();
      for (let i = 0; i < GW * GH; i++) { const v = Math.max(-1, Math.min(1, a[i])); bytes[i * 4] = (v * 0.5 + 0.5) * 255; }
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tH);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GW, GH, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tVid);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video); } catch (_) { return; }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    requestAnimationFrame(frame);
    hint(world, touchy ? "Touch the water" : "Move across the water");
  }

  window.atlasWorldInteraction = function (world, kind) {
    if (reduce || !world) return;
    try { if (kind === "flashlight") flashlight(world); else if (kind === "water") water(world); } catch (e) { /* the film still plays */ }
  };
})();
