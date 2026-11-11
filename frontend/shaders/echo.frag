#version 300 es
// Eco temporal: promedio móvil de los frames pasados del video (para los "fantasmas").
precision highp float;
in vec2 v_uv;
out vec4 o;

uniform sampler2D u_prev;
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform vec2  u_vres;
uniform float u_k;

vec2 coverUV(vec2 uv) {
  float ca = u_res.x / u_res.y;
  float va = u_vres.x / u_vres.y;
  vec2 s = vec2(1.0);
  if (ca > va) s.y = va / ca; else s.x = ca / va;
  return (uv - 0.5) * s + 0.5;
}

void main() {
  vec3 cur  = texture(u_tex, coverUV(v_uv)).rgb;
  vec3 prev = texture(u_prev, v_uv).rgb;
  o = vec4(mix(prev, cur, u_k), 1.0);
}
