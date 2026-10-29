'use strict';

// ============================================================
// selftest 框架(纯逻辑单元自检)
// ============================================================
const selftest = {
  results: [],
  ok(name) { this.results.push({ name: name, pass: true }); },
  fail(name, msg) { this.results.push({ name: name, pass: false, msg: msg || '' }); },
};

function runSelftest() {
  selftest.results = [];

  // --- Namer ---
  if (makeName(1, 12300) === 'change_001_12.3s.png') selftest.ok('Namer 基本命名');
  else selftest.fail('Namer 基本命名', makeName(1, 12300));
  if (makeName(42, 0) === 'change_042_0.0s.png') selftest.ok('Namer 序号补零');
  else selftest.fail('Namer 序号补零', makeName(42, 0));
  if (makeName(1000, 6500) === 'change_1000_6.5s.png') selftest.ok('Namer 大序号不截断');
  else selftest.fail('Namer 大序号不截断', makeName(1000, 6500));

  // --- DiffDetector ---
  const f0 = makeFrame(2, 2, 100);
  const f1 = makeFrame(2, 2, 100);              // 相同
  const f2 = makeFrame(2, 2, 200);              // 全变(差 100)
  const f3 = makeFrame(2, 2, 100); f3.data[0] = 200; f3.data[4] = 200;   // 2x2=4 像素改 2 个
  const f4 = makeFrame(2, 2, 100); f4.data[0] = 110; f4.data[4] = 110; f4.data[8] = 110; f4.data[12] = 110; // 噪声差 10 < 阈 30
  if (diffRatio(f0, f1, 30) === 0) selftest.ok('Diff 相同=0'); else selftest.fail('Diff 相同=0', String(diffRatio(f0, f1, 30)));
  if (diffRatio(f0, f2, 30) === 1) selftest.ok('Diff 全变=1'); else selftest.fail('Diff 全变=1', String(diffRatio(f0, f2, 30)));
  if (diffRatio(f0, f3, 30) === 0.5) selftest.ok('Diff 半变=0.5'); else selftest.fail('Diff 半变=0.5', String(diffRatio(f0, f3, 30)));
  if (diffRatio(f0, f4, 30) === 0) selftest.ok('Diff 噪声<阈不算'); else selftest.fail('Diff 噪声<阈不算', String(diffRatio(f0, f4, 30)));

  // --- ChangeTracker(上升沿触发,无冷却) ---
  (function () {
    const t = new ChangeTracker({ highRatio: 0.03, lowRatio: 0.005 });
    let now = 0;
    const r0 = t.feed(0.001, now); now += 100;  // 静止
    if (r0 === false && t.state === 'IDLE') selftest.ok('CT 静止不触发'); else selftest.fail('CT 静止不触发', t.state);
    const r1 = t.feed(0.1, now); now += 100;    // 上升沿 → 立刻截
    if (r1 === true && t.state === 'CHANGING') selftest.ok('CT 上升沿立刻截图'); else selftest.fail('CT 上升沿立刻截图', t.state + ' r=' + r1);
    const r2 = t.feed(0.1, now); now += 100;    // 同一变化持续 → 不重复
    if (r2 === false && t.state === 'CHANGING') selftest.ok('CT 同一变化不重复截'); else selftest.fail('CT 同一变化不重复截', t.state);
    t.feed(0.001, now); now += 100;             // 变化结束 → 回 IDLE
    if (t.state === 'IDLE') selftest.ok('CT 变化结束回IDLE'); else selftest.fail('CT 变化结束回IDLE', t.state);
    const r3 = t.feed(0.1, now); now += 100;    // 连续第二次变化 → 再截
    if (r3 === true) selftest.ok('CT 连续第二次变化再触发'); else selftest.fail('CT 连续第二次变化再触发', 'r=' + r3);
  })();

  // --- 几何 + Store ---
  const p = previewToVideo(100, 50, 400, 300, 800, 600);
  if (p.x === 200 && p.y === 100) selftest.ok('Geom 预览→video 映射'); else selftest.fail('Geom 预览→video 映射', JSON.stringify(p));
  const cl = clampRect({ x: -10, y: -10, w: 9999, h: 9999 }, 800, 600);
  if (cl.x === 0 && cl.y === 0 && cl.w === 800 && cl.h === 600) selftest.ok('Geom clamp 越界'); else selftest.fail('Geom clamp 越界', JSON.stringify(cl));
  const store = new SnapshotStore();
  store.add({ name: 'a' }); store.add({ name: 'b' });
  if (store.count() === 2) selftest.ok('Store add/count'); else selftest.fail('Store add/count', String(store.count()));
  store.remove(0);
  if (store.count() === 1 && store.getAll()[0].name === 'b') selftest.ok('Store remove'); else selftest.fail('Store remove', String(store.count()));

  const passed = selftest.results.filter(function (r) { return r.pass; }).length;
  const total = selftest.results.length;
  return { passed: passed, total: total, results: selftest.results };
}

// ============================================================
// Namer(纯函数)
// ============================================================
function padNum(n, width) {
  const s = String(n);
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}
function formatSeconds(ms) {
  return (ms / 1000).toFixed(1) + 's';
}
function makeName(index, elapsedMs) {
  return 'change_' + padNum(index, 3) + '_' + formatSeconds(elapsedMs) + '.png';
}

// ============================================================
// DiffDetector(纯函数):两帧 ImageData → 变化像素比例
// frame = { data: Uint8ClampedArray, width, height }
// ============================================================
function diffRatio(a, b, pixelThreshold) {
  const w = a.width, h = a.height;
  if (b.width !== w || b.height !== h) throw new Error('diffRatio size mismatch');
  const da = a.data, db = b.data;
  const total = w * h;
  let changed = 0;
  for (let i = 0; i < total; i++) {
    const off = i * 4;
    const r = Math.abs(da[off] - db[off]);
    const g = Math.abs(da[off + 1] - db[off + 1]);
    const bl = Math.abs(da[off + 2] - db[off + 2]);
    let m = r > g ? r : g;
    if (bl > m) m = bl;
    if (m > pixelThreshold) changed++;
  }
  return changed / total;
}
function makeFrame(w, h, fillValue) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const off = i * 4;
    data[off] = fillValue; data[off + 1] = fillValue; data[off + 2] = fillValue; data[off + 3] = 255;
  }
  return { data: data, width: w, height: h };
}

// ============================================================
// ChangeTracker 上升沿触发(无冷却)
// 每次大幅度变化的「开始」截一张;同一变化期间不重复;变化结束才能触发下一次。
// —— 适合短时间内连续多次变化,逐次捕获不漏截。
// feed(ratio, now) 返回 true 表示该帧应截图
// ============================================================
class ChangeTracker {
  constructor(opts) {
    this.highRatio = opts.highRatio;
    this.lowRatio = opts.lowRatio;
    this.state = 'IDLE';   // IDLE | CHANGING
  }
  feed(ratio, now) {
    if (this.state === 'IDLE') {
      if (ratio > this.highRatio) {
        this.state = 'CHANGING';
        return true;        // 上升沿:立刻截一张
      }
      return false;
    }
    // CHANGING:等变化结束(ratio 回落到低阈)才允许下一次触发
    if (ratio < this.lowRatio) {
      this.state = 'IDLE';
    }
    return false;
  }
}

// ============================================================
// 几何映射(纯函数)
// ============================================================
function previewToVideo(px, py, previewW, previewH, videoW, videoH) {
  return {
    x: Math.round(px * videoW / previewW),
    y: Math.round(py * videoH / previewH),
  };
}
function clampRect(r, videoW, videoH) {
  const x = Math.max(0, Math.min(r.x, videoW));
  const y = Math.max(0, Math.min(r.y, videoH));
  const w = Math.min(Math.max(1, r.w), videoW - x);
  const h = Math.min(Math.max(1, r.h), videoH - y);
  return { x: x, y: y, w: w, h: h };
}

// ============================================================
// SnapshotStore
// ============================================================
class SnapshotStore {
  constructor() { this.items = []; }
  add(item) { this.items.push(item); }
  remove(idx) { if (idx >= 0 && idx < this.items.length) this.items.splice(idx, 1); }
  getAll() { return this.items.slice(); }
  count() { return this.items.length; }
  clear() { this.items = []; }
}

// ============================================================
// 浏览器模块(依赖 window/document,纯逻辑测试不触达)
// ============================================================
function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
}
function blobToArrayBuffer(blob) {
  return new Promise(function (resolve, reject) {
    const fr = new FileReader();
    fr.onload = function () { resolve(fr.result); };
    fr.onerror = function () { reject(fr.error); };
    fr.readAsArrayBuffer(blob);
  });
}
async function exportZip(store, zipName) {
  const zip = new JSZip();
  const all = store.getAll();
  for (let i = 0; i < all.length; i++) {
    const buf = await blobToArrayBuffer(all[i].blob);
    zip.file(all[i].name, buf);
  }
  const out = await zip.generateAsync({ type: 'blob' });
  triggerDownload(out, zipName);
}
async function startCapture() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30 },
    audio: false,
  });
  return stream;
}
let _sampleCanvas = null;
function sampleRegion(video, rect) {
  if (!_sampleCanvas) _sampleCanvas = document.createElement('canvas');
  const w = Math.max(1, Math.round(rect.w));
  const h = Math.max(1, Math.round(rect.h));
  _sampleCanvas.width = w;
  _sampleCanvas.height = h;
  const ctx = _sampleCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
function snapshotRegion(video, rect) {
  const c = document.createElement('canvas');
  const w = Math.max(1, Math.round(rect.w));
  const h = Math.max(1, Math.round(rect.h));
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
  return new Promise(function (resolve, reject) {
    c.toBlob(function (b) { if (b) resolve(b); else reject(new Error('toBlob failed')); }, 'image/png');
  });
}

// ============================================================
// 控制器(仅浏览器环境运行;Node 沙箱验证 selftest 时整体跳过)
// ============================================================
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const overlay = document.getElementById('overlay');
  const video = document.getElementById('video');
  const btnSelect = document.getElementById('btn-select');
  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  const btnShot = document.getElementById('btn-shot');
  const btnStop = document.getElementById('btn-stop');
  const btnExport = document.getElementById('btn-export');
  const elState = document.getElementById('status-state');
  const elCount = document.getElementById('status-count');
  const elCount2 = document.getElementById('status-count2');
  const elThumbs = document.getElementById('thumbs');
  const elHint = document.getElementById('preview-hint');

  // 状态
  let sel = null;            // { x, y, w, h } video 像素
  let dragging = false;
  let dragStart = null;
  const store = new SnapshotStore();
  let tracker = null;
  let timer = null;
  let lastFrame = null;
  let monitorStart = 0;
  let monitorStartEpoch = 0;
  let shotIndex = 0;
  let capturing = false;
  let monitoring = false;
  let paused = false;

  function num(id, def) {
    const v = parseFloat(document.getElementById(id).value);
    return isNaN(v) ? def : v;
  }
  function readParams() {
    return {
      sampleInterval: num('in-sample', 150),
      pixelThreshold: num('in-pixel', 30),
      highRatio: num('in-high', 3) / 100,
      lowRatio: num('in-low', 0.5) / 100,
    };
  }
  function setStatePill(state) {
    elState.className = 'status-pill';
    if (state === 'CHANGING') elState.classList.add('changing');
    else if (state === 'COOLDOWN') elState.classList.add('cooldown');
    elState.textContent = state;
  }
  function updateCount() {
    const n = store.count();
    elCount.textContent = '已截 ' + n + ' 张';
    elCount2.textContent = String(n);
    btnExport.disabled = n === 0;
  }
  function updateButtons() {
    btnStart.disabled = !capturing || monitoring || !sel;
    btnPause.disabled = !monitoring;
    btnPause.textContent = paused ? '继续' : '暂停';
    btnShot.disabled = !capturing || !sel;
    btnStop.disabled = !monitoring;
  }

  // overlay 与 video 精确对齐(video 在 preview-wrap 内居中)
  function syncOverlaySize() {
    overlay.width = video.clientWidth;
    overlay.height = video.clientHeight;
    overlay.style.width = video.clientWidth + 'px';
    overlay.style.height = video.clientHeight + 'px';
    overlay.style.left = video.offsetLeft + 'px';
    overlay.style.top = video.offsetTop + 'px';
  }
  function drawOverlay() {
    const ctx = overlay.getContext('2d');
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (!sel) return;
    const sx = sel.x / video.videoWidth * overlay.width;
    const sy = sel.y / video.videoHeight * overlay.height;
    const sw = sel.w / video.videoWidth * overlay.width;
    const sh = sel.h / video.videoHeight * overlay.height;
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.fillStyle = 'rgba(37,99,235,0.12)';
    ctx.fillRect(sx, sy, sw, sh);
  }

  // 拖框选
  overlay.addEventListener('mousedown', function (e) {
    if (!video.videoWidth) return;
    dragging = true;
    const r = overlay.getBoundingClientRect();
    dragStart = { x: e.clientX - r.left, y: e.clientY - r.top };
  });
  overlay.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    const r = overlay.getBoundingClientRect();
    const cx = e.clientX - r.left, cy = e.clientY - r.top;
    const px = Math.min(dragStart.x, cx), py = Math.min(dragStart.y, cy);
    const pw = Math.abs(cx - dragStart.x), ph = Math.abs(cy - dragStart.y);
    const a = previewToVideo(px, py, overlay.width, overlay.height, video.videoWidth, video.videoHeight);
    const b = previewToVideo(px + pw, py + ph, overlay.width, overlay.height, video.videoWidth, video.videoHeight);
    sel = clampRect({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }, video.videoWidth, video.videoHeight);
    drawOverlay();
  });
  window.addEventListener('mouseup', function () {
    if (dragging) {
      dragging = false;
      if (sel && (sel.w < 2 || sel.h < 2)) sel = null;
      drawOverlay();
      updateButtons();
    }
  });

  video.addEventListener('loadedmetadata', function () {
    syncOverlaySize();
    drawOverlay();
  });
  window.addEventListener('resize', function () { syncOverlaySize(); drawOverlay(); });

  // 选屏
  btnSelect.addEventListener('click', async function () {
    try {
      const stream = await startCapture();
      video.srcObject = stream;
      stream.getVideoTracks()[0].addEventListener('ended', function () {
        stopMonitor();
        capturing = false;
        sel = null;
        drawOverlay();
        updateButtons();
        elHint.classList.remove('hidden');
        elHint.textContent = '已停止共享。重新点「选择屏幕」';
      });
      capturing = true;
      elHint.classList.add('hidden');
      updateButtons();
    } catch (e) {
      elState.textContent = '选屏失败';
      console.error(e);
    }
  });

  // 监控
  function startMonitor() {
    if (!capturing || !sel) return;
    const p = readParams();
    tracker = new ChangeTracker(p);
    lastFrame = sampleRegion(video, sel);
    monitorStart = performance.now();
    monitorStartEpoch = Date.now();
    shotIndex = 0;
    monitoring = true;
    paused = false;
    setStatePill('IDLE');
    timer = setInterval(sampleLoop, p.sampleInterval);
    updateButtons();
  }
  function sampleLoop() {
    if (!monitoring || paused || !sel) return;
    const now = performance.now() - monitorStart;
    const frame = sampleRegion(video, sel);
    const ratio = diffRatio(frame, lastFrame, readParams().pixelThreshold);
    lastFrame = frame;
    const shouldShot = tracker.feed(ratio, now);
    setStatePill(tracker.state);
    if (shouldShot) takeSnapshot(now);
  }
  async function takeSnapshot(now) {
    shotIndex++;
    const blob = await snapshotRegion(video, sel);
    const name = makeName(shotIndex, now);
    const url = URL.createObjectURL(blob);
    store.add({ name: name, blob: blob, url: url, ts: now });
    renderThumbs();
    updateCount();
  }
  function stopMonitor() {
    monitoring = false;
    if (timer) { clearInterval(timer); timer = null; }
    setStatePill('已停止');
    updateButtons();
  }

  btnStart.addEventListener('click', startMonitor);
  btnPause.addEventListener('click', function () {
    paused = !paused;
    if (!paused) { lastFrame = sampleRegion(video, sel); } // 恢复时重置基准帧,避免暂停期间变化误触发
    updateButtons();
  });
  btnShot.addEventListener('click', function () {
    if (!capturing || !sel) return;
    takeSnapshot(performance.now() - monitorStart);
  });
  btnStop.addEventListener('click', stopMonitor);
  btnExport.addEventListener('click', async function () {
    btnExport.disabled = true;
    const epoch = monitorStartEpoch || Date.now();
    const d = new Date(epoch);
    const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    const zipName = 'screenshots_' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.zip';
    try {
      await exportZip(store, zipName);
    } catch (e) {
      console.error(e);
      alert('导出失败: ' + (e && e.message ? e.message : e));
    }
    btnExport.disabled = store.count() === 0;
  });

  function renderThumbs() {
    elThumbs.innerHTML = '';
    const all = store.getAll();
    for (let i = 0; i < all.length; i++) {
      (function (idx, it) {
        const div = document.createElement('div');
        div.className = 'thumb';
        const img = document.createElement('img');
        img.src = it.url;
        img.title = it.name;
        img.addEventListener('click', function () { window.open(it.url); });
        const del = document.createElement('button');
        del.className = 'del';
        del.textContent = '×';
        del.title = '删除';
        del.addEventListener('click', function (ev) {
          ev.stopPropagation();
          URL.revokeObjectURL(it.url);
          store.remove(idx);
          renderThumbs();
          updateCount();
        });
        div.appendChild(img);
        div.appendChild(del);
        elThumbs.appendChild(div);
      })(i, all[i]);
    }
  }

  // ?selftest 模式:自动跑并显示结果
  if (window.location.search.indexOf('selftest') >= 0) {
    const r = runSelftest();
    const el = document.createElement('pre');
    el.className = 'selftest';
    el.textContent = 'selftest ' + r.passed + '/' + r.total + ' 通过\n\n' +
      r.results.map(function (x) { return (x.pass ? '✓ ' : '✗ ') + x.name + (x.pass ? '' : '  — ' + (x.msg || '')); }).join('\n');
    document.body.appendChild(el);
  }

  // 初始化
  updateCount();
  updateButtons();
}
