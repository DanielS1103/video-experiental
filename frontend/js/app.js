// ---------------------------------------------------------------------------
// Instalación interactiva — frontend WebGL2, dos modos: NOSTALGIA y ANSIEDAD
//   video (bucle) -> textura -> glitch.frag, controlado por el WebSocket
//   (o el ratón si el backend no está activo).
//   Pasadas: huella de manos (trail) -> eco temporal (echo) -> imagen final.
// ---------------------------------------------------------------------------
import { createAudio } from './audio.js';

const WS_URL = `ws://${location.hostname || 'localhost'}:8765`;
const DEFAULT_VIDEO = 'assets/experimental.mp4';

const $ = (id) => document.getElementById(id);
const canvas = $('gl'), hud = $('hud'), statusEl = $('status');
const dropEl = $('drop'), fileInput = $('file'), modeEl = $('modeName');

const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
if (!gl) {
  document.body.innerHTML = '<p style="color:#fff;font:16px monospace;padding:20px">Tu navegador no soporta WebGL2.</p>';
  throw new Error('WebGL2 no disponible');
}

// ---- modos ----------------------------------------------------------------
const MODES = [
  { name: 'NOSTALGIA', sub: 'quédate quieto: el recuerdo se queda. tócalo y se gasta.' },
  { name: 'ANSIEDAD', sub: 'la calma ayuda, pero no lo resuelve del todo.' },
];
let mode = 0;

// ---- parámetros ajustables en vivo ----------------------------------------
const params = { intensity: 1.0, radius: 0.22, flipX: false, mouseMode: false, timeFx: true };

// ---- estado de interacción ------------------------------------------------
const mkHand = () => ({ x: 0.5, y: 0.5, a: 0, tx: 0.5, ty: 0.5, ta: 0 });
const state = { hands: [mkHand(), mkHand()], motion: 0, tMotion: 0, lastMsg: 0, connected: false, source: '-' };
const mouse = { x: 0.5, y: 0.5, seen: false, speed: 0, px: 0.5, py: 0.5 };

// ---- estado dinámico de los modos ----------------------------------------
const dyn = { agit: 0, modeTime: 0, burst: 0, beatPhase: 0, tension: 0 };
const micro = { active: false, start: 0, len: 0, until: 0 };   // microbucles de la ansiedad
const audio = createAudio();

let modeTimer;
function announceMode() {
  modeEl.innerHTML = `<b>${MODES[mode].name}</b><span>${MODES[mode].sub}</span>`;
  modeEl.classList.add('show');
  clearTimeout(modeTimer);
  modeTimer = setTimeout(() => modeEl.classList.remove('show'), 2800);
}
function setMode(m) {
  if (m === mode) return;
  mode = m;
  dyn.modeTime = 0; dyn.agit = 0; dyn.burst = 1;
  micro.active = false;
  audio.setMode(m);
  announceMode();
}

// ---- WebSocket con reconexión ---------------------------------------------
function connect() {
  const ws = new WebSocket(WS_URL);
  ws.onopen = () => { state.connected = true; };
  ws.onclose = () => { state.connected = false; setTimeout(connect, 1000); };
  ws.onerror = () => ws.close();
  ws.onmessage = (e) => {
    let d;
    try { d = JSON.parse(e.data); } catch { return; }
    state.lastMsg = performance.now();
    if (params.mouseMode) return;
    state.source = d.source || '-';
    for (let i = 0; i < 2; i++) {
      const h = state.hands[i], src = d.hands && d.hands[i];
      if (src) {
        h.tx = params.flipX ? 1 - src.x : src.x;
        h.ty = 1 - src.y;           // el shader usa origen abajo-izquierda
        h.ta = 1;
      } else {
        h.ta = 0;
      }
    }
    state.tMotion = d.motion || 0;
  };
}
connect();

// ---- ratón (modo de prueba / respaldo) ------------------------------------
let idleTimer;
window.addEventListener('pointermove', (e) => {
  mouse.x = e.clientX / innerWidth;
  mouse.y = 1 - e.clientY / innerHeight;
  mouse.seen = true;
  mouse.speed = Math.min(1, mouse.speed + Math.hypot(mouse.x - mouse.px, mouse.y - mouse.py) * 6);
  mouse.px = mouse.x; mouse.py = mouse.y;
  document.body.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle'), 2500);
});

// ---- video ----------------------------------------------------------------
const video = document.createElement('video');
video.loop = true;
video.muted = true;
video.playsInline = true;
let videoReady = false;
let objectURL = null;

video.addEventListener('loadeddata', () => { videoReady = true; video.play().catch(() => {}); });
video.addEventListener('error', () => { videoReady = false; });

function loadVideo(src) {
  videoReady = false;
  video.src = src;
  video.load();
  video.play().catch(() => {});
}
function loadFile(file) {
  if (!file || !file.type.startsWith('video/')) return;
  if (objectURL) URL.revokeObjectURL(objectURL);
  objectURL = URL.createObjectURL(file);
  loadVideo(objectURL);
}
loadVideo(DEFAULT_VIDEO);
window.addEventListener('pointerdown', () => { if (video.paused && videoReady) video.play().catch(() => {}); });

fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
window.addEventListener('dragover', (e) => { e.preventDefault(); dropEl.classList.add('show'); });
window.addEventListener('dragleave', (e) => { if (e.target === dropEl) dropEl.classList.remove('show'); });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dropEl.classList.remove('show');
  loadFile(e.dataTransfer.files[0]);
});

// ---- imagen de reserva mientras no hay video ------------------------------
const ph = document.createElement('canvas');
ph.width = 1280; ph.height = 720;
const pc = ph.getContext('2d');
function drawPlaceholder(t) {
  const g = pc.createLinearGradient(0, 0, 1280, 720);
  g.addColorStop(0, `hsl(${(t * 20) % 360},80%,45%)`);
  g.addColorStop(1, `hsl(${(t * 20 + 120) % 360},80%,25%)`);
  pc.fillStyle = g; pc.fillRect(0, 0, 1280, 720);
  pc.fillStyle = 'rgba(255,255,255,.85)';
  for (let i = 0; i < 12; i++) {
    const x = ((t * 80 * (i % 3 + 1)) + i * 140) % 1480 - 100;
    pc.fillRect(x, 40 + i * 55, 120, 18);
  }
  pc.textAlign = 'center';
  pc.font = 'bold 54px monospace';
  pc.fillText('ARRASTRA TU VIDEO AQUÍ', 640, 370);
  pc.font = '28px monospace';
  pc.fillText('o presiona O para elegir un archivo', 640, 420);
}

// ---- WebGL ----------------------------------------------------------------
function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s));
    throw new Error('Error compilando shader: ' + gl.getShaderInfoLog(s));
  }
  return s;
}

async function main() {
  const names = ['shader.vert', 'glitch.frag', 'trail.frag', 'echo.frag'];
  const [vs, fsMain, fsTrail, fsEcho] = await Promise.all(names.map((n) =>
    fetch('shaders/' + n).then((r) => {
      if (!r.ok) throw new Error('No se pudo cargar shaders/' + n);
      return r.text();
    })));

  const vsh = compile(gl.VERTEX_SHADER, vs);
  const mk = (fs, uniformNames) => {
    const p = gl.createProgram();
    gl.attachShader(p, vsh);
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    uniformNames.forEach((n) => (u[n] = gl.getUniformLocation(p, n === 'u_hands' ? 'u_hands[0]' : n)));
    return { p, u };
  };
  const P = {
    main: mk(fsMain, ['u_tex', 'u_mask', 'u_echo', 'u_res', 'u_vres', 'u_time', 'u_hands', 'u_motion',
      'u_intensity', 'u_mode', 'u_tension', 'u_beat', 'u_burst', 'u_crowd']),
    trail: mk(fsTrail, ['u_prev', 'u_hands', 'u_radius', 'u_decay', 'u_aspect']),
    echo: mk(fsEcho, ['u_prev', 'u_tex', 'u_res', 'u_vres', 'u_k']),
  };

  // quad a pantalla completa
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // asignación fija de unidades de textura: 0 = video, 1 = huella, 2 = eco
  gl.useProgram(P.main.p);
  gl.uniform1i(P.main.u.u_tex, 0); gl.uniform1i(P.main.u.u_mask, 1); gl.uniform1i(P.main.u.u_echo, 2);
  gl.useProgram(P.trail.p);
  gl.uniform1i(P.trail.u.u_prev, 1);
  gl.useProgram(P.echo.p);
  gl.uniform1i(P.echo.u.u_tex, 0); gl.uniform1i(P.echo.u.u_prev, 2);

  const bindTex = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };

  // textura del video
  const vtex = gl.createTexture();
  bindTex(0, vtex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v);

  // ---- framebuffers ping-pong (huella y eco) ----
  const hasFloat = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  let FMT = hasFloat ? { internal: gl.RGBA16F, type: gl.HALF_FLOAT } : { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE };

  function makeTarget(w, h, fmt) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, gl.RGBA, fmt.type, null);
    for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
      [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, ok };
  }
  function makePing(w, h) {
    let a = makeTarget(w, h, FMT), b = makeTarget(w, h, FMT);
    if (!a.ok || !b.ok) {                       // sin soporte de float: 8 bits
      FMT = { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE };
      a = makeTarget(w, h, FMT); b = makeTarget(w, h, FMT);
    }
    return { read: a, write: b, w, h, swap() { [this.read, this.write] = [this.write, this.read]; } };
  }
  const mask = makePing(256, 144);
  const echo = makePing(640, 360);
  const minDecay = FMT.type === gl.UNSIGNED_BYTE ? 0.004 : 0;   // en 8 bits, restas < 1/255 no avanzan

  const handsBuf = new Float32Array(6);
  let lastSeek = 0, frames = 0, fps = 0, lastFpsT = performance.now(), lastHud = 0;
  let prevNow = performance.now(), lastW = 0, lastH = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - prevNow) / 1000 || 0.016);
    prevNow = now;
    const t = now / 1000;

    // tamaño del canvas
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(innerWidth * dpr), h = Math.floor(innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    lastW = w; lastH = h;

    // ¿ratón o backend?
    const useMouse = params.mouseMode || (now - state.lastMsg > 1500);
    if (useMouse) {
      state.hands[0].tx = mouse.x; state.hands[0].ty = mouse.y; state.hands[0].ta = mouse.seen ? 1 : 0;
      state.hands[1].ta = 0;
      mouse.speed *= 0.93;
      state.tMotion = mouse.speed;
      state.source = 'ratón';
    }

    // suavizado
    for (const hd of state.hands) {
      if (hd.a < 0.02 && hd.ta > 0) { hd.x = hd.tx; hd.y = hd.ty; }
      hd.x += (hd.tx - hd.x) * 0.35;
      hd.y += (hd.ty - hd.y) * 0.35;
      hd.a += (hd.ta - hd.a) * 0.15;
    }
    state.motion += (state.tMotion - state.motion) * 0.2;
    const presence = Math.max(state.hands[0].a, state.hands[1].a);
    const crowd = Math.min(state.hands[0].a, state.hands[1].a);

    // ---- dinámica de los modos ----
    dyn.modeTime += dt;
    // agitación: sube rápido con el movimiento y baja despacio
    const rise = state.motion > dyn.agit ? 3.0 : 0.6;
    dyn.agit += (Math.min(1, state.motion * 1.6) - dyn.agit) * (1 - Math.exp(-dt * rise));
    // ansiedad: además crece sola con el tiempo (hasta 0.3) aunque estés quieto
    const creep = mode === 1 ? Math.min(0.3, dyn.modeTime / 120 * 0.3) : 0;
    dyn.tension = mode === 1 ? Math.min(1, dyn.agit + creep) : 0;
    const bpm = 60 + 70 * dyn.tension;
    dyn.beatPhase += dt * bpm / 60;
    const f = dyn.beatPhase % 1;
    const beat = Math.min(1, Math.exp(-f * 9) + 0.55 * Math.exp(-Math.pow((f - 0.25) * 12, 2)));

    // estallidos: al cambiar de modo y espontáneos (más frecuentes en ansiedad)
    dyn.burst *= Math.exp(-dt * 3.5);
    const pBurst = mode === 1 ? 0.15 + 0.6 * creep + 0.4 * dyn.agit : 0.04;
    if (Math.random() < pBurst * dt) dyn.burst = Math.max(dyn.burst, mode === 1 ? 0.5 + 0.5 * Math.random() : 0.35);

    // ---- el tiempo del video ----
    if (videoReady && video.duration) {
      if (mode === 0) {
        // nostalgia: cámara lenta + "rebobinar" cuando te agitas
        if (params.timeFx && state.motion > 0.45 && now - lastSeek > 140 && Math.random() < state.motion * 0.25) {
          video.currentTime = Math.max(0, video.currentTime - (0.15 + Math.random() * 0.4));
          lastSeek = now;
        }
      } else if (params.timeFx) {
        // ansiedad: microbucles intrusivos que se atascan y se sueltan
        if (micro.active) {
          if (now > micro.until) micro.active = false;
          else if (video.currentTime > micro.start + micro.len) video.currentTime = micro.start;
        } else if (dyn.tension > 0.3 && Math.random() < dyn.tension * dt * 0.7) {
          micro.active = true;
          micro.start = video.currentTime;
          micro.len = 0.25 + Math.random() * 0.35;
          micro.until = now + 800 + Math.random() * 1800;
        }
      } else micro.active = false;
    }
    const rate = mode === 0 ? 0.75 : 1 + 0.25 * dyn.tension;
    if (Math.abs(video.playbackRate - rate) > 0.01) video.playbackRate = rate;

    // ---- audio ----
    audio.update({ tension: dyn.tension, motion: state.motion, presence, beatPhase: dyn.beatPhase, bpm });

    // fuente de la textura
    let src, vw, vh;
    if (videoReady && video.readyState >= 2) { src = video; vw = video.videoWidth; vh = video.videoHeight; }
    else { drawPlaceholder(t); src = ph; vw = ph.width; vh = ph.height; }

    bindTex(0, vtex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);

    state.hands.forEach((hd, i) => {
      handsBuf[i * 3] = hd.x; handsBuf[i * 3 + 1] = hd.y; handsBuf[i * 3 + 2] = hd.a;
    });

    // ---- pasada 1: huella de las manos ----
    // nostalgia: el rastro dura ~4 s; ansiedad: ~0.5 s
    const decay = Math.max((mode === 0 ? 0.27 : 1.8) * dt, minDecay);
    gl.useProgram(P.trail.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, mask.write.fbo);
    gl.viewport(0, 0, mask.w, mask.h);
    bindTex(1, mask.read.tex);
    gl.uniform3fv(P.trail.u.u_hands, handsBuf);
    gl.uniform1f(P.trail.u.u_radius, params.radius);
    gl.uniform1f(P.trail.u.u_decay, decay);
    gl.uniform1f(P.trail.u.u_aspect, w / h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    mask.swap();

    // ---- pasada 2: eco temporal del video ----
    gl.useProgram(P.echo.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, echo.write.fbo);
    gl.viewport(0, 0, echo.w, echo.h);
    bindTex(2, echo.read.tex);
    gl.uniform2f(P.echo.u.u_res, w, h);
    gl.uniform2f(P.echo.u.u_vres, vw, vh);
    gl.uniform1f(P.echo.u.u_k, 1 - Math.exp(-dt / 0.6));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    echo.swap();

    // ---- pasada 3: imagen final ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(P.main.p);
    bindTex(1, mask.read.tex);
    bindTex(2, echo.read.tex);
    const U = P.main.u;
    gl.uniform3fv(U.u_hands, handsBuf);
    gl.uniform2f(U.u_res, w, h);
    gl.uniform2f(U.u_vres, vw, vh);
    gl.uniform1f(U.u_time, t);
    gl.uniform1f(U.u_motion, state.motion);
    gl.uniform1f(U.u_intensity, params.intensity);
    gl.uniform1i(U.u_mode, mode);
    gl.uniform1f(U.u_tension, dyn.tension);
    gl.uniform1f(U.u_beat, beat);
    gl.uniform1f(U.u_burst, Math.min(1, dyn.burst));
    gl.uniform1f(U.u_crowd, crowd);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // HUD
    frames++;
    if (now - lastFpsT > 1000) { fps = frames; frames = 0; lastFpsT = now; }
    if (now - lastHud > 250) {
      lastHud = now;
      statusEl.textContent =
        `modo: ${MODES[mode].name}` + (mode === 1 ? ` (tensión ${dyn.tension.toFixed(2)}, ${Math.round(bpm)} bpm)` : '') + '\n' +
        `backend: ${state.connected ? 'conectado' : 'desconectado'} | control: ${state.source} | ` +
        `movimiento: ${state.motion.toFixed(2)} | audio: ${audio.state}\n` +
        `intensidad: ${params.intensity.toFixed(1)} | radio: ${params.radius.toFixed(2)} | ` +
        `video: ${videoReady ? 'ok' : 'placeholder'} | tiempo: ${params.timeFx ? 'on' : 'off'} | ${fps} fps`;
    }
  }
  announceMode();
  requestAnimationFrame(frame);
}
main().catch((e) => { console.error(e); statusEl.textContent = 'Error: ' + e.message; });

// ---- audio: los navegadores exigen un gesto del usuario -------------------
['keydown', 'pointerdown'].forEach((ev) => window.addEventListener(ev, () => audio.start()));

// ---- atajos de teclado ----------------------------------------------------
window.addEventListener('keydown', (e) => {
  switch (e.key.toLowerCase()) {
    case 'tab': e.preventDefault(); setMode(1 - mode); break;
    case 'n': setMode(1 - mode); break;
    case '1': setMode(0); break;
    case '2': setMode(1); break;
    case 'f':
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
      break;
    case 'h': hud.classList.toggle('hidden'); break;
    case 'o': fileInput.click(); break;
    case 'm': params.mouseMode = !params.mouseMode; break;
    case 'x': params.flipX = !params.flipX; break;
    case 's': params.timeFx = !params.timeFx; break;
    case 'a': audio.toggle(); break;
    case ' ':
      e.preventDefault();
      if (video.paused) video.play(); else video.pause();
      break;
    case '+': case '=': params.intensity = Math.min(3, params.intensity + 0.1); break;
    case '-': params.intensity = Math.max(0, params.intensity - 0.1); break;
    case '[': params.radius = Math.max(0.05, params.radius - 0.02); break;
    case ']': params.radius = Math.min(0.8, params.radius + 0.02); break;
  }
});
