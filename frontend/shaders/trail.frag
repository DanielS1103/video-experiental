#version 300 es
// Mapa de "huella": acumula por donde han pasado las manos y se desvanece con el tiempo.
precision highp float;
in vec2 v_uv;
out vec4 o;

uniform sampler2D u_prev;
uniform vec3  u_hands[2];
uniform float u_radius;
uniform float u_decay;
uniform float u_aspect;

void main() {
  float prev = max(texture(u_prev, v_uv).r - u_decay, 0.0);
  float add = 0.0;
  for (int i = 0; i < 2; i++) {
    vec3 h = u_hands[i];
    float d = length((v_uv - h.xy) * vec2(u_aspect, 1.0));
    add = max(add, (1.0 - smoothstep(0.0, u_radius, d)) * h.z);
  }
  o = vec4(max(prev, add), 0.0, 0.0, 1.0);
}
