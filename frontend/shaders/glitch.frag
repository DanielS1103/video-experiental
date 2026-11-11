#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_tex;      // frame actual del video
uniform sampler2D u_mask;     // huella de las manos (0..1)
uniform sampler2D u_echo;     // eco temporal del video (fantasmas)
uniform vec2  u_res;          // resolucion del canvas
uniform vec2  u_vres;         // resolucion del video
uniform float u_time;
uniform vec3  u_hands[2];     // x, y (origen abajo-izq), activa (0..1)
uniform float u_motion;       // 0..1 movimiento global
uniform float u_intensity;    // multiplicador global
uniform int   u_mode;         // 0 = nostalgia, 1 = ansiedad
uniform float u_tension;      // 0..1 (solo ansiedad)
uniform float u_beat;         // 0..1 pulso del latido
uniform float u_burst;        // 0..1 estallido de glitch (cambio de modo / espontaneo)
uniform float u_crowd;        // 0..1 varias manos a la vez

float g_aspect;
float g_t;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 mirrorUV(vec2 u) { return 1.0 - abs(1.0 - mod(u, 2.0)); }

// "cover": el video llena el canvas sin deformarse
vec2 coverUV(vec2 uv) {
  float ca = u_res.x / u_res.y;
  float va = u_vres.x / u_vres.y;
  vec2 s = vec2(1.0);
  if (ca > va) s.y = va / ca; else s.x = ca / va;
  return (uv - 0.5) * s + 0.5;
}

vec3 vid(vec2 uv) { return texture(u_tex, coverUV(mirrorUV(uv))).rgb; }

vec3 vidBlur(vec2 uv, float r) {
  vec3 s = vid(uv) * 0.2;
  for (int i = 0; i < 8; i++) {
    float a = 6.2831853 * float(i) / 8.0;
    s += vid(uv + vec2(cos(a) / g_aspect, sin(a)) * r) * 0.1;
  }
  return s;
}

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// ===========================================================================
// MODO 0 — NOSTALGIA: quieto = recuerdo cálido y suave; moverse = cinta VHS
// inestable; tocar = el recuerdo se borra, se emborrona y deja fantasmas.
// ===========================================================================
vec3 nostalgia(float infl, float dBest, vec2 dirUV) {
  vec2 uv = v_uv;
  float er = clamp(infl, 0.0, 1.0);
  float calm = 1.0 - clamp(u_motion * 2.5, 0.0, 1.0);

  // oscilación de cinta (wow & flutter)
  float wob = sin(uv.y * 6.0 + u_time * 1.3) * 0.0015
            + sin(uv.y * 40.0 + u_time * 7.0) * 0.0008 * (1.0 - calm);
  uv.x += wob * (1.0 + u_motion * 6.0);

  // errores de tracking VHS
  float rowQ = floor(uv.y * 60.0);
  float bandOn = step(0.985 - 0.08 * u_motion - 0.1 * u_burst, hash(vec2(rowQ, g_t)));
  uv.x += bandOn * (hash(vec2(rowQ, g_t + 2.0)) - 0.5) * 0.08
        * (0.4 + u_motion * 2.0 + u_burst * 3.0);

  // barra de tracking que sube lentamente
  float barY = 1.0 - fract(u_time * 0.07);
  float bar = 1.0 - smoothstep(0.0, 0.05, abs(uv.y - barY));
  uv.x += bar * 0.008 * sin(uv.y * 200.0 + u_time * 20.0) * (0.3 + u_motion);

  // ondas lentas y soñadas alrededor de la mano
  uv += dirUV * sin(dBest * 30.0 - u_time * 2.0) * 0.01 * infl;

  // imagen base: suave, con brillo difuso
  vec3 sharp = vid(uv);
  vec3 soft  = vidBlur(uv, 0.004 + 0.012 * er);
  vec3 col = mix(sharp, soft, 0.35 + 0.55 * er);

  // fantasmas: frames pasados donde has tocado
  vec3 ghost = texture(u_echo, mirrorUV(uv)).rgb;
  col = mix(col, ghost, er * 0.8 + 0.15 * u_motion);

  // sangrado de crominancia (VHS)
  vec2 cb = vec2(0.003 + 0.006 * u_motion + 0.01 * u_burst, 0.0);
  col.r = mix(col.r, vid(uv + cb).r, 0.7);
  col.b = mix(col.b, vid(uv - cb).b, 0.7);

  // gradación cálida (más dorada cuando estás en calma)
  float l = luma(col);
  float warm = 0.2 + 0.45 * calm;
  col = mix(col, col * vec3(1.10, 0.97, 0.82) + vec3(0.03, 0.015, 0.0), warm);
  col = mix(col, vec3(l) * vec3(1.15, 0.95, 0.75), 0.25 * calm);

  // el recuerdo se desgasta: lavado hacia color crema
  float er2 = smoothstep(0.35, 1.0, er);
  col = mix(col, mix(vec3(l), vec3(0.96, 0.90, 0.78), 0.65), er2 * 0.75);

  // negros levantados + viñeta suave
  col = col * 0.88 + 0.06;
  float vg = length((v_uv - 0.5) * vec2(g_aspect, 1.0));
  col *= mix(0.6, 1.0, 1.0 - smoothstep(0.3, 0.95, vg));

  // grano de película y polvo
  float gr = hash(floor(v_uv * u_res / 1.5) + floor(u_time * 24.0));
  col += (gr - 0.5) * (0.05 + 0.12 * er + 0.05 * u_motion);
  float dust = step(0.9993, hash(floor(v_uv * u_res / 3.0) + floor(u_time * 12.0)));
  col += dust * 0.35;

  // fuga de luz (cambio de modo / destellos espontáneos)
  float leak = u_burst * pow(1.0 - v_uv.x, 2.0);
  col += leak * vec3(0.9, 0.45, 0.2);

  return col;
}

// ===========================================================================
// MODO 1 — ANSIEDAD: la tensión sube con la agitación y también con el tiempo;
// latido, zoom que se cierra, bloques que se rompen, duplicados, glitch propio.
// ===========================================================================
vec3 anxiety(float infl, float dBest, vec2 dirUV) {
  float T = u_tension;
  vec2 uv = v_uv;
  float ci = clamp(infl, 0.0, 1.0);
  float g = clamp(max(u_motion * u_intensity * 0.9, u_burst), 0.0, 1.0);
  float gAll = max(g, T * 0.35);

  // el cuadro se cierra y late
  float zoom = 1.0 - (0.02 * T + 0.025 * T * u_beat);
  uv = (uv - 0.5) * zoom + 0.5;
  uv += (vec2(hash(vec2(g_t, 1.0)), hash(vec2(g_t, 2.0))) - 0.5) * 0.006 * T * (0.5 + u_beat);

  // ondas desde la mano
  uv += dirUV * sin(dBest * 60.0 - u_time * 10.0) * 0.012 * infl;

  // bloques desplazados
  vec2 blk = floor(uv * vec2(28.0, 16.0));
  float rb = hash(blk + g_t);
  float trig = step(1.0 - 0.55 * ci - 0.15 * gAll, rb);
  uv.x += trig * (hash(blk + g_t + 7.0) - 0.5) * 0.25 * max(infl, gAll * 0.6);

  // desgarro de líneas
  float row = floor(uv.y * 180.0);
  float rr = hash(vec2(row, g_t));
  uv.x += step(0.9 - 0.3 * gAll, rr) * (hash(vec2(row, g_t + 3.0)) - 0.5) * 0.12 * gAll;

  // pixelado en el núcleo
  float pxAmt = smoothstep(0.5, 1.0, infl);
  vec2 grid = vec2(80.0, 45.0);
  uv = mix(uv, (floor(uv * grid) + 0.5) / grid, pxAmt);

  // separación RGB
  vec2 off = dirUV * 0.025 * infl
           + vec2(0.012 * gAll, 0.0) * (hash(vec2(g_t, 1.0)) - 0.5) * 2.0;
  vec3 col;
  col.r = vid(uv + off).r;
  col.g = vid(uv).g;
  col.b = vid(uv - off).b;

  // muchas manos / muchos ojos: el video se duplica y se superpone
  if (u_crowd > 0.01) {
    vec2 o = vec2(0.03 + 0.04 * T, 0.01);
    vec3 d = (vid(uv + o) + vid(uv - o * 1.3)) * 0.5;
    col = mix(col, d, u_crowd * 0.45);
  }

  // color: se enfría, se desatura y se endurece con la tensión
  float l = luma(col);
  col = mix(col, vec3(l), 0.15 + 0.55 * T);
  col *= mix(vec3(1.0), vec3(0.85, 0.95, 1.10), T);
  col = (col - 0.5) * (1.0 + 0.5 * T) + 0.5;

  // viñeta que se cierra, con latido rojo
  float r = length((v_uv - 0.5) * vec2(g_aspect, 1.0));
  float inner = 0.75 - 0.45 * T - 0.05 * u_beat * T;
  float vg = smoothstep(inner, inner + 0.35, r);
  col = mix(col, col * 0.15, vg * (0.4 + 0.6 * T));
  col += vec3(0.25, 0.0, 0.0) * vg * u_beat * T;

  // ruido
  col += (hash(v_uv * u_res + u_time) - 0.5) * (0.06 + 0.14 * T + 0.10 * infl);

  // parpadeo invertido durante los estallidos
  float flick = step(0.8, hash(vec2(g_t, 5.0))) * u_burst;
  col = mix(col, 1.0 - col, flick * 0.7);

  return col;
}

void main() {
  g_aspect = u_res.x / u_res.y;
  g_t = floor(u_time * 12.0);

  // dirección hacia la mano más cercana (para ondas y separación RGB)
  float dBest = 1.0;
  vec2 dirUV = vec2(0.0);
  for (int i = 0; i < 2; i++) {
    vec3 h = u_hands[i];
    vec2 dv = (v_uv - h.xy) * vec2(g_aspect, 1.0);
    float d = length(dv);
    if (h.z > 0.05 && d < dBest) {
      dBest = d;
      dirUV = (dv / (d + 1e-4)) / vec2(g_aspect, 1.0);
    }
  }

  float infl = texture(u_mask, v_uv).r * u_intensity;
  vec3 col = (u_mode == 0) ? nostalgia(infl, dBest, dirUV) : anxiety(infl, dBest, dirUV);
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
