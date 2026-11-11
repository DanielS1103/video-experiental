#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_tex;      // frame actual del video
uniform vec2  u_res;          // resolucion del canvas
uniform vec2  u_vres;         // resolucion del video
uniform float u_time;
uniform vec3  u_hands[2];     // x, y (0..1, origen abajo-izq), activa (0..1)
uniform float u_motion;       // 0..1 movimiento global del espectador
uniform float u_intensity;    // multiplicador global
uniform float u_radius;       // radio de influencia de cada mano

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

vec3 tex(vec2 uv) { return texture(u_tex, coverUV(mirrorUV(uv))).rgb; }

void main() {
  vec2 uv = v_uv;
  float aspect = u_res.x / u_res.y;
  float t = floor(u_time * 12.0);          // el glitch "late" a 12 fps

  // ---- influencia de las manos ----
  float infl = 0.0, dBest = 1.0;
  vec2 dirUV = vec2(0.0);
  for (int i = 0; i < 2; i++) {
    vec3 h = u_hands[i];
    vec2 dv = (uv - h.xy) * vec2(aspect, 1.0);
    float d = length(dv);
    float f = (1.0 - smoothstep(0.0, u_radius, d)) * h.z;
    if (f > infl) {
      infl = f; dBest = d;
      dirUV = (dv / (d + 1e-4)) / vec2(aspect, 1.0);
    }
  }
  infl *= u_intensity;
  float g = clamp(u_motion * u_intensity, 0.0, 1.0);   // glitch global por movimiento
  float ci = clamp(infl, 0.0, 1.0);

  // 1) ondas que irradian desde la mano
  uv += dirUV * sin(dBest * 60.0 - u_time * 10.0) * 0.012 * infl;

  // 2) bloques desplazados (datamosh barato)
  vec2 blk = floor(uv * vec2(28.0, 16.0));
  float rb = hash(blk + t);
  float trig = step(1.0 - 0.55 * ci - 0.15 * g, rb);
  uv.x += trig * (hash(blk + t + 7.0) - 0.5) * 0.25 * max(infl, g * 0.6);

  // 3) desgarro de lineas de barrido (crece con el movimiento)
  float row = floor(uv.y * 180.0);
  float rr = hash(vec2(row, t));
  uv.x += step(0.9 - 0.3 * g, rr) * (hash(vec2(row, t + 3.0)) - 0.5) * 0.12 * g;

  // 4) pixelado en el centro de la mano
  float pxAmt = smoothstep(0.5, 1.0, infl);
  vec2 grid = vec2(80.0, 45.0);
  uv = mix(uv, (floor(uv * grid) + 0.5) / grid, pxAmt);

  // 5) separacion RGB
  vec2 off = dirUV * 0.025 * infl
           + vec2(0.012 * g, 0.0) * (hash(vec2(t, 1.0)) - 0.5) * 2.0;
  vec3 col;
  col.r = tex(uv + off).r;
  col.g = tex(uv).g;
  col.b = tex(uv - off).b;

  // 6) inversion intermitente en el nucleo
  float inv = smoothstep(0.9, 1.2, infl) * step(0.5, hash(vec2(t, 9.0)));
  col = mix(col, 1.0 - col, inv);

  // 7) grano
  col += (hash(v_uv * u_res + u_time) - 0.5) * 0.08 * (g + infl * 0.5);

  outColor = vec4(col, 1.0);
}
