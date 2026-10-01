/* ==========================================================================
   Philip Radeff — portfolio
   Vanilla JS. No dependencies.
   1. Aurora shader (WebGL)          4. Mobile menu + nav state
   2. Scroll-expanding hero          5. Phone mockup: tilt, countdown, Lily
   3. Reveal on scroll               6. Parallax band, copy email, misc
   ========================================================================== */
(() => {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ------------------------------------------------------------------
     1. Aurora shader — port of the "aurora veil" preset to plain WebGL
     ------------------------------------------------------------------ */
  const aurora = (() => {
    const canvas = $('#aurora');
    if (!canvas) return null;

    const VS = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;
    const FS = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform vec2 u_res; uniform float u_time; uniform vec2 u_ptr; uniform float u_int;

      mat2 rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
      float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
        float a=hash21(i),b=hash21(i+vec2(1,0)),c=hash21(i+vec2(0,1)),d=hash21(i+vec2(1,1));
        return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
      float fbm(vec2 p){float v=0.,amp=.5;for(int i=0;i<4;i++){v+=amp*noise(p);p=rot(.72)*p*2.03+4.17;amp*=.5;}return v;}

      void main(){
        vec2 p=(gl_FragCoord.xy*2.-u_res)/max(min(u_res.x,u_res.y),1.);
        float t=u_time;
        vec2 ptr=(u_ptr*2.-1.); ptr.x*=u_res.x/max(u_res.y,1.);
        vec2 q=p;
        q.x+=sin(q.y*2.+t*.18)*.22;
        q.y+=cos(q.x*1.7-t*.14)*.16;
        q+= (ptr - q) * 0.03;                                   /* faint pointer drift */
        float veilA=smoothstep(.72,.04,abs(q.y+sin(q.x*1.8+t*.24)*.32));
        float veilB=smoothstep(.62,.02,abs(q.y*.85-cos(q.x*2.4-t*.2)*.24));
        float grain=fbm(q*2.5+t*.04);
        vec3 base=vec3(.025,.03,.03);
        vec3 green=vec3(.28,.82,.72);
        vec3 ember=vec3(.95,.38,.12);
        vec3 col=base+green*veilA*.40+ember*veilB*.22;
        col+=(grain-.5)*.05;
        col*= .80+u_int*.22;
        /* soften toward the edges so the card in the middle reads */
        float vig=smoothstep(1.9,.4,length(p));
        col*= .55+.45*vig;
        col=pow(max(col,vec3(0.)),vec3(.95));
        gl_FragColor=vec4(col,1.);
      }`;

    let gl;
    try {
      gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    } catch (e) { gl = null; }
    if (!gl) { canvas.remove(); return null; }

    const compile = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); gl.deleteShader(s); return null; }
      return s;
    };
    const vs = compile(gl.VERTEX_SHADER, VS), fs = compile(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) { canvas.remove(); return null; }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return null; }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aLoc = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(aLoc);
    gl.vertexAttribPointer(aLoc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uPtr = gl.getUniformLocation(prog, 'u_ptr');
    const uInt = gl.getUniformLocation(prog, 'u_int');

    const MAX_PIXELS = 520000;       // cap fill-rate; the shader is soft anyway
    const ptr = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    let running = false, raf = 0, visible = true, allowed = true;

    function resize() {
      const r = canvas.getBoundingClientRect();
      const ratio = Math.min(devicePixelRatio || 1, 1.25);
      let w = Math.max(1, Math.floor(r.width * ratio)), h = Math.max(1, Math.floor(r.height * ratio));
      const px = w * h;
      if (px > MAX_PIXELS) { const s = Math.sqrt(MAX_PIXELS / px); w = Math.floor(w * s); h = Math.floor(h * s); }
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    }

    function draw(now) {
      resize();
      ptr.x += (ptr.tx - ptr.x) * 0.04; ptr.y += (ptr.ty - ptr.y) * 0.04;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, reduced ? 18 : now * 0.001);
      gl.uniform2f(uPtr, ptr.x, ptr.y);
      gl.uniform1f(uInt, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function tick(now) { if (!running) { raf = 0; return; } draw(now); raf = requestAnimationFrame(tick); }
    function start() { if (reduced) { draw(performance.now()); return; } if (!running && visible && allowed) { running = true; raf = requestAnimationFrame(tick); } }
    function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

    new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? start() : stop(); }, { threshold: 0.01 }).observe(canvas);
    document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
    if (finePointer) window.addEventListener('pointermove', e => { ptr.tx = e.clientX / innerWidth; ptr.ty = 1 - e.clientY / innerHeight; }, { passive: true });
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); stop(); });
    canvas.addEventListener('webglcontextrestored', () => start());

    draw(performance.now());
    start();
    // The hero can pause the shader once the image covers it entirely.
    return { setAllowed(v) { allowed = v; v ? start() : stop(); } };
  })();

  /* ------------------------------------------------------------------
     2. Scroll-expanding hero — progress 0..1 drives CSS via --p
     ------------------------------------------------------------------ */
  const hero = $('#hero');
  const nav = $('#nav');
  (() => {
    if (!hero) return;
    if (reduced) { hero.style.setProperty('--p', '1'); nav.classList.add('is-solid'); return; }

    let top = 0, runway = 1, target = 0, cur = -1, raf = 0, last = 0;

    function measure() {
      top = hero.offsetTop;
      runway = Math.max(1, hero.offsetHeight - innerHeight);
      onScroll();
    }
    function onScroll() {
      target = clamp((scrollY - top) / runway, 0, 1);
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function tick(now) {
      // Light, frame-rate independent smoothing (~90 ms time constant): attached to the wheel, never juddery.
      const dt = last ? Math.min(64, now - last) : 16; last = now;
      const k = 1 - Math.exp(-dt / 90);
      const next = cur < 0 ? target : cur + (target - cur) * k;
      cur = Math.abs(target - next) < 0.0006 ? target : next;
      hero.style.setProperty('--p', cur.toFixed(4));
      nav.classList.toggle('is-solid', cur > 0.55);
      if (aurora) aurora.setAllowed(cur < 0.985);
      if (cur !== target) raf = requestAnimationFrame(tick); else { raf = 0; last = 0; }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('load', measure);
    measure();
  })();

  /* ------------------------------------------------------------------
     3. Reveal on scroll
     ------------------------------------------------------------------ */
  (() => {
    const els = $$('[data-reveal]');
    if (!els.length) return;
    if (reduced || !('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('in')); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => io.observe(el));
  })();

  /* ------------------------------------------------------------------
     4. Mobile menu + active nav
     ------------------------------------------------------------------ */
  (() => {
    const toggle = $('#menuToggle'), menu = $('#menu');
    if (!toggle || !menu) return;
    const icon = $('svg use', toggle);
    const setOpen = open => {
      menu.classList.toggle('is-open', open);
      menu.setAttribute('aria-hidden', String(!open));
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      icon.setAttribute('href', open ? '#i-close' : '#i-menu');
      document.body.classList.toggle('menu-open', open);
    };
    toggle.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
    $$('a', menu).forEach(a => a.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu.classList.contains('is-open')) setOpen(false); });

    // Active section marker
    const links = $$('[data-nav]');
    const sections = links.map(l => $('#' + l.dataset.nav)).filter(Boolean);
    if (!sections.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        links.forEach(l => l.toggleAttribute('aria-current', false));
        const l = links.find(l => l.dataset.nav === e.target.id);
        if (l) l.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
    sections.forEach(s => io.observe(s));
  })();

  /* ------------------------------------------------------------------
     5. Spursit phone: tilt, live countdown, Lily prompts
     ------------------------------------------------------------------ */
  (() => {
    const stage = $('#phoneStage'), phone = $('#phone'), showcase = $('#spursit');
    if (!stage || !phone) return;

    // Tilt toward the pointer (desktop only)
    if (finePointer && !reduced) {
      let raf = 0, rx = 4, ry = -8, trx = 4, try_ = -8;
      const apply = () => {
        rx += (trx - rx) * 0.12; ry += (try_ - ry) * 0.12;
        phone.style.setProperty('--rx', rx.toFixed(2) + 'deg');
        phone.style.setProperty('--ry', ry.toFixed(2) + 'deg');
        raf = (Math.abs(trx - rx) > 0.01 || Math.abs(try_ - ry) > 0.01) ? requestAnimationFrame(apply) : 0;
      };
      stage.addEventListener('pointermove', e => {
        const r = stage.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        try_ = x * 16; trx = -y * 12;
        if (!raf) raf = requestAnimationFrame(apply);
      });
      stage.addEventListener('pointerleave', () => { try_ = -8; trx = 4; if (!raf) raf = requestAnimationFrame(apply); });
      // Spotlight on the showcase surface
      if (showcase) showcase.addEventListener('pointermove', e => {
        const r = showcase.getBoundingClientRect();
        showcase.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
        showcase.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
      });
    }

    // Countdown to next Saturday 15:00 local — just to feel alive
    const d = $('#cd-d'), h = $('#cd-h'), m = $('#cd-m');
    if (d && h && m) {
      const pad = n => String(Math.max(0, n)).padStart(2, '0');
      const tickCd = () => {
        const now = new Date(); const t = new Date(now);
        t.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7 || 7)); t.setHours(15, 0, 0, 0);
        const diff = Math.max(0, t - now);
        d.textContent = pad(Math.floor(diff / 864e5));
        h.textContent = pad(Math.floor(diff / 36e5) % 24);
        m.textContent = pad(Math.floor(diff / 6e4) % 60);
      };
      tickCd(); setInterval(tickCd, 30000);
    }

    // Lily: rotate example questions
    const q = $('#lilyQ');
    if (q && !reduced) {
      const qs = [
        'Who scored in the 1984 UEFA Cup final?',
        'How many goals did Kane score for Spurs?',
        'What was the 1961 Double side\'s lineup?',
        'Which pub near me is showing the game?',
        'When was the last time we beat Arsenal away?'
      ];
      let i = 0;
      setInterval(() => {
        q.classList.add('is-out');
        setTimeout(() => { i = (i + 1) % qs.length; q.textContent = qs[i]; q.classList.remove('is-out'); }, 420);
      }, 4200);
    }
  })();

  /* ------------------------------------------------------------------
     6. Parallax band, spotlight cards, copy email, year
     ------------------------------------------------------------------ */
  (() => {
    const band = $('#band'), img = band && $('img', band);
    if (band && img && !reduced) {
      let raf = 0;
      const update = () => {
        raf = 0;
        const r = band.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return;
        const mid = (r.top + r.height / 2) - innerHeight / 2;     // distance from viewport centre
        img.style.setProperty('--py', (-mid * 0.12).toFixed(1) + 'px');
      };
      window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
      update();
    }

    if (finePointer) $$('.card').forEach(card => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        card.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    });

    const copy = $('#copyEmail');
    if (copy) {
      const label = $('span', copy), use = $('use', copy);
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText('radeffphilip@gmail.com'); }
        catch (e) { location.href = 'mailto:radeffphilip@gmail.com'; return; }
        copy.classList.add('is-done'); label.textContent = 'copied'; use.setAttribute('href', '#i-check');
        setTimeout(() => { copy.classList.remove('is-done'); label.textContent = 'copy'; use.setAttribute('href', '#i-copy'); }, 2200);
      });
    }

    const y = $('#year'); if (y) y.textContent = String(new Date().getFullYear());
  })();
})();
