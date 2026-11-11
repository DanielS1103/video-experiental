// ---------------------------------------------------------------------------
// Instalación interactiva — frontend WebGL2
//   video (bucle) -> textura -> glitch.frag, controlado por datos del WebSocket
//   (o del ratón si el backend no está activo)
// ---------------------------------------------------------------------------
const WS_URL = `ws://${location.hostname || 'localhost'}:8765`;
const DEFAULT_VIDEO = 'assets/experimental.mp4';

const canvas = document.getElementById('gl');
const hud = document.getElementById('hud');
const statusEl = document.getElementById('status');
const dropEl = document.getElementById('drop');
const fileInput = document.getElementById('file');

const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
if (!gl) {
  document.body.innerHTML = '<p style="color:#fff;font:16px monospace;padding:20px">Tu navegador no soporta WebGL2.</p>';
  throw new Error('WebGL2 no disponible');
}

// ---- parámetros ajustables en vivo ----------------------------------------
const params = { intensity: 1.0, radius: 0.22, flipX: false, mouseMode: false, scratch: false };

// ---- estado de interacción ------------------------------------------------
const mkHand = () => ({ x: 0.5, y: 0.5, a: 0, tx: 0.5, ty: 0.5, ta: 0 });
const state = { hands: [mkHand(), mkHand()], motion: 0, tMotion: 0, lastMsg: 0, connected: false, source: '-' };
const mouse = { x: 0.5, y: 0.5, seen: false, speed: 0, px: 0.5, py: 0.5 };

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
    throw new Error('Error compilando shader');
  }
  return s;
}

async function main() {
  const [vs, fs] = await Promise.all([
    fetch('shaders/shader.vert').then((r) => r.text()),
    fetch('shaders/glitch.frag').then((r) => r.text()),
  ]);
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  // quad a pantalla completa
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  // textura del video
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const U = {};
  ['u_tex', 'u_res', 'u_vres', 'u_time', 'u_motion', 'u_intensity', 'u_radius']
    .forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));
  U.u_hands = gl.getUniformLocation(prog, 'u_hands[0]');
  gl.uniform1i(U.u_tex, 0);

  const handsBuf = new Float32Array(6);
  let lastSeek = 0, frames = 0, fps = 0, lastFpsT = performance.now(), lastHud = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const t = now / 1000;

    // tamaño del canvas
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(innerWidth * dpr), h = Math.floor(innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);

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

    // "scratch": saltos hacia atrás en el bucle cuando hay mucho movimiento
    if (params.scratch && videoReady && video.duration && state.motion > 0.35
        && now - lastSeek > 120 && Math.random() < state.motion * 0.25) {
      video.currentTime = Math.max(0, video.currentTime - (0.05 + Math.random() * 0.3));
      lastSeek = now;
    }

    // fuente de la textura
    let src, vw, vh;
    if (videoReady && video.readyState >= 2) { src = video; vw = video.videoWidth; vh = video.videoHeight; }
    else { drawPlaceholder(t); src = ph; vw = ph.width; vh = ph.height; }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);

    // uniforms
    state.hands.forEach((hd, i) => {
      handsBuf[i * 3] = hd.x; handsBuf[i * 3 + 1] = hd.y; handsBuf[i * 3 + 2] = hd.a;
    });
    gl.uniform3fv(U.u_hands, handsBuf);
    gl.uniform2f(U.u_res, w, h);
    gl.uniform2f(U.u_vres, vw, vh);
    gl.uniform1f(U.u_time, t);
    gl.uniform1f(U.u_motion, state.motion);
    gl.uniform1f(U.u_intensity, params.intensity);
    gl.uniform1f(U.u_radius, params.radius);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // HUD
    frames++;
    if (now - lastFpsT > 1000) { fps = frames; frames = 0; lastFpsT = now; }
    if (now - lastHud > 250) {
      lastHud = now;
      statusEl.textContent =
        `backend: ${state.connected ? 'conectado' : 'desconectado'} | control: ${state.source} | ` +
        `movimiento: ${state.motion.toFixed(2)} | intensidad: ${params.intensity.toFixed(1)} | ` +
        `radio: ${params.radius.toFixed(2)} | video: ${videoReady ? 'ok' : 'placeholder'} | ` +
        `scratch: ${params.scratch ? 'on' : 'off'} | ${fps} fps`;
    }
  }
  requestAnimationFrame(frame);
}
main().catch((e) => { console.error(e); statusEl.textContent = 'Error: ' + e.message; });

// ---- atajos de teclado ----------------------------------------------------
window.addEventListener('keydown', (e) => {
  switch (e.key.toLowerCase()) {
    case 'f':
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
      break;
    case 'h': hud.classList.toggle('hidden'); break;
    case 'o': fileInput.click(); break;
    case 'm': params.mouseMode = !params.mouseMode; break;
    case 'x': params.flipX = !params.flipX; break;
    case 's': params.scratch = !params.scratch; break;
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
