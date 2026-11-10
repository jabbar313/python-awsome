/* Tayhami Labs — hero orb. A breathing, wobbling bronze sphere rendered with a WebGL1
   fragment shader. Written for this site: the shape comes from a displaced signed-distance
   sphere, shaded with a bronze environment, a sweeping highlight band and a gold rim.
   Without WebGL, reduced motion, or before the first frame, the CSS orb stays visible. */
(() => {
  const hero = document.querySelector('.hero');
  const canvas = document.querySelector('.hero__canvas');
  if (!hero || !canvas) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return;

  const VERT = 'attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }';
  const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPointer;
uniform float uDim;

// Surface wobble: spherical-harmonic lobes. Each lobe averages to zero over the sphere, so the
// average radius stays fixed while the lumps travel across the surface.
float wobble(vec3 p, float t) {
  vec3 n = p / max(length(p), 0.001);
  float zonal2 = 0.5 * (3.0 * n.z * n.z - 1.0);
  float tesseral2 = 1.732 * n.x * n.y;
  float zonal3 = 0.5 * (5.0 * n.z * n.z * n.z - 3.0 * n.z);
  float tesseral2b = 1.936 * n.y * n.z;
  return 0.085 * (cos(0.55 * t) * zonal2 + sin(0.42 * t) * tesseral2)
       + 0.050 * (cos(0.70 * t + 1.0) * zonal3 + sin(0.50 * t) * tesseral2b);
}
// Fixed radius: no breathing, so the orb keeps its size.
float radius(float t) { return 0.66; }
float field(vec3 p, float t) { return length(p) - radius(t) + wobble(p, t); }

vec3 surfaceNormal(vec3 p, float t) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    field(p + e.xyy, t) - field(p - e.xyy, t),
    field(p + e.yxy, t) - field(p - e.yxy, t),
    field(p + e.yyx, t) - field(p - e.yyx, t)));
}

// Bronze environment: dark brown floor, warm mid-tones, a moving soft-box band and a gold sweep.
vec3 environment(vec3 r, float t) {
  float y = r.y * 0.5 + 0.5;
  vec3 c = mix(vec3(0.02, 0.012, 0.008), vec3(0.16, 0.095, 0.06), smoothstep(0.15, 0.95, y));
  float band = smoothstep(0.965, 0.995, sin(r.y * 3.1 + r.x * 0.9 + t * 0.12) * 0.5 + 0.5);
  c += vec3(0.92, 0.85, 0.72) * band * 0.5;
  c += vec3(0.89, 0.77, 0.56) * pow(max(dot(r, normalize(vec3(-0.55, 0.75, 0.45))), 0.0), 18.0) * 0.9;
  return c;
}

void main() {
  vec2 centre = uRes * vec2(0.5, 0.49);
  float unit = min(uRes.x, uRes.y) * 0.9;
  vec2 uv = gl_FragCoord.xy / uRes;

  // Background: near-black with a faint bronze halo that dims with scroll.
  vec2 cuv = uv - vec2(0.5, 0.49);
  float halo = exp(-dot(cuv, cuv) * 9.0);
  vec3 col = mix(vec3(0.016, 0.015, 0.012), vec3(0.16, 0.10, 0.06), halo * mix(0.45, 0.2, uDim));

  // Ray from a camera on +z through the pixel.
  vec2 p = (gl_FragCoord.xy - centre) / unit;
  vec3 ro = vec3(0.0, 0.0, 3.0);
  vec3 rd = normalize(vec3(p, -1.6));

  // Bounding sphere test before marching.
  float b = dot(ro, rd);
  float c = dot(ro, ro) - 0.92 * 0.92;
  float disc = b * b - c;
  if (disc > 0.0) {
    float t0 = max(0.0, -b - sqrt(disc));
    bool hit = false;
    for (int i = 0; i < 72; i++) {
      float d = field(ro + rd * t0, uTime);
      if (d < 0.0008) { hit = true; break; }
      t0 += d * 0.9;
      if (t0 > 6.0) break;
    }
    if (hit) {
      vec3 x = ro + rd * t0;
      vec3 n = surfaceNormal(x, uTime);
      vec3 v = -rd;
      vec3 l = normalize(vec3((uPointer.x - 0.5) * 5.0 - 1.2, (uPointer.y - 0.5) * 5.0 + 1.6, 2.2));
      float fres = pow(1.0 - max(dot(n, v), 0.0), 2.6);
      float diff = max(dot(n, l), 0.0);
      float spec = pow(max(dot(reflect(-l, n), v), 0.0), 46.0);
      vec3 tint = mix(vec3(0.82, 0.50, 0.30), vec3(0.89, 0.77, 0.56), clamp(fres * 1.2 + diff * 0.35, 0.0, 1.0));
      vec3 shaded = vec3(0.10, 0.06, 0.035) * (0.3 + diff)
                  + environment(reflect(rd, n), uTime) * tint * 1.1
                  + vec3(0.89, 0.77, 0.56) * fres * 0.5
                  + vec3(0.95, 0.92, 0.87) * spec * 1.0;
      col = shaded * mix(0.62, 1.0, 1.0 - uDim);
    }
  }

  // Gentle vignette.
  vec2 vc = uv - 0.5;
  col *= 1.0 - 0.35 * dot(vc, vc);
  gl_FragColor = vec4(col, 1.0);
}`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  }
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  // One oversized triangle covers the viewport.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(program, 'uRes');
  const uTime = gl.getUniformLocation(program, 'uTime');
  const uPointer = gl.getUniformLocation(program, 'uPointer');
  const uDim = gl.getUniformLocation(program, 'uDim');

  const PARALLAX = 0.45;
  const pointer = { x: 0.5, y: 0.55 };
  const smoothPointer = { x: 0.5, y: 0.55 };
  let time = 8;
  let last = performance.now();
  let raf = 0;
  let running = false;
  let visible = true;
  let started = false;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    let scale = Math.min(window.devicePixelRatio || 1, 2);
    const maxPixels = 4e6;
    const pixels = rect.width * rect.height * scale * scale;
    if (pixels > maxPixels) scale *= Math.sqrt(maxPixels / pixels);
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function draw() {
    smoothPointer.x += (pointer.x - smoothPointer.x) * 0.045;
    smoothPointer.y += (pointer.y - smoothPointer.y) * 0.045;
    const dim = Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.9)));
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, time);
    gl.uniform2f(uPointer, smoothPointer.x, smoothPointer.y);
    gl.uniform1f(uDim, dim);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!started) {
      started = true;
      canvas.parentElement.classList.add('is-webgl');
    }
  }

  function loop(now) {
    if (!running) return;
    time += Math.min(50, now - last) / 1000;
    last = now;
    draw();
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (reduce || running || !visible || document.hidden) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  // Cursor (or touch) moves the light.
  const track = (e) => {
    pointer.x = e.clientX / window.innerWidth;
    pointer.y = 1 - e.clientY / window.innerHeight;
  };
  window.addEventListener('pointermove', track, { passive: true });
  window.addEventListener('pointerdown', track, { passive: true });

  // The orb drifts slower than the page as you scroll away from the hero.
  let ticking = false;
  const parallax = () => {
    ticking = false;
    const y = Math.max(0, window.scrollY);
    if (y > hero.offsetHeight * 1.2) return;
    canvas.style.transform = `translate3d(0, ${(y * PARALLAX).toFixed(1)}px, 0)`;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(parallax);
    }
  }, { passive: true });

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start(); else stop();
  }, { threshold: 0 }).observe(hero);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop(); else start();
  });

  resize();
  draw();
  if (reduce) return;
  start();
})();
