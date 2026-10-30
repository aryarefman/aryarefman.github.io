// Burning-paper page transition: a full-screen WebGL overlay that is transparent over unburnt paper, so the real
// page underneath is what appears to burn. From the origin outward a noisy burn front advances: scorched brown
// ahead of it, a glowing orange band of fire on it, then charred black with drifting embers behind it.
const VERT = "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }";
const FRAG = `
precision highp float;
uniform vec2 uRes, uOrigin;
uniform float uProgress, uTime;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.07 + 13.1; a *= 0.5; } return s; }
void main() {
  vec2 px = gl_FragCoord.xy, uv = px / uRes.y;
  float maxD = length(max(uOrigin, uRes - uOrigin)) / uRes.y;
  float d = distance(px, uOrigin) / uRes.y / maxD;
  float n = fbm(uv * 6.0) * 0.55 + fbm(uv * 22.0 + uTime * 0.05) * 0.18;
  float v = d + (n - 0.4) * 0.5 - uProgress * 1.45;      // < 0: burnt
  vec4 col = vec4(0.0);
  if (v < -0.035) {
    // char: near-black with flickering embers that cool as the front moves on
    float em = step(0.985, hash(floor(px / 3.0) + floor(uTime * 8.0))) * smoothstep(-0.35, -0.04, v);
    col = vec4(vec3(0.02, 0.012, 0.01) + vec3(1.0, 0.35, 0.05) * em, 1.0);
  } else if (v < 0.0) {
    float k = (v + 0.035) / 0.035;                      // 0 char side → 1 fire side
    col = vec4(mix(vec3(0.05, 0.02, 0.01), vec3(1.0, 0.42, 0.06), k * k), 1.0);
  } else if (v < 0.022) {
    float k = v / 0.022;
    col = vec4(mix(vec3(1.0, 0.78, 0.35), vec3(0.55, 0.25, 0.08), k), 1.0 - k * 0.35);
  } else if (v < 0.11) {
    float k = (v - 0.022) / 0.088;                      // scorch: the paper browns before it catches
    col = vec4(0.35, 0.17, 0.05, (1.0 - k) * 0.55);
  }
  gl_FragColor = col;
}`;

export function burnPage({ x = innerWidth / 2, y = innerHeight / 2, duration = 1.7, onDone = () => {} } = {}) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:9999;pointer-events:all";
  document.body.appendChild(canvas);
  const gl = canvas.getContext("webgl", { premultipliedAlpha: false, alpha: true });
  if (!gl) { onDone(); return; }
  const dpr = Math.min(devicePixelRatio, 1.5);
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(prog); gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (n) => gl.getUniformLocation(prog, n);
  gl.uniform2f(u("uRes"), canvas.width, canvas.height);
  gl.uniform2f(u("uOrigin"), x * dpr, (innerHeight - y) * dpr);   // GL's origin is bottom-left
  gl.viewport(0, 0, canvas.width, canvas.height);
  const t0 = performance.now();
  (function tick(now) {
    const k = Math.min(1, (now - t0) / (duration * 1000));
    gl.uniform1f(u("uProgress"), k * k * (3 - 2 * k) * 0.6 + k * 0.4);
    gl.uniform1f(u("uTime"), (now - t0) / 1000);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (k < 1) requestAnimationFrame(tick); else setTimeout(onDone, 120);
  })(t0);
}
