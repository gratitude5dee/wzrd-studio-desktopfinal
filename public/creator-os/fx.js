/* ============================================================
   WZRD Creator OS — atmosphere engine
   Dependency-free web components porting the React Bits effects
   (LightRays, Dither, LiquidChrome, FaultyTerminal, Prism,
   PrismaticBurst, GridMotion, PixelCard) to raw WebGL / DOM.

   Every element:
   - paints one static frame even when motion is off/reduced
   - only animates while on screen (IntersectionObserver)
   - respects mode="full|calm|off" + prefers-reduced-motion
   - caps devicePixelRatio per effect cost
   ============================================================ */
(() => {
  'use strict';
  if (customElements.get('wz-sky')) return; // hot-reload guard

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- shared GL helpers ---------- */
  const V1 = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const V2 = '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const err = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('shader: ' + err);
    }
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    return p;
  }
  function bigTri(gl, prog) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }
  function hexRGB(hex, fallback) {
    let h = String(hex || '').trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    if (isNaN(n) || h.length !== 6) return fallback || [1, 1, 1];
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  /* ---------- base element ---------- */
  class FXBase extends HTMLElement {
    static get observedAttributes() { return ['mode']; }
    constructor() {
      super();
      this._t = Math.random() * 40; // desync siblings
      this._raf = 0;
      this._visible = false;
      this._booted = false;
      this._dead = false;
      this._lost = false;
      this._relTimer = 0;
      this._releasing = false;
      const sh = this.attachShadow({ mode: 'open' });
      const st = document.createElement('style');
      st.textContent = ':host{position:absolute;inset:0;display:block;pointer-events:none;overflow:hidden}canvas{position:absolute;inset:0;width:100%;height:100%;display:block}';
      sh.appendChild(st);
      this._canvas = document.createElement('canvas');
      sh.appendChild(this._canvas);
    }
    get mode() { const m = this.getAttribute('mode'); return m === 'off' ? 'off' : m === 'calm' ? 'calm' : 'full'; }
    get speedScale() { return this.mode === 'calm' ? 0.32 : 1; }
    fAttr(name, def) { const v = parseFloat(this.getAttribute(name)); return isNaN(v) ? def : v; }
    connectedCallback() {
      if (this._booted) { this._sync(); return; }
      this._booted = true;
      try { this.init(); } catch (e) { console.warn('[wz-fx]', this.tagName, e.message); this._dead = true; }
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(this);
      this._io = new IntersectionObserver(es => {
        this._visible = es.some(e => e.isIntersecting);
        if (this._visible) { clearTimeout(this._relTimer); this._ensureGL(); }
        else this._scheduleRelease();
        this._sync();
      }, { rootMargin: '140px' });
      this._io.observe(this);
      this._onVis = () => this._sync();
      document.addEventListener('visibilitychange', this._onVis);
      if (REDUCED.addEventListener) REDUCED.addEventListener('change', this._onVis);
      this._resize();
      this._sync();
    }
    disconnectedCallback() {
      this._stop();
      clearTimeout(this._relTimer);
      if (this._ro) this._ro.disconnect();
      if (this._io) this._io.disconnect();
      document.removeEventListener('visibilitychange', this._onVis);
      if (REDUCED.removeEventListener) REDUCED.removeEventListener('change', this._onVis);
    }
    attributeChangedCallback() { if (this._booted) this._sync(); }
    get shouldRun() { return !this._dead && this._visible && !document.hidden && this.mode !== 'off' && !REDUCED.matches; }
    _sync() {
      this._canvas.style.display = (this.mode === 'off' || this._dead || !this.ready) ? 'none' : 'block';
      if (this.shouldRun && this.ready) this._start(); else this._stop();
    }
    _start() {
      if (this._raf) return;
      this._last = performance.now();
      const loop = ts => {
        if (!this.shouldRun || !this.ready) { this._raf = 0; return; }
        const dt = Math.min(50, ts - this._last);
        this._last = ts;
        this._t += dt * 0.001 * this.speedScale;
        try { this.draw(this._t, dt * 0.001); }
        catch (e) { console.warn('[wz-fx draw]', this.tagName, e.message); this._dead = true; this._sync(); return; }
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }
    _stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } }
    _resize() {
      const w = Math.max(1, this.clientWidth), h = Math.max(1, this.clientHeight);
      const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap || 1.5);
      this._w = Math.max(1, Math.round(w * dpr));
      this._h = Math.max(1, Math.round(h * dpr));
      this._dpr = dpr;
      if (this._canvas.width !== this._w) this._canvas.width = this._w;
      if (this._canvas.height !== this._h) this._canvas.height = this._h;
      if (this._dead || !this.ready) return;
      try {
        if (this.onResize) this.onResize(this._w, this._h);
        this.draw(this._t, 0); // static frame for paused/reduced states
      } catch (e) { /* first layout may race; loop will recover */ }
    }
    init() {} draw() {}
    get ready() { return true; }
    _ensureGL() {}
    _scheduleRelease() {}
  }

  class FXShader extends FXBase {
    get ready() { return !!this.gl && !this._lost; }
    glSetup() {}
    /* Contexts are created lazily on first visibility and released when
       far offscreen, so only a couple of WebGL contexts are ever alive
       at once (browser eviction killed eager contexts). */
    _ensureGL() {
      if (this._dead || (this.gl && !this._lost)) return;
      if (this._lost || this.gl) {
        const fresh = this._canvas.cloneNode(false); // fresh canvas = fresh context
        this._canvas.replaceWith(fresh);
        this._canvas = fresh;
        this.gl = null; this.prog = null; this._U = {};
        this._lost = false;
      }
      try {
        this.glSetup();
        this._resize();
      } catch (e) { console.warn('[wz-fx gl]', this.tagName, e.message); this._dead = true; }
      this._sync();
    }
    _scheduleRelease() {
      clearTimeout(this._relTimer);
      if (!this.gl || this._lost) return;
      this._relTimer = setTimeout(() => {
        if (this._visible || !this.gl || this._lost) return;
        this._releasing = true;
        try { const ext = this.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e) {}
        this._releasing = false;
        this._lost = true; this.gl = null; this.prog = null; this._U = {};
        this._sync();
      }, 5000);
    }
    glInit(frag, ver) {
      const opts = { alpha: true, antialias: false, premultipliedAlpha: false, depth: false, stencil: false };
      const gl = ver === 2 ? this._canvas.getContext('webgl2', opts) : (this._canvas.getContext('webgl', opts) || this._canvas.getContext('experimental-webgl', opts));
      if (!gl) throw new Error('no webgl' + (ver === 2 ? '2' : ''));
      this.gl = gl;
      this.prog = program(gl, ver === 2 ? V2 : V1, frag);
      gl.useProgram(this.prog);
      bigTri(gl, this.prog);
      this._U = {};
      this._canvas.addEventListener('webglcontextlost', e => {
        e.preventDefault();
        this._stop();
        this._lost = true; this.gl = null; this.prog = null; this._U = {};
        this._sync(); // fallback art shows while context is gone
        if (this._visible && !this._releasing) setTimeout(() => { if (this._visible) this._ensureGL(); }, 400);
      });
    }
    u(name) { if (!(name in this._U)) this._U[name] = this.gl.getUniformLocation(this.prog, name); return this._U[name]; }
    onResize(w, h) { if (this.gl) this.gl.viewport(0, 0, w, h); }
    blit() { this.gl.drawArrays(this.gl.TRIANGLES, 0, 3); }
  }

  /* ============================================================
     <wz-sky> — hero atmosphere: the repo's fBm cloud field fused
     with the React Bits LightRays pass in a single context.
     Property: .progress (0..1 scroll journey)
     ============================================================ */
  const SKY_FRAG = `
precision highp float;
uniform vec2 uRes;uniform float uTime;uniform float uProgress;uniform float uRays;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);
return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}
float fbm(vec2 p){float s=0.0;float a=0.56;mat2 r=mat2(0.8,-0.6,0.6,0.8);
for(int i=0;i<5;i++){s+=a*noise(p);p=r*p*2.03+9.7;a*=0.52;}return s;}
float rayStrength(vec2 src,vec2 dir,vec2 coord,float seedA,float seedB,float speed){
vec2 toC=coord-src;float d=length(toC);vec2 dn=toC/max(d,1e-4);
float cosA=dot(dn,dir);
float distorted=cosA+0.04*sin(uTime*1.4+d*3.0);
float spread=pow(max(distorted,0.0),2.4);
float lenFall=clamp((1.7-d)/1.7,0.0,1.0);
float base=clamp((0.45+0.15*sin(distorted*seedA+uTime*speed))+(0.3+0.2*cos(-distorted*seedB+uTime*speed)),0.0,1.0);
return base*lenFall*spread;}
void main(){
vec2 uv=gl_FragCoord.xy/uRes;
float j=clamp(uProgress,0.0,1.0);
vec2 drift=vec2(-j*0.46-uTime*0.006,j*0.11+uTime*0.0018);
float horizon=smoothstep(0.0,0.72,uv.y);
vec3 sky=mix(vec3(0.015,0.045,0.12),vec3(0.08,0.30,0.62),horizon);
float fA=fbm(uv*vec2(2.1,3.2)+drift);
float fB=fbm(uv*vec2(4.8,2.3)-drift*0.65);
float cloud=smoothstep(0.42,0.78,fA*0.72+fB*0.38+uv.y*0.12);
float mist=smoothstep(0.18,0.92,fbm(uv*vec2(1.15,2.1)+drift*0.4));
vec3 cloudColor=mix(vec3(0.21,0.36,0.56),vec3(0.86,0.93,1.0),smoothstep(0.42,1.0,fB+uv.y*0.24));
sky=mix(sky,cloudColor,cloud*(0.78-j*0.22));
sky+=mist*0.055*vec3(0.42,0.65,1.0);
vec2 sunP=vec2(0.73,0.64);
float sun=smoothstep(0.28,0.0,distance(uv,sunP));
sky+=sun*vec3(0.3,0.42,0.56)*(1.0-j*0.58);
vec2 asp=vec2(uRes.x/uRes.y,1.0);
vec2 rc=uv*asp;vec2 rs=sunP*asp;
vec2 rdir=normalize(vec2(-0.34,-1.0));
float r1=rayStrength(rs,rdir,rc,36.2214,21.11349,1.1);
float r2=rayStrength(rs,rdir,rc,22.3991,18.0234,0.8);
float rays=(r1*0.5+r2*0.4)*uRays*(1.0-j*0.55);
sky+=rays*vec3(0.72,0.86,1.0)*(0.55+0.45*cloud);
sky+=(hash(gl_FragCoord.xy+uTime)*2.0-1.0)*0.012;
float veil=smoothstep(0.52,1.0,j);
sky=mix(sky,vec3(0.02,0.035,0.07),veil*0.84);
sky*=0.85+0.15*smoothstep(0.0,0.45,uv.y);
gl_FragColor=vec4(sky,1.0);}`;

  class WZSky extends FXShader {
    constructor() { super(); this.dprCap = 1.25; this._progress = 0; }
    get progress() { return this._progress; }
    set progress(v) {
      this._progress = Math.max(0, Math.min(1, +v || 0));
      if (!this._raf && this._booted && !this._dead && this.ready && this.mode !== 'off') {
        try { this.draw(this._t, 0); } catch (e) {}
      }
    }
    glSetup() { this.glInit(SKY_FRAG, 1); }
    draw(t) {
      const gl = this.gl;
      gl.uniform2f(this.u('uRes'), this._w, this._h);
      gl.uniform1f(this.u('uTime'), t);
      gl.uniform1f(this.u('uProgress'), this._progress);
      gl.uniform1f(this.u('uRays'), this.fAttr('rays', 0.9));
      this.blit();
    }
  }

  /* ============================================================
     <wz-dither> — React Bits Dither: perlin fBm waves quantized
     through an 8x8 Bayer matrix. Single pass, WebGL2.
     attrs: color, pixel, levels, speed, freq, amp
     ============================================================ */
  const DITHER_FRAG = `#version 300 es
precision highp float;
out vec4 O;
uniform vec2 uRes;uniform float uTime;uniform vec3 uColor;
uniform float uColorNum;uniform float uPixel;uniform float uFreq;uniform float uAmp;uniform float uSpeed;
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
vec2 fade(vec2 t){return t*t*t*(t*(t*6.0-15.0)+10.0);}
float cnoise(vec2 P){
vec4 Pi=floor(P.xyxy)+vec4(0.0,0.0,1.0,1.0);
vec4 Pf=fract(P.xyxy)-vec4(0.0,0.0,1.0,1.0);
Pi=mod289(Pi);
vec4 ix=Pi.xzxz;vec4 iy=Pi.yyww;vec4 fx=Pf.xzxz;vec4 fy=Pf.yyww;
vec4 i=permute(permute(ix)+iy);
vec4 gx=fract(i*(1.0/41.0))*2.0-1.0;
vec4 gy=abs(gx)-0.5;vec4 tx=floor(gx+0.5);gx=gx-tx;
vec2 g00=vec2(gx.x,gy.x);vec2 g10=vec2(gx.y,gy.y);vec2 g01=vec2(gx.z,gy.z);vec2 g11=vec2(gx.w,gy.w);
vec4 norm=taylorInvSqrt(vec4(dot(g00,g00),dot(g01,g01),dot(g10,g10),dot(g11,g11)));
g00*=norm.x;g01*=norm.y;g10*=norm.z;g11*=norm.w;
float n00=dot(g00,vec2(fx.x,fy.x));float n10=dot(g10,vec2(fx.y,fy.y));
float n01=dot(g01,vec2(fx.z,fy.z));float n11=dot(g11,vec2(fx.w,fy.w));
vec2 fade_xy=fade(Pf.xy);
vec2 n_x=mix(vec2(n00,n01),vec2(n10,n11),fade_xy.x);
return 2.3*mix(n_x.x,n_x.y,fade_xy.y);}
float fbm(vec2 p){float value=0.0;float amp=1.0;
for(int i=0;i<4;i++){value+=amp*abs(cnoise(p));p*=uFreq;amp*=uAmp;}return value;}
float pattern(vec2 p){vec2 p2=p-uTime*uSpeed;return fbm(p+fbm(p2));}
const float bayer[64]=float[64](
0.0/64.0,48.0/64.0,12.0/64.0,60.0/64.0,3.0/64.0,51.0/64.0,15.0/64.0,63.0/64.0,
32.0/64.0,16.0/64.0,44.0/64.0,28.0/64.0,35.0/64.0,19.0/64.0,47.0/64.0,31.0/64.0,
8.0/64.0,56.0/64.0,4.0/64.0,52.0/64.0,11.0/64.0,59.0/64.0,7.0/64.0,55.0/64.0,
40.0/64.0,24.0/64.0,36.0/64.0,20.0/64.0,43.0/64.0,27.0/64.0,39.0/64.0,23.0/64.0,
2.0/64.0,50.0/64.0,14.0/64.0,62.0/64.0,1.0/64.0,49.0/64.0,13.0/64.0,61.0/64.0,
34.0/64.0,18.0/64.0,46.0/64.0,30.0/64.0,33.0/64.0,17.0/64.0,45.0/64.0,29.0/64.0,
10.0/64.0,58.0/64.0,6.0/64.0,54.0/64.0,9.0/64.0,57.0/64.0,5.0/64.0,53.0/64.0,
42.0/64.0,26.0/64.0,38.0/64.0,22.0/64.0,41.0/64.0,25.0/64.0,37.0/64.0,21.0/64.0);
void main(){
vec2 fc=floor(gl_FragCoord.xy/uPixel)*uPixel;
vec2 uv=fc/uRes-0.5;uv.x*=uRes.x/uRes.y;
float f=pattern(uv);
vec3 col=uColor*f;
ivec2 cell=ivec2(mod(floor(gl_FragCoord.xy/uPixel),8.0));
float threshold=bayer[cell.y*8+cell.x]-0.25;
float stp=1.0/(uColorNum-1.0);
col+=threshold*stp;
col=clamp(col-0.2,0.0,1.0);
col=floor(col*(uColorNum-1.0)+0.5)/(uColorNum-1.0);
O=vec4(col,1.0);}`;

  class WZDither extends FXShader {
    constructor() { super(); this.dprCap = 1.25; }
    glSetup() { this.glInit(DITHER_FRAG, 2); }
    draw(t) {
      const gl = this.gl;
      gl.uniform2f(this.u('uRes'), this._w, this._h);
      gl.uniform1f(this.u('uTime'), t);
      gl.uniform3fv(this.u('uColor'), hexRGB(this.getAttribute('color'), [0.49, 0.72, 1]));
      gl.uniform1f(this.u('uColorNum'), this.fAttr('levels', 4));
      gl.uniform1f(this.u('uPixel'), this.fAttr('pixel', 2.5) * (this._dpr || 1));
      gl.uniform1f(this.u('uFreq'), this.fAttr('freq', 2.6));
      gl.uniform1f(this.u('uAmp'), this.fAttr('amp', 0.32));
      gl.uniform1f(this.u('uSpeed'), this.fAttr('speed', 0.055));
      this.blit();
    }
  }

  /* ============================================================
     <wz-chrome> — React Bits LiquidChrome, pointer-reactive.
     attrs: base, amp, fx, fy, speed
     ============================================================ */
  const CHROME_FRAG = `
precision highp float;
uniform float uTime;uniform vec2 uRes;uniform vec3 uBase;
uniform float uAmp;uniform float uFx;uniform float uFy;uniform vec2 uMouse;
vec4 renderImage(vec2 uvCoord){
vec2 fragCoord=uvCoord*uRes;
vec2 uv=(2.0*fragCoord-uRes)/min(uRes.x,uRes.y);
for(float i=1.0;i<10.0;i++){
uv.x+=uAmp/i*cos(i*uFx*uv.y+uTime+uMouse.x*3.14159);
uv.y+=uAmp/i*cos(i*uFy*uv.x+uTime+uMouse.y*3.14159);}
vec2 diff=uvCoord-uMouse;
float dist=length(diff);
float falloff=exp(-dist*20.0);
float ripple=sin(10.0*dist-uTime*2.0)*0.03;
uv+=(diff/(dist+0.0001))*ripple*falloff;
vec3 color=uBase/abs(sin(uTime-uv.y-uv.x));
return vec4(min(color,vec3(1.4)),1.0);}
void main(){
vec2 vUv=gl_FragCoord.xy/uRes;
vec4 col=vec4(0.0);
for(int i=-1;i<=1;i++){for(int j=-1;j<=1;j++){
col+=renderImage(vUv+vec2(float(i),float(j))/min(uRes.x,uRes.y));}}
gl_FragColor=col/9.0;}`;

  class WZChrome extends FXShader {
    constructor() { super(); this.dprCap = 1; this._mx = 0.3; this._my = 0.35; this._tmx = 0.3; this._tmy = 0.35; }
    glSetup() { this.glInit(CHROME_FRAG, 1); }
    init() {
      const host = this.parentElement;
      if (host) {
        this._host = host;
        this._onMove = e => {
          const r = this.getBoundingClientRect();
          if (!r.width) return;
          this._tmx = (e.clientX - r.left) / r.width;
          this._tmy = 1 - (e.clientY - r.top) / r.height;
        };
        host.addEventListener('pointermove', this._onMove, { passive: true });
      }
    }
    disconnectedCallback() {
      // parentElement is already null once detached, so use the cached host.
      if (this._onMove && this._host) this._host.removeEventListener('pointermove', this._onMove);
      super.disconnectedCallback();
    }
    draw(t) {
      const gl = this.gl;
      this._mx += (this._tmx - this._mx) * 0.06;
      this._my += (this._tmy - this._my) * 0.06;
      gl.uniform2f(this.u('uRes'), this._w, this._h);
      gl.uniform1f(this.u('uTime'), t * this.fAttr('speed', 0.5));
      gl.uniform3fv(this.u('uBase'), hexRGB(this.getAttribute('base'), [0.04, 0.12, 0.14]));
      gl.uniform1f(this.u('uAmp'), this.fAttr('amp', 0.45));
      gl.uniform1f(this.u('uFx'), this.fAttr('fx', 2.2));
      gl.uniform1f(this.u('uFy'), this.fAttr('fy', 1.6));
      gl.uniform2f(this.u('uMouse'), this._mx, this._my);
      this.blit();
    }
  }

  /* ============================================================
     <wz-terminal> — React Bits FaultyTerminal (verbatim shader,
     vUv derived from gl_FragCoord). attrs: tint, scale, bright,
     speed, curve, scanline, flicker, glitch, dither, digit
     ============================================================ */
  const TERMINAL_FRAG = `
precision mediump float;
uniform float iTime;
uniform vec3 iResolution;
uniform float uScale;
uniform vec2 uGridMul;
uniform float uDigitSize;
uniform float uScanlineIntensity;
uniform float uGlitchAmount;
uniform float uFlickerAmount;
uniform float uNoiseAmp;
uniform float uChromaticAberration;
uniform float uDither;
uniform float uCurvature;
uniform vec3 uTint;
uniform vec2 uMouse;
uniform float uMouseStrength;
uniform float uUseMouse;
uniform float uPageLoadProgress;
uniform float uUsePageLoadAnimation;
uniform float uBrightness;
float time;
float hash21(vec2 p){p=fract(p*234.56);p+=dot(p,p+34.56);return fract(p.x*p.y);}
float noise(vec2 p){return sin(p.x*10.0)*sin(p.y*(3.0+sin(time*0.090909)))+0.2;}
mat2 rotate(float angle){float c=cos(angle);float s=sin(angle);return mat2(c,-s,s,c);}
float fbm(vec2 p){
p*=1.1;float f=0.0;float amp=0.5*uNoiseAmp;
mat2 modify0=rotate(time*0.02);f+=amp*noise(p);p=modify0*p*2.0;amp*=0.454545;
mat2 modify1=rotate(time*0.02);f+=amp*noise(p);p=modify1*p*2.0;amp*=0.454545;
mat2 modify2=rotate(time*0.08);f+=amp*noise(p);
return f;}
float pattern(vec2 p,out vec2 q,out vec2 r){
vec2 offset1=vec2(1.0);vec2 offset0=vec2(0.0);
mat2 rot01=rotate(0.1*time);mat2 rot1=rotate(0.1);
q=vec2(fbm(p+offset1),fbm(rot01*p+offset1));
r=vec2(fbm(rot1*q+offset0),fbm(q+offset0));
return fbm(p+r);}
float digit(vec2 p){
vec2 grid=uGridMul*15.0;
vec2 s=floor(p*grid)/grid;
p=p*grid;
vec2 q;vec2 r;
float intensity=pattern(s*0.1,q,r)*1.3-0.03;
if(uUseMouse>0.5){
vec2 mouseWorld=uMouse*uScale;
float distToMouse=distance(s,mouseWorld);
float mouseInfluence=exp(-distToMouse*8.0)*uMouseStrength*10.0;
intensity+=mouseInfluence;
float ripple=sin(distToMouse*20.0-iTime*5.0)*0.1*mouseInfluence;
intensity+=ripple;}
if(uUsePageLoadAnimation>0.5){
float cellRandom=fract(sin(dot(s,vec2(12.9898,78.233)))*43758.5453);
float cellDelay=cellRandom*0.8;
float cellProgress=clamp((uPageLoadProgress-cellDelay)/0.2,0.0,1.0);
float fadeAlpha=smoothstep(0.0,1.0,cellProgress);
intensity*=fadeAlpha;}
p=fract(p);
p*=uDigitSize;
float px5=p.x*5.0;
float py5=(1.0-p.y)*5.0;
float x=fract(px5);
float y=fract(py5);
float i=floor(py5)-2.0;
float j=floor(px5)-2.0;
float n=i*i+j*j;
float f=n*0.0625;
float isOn=step(0.1,intensity-f);
float brightness=isOn*(0.2+y*0.8)*(0.75+x*0.25);
return step(0.0,p.x)*step(p.x,1.0)*step(0.0,p.y)*step(p.y,1.0)*brightness;}
float onOff(float a,float b,float c){return step(c,sin(iTime+a*cos(iTime*b)))*uFlickerAmount;}
float displace(vec2 look){
float y=look.y-mod(iTime*0.25,1.0);
float window=1.0/(1.0+50.0*y*y);
return sin(look.y*20.0+iTime)*0.0125*onOff(4.0,2.0,0.8)*(1.0+cos(iTime*60.0))*window;}
vec3 getColor(vec2 p){
float bar=step(mod(p.y+time*20.0,1.0),0.2)*0.4+1.0;
bar*=uScanlineIntensity;
float displacement=displace(p);
p.x+=displacement;
if(uGlitchAmount!=1.0){float extra=displacement*(uGlitchAmount-1.0);p.x+=extra;}
float middle=digit(p);
const float off=0.002;
float sum=digit(p+vec2(-off,-off))+digit(p+vec2(0.0,-off))+digit(p+vec2(off,-off))+
digit(p+vec2(-off,0.0))+digit(p+vec2(0.0,0.0))+digit(p+vec2(off,0.0))+
digit(p+vec2(-off,off))+digit(p+vec2(0.0,off))+digit(p+vec2(off,off));
vec3 baseColor=vec3(0.9)*middle+sum*0.1*vec3(1.0)*bar;
return baseColor;}
vec2 barrel(vec2 uv){
vec2 c=uv*2.0-1.0;
float r2=dot(c,c);
c*=1.0+uCurvature*r2;
return c*0.5+0.5;}
void main(){
time=iTime*0.333333;
vec2 vUv=gl_FragCoord.xy/iResolution.xy;
vec2 uv=vUv;
if(uCurvature!=0.0){uv=barrel(uv);}
vec2 p=uv*uScale;
vec3 col=getColor(p);
if(uChromaticAberration!=0.0){
vec2 ca=vec2(uChromaticAberration)/iResolution.xy;
col.r=getColor(p+ca).r;
col.b=getColor(p-ca).b;}
col*=uTint;
col*=uBrightness;
if(uDither>0.0){
float rnd=hash21(gl_FragCoord.xy);
col+=(rnd-0.5)*(uDither*0.003922);}
gl_FragColor=vec4(col,1.0);}`;

  class WZTerminal extends FXShader {
    constructor() {
      super();
      this.dprCap = 1;
      this._mx = 0.5; this._my = 0.5; this._tmx = 0.5; this._tmy = 0.5;
      this._loadStart = 0;
      this._timeOffset = Math.random() * 100;
    }
    glSetup() { this.glInit(TERMINAL_FRAG, 1); }
    init() {
      const host = this.parentElement;
      if (host) {
        this._host = host;
        this._onMove = e => {
          const r = this.getBoundingClientRect();
          if (!r.width) return;
          this._tmx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
          this._tmy = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
        };
        host.addEventListener('pointermove', this._onMove, { passive: true });
      }
    }
    disconnectedCallback() {
      // parentElement is already null once detached, so use the cached host.
      if (this._onMove && this._host) this._host.removeEventListener('pointermove', this._onMove);
      super.disconnectedCallback();
    }
    draw(t) {
      const gl = this.gl;
      if (!this._loadStart) this._loadStart = t;
      const loadP = Math.min(1, (t - this._loadStart) / 2.2);
      this._mx += (this._tmx - this._mx) * 0.08;
      this._my += (this._tmy - this._my) * 0.08;
      gl.uniform1f(this.u('iTime'), (t + this._timeOffset) * this.fAttr('speed', 0.28));
      gl.uniform3f(this.u('iResolution'), this._w, this._h, this._w / this._h);
      gl.uniform1f(this.u('uScale'), this.fAttr('scale', 1.4));
      gl.uniform2f(this.u('uGridMul'), 2, 1);
      gl.uniform1f(this.u('uDigitSize'), this.fAttr('digit', 1.35));
      gl.uniform1f(this.u('uScanlineIntensity'), this.fAttr('scanline', 0.28));
      gl.uniform1f(this.u('uGlitchAmount'), this.fAttr('glitch', 1));
      gl.uniform1f(this.u('uFlickerAmount'), this.fAttr('flicker', 0.6));
      gl.uniform1f(this.u('uNoiseAmp'), this.fAttr('noise', 0.9));
      gl.uniform1f(this.u('uChromaticAberration'), 0);
      gl.uniform1f(this.u('uDither'), this.fAttr('dither', 0.4));
      gl.uniform1f(this.u('uCurvature'), this.fAttr('curve', 0.12));
      gl.uniform3fv(this.u('uTint'), hexRGB(this.getAttribute('tint'), [0.88, 0.48, 0.34]));
      gl.uniform2f(this.u('uMouse'), this._mx, this._my);
      gl.uniform1f(this.u('uMouseStrength'), this.fAttr('mouse', 0.12));
      gl.uniform1f(this.u('uUseMouse'), 1);
      gl.uniform1f(this.u('uPageLoadProgress'), loadP);
      gl.uniform1f(this.u('uUsePageLoadAnimation'), 1);
      gl.uniform1f(this.u('uBrightness'), this.fAttr('bright', 0.55));
      this.blit();
    }
  }

  /* ============================================================
     <wz-prism> — React Bits Prism (verbatim raymarch), driven in
     3drotate mode. attrs: scale, glow, hue, freq, noise, speed,
     height, basew, bloom
     ============================================================ */
  const PRISM_FRAG = `
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uHeight;
uniform float uBaseHalf;
uniform mat3 uRot;
uniform int uUseBaseWobble;
uniform float uGlow;
uniform vec2 uOffsetPx;
uniform float uNoise;
uniform float uSaturation;
uniform float uHueShift;
uniform float uColorFreq;
uniform float uBloom;
uniform float uCenterShift;
uniform float uInvBaseHalf;
uniform float uInvHeight;
uniform float uMinAxis;
uniform float uPxScale;
uniform float uTimeScale;
vec4 tanh4(vec4 x){vec4 e2x=exp(2.0*x);return (e2x-1.0)/(e2x+1.0);}
float rand(vec2 co){return fract(sin(dot(co,vec2(12.9898,78.233)))*43758.5453123);}
float sdOctaAnisoInv(vec3 p){
vec3 q=vec3(abs(p.x)*uInvBaseHalf,abs(p.y)*uInvHeight,abs(p.z)*uInvBaseHalf);
float m=q.x+q.y+q.z-1.0;
return m*uMinAxis*0.5773502691896258;}
float sdPyramidUpInv(vec3 p){
float oct=sdOctaAnisoInv(p);
float halfSpace=-p.y;
return max(oct,halfSpace);}
mat3 hueRotation(float a){
float c=cos(a),s=sin(a);
mat3 W=mat3(0.299,0.587,0.114,0.299,0.587,0.114,0.299,0.587,0.114);
mat3 U=mat3(0.701,-0.587,-0.114,-0.299,0.413,-0.114,-0.300,-0.588,0.886);
mat3 V=mat3(0.168,-0.331,0.500,0.328,0.035,-0.500,-0.497,0.296,0.201);
return W+U*c+V*s;}
void main(){
vec2 f=(gl_FragCoord.xy-0.5*iResolution.xy-uOffsetPx)*uPxScale;
float z=5.0;
float d=0.0;
vec3 p;
vec4 o=vec4(0.0);
float centerShift=uCenterShift;
float cf=uColorFreq;
mat2 wob=mat2(1.0,0.0,0.0,1.0);
if(uUseBaseWobble==1){
float t=iTime*uTimeScale;
float c0=cos(t+0.0);float c1=cos(t+33.0);float c2=cos(t+11.0);
wob=mat2(c0,c1,c2,c0);}
for(int i=0;i<100;i++){
p=vec3(f,z);
p.xz=p.xz*wob;
p=uRot*p;
vec3 q=p;
q.y+=centerShift;
d=0.1+0.2*abs(sdPyramidUpInv(q));
z-=d;
o+=(sin((p.y+z)*cf+vec4(0.0,1.0,2.0,3.0))+1.0)/d;}
o=tanh4(o*o*(uGlow*uBloom)/1e5);
vec3 col=o.rgb;
float n=rand(gl_FragCoord.xy+vec2(iTime));
col+=(n-0.5)*uNoise;
col=clamp(col,0.0,1.0);
float L=dot(col,vec3(0.2126,0.7152,0.0722));
col=clamp(mix(vec3(L),col,uSaturation),0.0,1.0);
if(abs(uHueShift)>0.0001){col=clamp(hueRotation(uHueShift)*col,0.0,1.0);}
gl_FragColor=vec4(col,o.a);}`;

  class WZPrism extends FXShader {
    constructor() {
      super();
      this.dprCap = 1;
      const r = Math.random;
      this._wX = 0.3 + r() * 0.6; this._wY = 0.2 + r() * 0.7; this._wZ = 0.1 + r() * 0.5;
      this._phX = r() * Math.PI * 2; this._phZ = r() * Math.PI * 2;
      this._rot = new Float32Array(9);
    }
    glSetup() { this.glInit(PRISM_FRAG, 1); }
    _setRot(yaw, pitch, roll) {
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const cx = Math.cos(pitch), sx = Math.sin(pitch);
      const cz = Math.cos(roll), sz = Math.sin(roll);
      const o = this._rot;
      o[0] = cy * cz + sy * sx * sz; o[1] = cx * sz; o[2] = -sy * cz + cy * sx * sz;
      o[3] = -cy * sz + sy * sx * cz; o[4] = cx * cz; o[5] = sy * sz + cy * sx * cz;
      o[6] = sy * cx; o[7] = -sx; o[8] = cy * cx;
    }
    draw(t) {
      const gl = this.gl;
      const H = Math.max(0.001, this.fAttr('height', 3.2));
      const BH = Math.max(0.001, this.fAttr('basew', 5.2)) * 0.5;
      const SCALE = Math.max(0.001, this.fAttr('scale', 3.4));
      const ts = this.fAttr('speed', 0.4);
      const tScaled = t * ts;
      this._setRot(tScaled * this._wY, Math.sin(tScaled * this._wX + this._phX) * 0.6, Math.sin(tScaled * this._wZ + this._phZ) * 0.5);
      gl.uniform2f(this.u('iResolution'), this._w, this._h);
      gl.uniform1f(this.u('iTime'), t);
      gl.uniform1f(this.u('uHeight'), H);
      gl.uniform1f(this.u('uBaseHalf'), BH);
      gl.uniformMatrix3fv(this.u('uRot'), false, this._rot);
      gl.uniform1i(this.u('uUseBaseWobble'), 0);
      gl.uniform1f(this.u('uGlow'), this.fAttr('glow', 1));
      gl.uniform2f(this.u('uOffsetPx'), 0, 0);
      gl.uniform1f(this.u('uNoise'), this.fAttr('noise', 0.28));
      gl.uniform1f(this.u('uSaturation'), 1.5);
      gl.uniform1f(this.u('uHueShift'), this.fAttr('hue', 0));
      gl.uniform1f(this.u('uColorFreq'), this.fAttr('freq', 1));
      gl.uniform1f(this.u('uBloom'), this.fAttr('bloom', 1));
      gl.uniform1f(this.u('uCenterShift'), H * 0.25);
      gl.uniform1f(this.u('uInvBaseHalf'), 1 / BH);
      gl.uniform1f(this.u('uInvHeight'), 1 / H);
      gl.uniform1f(this.u('uMinAxis'), Math.min(BH, H));
      gl.uniform1f(this.u('uPxScale'), 1 / ((this._h || 1) * 0.1 * SCALE));
      gl.uniform1f(this.u('uTimeScale'), ts);
      this.blit();
    }
  }

  /* ============================================================
     <wz-burst> — React Bits PrismaticBurst (verbatim WebGL2
     raymarch with gradient texture).
     attrs: colors="#a,#b,#c", intensity, speed, distort, rays,
            focal="0.7,0.42"
     ============================================================ */
  const BURST_FRAG = `#version 300 es
precision highp float;
precision highp int;
out vec4 fragColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform float uSpeed;
uniform int uAnimType;
uniform vec2 uMouse;
uniform int uColorCount;
uniform float uDistort;
uniform vec2 uOffset;
uniform sampler2D uGradient;
uniform float uNoiseAmount;
uniform int uRayCount;
float hash21(vec2 p){p=floor(p);float f=52.9829189*fract(dot(p,vec2(0.065,0.005)));return fract(f);}
mat2 rot30(){return mat2(0.8,-0.5,0.5,0.8);}
float layeredNoise(vec2 fragPx){
vec2 p=mod(fragPx+vec2(uTime*30.0,-uTime*21.0),1024.0);
vec2 q=rot30()*p;
float n=0.0;
n+=0.40*hash21(q);
n+=0.25*hash21(q*2.0+17.0);
n+=0.20*hash21(q*4.0+47.0);
n+=0.10*hash21(q*8.0+113.0);
n+=0.05*hash21(q*16.0+191.0);
return n;}
vec3 rayDir(vec2 frag,vec2 res,vec2 offset,float dist){
float focal=res.y*max(dist,1e-3);
return normalize(vec3(2.0*(frag-offset)-res,focal));}
float edgeFade(vec2 frag,vec2 res,vec2 offset){
vec2 toC=frag-0.5*res-offset;
float r=length(toC)/(0.5*min(res.x,res.y));
float x=clamp(r,0.0,1.0);
float q=x*x*x*(x*(x*6.0-15.0)+10.0);
float s=q*0.5;
s=pow(s,1.5);
float tail=1.0-pow(1.0-s,2.0);
s=mix(s,tail,0.2);
float dn=(layeredNoise(frag*0.15)-0.5)*0.0015*s;
return clamp(s+dn,0.0,1.0);}
mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1.0,0.0,0.0,0.0,c,-s,0.0,s,c);}
mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.0,s,0.0,1.0,0.0,-s,0.0,c);}
mat3 rotZ(float a){float c=cos(a),s=sin(a);return mat3(c,-s,0.0,s,c,0.0,0.0,0.0,1.0);}
vec3 sampleGradient(float t){
t=clamp(t,0.0,1.0);
return texture(uGradient,vec2(t,0.5)).rgb;}
vec2 rot2(vec2 v,float a){
float s=sin(a),c=cos(a);
return mat2(c,-s,s,c)*v;}
float bendAngle(vec3 q,float t){
float a=0.8*sin(q.x*0.55+t*0.6)+0.7*sin(q.y*0.50-t*0.5)+0.6*sin(q.z*0.60+t*0.7);
return a;}
void main(){
vec2 frag=gl_FragCoord.xy;
float t=uTime*uSpeed;
float jitterAmp=0.1*clamp(uNoiseAmount,0.0,1.0);
vec3 dir=rayDir(frag,uResolution,uOffset,1.0);
float marchT=0.0;
vec3 col=vec3(0.0);
float n=layeredNoise(frag);
vec4 c=cos(t*0.2+vec4(0.0,33.0,11.0,0.0));
mat2 M2=mat2(c.x,c.y,c.z,c.w);
float amp=clamp(uDistort,0.0,50.0)*0.15;
mat3 rot3dMat=mat3(1.0);
if(uAnimType==1){
vec3 ang=vec3(t*0.31,t*0.21,t*0.17);
rot3dMat=rotZ(ang.z)*rotY(ang.y)*rotX(ang.x);}
mat3 hoverMat=mat3(1.0);
if(uAnimType==2){
vec2 m=uMouse*2.0-1.0;
vec3 ang=vec3(m.y*0.6,m.x*0.6,0.0);
hoverMat=rotY(ang.y)*rotX(ang.x);}
for(int i=0;i<44;++i){
vec3 P=marchT*dir;
P.z-=2.0;
float rad=length(P);
vec3 Pl=P*(10.0/max(rad,1e-6));
if(uAnimType==0){Pl.xz*=M2;}
else if(uAnimType==1){Pl=rot3dMat*Pl;}
else{Pl=hoverMat*Pl;}
float stepLen=min(rad-0.3,n*jitterAmp)+0.1;
float grow=smoothstep(0.35,3.0,marchT);
float a1=amp*grow*bendAngle(Pl*0.6,t);
float a2=0.5*amp*grow*bendAngle(Pl.zyx*0.5+3.1,t*0.9);
vec3 Pb=Pl;
Pb.xz=rot2(Pb.xz,a1);
Pb.xy=rot2(Pb.xy,a2);
float rayPattern=smoothstep(0.5,0.7,
sin(Pb.x+cos(Pb.y)*cos(Pb.z))*
sin(Pb.z+sin(Pb.y)*cos(Pb.x+t)));
if(uRayCount>0){
float ang=atan(Pb.y,Pb.x);
float comb=0.5+0.5*cos(float(uRayCount)*ang);
comb=pow(comb,3.0);
rayPattern*=smoothstep(0.15,0.95,comb);}
vec3 spectralDefault=1.0+vec3(
cos(marchT*3.0+0.0),
cos(marchT*3.0+1.0),
cos(marchT*3.0+2.0));
float saw=fract(marchT*0.25);
float tRay=saw*saw*(3.0-2.0*saw);
vec3 userGradient=2.0*sampleGradient(tRay);
vec3 spectral=(uColorCount>0)?userGradient:spectralDefault;
vec3 base=(0.05/(0.4+stepLen))*smoothstep(5.0,0.0,rad)*spectral;
col+=base*rayPattern;
marchT+=stepLen;}
col*=edgeFade(frag,uResolution,uOffset);
col*=uIntensity;
fragColor=vec4(clamp(col,0.0,1.0),1.0);}`;

  class WZBurst extends FXShader {
    constructor() { super(); this.dprCap = 1; }
    glSetup() {
      this.glInit(BURST_FRAG, 2);
      const gl = this.gl;
      const colors = (this.getAttribute('colors') || '#ffffff').split(',').map(s => s.trim()).filter(Boolean);
      this._count = Math.max(1, Math.min(colors.length, 64));
      const data = new Uint8Array(this._count * 4);
      for (let i = 0; i < this._count; i++) {
        const [r, g, b] = hexRGB(colors[i], [1, 1, 1]);
        data[i * 4] = Math.round(r * 255);
        data[i * 4 + 1] = Math.round(g * 255);
        data[i * 4 + 2] = Math.round(b * 255);
        data[i * 4 + 3] = 255;
      }
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this._count, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(this.u('uGradient'), 0);
    }
    draw(t) {
      const gl = this.gl;
      const focal = (this.getAttribute('focal') || '0.5,0.5').split(',').map(parseFloat);
      const fx = isNaN(focal[0]) ? 0.5 : focal[0];
      const fy = isNaN(focal[1]) ? 0.5 : focal[1];
      gl.uniform2f(this.u('uResolution'), this._w, this._h);
      gl.uniform1f(this.u('uTime'), t);
      gl.uniform1f(this.u('uIntensity'), this.fAttr('intensity', 1.2));
      gl.uniform1f(this.u('uSpeed'), this.fAttr('speed', 0.14));
      gl.uniform1i(this.u('uAnimType'), 1);
      gl.uniform2f(this.u('uMouse'), 0.5, 0.5);
      gl.uniform1i(this.u('uColorCount'), this._count);
      gl.uniform1f(this.u('uDistort'), this.fAttr('distort', 1.3));
      gl.uniform2f(this.u('uOffset'), (fx - 0.5) * this._w, (0.5 - fy) * this._h);
      gl.uniform1f(this.u('uNoiseAmount'), 0.8);
      gl.uniform1i(this.u('uRayCount'), Math.round(this.fAttr('rays', 18)));
      this.blit();
    }
  }

  /* ============================================================
     <wz-gridmotion> — React Bits GridMotion, DOM port (no gsap):
     4 rotated rows of frames drifting against pointer-x with
     per-row inertia. attrs: items="a|b||c", ink, accent, wash
     ============================================================ */
  class WZGridMotion extends HTMLElement {
    static get observedAttributes() { return ['mode']; }
    constructor() {
      super();
      this._raf = 0; this._visible = false; this._booted = false;
      this._mx = typeof window !== 'undefined' ? window.innerWidth / 2 : 0;
      this._xs = [0, 0, 0, 0];
      this._sh = this.attachShadow({ mode: 'open' });
    }
    get mode() { const m = this.getAttribute('mode'); return m === 'off' ? 'off' : m === 'calm' ? 'calm' : 'full'; }
    connectedCallback() {
      if (this._booted) { this._sync(); return; }
      this._booted = true;
      const ink = this.getAttribute('ink') || 'rgba(23,19,17,0.55)';
      const accent = this.getAttribute('accent') || 'rgba(179,60,37,0.36)';
      const wash = this.getAttribute('wash') || 'rgba(224,155,93,0.16)';
      const gradientColor = this.getAttribute('gradient-color') || '#0e0c0a';
      const st = document.createElement('style');
      st.textContent = `
:host{position:absolute;inset:0;display:block;overflow:hidden;pointer-events:none}
.wrap{position:absolute;left:50%;top:50%;width:170vmax;height:120vmax;transform:translate(-50%,-50%) rotate(-15deg);display:grid;grid-template-rows:repeat(4,1fr);gap:1.15rem}
.row{display:grid;grid-template-columns:repeat(7,1fr);gap:1.15rem;will-change:transform}
.cell{border:1px solid ${accent};border-radius:0.6rem;overflow:hidden;box-shadow:0 0.5rem 1.1rem rgba(23,19,17,0.12);display:flex;align-items:flex-end;padding:0.6rem 0.65rem;font:500 0.58rem/1.5 "Azeret Mono","SFMono-Regular",Consolas,monospace;letter-spacing:0.09em;text-transform:uppercase;color:${ink};overflow:hidden;white-space:nowrap}
.cell.tone{background:linear-gradient(148deg,${wash},transparent 72%)}
.cell.deep{background:linear-gradient(148deg,rgba(179,60,37,0.12),transparent 66%)}
.vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 50% 50%, transparent 0%, transparent 32%, ${gradientColor} 100%)}`;
      this._sh.appendChild(st);
      const wrap = document.createElement('div');
      wrap.className = 'wrap';
      const items = (this.getAttribute('items') || '').split('|');
      this._rows = [];
      for (let r = 0; r < 4; r++) {
        const row = document.createElement('div');
        row.className = 'row';
        for (let c = 0; c < 7; c++) {
          const i = r * 7 + c;
          const cell = document.createElement('div');
          const kind = i % 5;
          cell.className = 'cell' + (kind === 1 ? ' tone' : kind === 3 ? ' deep' : '');
          const label = items[i % items.length];
          if (label && label.trim()) cell.textContent = label.trim();
          row.appendChild(cell);
        }
        wrap.appendChild(row);
        this._rows.push(row);
      }
      this._sh.appendChild(wrap);
      const vig = document.createElement('div');
      vig.className = 'vignette';
      this._sh.appendChild(vig);
      this._onMove = e => { this._mx = e.clientX; };
      window.addEventListener('pointermove', this._onMove, { passive: true });
      this._io = new IntersectionObserver(es => {
        this._visible = es.some(e => e.isIntersecting);
        this._sync();
      }, { rootMargin: '120px' });
      this._io.observe(this);
      this._onVis = () => this._sync();
      document.addEventListener('visibilitychange', this._onVis);
      this._sync();
    }
    disconnectedCallback() {
      this._stop();
      window.removeEventListener('pointermove', this._onMove);
      document.removeEventListener('visibilitychange', this._onVis);
      if (this._io) this._io.disconnect();
    }
    attributeChangedCallback() { if (this._booted) this._sync(); }
    get shouldRun() { return this._visible && !document.hidden && this.mode !== 'off' && !REDUCED.matches; }
    _sync() { if (this.shouldRun) this._start(); else this._stop(); }
    _start() {
      if (this._raf) return;
      const K = [0.026, 0.033, 0.042, 0.054];
      const loop = () => {
        if (!this.shouldRun) { this._raf = 0; return; }
        const w = Math.max(1, window.innerWidth);
        const max = this.mode === 'calm' ? 130 : 260;
        for (let r = 0; r < 4; r++) {
          const dir = r % 2 === 0 ? 1 : -1;
          const target = ((this._mx / w) * max - max / 2) * dir;
          this._xs[r] += (target - this._xs[r]) * K[r];
          this._rows[r].style.transform = 'translate3d(' + this._xs[r].toFixed(2) + 'px,0,0)';
        }
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    }
    _stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } }
  }

  /* ============================================================
     <wz-pixels> — PixelCard-style ember field on a coarse grid
     (2D canvas; cells ignite and decay in steps).
     attrs: color, color2, cell, rate
     ============================================================ */
  class WZPixels extends FXBase {
    constructor() { super(); this.dprCap = 1; this._cells = []; this._acc = 0; }
    get ready() { return !!this.ctx; }
    init() {
      this.ctx = this._canvas.getContext('2d');
      if (!this.ctx) throw new Error('no 2d');
    }
    draw(t, dt) {
      const ctx = this.ctx;
      if (!ctx) return;
      this._acc += dt || 0;
      const step = 0.085;
      if (dt !== 0 && this._acc < step) return; // steps() cadence
      this._acc = 0;
      const cs = Math.max(6, this.fAttr('cell', 13)) * (this._dpr || 1);
      const cols = Math.ceil(this._w / cs), rows = Math.ceil(this._h / cs);
      const rate = this.fAttr('rate', 3);
      for (let i = 0; i < rate; i++) {
        if (Math.random() < 0.9) {
          const x = Math.floor(Math.random() * cols), y = Math.floor(Math.random() * rows);
          this._cells.push({ x, y, life: 1, hot: Math.random() < 0.22 });
          if (Math.random() < 0.35) this._cells.push({ x: x + (Math.random() < 0.5 ? 1 : -1), y, life: 0.8, hot: false });
          if (Math.random() < 0.25) this._cells.push({ x, y: y + 1, life: 0.7, hot: false });
        }
      }
      if (this._cells.length > 170) this._cells.splice(0, this._cells.length - 170);
      ctx.clearRect(0, 0, this._w, this._h);
      const c1 = this.getAttribute('color') || '#f0a145';
      const c2 = this.getAttribute('color2') || '#f06a47';
      for (const cell of this._cells) {
        cell.life -= 0.075;
        if (cell.life <= 0) continue;
        ctx.globalAlpha = Math.min(0.6, cell.life * 0.6);
        ctx.fillStyle = cell.hot ? c2 : c1;
        ctx.fillRect(cell.x * cs, cell.y * cs, cs - 2, cs - 2);
      }
      this._cells = this._cells.filter(c => c.life > 0);
      ctx.globalAlpha = 1;
    }
  }

  /* ============================================================
     <wz-trail> — cursor-following chip trail (ImageTrail-inspired,
     brand-chip version: no stock imagery, small tag pills spawn
     near the pointer and drift/fade out). Listens on parentElement
     so the host itself can stay pointer-events:none.
     attrs: tags="Air|Studio|Earth", threshold(px)
     ============================================================ */
  class WZTrail extends HTMLElement {
    static get observedAttributes() { return ['mode']; }
    constructor() {
      super();
      this._sh = this.attachShadow({ mode: 'open' });
      this._last = null;
      this._pool = [];
      this._booted = false;
    }
    get mode() { const m = this.getAttribute('mode'); return m === 'off' ? 'off' : m; }
    connectedCallback() {
      if (this._booted) return;
      this._booted = true;
      const st = document.createElement('style');
      st.textContent = `
:host{position:absolute;inset:0;display:block;overflow:hidden;pointer-events:none}
.chip{position:absolute;top:0;left:0;transform:translate(-50%,-50%) scale(0.4);opacity:0;padding:0.4rem 0.7rem;border-radius:999px;font:600 0.62rem/1 'Azeret Mono',ui-monospace,Consolas,monospace;letter-spacing:0.06em;text-transform:uppercase;white-space:nowrap;will-change:transform,opacity;transition:transform 650ms cubic-bezier(0.22,1,0.36,1),opacity 650ms ease}
.chip.show{transform:translate(-50%,-50%) translateY(-1.1rem) scale(1);opacity:0.92}
.chip.out{transform:translate(-50%,-50%) translateY(-2.6rem) scale(0.85);opacity:0}`;
      this._sh.appendChild(st);
      const host = this.parentElement;
      if (!host) return;
      this._host = host;
      const tags = (this.getAttribute('tags') || 'Air|Studio|Earth|Zap').split('|').filter(Boolean);
      const colors = ['#8cc8ff', '#f0a145', '#c5ba9e', '#f06a47', '#6dc8d7'];
      const threshold = parseFloat(this.getAttribute('threshold')) || 90;
      const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
      let lastX = null, lastY = null, i = 0;
      const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
      const spawn = (x, y) => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        const tag = tags[i % tags.length];
        chip.textContent = tag;
        const c = colors[i % colors.length];
        chip.style.background = c;
        chip.style.color = '#05070a';
        i++;
        chip.style.left = x + 'px';
        chip.style.top = y + 'px';
        this._sh.appendChild(chip);
        requestAnimationFrame(() => chip.classList.add('show'));
        setTimeout(() => {
          chip.classList.remove('show');
          chip.classList.add('out');
          setTimeout(() => chip.remove(), 700);
        }, 420);
      };
      this._onMove = e => {
        if (this.mode === 'off' || REDUCED.matches || !fine.matches) return;
        const r = host.getBoundingClientRect();
        const x = e.clientX - r.left, y = e.clientY - r.top;
        if (lastX == null) { lastX = x; lastY = y; return; }
        const d = Math.hypot(x - lastX, y - lastY);
        if (d > threshold) { spawn(x, y); lastX = x; lastY = y; }
      };
      host.addEventListener('pointermove', this._onMove, { passive: true });
    }
    disconnectedCallback() { if (this._onMove && this._host) this._host.removeEventListener('pointermove', this._onMove); }
  }

  /* ============================================================
     <wz-infinite-menu> — true InfiniteMenu port: an icosphere of
     WebGL2 disc instances, arcball-dragged with inertia and snap-
     to-nearest, each disc textured from a generated (no stock-photo)
     atlas of role tag + color. Requires window.glMatrix (mat4/quat/
     vec2/vec3) — load the gl-matrix UMD build in <helmet> before
     fx.js. Falls back to hiding itself if gl-matrix or WebGL2 is
     unavailable.
     attrs: items="TAG|Title|Description|#color;;TAG2|...", scale
     ============================================================ */
  const IM_VERT = `#version 300 es
uniform mat4 uWorldMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform vec4 uRotationAxisVelocity;
in vec3 aModelPosition;
in vec2 aModelUvs;
in mat4 aInstanceMatrix;
out vec2 vUvs;
out float vAlpha;
flat out int vInstanceId;
void main(){
vec4 worldPosition=uWorldMatrix*aInstanceMatrix*vec4(aModelPosition,1.);
vec3 centerPos=(uWorldMatrix*aInstanceMatrix*vec4(0.,0.,0.,1.)).xyz;
float radius=length(centerPos.xyz);
if(gl_VertexID>0){
vec3 rotationAxis=uRotationAxisVelocity.xyz;
float rotationVelocity=min(.15,uRotationAxisVelocity.w*15.);
vec3 stretchDir=normalize(cross(centerPos,rotationAxis));
vec3 relativeVertexPos=normalize(worldPosition.xyz-centerPos);
float strength=dot(stretchDir,relativeVertexPos);
float invAbsStrength=min(0.,abs(strength)-1.);
strength=rotationVelocity*sign(strength)*abs(invAbsStrength*invAbsStrength*invAbsStrength+1.);
worldPosition.xyz+=stretchDir*strength;}
worldPosition.xyz=radius*normalize(worldPosition.xyz);
gl_Position=uProjectionMatrix*uViewMatrix*worldPosition;
vAlpha=smoothstep(0.5,1.,normalize(worldPosition.xyz).z)*.9+.1;
vUvs=aModelUvs;
vInstanceId=gl_InstanceID;}`;
  const IM_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform int uItemCount;
uniform int uAtlasSize;
out vec4 outColor;
in vec2 vUvs;
in float vAlpha;
flat in int vInstanceId;
void main(){
int itemIndex=vInstanceId % uItemCount;
int cellsPerRow=uAtlasSize;
int cellX=itemIndex % cellsPerRow;
int cellY=itemIndex / cellsPerRow;
vec2 cellSize=vec2(1.0)/vec2(float(cellsPerRow));
vec2 cellOffset=vec2(float(cellX),float(cellY))*cellSize;
vec2 st=vec2(vUvs.x,1.0-vUvs.y)*cellSize+cellOffset;
outColor=texture(uTex,st);
outColor.a*=vAlpha;}`;

  function imMakeIcosphere(subdiv, radius) {
    const t = Math.sqrt(5) * 0.5 + 0.5;
    let verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
    let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    const cache = {};
    const mid = (a, b) => {
      const key = a < b ? a + '_' + b : b + '_' + a;
      if (cache[key] != null) return cache[key];
      const va = verts[a], vb = verts[b];
      const idx = verts.length;
      verts.push([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]);
      cache[key] = idx;
      return idx;
    };
    for (let d = 0; d < subdiv; d++) {
      const nf = [];
      faces.forEach(([a, b, c]) => {
        const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
        nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      });
      faces = nf;
    }
    return verts.map(v => {
      const len = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / len * radius, v[1] / len * radius, v[2] / len * radius];
    });
  }
  function imMakeDisc(steps, radius) {
    const positions = [0, 0, 0], uvs = [0.5, 0.5], indices = [];
    for (let i = 0; i < steps; i++) {
      const a = (2 * Math.PI / steps) * i, x = Math.cos(a), y = Math.sin(a);
      positions.push(radius * x, radius * y, 0);
      uvs.push(x * 0.5 + 0.5, y * 0.5 + 0.5);
      if (i > 0) indices.push(0, i, i + 1);
    }
    indices.push(0, steps, 1);
    return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), indices: new Uint16Array(indices) };
  }
  function imCompile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const e = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(e); }
    return s;
  }
  function imProgram(gl, vs, fs, attribLocs) {
    const p = gl.createProgram();
    gl.attachShader(p, imCompile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, imCompile(gl, gl.FRAGMENT_SHADER, fs));
    for (const k in attribLocs) gl.bindAttribLocation(p, attribLocs[k], k);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  class WZInfiniteMenu extends HTMLElement {
    static get observedAttributes() { return ['mode']; }
    constructor() {
      super();
      this._sh = this.attachShadow({ mode: 'open' });
      this._booted = false; this._raf = 0; this._visible = true; this._dead = false;
      // Boot can bail out before the loop closures exist (no webgl2 / no
      // gl-matrix), so teardown always has something safe to call.
      this._start = () => {};
      this._stop = () => { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } };
    }
    get mode() { const m = this.getAttribute('mode'); return m === 'off' ? 'off' : m; }
    // Boot failures (no gl-matrix, no webgl2, shader errors) are advertised on the
    // host so the page can swap in its own still artwork instead of empty space.
    _fail(message) {
      console.warn('[wz-infinite-menu]', message);
      this._dead = true;
      this.style.display = 'none';
      this.setAttribute('data-fx-failed', 'true');
    }
    connectedCallback() {
      if (this._booted && !this._needsRebuild) { this._sync(); return; }
      try { this._boot(); }
      catch (e) { this._fail((e && e.message) || String(e)); }
    }
    _boot() {
      this._booted = true; this._needsRebuild = false;
      this._teardown();
      this._sh.innerHTML = '';
      const gm = window.glMatrix;
      if (!gm) throw new Error('gl-matrix not loaded');
      const { mat4, quat, vec2, vec3 } = gm;

      const SILK_MAP = { AIR: 'silk-sky-melon', STUDIO: 'silk-amber-dusk', EARTH: 'jade-plum-gold', ZAP: 'nova-teal-void' };
      // Resolved through window.__resources when bundled offline (the URL only
      // exists as a string here, so the inliner can't discover it on its own).
      const silkUrl = name => (window.__resources && window.__resources['silk_' + name]) || `public/creator-os/${name}.svg`;
      const items = (this.getAttribute('items') || '').split(';;').filter(Boolean).map(chunk => {
        const [tag, title, desc, color] = chunk.split('|');
        const silk = SILK_MAP[tag];
        return { tag, title, desc, color: color || '#f1ebdd', img: silk ? silkUrl(silk) : null };
      });
      this._items = items.length ? items : [{ tag: 'WZRD', title: 'No items', desc: '', color: '#f1ebdd', img: null }];

      const st = document.createElement('style');
      st.textContent = `
:host{position:relative;display:block;width:100%;height:100%}
canvas{cursor:grab;width:100%;height:100%;display:block;position:relative;outline:none;touch-action:none}
canvas.drag{cursor:grabbing}
.readout{position:absolute;left:0;right:0;top:1.6rem;z-index:2;text-align:center;pointer-events:none;opacity:0;transform:translateY(-0.6rem);transition:opacity 0.45s ease,transform 0.45s ease}
.readout.active{opacity:1;transform:translateY(0)}
.hint{top:auto;bottom:0.8rem}
.readout p{margin:0;font-family:'Azeret Mono',ui-monospace,Consolas,monospace;font-size:0.68rem;letter-spacing:0.1em;text-transform:uppercase;opacity:0.75}
.readout h4{margin:0.4rem 0 0;font-family:Newsreader,Georgia,serif;font-weight:400;font-size:clamp(1.5rem,2.8vw,2.2rem);letter-spacing:-0.03em}
.readout span{display:block;margin-top:0.5rem;font-size:0.92rem;opacity:0.72;max-width:24rem;margin-left:auto;margin-right:auto}
.hint{position:absolute;top:0.8rem;left:50%;transform:translateX(-50%);z-index:2;font:0.56rem/1 'Azeret Mono',ui-monospace,Consolas,monospace;letter-spacing:0.1em;text-transform:uppercase;opacity:0.4;pointer-events:none}`;
      this._sh.appendChild(st);

      const canvas = document.createElement('canvas');
      this._canvas = canvas;
      this._sh.appendChild(canvas);
      const hint = document.createElement('div'); hint.className = 'hint'; hint.textContent = 'drag to explore';
      this._sh.appendChild(hint);
      const readout = document.createElement('div'); readout.className = 'readout';
      readout.innerHTML = '<p></p><h4></h4><span></span>';
      this._sh.appendChild(readout);
      this._readout = readout;
      this._readoutP = readout.querySelector('p');
      this._readoutH = readout.querySelector('h4');
      this._readoutS = readout.querySelector('span');

      const gl = canvas.getContext('webgl2', { antialias: true, alpha: true });
      if (!gl) throw new Error('no webgl2');
      this.gl = gl;
      canvas.addEventListener('webglcontextlost', e => {
        e.preventDefault();
        this._stop();
        this.gl = null; this._needsRebuild = true;
      });
      canvas.addEventListener('webglcontextrestored', () => {
        if (this._needsRebuild) this.connectedCallback();
      });

      const prog = imProgram(gl, IM_VERT, IM_FRAG, { aModelPosition: 0, aModelUvs: 2, aInstanceMatrix: 3 });
      const loc = {
        aModelPosition: 0, aModelUvs: 2, aInstanceMatrix: 3,
        uWorldMatrix: gl.getUniformLocation(prog, 'uWorldMatrix'),
        uViewMatrix: gl.getUniformLocation(prog, 'uViewMatrix'),
        uProjectionMatrix: gl.getUniformLocation(prog, 'uProjectionMatrix'),
        uRotationAxisVelocity: gl.getUniformLocation(prog, 'uRotationAxisVelocity'),
        uTex: gl.getUniformLocation(prog, 'uTex'),
        uItemCount: gl.getUniformLocation(prog, 'uItemCount'),
        uAtlasSize: gl.getUniformLocation(prog, 'uAtlasSize'),
      };

      const disc = imMakeDisc(56, 1);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const posBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.bufferData(gl.ARRAY_BUFFER, disc.positions, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc.aModelPosition); gl.vertexAttribPointer(loc.aModelPosition, 3, gl.FLOAT, false, 0, 0);
      const uvBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf); gl.bufferData(gl.ARRAY_BUFFER, disc.uvs, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc.aModelUvs); gl.vertexAttribPointer(loc.aModelUvs, 2, gl.FLOAT, false, 0, 0);
      const idxBuf = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, disc.indices, gl.STATIC_DRAW);

      const SPHERE_RADIUS = 2;
      const positions = imMakeIcosphere(1, SPHERE_RADIUS);
      const count = positions.length;
      const matricesArray = new Float32Array(count * 16);
      const matrices = [];
      for (let i = 0; i < count; i++) matrices.push(new Float32Array(matricesArray.buffer, i * 64, 16));
      matrices.forEach(m => mat4.identity(m));
      const instBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
      gl.bufferData(gl.ARRAY_BUFFER, matricesArray.byteLength, gl.DYNAMIC_DRAW);
      for (let j = 0; j < 4; j++) {
        const l = loc.aInstanceMatrix + j;
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, 4, gl.FLOAT, false, 64, j * 16);
        gl.vertexAttribDivisor(l, 1);
      }
      gl.bindVertexArray(null);

      // Texture atlas — user-supplied Silk-generative avatar SVGs, one per role tile.
      const n = this._items.length;
      const atlasSize = Math.ceil(Math.sqrt(n));
      const cell = 512;
      const atlas = document.createElement('canvas');
      atlas.width = atlasSize * cell; atlas.height = atlasSize * cell;
      const actx = atlas.getContext('2d');
      const paintCell = (it, i) => {
        const x = (i % atlasSize) * cell, y = Math.floor(i / atlasSize) * cell;
        actx.clearRect(x, y, cell, cell);
        actx.fillStyle = it.color; actx.fillRect(x, y, cell, cell);
        if (it._img) actx.drawImage(it._img, x, y, cell, cell);
        actx.fillStyle = 'rgba(5,7,10,0.28)';
        actx.fillRect(x, y + cell * 0.78, cell, cell * 0.22);
        actx.fillStyle = '#f1ebdd';
        actx.textAlign = 'center'; actx.textBaseline = 'middle';
        actx.font = '700 ' + Math.round(cell * 0.15) + 'px "Azeret Mono", monospace';
        actx.fillText(it.tag, x + cell / 2, y + cell * 0.895);
      };
      this._items.forEach((it, i) => paintCell(it, i));
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
      this._items.forEach((it, i) => {
        if (!it.img) return;
        const image = new Image();
        image.onload = () => {
          it._img = image;
          paintCell(it, i);
          if (!this.gl) return;
          const g2 = this.gl;
          g2.bindTexture(g2.TEXTURE_2D, tex);
          g2.texImage2D(g2.TEXTURE_2D, 0, g2.RGBA, g2.RGBA, g2.UNSIGNED_BYTE, atlas);
        };
        image.src = it.img;
      });

      // ---- Arcball control (standard technique, ported to glMatrix) ----
      const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
      const ctl = {
        isDown: false,
        orientation: quat.create(),
        pointerRotation: quat.create(),
        rotationVelocity: 0,
        rotationAxis: vec3.fromValues(1, 0, 0),
        snapDirection: vec3.fromValues(0, 0, -1),
        snapTarget: null,
        pointerPos: vec2.create(), prevPointerPos: vec2.create(), combinedQuat: quat.create(), _rv: 0,
      };
      const project = (pos) => {
        const r = 2, w = canvas.clientWidth || 1, h = canvas.clientHeight || 1, s = Math.max(w, h) - 1;
        const x = (2 * pos[0] - w - 1) / s, y = (2 * pos[1] - h - 1) / s;
        const xySq = x * x + y * y, rSq = r * r;
        const z = xySq <= rSq / 2 ? Math.sqrt(rSq - xySq) : rSq / Math.sqrt(xySq);
        return vec3.fromValues(-x, y, z);
      };
      const quatFromVectors = (a, b, out, angleFactor) => {
        const axis = vec3.cross(vec3.create(), a, b);
        vec3.normalize(axis, axis);
        const d = Math.max(-1, Math.min(1, vec3.dot(a, b)));
        const angle = Math.acos(d) * angleFactor;
        quat.setAxisAngle(out, axis, angle);
      };
      const controlUpdate = (dt, targetFrame) => {
        const timeScale = dt / targetFrame + 0.00001;
        let angleFactor = timeScale;
        const snapRot = quat.create();
        if (ctl.isDown) {
          const INTENSITY = 0.3 * timeScale, AMP = 5 / timeScale;
          const mid = vec2.sub(vec2.create(), ctl.pointerPos, ctl.prevPointerPos);
          vec2.scale(mid, mid, INTENSITY);
          if (vec2.sqrLen(mid) > 0.1) {
            vec2.add(mid, ctl.prevPointerPos, mid);
            const p = project(mid), q = project(ctl.prevPointerPos);
            const a = vec3.normalize(vec3.create(), p), b = vec3.normalize(vec3.create(), q);
            vec2.copy(ctl.prevPointerPos, mid);
            angleFactor *= AMP;
            quatFromVectors(a, b, ctl.pointerRotation, angleFactor);
          } else {
            quat.slerp(ctl.pointerRotation, ctl.pointerRotation, quat.create(), INTENSITY);
          }
        } else {
          const INTENSITY = REDUCED.matches ? 0.6 : 0.1 * timeScale;
          quat.slerp(ctl.pointerRotation, ctl.pointerRotation, quat.create(), INTENSITY);
          if (ctl.snapTarget) {
            const SNAP = REDUCED.matches ? 0.9 : 0.2;
            const sqrDist = vec3.squaredDistance(ctl.snapTarget, ctl.snapDirection);
            const distFactor = Math.max(0.1, 1 - sqrDist * 10);
            angleFactor *= SNAP * distFactor;
            quatFromVectors(ctl.snapTarget, ctl.snapDirection, snapRot, angleFactor);
          }
        }
        const combined = quat.multiply(quat.create(), snapRot, ctl.pointerRotation);
        ctl.orientation = quat.multiply(quat.create(), combined, ctl.orientation);
        quat.normalize(ctl.orientation, ctl.orientation);
        quat.slerp(ctl.combinedQuat, ctl.combinedQuat, combined, 0.8 * timeScale);
        quat.normalize(ctl.combinedQuat, ctl.combinedQuat);
        const rad = Math.acos(Math.max(-1, Math.min(1, ctl.combinedQuat[3]))) * 2;
        const s = Math.sin(rad / 2);
        let rv = 0;
        if (s > 1e-6) {
          rv = rad / (2 * Math.PI);
          ctl.rotationAxis[0] = ctl.combinedQuat[0] / s; ctl.rotationAxis[1] = ctl.combinedQuat[1] / s; ctl.rotationAxis[2] = ctl.combinedQuat[2] / s;
        }
        ctl._rv += (rv - ctl._rv) * (0.5 * timeScale);
        ctl.rotationVelocity = ctl._rv / timeScale;
      };

      const onDown = e => { if (this._dead) return; ctl.isDown = true; canvas.classList.add('drag'); vec2.set(ctl.pointerPos, e.clientX, e.clientY); vec2.copy(ctl.prevPointerPos, ctl.pointerPos); try { canvas.setPointerCapture(e.pointerId); } catch (err) {} };
      const onUp = () => { ctl.isDown = false; canvas.classList.remove('drag'); };
      const onMove = e => { if (ctl.isDown) vec2.set(ctl.pointerPos, e.clientX, e.clientY); };
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointerleave', onUp);
      canvas.addEventListener('pointermove', onMove);
      canvas.tabIndex = 0;
      canvas.setAttribute('role', 'listbox');
      canvas.setAttribute('aria-label', 'Creator role sphere — drag to rotate');

      // ---- Camera ----
      const camera = { position: vec3.fromValues(0, 0, 3), matrix: mat4.create(), view: mat4.create(), proj: mat4.create() };
      const scaleFactor = parseFloat(this.getAttribute('scale')) || 1;
      camera.position[2] = 3 * scaleFactor;
      const updateCameraMatrix = () => { mat4.targetTo(camera.matrix, camera.position, [0, 0, 0], [0, 1, 0]); mat4.invert(camera.view, camera.matrix); };
      const updateProjection = () => {
        const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
        const height = SPHERE_RADIUS * 0.35, distance = camera.position[2];
        const fov = aspect > 1 ? 2 * Math.atan(height / distance) : 2 * Math.atan(height / aspect / distance);
        mat4.perspective(camera.proj, fov, aspect, 0.1, 40);
      };

      let activeIdx = -1;
      const setActive = idx => {
        if (idx === activeIdx) return;
        activeIdx = idx;
        const it = this._items[idx % this._items.length];
        this._readout.classList.remove('active');
        clearTimeout(this._roT);
        this._roT = setTimeout(() => {
          this._readoutP.textContent = it.tag; this._readoutP.style.color = it.color;
          this._readoutH.textContent = it.title;
          this._readoutS.textContent = it.desc;
          this._readout.classList.add('active');
        }, 160);
      };

      const findNearestVertexIndex = () => {
        const inv = quat.conjugate(quat.create(), ctl.orientation);
        const nt = vec3.transformQuat(vec3.create(), ctl.snapDirection, inv);
        let maxD = -Infinity, best = 0;
        for (let i = 0; i < count; i++) {
          const d = nt[0] * positions[i][0] + nt[1] * positions[i][1] + nt[2] * positions[i][2];
          if (d > maxD) { maxD = d; best = i; }
        }
        return best;
      };

      const animate = dt => {
        controlUpdate(dt, 1000 / 60);
        for (let i = 0; i < count; i++) {
          const p = vec3.transformQuat(vec3.create(), positions[i], ctl.orientation);
          const s = (Math.abs(p[2]) / SPHERE_RADIUS) * 0.6 + 0.4;
          const finalScale = s * 0.105;
          const m = mat4.create();
          mat4.multiply(m, m, mat4.fromTranslation(mat4.create(), vec3.negate(vec3.create(), p)));
          mat4.multiply(m, m, mat4.targetTo(mat4.create(), [0, 0, 0], p, [0, 1, 0]));
          mat4.multiply(m, m, mat4.fromScaling(mat4.create(), [finalScale, finalScale, finalScale]));
          mat4.multiply(m, m, mat4.fromTranslation(mat4.create(), [0, 0, -SPHERE_RADIUS]));
          mat4.copy(matrices[i], m);
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, matricesArray);

        const timeScale = dt / (1000 / 60) + 0.0001;
        let damping = 5 / timeScale, targetZ = 3 * scaleFactor;
        if (!ctl.isDown) {
          const nearest = findNearestVertexIndex();
          setActive(nearest % this._items.length);
          const wp = vec3.transformQuat(vec3.create(), positions[nearest], ctl.orientation);
          ctl.snapTarget = vec3.normalize(vec3.create(), wp);
        } else {
          targetZ += ctl.rotationVelocity * 80 + 2.5;
          damping = 7 / timeScale;
        }
        camera.position[2] += (targetZ - camera.position[2]) / damping;
        updateCameraMatrix();
      };

      const render = () => {
        gl.useProgram(prog);
        gl.enable(gl.CULL_FACE); gl.enable(gl.DEPTH_TEST);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(loc.uWorldMatrix, false, mat4.create());
        gl.uniformMatrix4fv(loc.uViewMatrix, false, camera.view);
        gl.uniformMatrix4fv(loc.uProjectionMatrix, false, camera.proj);
        gl.uniform4f(loc.uRotationAxisVelocity, ctl.rotationAxis[0], ctl.rotationAxis[1], ctl.rotationAxis[2], ctl.rotationVelocity * 0.35);
        gl.uniform1i(loc.uItemCount, n);
        gl.uniform1i(loc.uAtlasSize, atlasSize);
        gl.uniform1i(loc.uTex, 0);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.bindVertexArray(vao);
        gl.drawElementsInstanced(gl.TRIANGLES, disc.indices.length, gl.UNSIGNED_SHORT, 0, count);
      };

      let lastT = 0;
      const loop = ts => {
        if (!this._visible || this.mode === 'off' || this._dead) { this._raf = 0; return; }
        const dt = Math.min(32, ts - lastT || 16); lastT = ts;
        animate(dt);
        render();
        this._raf = requestAnimationFrame(loop);
      };
      this._start = () => { if (!this._raf && this._visible && this.mode !== 'off' && !this._dead) { lastT = performance.now(); this._raf = requestAnimationFrame(loop); } };
      this._stop = () => { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; } };

      const doResize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
        const changed = canvas.width !== w || canvas.height !== h;
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        gl.viewport(0, 0, w, h);
        updateProjection();
        // Resizing the canvas clears its contents — always repaint a frame
        // immediately so a resize never leaves the sphere blank while the
        // continuous loop is gated behind IntersectionObserver visibility.
        if (changed) { animate(16); render(); }
      };
      this._ro = new ResizeObserver(doResize);
      this._ro.observe(this);
      updateCameraMatrix(); updateProjection(); doResize();
      animate(16); render();

      this._io = new IntersectionObserver(es => {
        this._visible = es.some(e => e.isIntersecting);
        if (this._visible) {
          clearTimeout(this._relTimer);
          if (this._needsRebuild) this.connectedCallback();
        } else {
          clearTimeout(this._relTimer);
          this._relTimer = setTimeout(() => {
            if (this._visible || !this.gl) return;
            try { const ext = this.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); } catch (e2) {}
          }, 5000);
        }
        this._sync();
      }, { rootMargin: '120px' });
      this._io.observe(this);
      this._onVis = () => this._sync();
      document.addEventListener('visibilitychange', this._onVis);

      this._cleanup = () => {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointerleave', onUp);
        canvas.removeEventListener('pointermove', onMove);
        clearTimeout(this._roT);
      };
      this._sync();
    }
    attributeChangedCallback() { if (this._booted) this._sync(); }
    _sync() {
      if (this._dead) { this.style.display = 'none'; return; }
      if (this.mode === 'off') { this._stop(); } else { this._start(); }
    }
    // Rebuilding after a context loss re-creates the observers and listeners,
    // so drop the previous generation first.
    _teardown() {
      this._stop();
      clearTimeout(this._relTimer);
      if (this._cleanup) { this._cleanup(); this._cleanup = null; }
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
      if (this._io) { this._io.disconnect(); this._io = null; }
      if (this._onVis) { document.removeEventListener('visibilitychange', this._onVis); this._onVis = null; }
    }
    disconnectedCallback() { this._teardown(); }
  }

  /* ============================================================
     <wz-griddistortion> — GridDistortion-style ripple over a real
     image (product shot): a coarse displacement field, decayed each
     frame and pushed by pointer velocity, offsets the image lookup.
     Single WebGL2 pass, no three.js. attrs: src, radius, strength, relax
     ============================================================ */
  const DISTORT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uImage;uniform sampler2D uDisp;uniform vec2 uRes;uniform vec2 uImgSize;uniform float uStrength;
out vec4 fragColor;
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  float canvasAspect=uRes.x/uRes.y; float imageAspect=uImgSize.x/uImgSize.y;
  vec2 st=uv-0.5;
  if(canvasAspect>imageAspect){ st.x*=canvasAspect/imageAspect; } else { st.y*=imageAspect/canvasAspect; }
  st+=0.5;
  vec2 offset=(texture(uDisp,uv).rg-0.5)*2.0*uStrength;
  vec4 color=vec4(0.0);
  vec2 sst=st-offset;
  if(sst.x>0.0&&sst.x<1.0&&sst.y>0.0&&sst.y<1.0){ color=texture(uImage,sst); }
  fragColor=color;
}`;
  class WZGridDistort extends FXShader {
    constructor() { super(); this.dprCap = 1.5; this._grid = 22; this._imgW = 1; this._imgH = 1; this._imgReady = false; this._mouse = { x: -1, y: -1, px: -1, py: -1 }; }
    glSetup() {
      this.glInit(DISTORT_FRAG, 2);
      const gl = this.gl;
      const g = this._grid;
      this._disp = new Uint8Array(g * g * 4).fill(128);
      this._dispTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this._dispTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, g, g, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._disp);

      this._imgTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this._imgTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

      const resId = this.getAttribute('data-resource-id');
      const src = (resId && window.__resources && window.__resources[resId]) || this.getAttribute('src');
      if (src) {
        const img = new Image();
        img.onload = () => {
          this._imgW = img.naturalWidth; this._imgH = img.naturalHeight;
          if (!this.gl) return;
          const g2 = this.gl;
          g2.bindTexture(g2.TEXTURE_2D, this._imgTex);
          g2.pixelStorei(g2.UNPACK_FLIP_Y_WEBGL, true);
          g2.texImage2D(g2.TEXTURE_2D, 0, g2.RGBA, g2.RGBA, g2.UNSIGNED_BYTE, img);
          g2.pixelStorei(g2.UNPACK_FLIP_Y_WEBGL, false);
          this._imgReady = true;
        };
        img.src = src;
      }

      const host = this._host || (this._host = this.parentElement || this);
      if (this._onMove) {
        host.removeEventListener('pointermove', this._onMove);
        host.removeEventListener('pointerleave', this._onLeave);
      }
      this._onMove = e => {
        const r = host.getBoundingClientRect();
        this._mouse.x = (e.clientX - r.left) / Math.max(1, r.width);
        this._mouse.y = 1 - (e.clientY - r.top) / Math.max(1, r.height);
      };
      this._onLeave = () => { this._mouse.x = -1; this._mouse.y = -1; };
      host.addEventListener('pointermove', this._onMove, { passive: true });
      host.addEventListener('pointerleave', this._onLeave, { passive: true });
    }
    disconnectedCallback() {
      if (this._host && this._onMove) {
        this._host.removeEventListener('pointermove', this._onMove);
        this._host.removeEventListener('pointerleave', this._onLeave);
      }
      super.disconnectedCallback();
    }
    draw() {
      const gl = this.gl;
      if (!this._imgReady) return;
      const g = this._grid;
      const relax = Math.max(0, Math.min(0.99, this.fAttr('relax', 0.9)));
      const strength = this.fAttr('strength', 0.5) * 0.05;
      const radius = this.fAttr('radius', 0.18);
      const d = this._disp;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 128 + (d[i] - 128) * relax;
        d[i + 1] = 128 + (d[i + 1] - 128) * relax;
      }
      const m = this._mouse;
      if (m.x >= 0 && m.px >= 0) {
        const vx = m.x - m.px, vy = m.y - m.py;
        for (let gy = 0; gy < g; gy++) {
          for (let gx = 0; gx < g; gx++) {
            const cx = gx / (g - 1), cy = gy / (g - 1);
            const dist = Math.hypot(cx - m.x, cy - m.y);
            if (dist < radius) {
              const power = (1 - dist / radius);
              const idx = (gy * g + gx) * 4;
              d[idx] = Math.max(0, Math.min(255, d[idx] + vx * 900 * power));
              d[idx + 1] = Math.max(0, Math.min(255, d[idx + 1] - vy * 900 * power));
            }
          }
        }
      }
      m.px = m.x; m.py = m.y;
      gl.bindTexture(gl.TEXTURE_2D, this._dispTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, g, g, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);

      gl.useProgram(this.prog);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this._imgTex);
      gl.uniform1i(this.u('uImage'), 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this._dispTex);
      gl.uniform1i(this.u('uDisp'), 1);
      gl.uniform2f(this.u('uRes'), this._w, this._h);
      gl.uniform2f(this.u('uImgSize'), this._imgW, this._imgH);
      gl.uniform1f(this.u('uStrength'), strength);
      this.blit();
    }
  }

  /* ============================================================
     <wz-beams> — Beams-style vertical noise-lit columns, ported as
     a single fragment pass (no three.js/r3f): N tilted beam bands
     whose edges wobble via 3D value-noise, plus a fine dither grain
     matching the reference's dithering_fragment pass.
     attrs: color, speed, noise, scale, beams(count), width, rotation(deg)
     ============================================================ */
  const BEAMS_FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;uniform float uTime;uniform vec3 uColor;uniform float uSpeed;
uniform float uNoiseIntensity;uniform float uScale;uniform float uBeams;uniform float uWidth;uniform float uRotation;
out vec4 fragColor;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
float vnoise(vec3 p){
  vec3 i=floor(p);vec3 f=fract(p);f=f*f*(3.0-2.0*f);
  float n000=hash(i.xy+i.z*13.1);float n100=hash(i.xy+vec2(1.0,0.0)+i.z*13.1);
  float n010=hash(i.xy+vec2(0.0,1.0)+i.z*13.1);float n110=hash(i.xy+vec2(1.0,1.0)+i.z*13.1);
  float n001=hash(i.xy+(i.z+1.0)*13.1);float n101=hash(i.xy+vec2(1.0,0.0)+(i.z+1.0)*13.1);
  float n011=hash(i.xy+vec2(0.0,1.0)+(i.z+1.0)*13.1);float n111=hash(i.xy+vec2(1.0,1.0)+(i.z+1.0)*13.1);
  float nx00=mix(n000,n100,f.x);float nx10=mix(n010,n110,f.x);
  float nx01=mix(n001,n101,f.x);float nx11=mix(n011,n111,f.x);
  float nxy0=mix(nx00,nx10,f.y);float nxy1=mix(nx01,nx11,f.y);
  return mix(nxy0,nxy1,f.z);
}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  vec2 c=uv-0.5; float ca=cos(uRotation),sa=sin(uRotation);
  c=mat2(ca,-sa,sa,ca)*c; c.x*=uRes.x/uRes.y; uv=c+0.5;
  float x=uv.x*uBeams; float beamId=floor(x); float frac=fract(x)-0.5;
  float n=vnoise(vec3(beamId*0.75, uv.y*2.2-uTime*uSpeed*0.4, uTime*0.1*uSpeed))-0.5;
  frac+=n*1.1;
  float half_=uWidth*0.5;
  float mask=smoothstep(half_,half_-0.09,abs(frac));
  float shade=0.55+0.45*vnoise(vec3(beamId*1.3+9.0, uv.y*1.6+uTime*0.06*uSpeed, 4.0));
  float grain=hash(gl_FragCoord.xy+uTime);
  float a=clamp(mask*shade - grain*0.06*uNoiseIntensity, 0.0, 1.0);
  fragColor=vec4(uColor, a);
}`;
  class WZBeams extends FXShader {
    constructor() { super(); this.dprCap = 1.25; }
    glSetup() { this.glInit(BEAMS_FRAG, 2); }
    draw(t) {
      const gl = this.gl;
      gl.uniform2f(this.u('uRes'), this._w, this._h);
      gl.uniform1f(this.u('uTime'), t);
      gl.uniform3fv(this.u('uColor'), hexRGB(this.getAttribute('color'), [0.7, 0.24, 0.15]));
      gl.uniform1f(this.u('uSpeed'), this.fAttr('speed', 1));
      gl.uniform1f(this.u('uNoiseIntensity'), this.fAttr('noise', 1));
      gl.uniform1f(this.u('uScale'), this.fAttr('scale', 1));
      gl.uniform1f(this.u('uBeams'), this.fAttr('beams', 12));
      gl.uniform1f(this.u('uWidth'), this.fAttr('width', 0.55));
      gl.uniform1f(this.u('uRotation'), (this.fAttr('rotation', 0)) * Math.PI / 180);
      this.blit();
    }
  }

  /* ============================================================
     <wz-electric-border> — canvas noise-perturbed glow ring, ported
     from the ElectricBorder React Bits pattern (2D adaptation).
     Runs continuously while visible; fades via active 0/1.
     attrs: color, active, radius, chaos, speed
     ============================================================ */
  class WZElectricBorder extends FXBase {
    static get observedAttributes() { return ['mode', 'active', 'color', 'radius', 'chaos', 'speed']; }
    constructor() { super(); this.dprCap = 1.5; this._op = 0; }
    get ready() { return true; }
    _roundedRectPoint(p, left, top, w, h, r) {
      const sw = w - 2 * r, sh = h - 2 * r, arc = (Math.PI * r) / 2;
      const total = 2 * sw + 2 * sh + 4 * arc;
      let d = p * total, acc = 0;
      if (d <= acc + sw) return { x: left + r + (d - acc), y: top };
      acc += sw;
      if (d <= acc + arc) { const q = (d - acc) / arc, a = -Math.PI / 2 + q * (Math.PI / 2); return { x: left + w - r + r * Math.cos(a), y: top + r + r * Math.sin(a) }; }
      acc += arc;
      if (d <= acc + sh) return { x: left + w, y: top + r + (d - acc) };
      acc += sh;
      if (d <= acc + arc) { const q = (d - acc) / arc, a = q * (Math.PI / 2); return { x: left + w - r + r * Math.cos(a), y: top + h - r + r * Math.sin(a) }; }
      acc += arc;
      if (d <= acc + sw) return { x: left + w - r - (d - acc), y: top + h };
      acc += sw;
      if (d <= acc + arc) { const q = (d - acc) / arc, a = Math.PI / 2 + q * (Math.PI / 2); return { x: left + r + r * Math.cos(a), y: top + h - r + r * Math.sin(a) }; }
      acc += arc;
      if (d <= acc + sh) return { x: left, y: top + h - r - (d - acc) };
      acc += sh;
      const q = (d - acc) / arc, a = Math.PI + q * (Math.PI / 2);
      return { x: left + r + r * Math.cos(a), y: top + r + r * Math.sin(a) };
    }
    draw(t) {
      const ctx = this._canvas.getContext('2d');
      if (!ctx) return;
      const w = this._w, h = this._h, dpr = this._dpr || 1;
      const target = this.getAttribute('active') === '1' ? 1 : 0;
      this._op += (target - this._op) * 0.14;
      ctx.clearRect(0, 0, w, h);
      if (this._op < 0.01 && target === 0) return;
      const color = this.getAttribute('color') || '#8cc8ff';
      const chaos = this.fAttr('chaos', 7) * dpr;
      const speed = this.fAttr('speed', 1);
      const pad = 7 * dpr;
      const left = pad, top = pad, bw = w - pad * 2, bh = h - pad * 2;
      if (bw <= 0 || bh <= 0) return;
      const radius = Math.min(this.fAttr('radius', 999) * dpr, Math.min(bw, bh) / 2);
      const n = 110;
      const time = t * speed;
      const flicker = 0.72 + 0.28 * (Math.sin(time * 9.7) * 0.5 + Math.sin(time * 23.1) * 0.5 + 1) * 0.5;
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const p = i / n;
        const pt = this._roundedRectPoint(p, left, top, bw, bh, radius);
        const jag = Math.sin(p * 41 + time * 5.2) * 0.22 + Math.sin(p * 97 - time * 8.1) * 0.12;
        const nx = Math.sin(p * 18 + time * 1.7) * 0.5 + Math.sin(p * 7 - time * 2.3) * 0.5 + jag;
        const ny = Math.cos(p * 15 - time * 1.4) * 0.5 + Math.cos(p * 9 + time * 1.9) * 0.5 + jag;
        pts.push({ x: pt.x + nx * chaos, y: pt.y + ny * chaos });
      }
      ctx.save();
      ctx.globalAlpha = this._op * flicker;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const stroke = (width, blur, alphaMul) => {
        ctx.globalAlpha = this._op * flicker * alphaMul;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = blur * dpr;
        ctx.lineWidth = width * dpr;
        ctx.beginPath();
        pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        ctx.closePath();
        ctx.stroke();
      };
      stroke(3.2, 14, 0.45);
      stroke(1.1, 4, 1);
      ctx.restore();
    }
  }

  /* ============================================================
     <wz-pixel-veil> — canvas pixel dissolve/assemble wash, ported
     from the PixelCard React Bits pattern. Grows in on active="1",
     shrinks out on active="0".
     attrs: active, colors ("a,b,c"), cell, speed
     ============================================================ */
  class WZPixelVeil extends FXBase {
    static get observedAttributes() { return ['mode', 'active', 'colors', 'cell', 'speed']; }
    constructor() { super(); this.dprCap = 1; this._cells = null; }
    get ready() { return true; }
    onResize() { this._cells = null; }
    _build() {
      const dpr = this._dpr || 1;
      const cell = Math.max(3, this.fAttr('cell', 8)) * dpr;
      const colors = (this.getAttribute('colors') || '#f0a145,#f06a47').split(',');
      const cols = Math.ceil(this._w / cell), rows = Math.ceil(this._h / cell);
      const cx = this._w / 2, cy = this._h / 2;
      const cells = [];
      for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
          const px = x * cell, py = y * cell;
          const dx = px - cx, dy = py - cy;
          cells.push({ x: px, y: py, size: 0, max: 0.55 + Math.random() * (cell * 0.5 - 0.55), delay: Math.sqrt(dx * dx + dy * dy), color: colors[(Math.random() * colors.length) | 0] });
        }
      }
      this._cell = cell;
      this._cells = cells;
    }
    draw(t, dt) {
      const ctx = this._canvas.getContext('2d');
      if (!ctx) return;
      if (!this._cells) this._build();
      const active = this.getAttribute('active') === '1';
      const speed = this.fAttr('speed', 1) * (dt || 0.016) * 60;
      ctx.clearRect(0, 0, this._w, this._h);
      for (const c of this._cells) {
        if (active) {
          if (c.t === undefined) c.t = 0;
          c.t += dt || 0.016;
          if (c.t * 1000 > c.delay * 0.6) {
            c.size += 0.06 * speed;
            if (c.size > c.max) c.size = c.max;
          }
        } else {
          c.size -= 0.05 * speed;
          if (c.size < 0) c.size = 0;
          c.t = 0;
        }
        if (c.size > 0.02) {
          ctx.fillStyle = c.color;
          ctx.fillRect(c.x, c.y, c.size, c.size);
        }
      }
    }
  }

  /* ============================================================
     <wz-ascii-fx> — canvas ascii-glyph text mosaic with a hue-
     shifting wash, ported from the ASCIIText React Bits pattern
     (2D adaptation — no three.js plane). Overlays a live heading
     via mix-blend-mode:difference.
     attrs: text, color, fontsize
     ============================================================ */
  const ASCII_CHARSET = ' .:-=+*#%@';
  class WZAsciiFX extends FXBase {
    static get observedAttributes() { return ['mode', 'text', 'color', 'fontsize']; }
    constructor() { super(); this.dprCap = 1.25; this._baked = null; }
    get ready() { return true; }
    onResize() { this._baked = null; }
    _bake() {
      const dpr = this._dpr || 1;
      const w = this._w, h = this._h;
      const raw = this.getAttribute('text') || '';
      const lines = raw.split('|').filter(Boolean);
      if (!lines.length) lines.push(raw);
      const off = document.createElement('canvas');
      off.width = w; off.height = h;
      const octx = off.getContext('2d');
      octx.fillStyle = '#fff';
      octx.textAlign = 'center';
      octx.textBaseline = 'middle';
      const lineH = h / lines.length;
      lines.forEach((ln, i) => {
        let fs = Math.round(lineH * 0.82);
        octx.font = `700 ${fs}px 'Newsreader', Georgia, serif`;
        while (octx.measureText(ln).width > w * 0.94 && fs > 8) {
          fs -= 2;
          octx.font = `700 ${fs}px 'Newsreader', Georgia, serif`;
        }
        octx.fillText(ln, w / 2, lineH * (i + 0.52));
      });
      const cell = Math.max(4, this.fAttr('fontsize', 9)) * dpr;
      const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
      const baked = document.createElement('canvas');
      baked.width = w; baked.height = h;
      const bctx = baked.getContext('2d');
      bctx.font = `${cell}px 'Azeret Mono', ui-monospace, Consolas, monospace`;
      bctx.textAlign = 'center';
      bctx.textBaseline = 'middle';
      bctx.fillStyle = '#fff';
      const img = octx.getImageData(0, 0, w, h).data;
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          const px = Math.min(w - 1, (cx * cell + cell / 2) | 0);
          const py = Math.min(h - 1, (cy * cell + cell / 2) | 0);
          const a = img[(py * w + px) * 4 + 3] / 255;
          if (a < 0.08) continue;
          const idx = Math.min(ASCII_CHARSET.length - 1, Math.floor(a * (ASCII_CHARSET.length - 1)));
          const ch = ASCII_CHARSET[idx];
          if (ch === ' ') continue;
          bctx.fillText(ch, cx * cell + cell / 2, cy * cell + cell / 2);
        }
      }
      this._baked = baked;
    }
    draw(t) {
      const ctx = this._canvas.getContext('2d');
      if (!ctx) return;
      if (!this._baked) { try { this._bake(); } catch (e) { return; } }
      const w = this._w, h = this._h;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(this._baked, 0, 0);
      ctx.globalCompositeOperation = 'source-atop';
      const hue = (t * 26) % 360;
      const base = this.getAttribute('color') || '#8cc8ff';
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, `hsl(${hue},85%,68%)`);
      grad.addColorStop(0.5, base);
      grad.addColorStop(1, `hsl(${(hue + 140) % 360},85%,62%)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  customElements.define('wz-sky', WZSky);
  customElements.define('wz-dither', WZDither);
  customElements.define('wz-chrome', WZChrome);
  customElements.define('wz-terminal', WZTerminal);
  customElements.define('wz-prism', WZPrism);
  customElements.define('wz-burst', WZBurst);
  customElements.define('wz-gridmotion', WZGridMotion);
  customElements.define('wz-pixels', WZPixels);
  customElements.define('wz-trail', WZTrail);
  customElements.define('wz-infinite-menu', WZInfiniteMenu);
  customElements.define('wz-griddistort', WZGridDistort);
  customElements.define('wz-beams', WZBeams);
  customElements.define('wz-electric-border', WZElectricBorder);
  customElements.define('wz-pixel-veil', WZPixelVeil);
  customElements.define('wz-ascii-fx', WZAsciiFX);
})();
