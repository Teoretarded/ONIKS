/* WebGL2 foundation: context, resize with a render scale, shader and buffer helpers.
   No antialiasing (the dots are crisp squares), opaque canvas, a depth buffer for the terrain occluder. */

export function createGL(canvas, opts) {
  opts = opts || {};
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: true, stencil: false, premultipliedAlpha: false,
    preserveDrawingBuffer: !!opts.preserve, powerPreference: 'high-performance', desynchronized: false,
  });
  if (!gl) throw new Error('WebGL2 is not available');
  const ext = {
    floatLinear: gl.getExtension('OES_texture_float_linear'),
    colorFloat: gl.getExtension('EXT_color_buffer_float'),
  };
  const G = {
    gl, canvas, ext,
    renderScale: opts.renderScale || 1,
    W: 0, H: 0, cssW: 0, cssH: 0, dpr: 1,
    pointMax: gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1],
    /* match the backing store to the CSS size x devicePixelRatio x renderScale; true when it changed */
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr || 2);
      const cw = canvas.clientWidth || window.innerWidth, ch = canvas.clientHeight || window.innerHeight;
      const W = Math.max(1, Math.round(cw * dpr * G.renderScale)), H = Math.max(1, Math.round(ch * dpr * G.renderScale));
      G.cssW = cw; G.cssH = ch; G.dpr = dpr;
      if (W === G.W && H === G.H) return false;
      canvas.width = W; canvas.height = H; G.W = W; G.H = H;
      return true;
    },
  };
  G.resize();
  return G;
}

export function compile(gl, type, src, name) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s), lines = src.split('\n');
    const m = /ERROR: \d+:(\d+)/.exec(log || '');
    const at = m ? +m[1] : 0;
    const ctx = at ? lines.slice(Math.max(0, at - 3), at + 2).map((l, k) => `${Math.max(1, at - 2) + k}: ${l}`).join('\n') : '';
    throw new Error(`shader ${name || ''} (${type === gl.VERTEX_SHADER ? 'vs' : 'fs'}): ${log}\n${ctx}`);
  }
  return s;
}

/* program with its uniform locations and uniform-block binding (block 'Frame' -> binding 0) */
export function program(gl, vs, fs, name) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, name));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, name));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link ${name || ''}: ${gl.getProgramInfoLog(p)}`);
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const nm = info.name.replace(/\[0\]$/, '');
    const loc = gl.getUniformLocation(p, info.name);
    if (loc) u[nm] = loc;
  }
  const bi = gl.getUniformBlockIndex(p, 'Frame');
  if (bi !== gl.INVALID_INDEX) gl.uniformBlockBinding(p, bi, 0);
  return { p, u, name };
}

export function buffer(gl, data, usage) {
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
  return b;
}

/* R32F texture from a Float32Array (nearest; the shaders filter by hand when needed) */
export function floatTex(gl, w, h, data, linear) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, data);
  const f = linear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/* RGBA8 texture (filterable) */
export function rgbaTex(gl, w, h, data, linear) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  const f = linear === false ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
