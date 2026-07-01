'use strict';

// JSZip 依赖检测
if (typeof window !== 'undefined' && typeof window.JSZip === 'undefined') {
  console.error('依赖 JSZip 加载失败,请确认 vendor/jszip.min.js 存在');
}

// ===== 1. Self-test 框架 =====
const __tests = [];

function test(name, fn) {
  __tests.push({ name: String(name), fn: fn });
}

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error((msg || 'assertEq') + ' 期望 ' + e + ' 实际 ' + a);
  }
}

function assertTrue(value, msg) {
  if (!value) {
    throw new Error(msg || 'assertTrue 失败');
  }
}

function runSelfTests() {
  const results = { passed: 0, failed: 0, details: [] };
  for (let i = 0; i < __tests.length; i++) {
    const t = __tests[i];
    try {
      t.fn();
      results.passed++;
      results.details.push({ name: t.name, ok: true });
    } catch (err) {
      results.failed++;
      results.details.push({ name: t.name, ok: false, err: err.message });
    }
  }
  return results;
}

// ===== 2. Geometry 纯函数 =====
function displayToImage(value, scale) {
  return Math.round(value / scale);
}

function imageToDisplay(value, scale) {
  return value * scale;
}

function normalizeSelection(sel) {
  let x = sel.x, y = sel.y, w = sel.w, h = sel.h;
  if (w < 0) { x = x + w; w = -w; }
  if (h < 0) { y = y + h; h = -h; }
  return { x: x, y: y, w: w, h: h };
}

function clampSelection(sel, bounds) {
  let x = Math.max(0, Math.min(sel.x, bounds.w));
  let y = Math.max(0, Math.min(sel.y, bounds.h));
  let w = Math.min(sel.w, bounds.w - x);
  let h = Math.min(sel.h, bounds.h - y);
  if (w < 0) w = 0;
  if (h < 0) h = 0;
  return { x: x, y: y, w: w, h: h };
}

function applyAspect(sel, ratio) {
  if (!ratio || ratio <= 0) {
    return { x: sel.x, y: sel.y, w: sel.w, h: sel.h };
  }
  const newH = Math.round(sel.w / ratio);
  return { x: sel.x, y: sel.y, w: sel.w, h: newH };
}

// ===== Geometry 测试 =====
test('displayToImage 显示坐标转原图坐标', function () {
  assertEq(displayToImage(160, 0.5), 320, 'x1');
  assertEq(displayToImage(0, 0.5), 0, 'x2');
});

test('imageToDisplay 原图坐标转显示坐标', function () {
  assertEq(imageToDisplay(320, 0.5), 160, 'd1');
  assertEq(imageToDisplay(0, 0.5), 0, 'd2');
});

test('normalizeSelection 负宽高规整', function () {
  assertEq(normalizeSelection({ x: 100, y: 50, w: -40, h: -30 }),
    { x: 60, y: 20, w: 40, h: 30 }, 'n1');
  assertEq(normalizeSelection({ x: 10, y: 10, w: 20, h: 20 }),
    { x: 10, y: 10, w: 20, h: 20 }, 'n2');
});

test('clampSelection 限制在边界内', function () {
  const bounds = { w: 200, h: 100 };
  assertEq(clampSelection({ x: -10, y: -10, w: 50, h: 50 }, bounds),
    { x: 0, y: 0, w: 50, h: 50 }, 'c1');
  assertEq(clampSelection({ x: 180, y: 80, w: 50, h: 50 }, bounds),
    { x: 180, y: 80, w: 20, h: 20 }, 'c2');
});

test('applyAspect 应用比例锁(以宽为准)', function () {
  assertEq(applyAspect({ x: 0, y: 0, w: 160, h: 120 }, 1.7778),
    { x: 0, y: 0, w: 160, h: 90 }, 'a1');
  assertEq(applyAspect({ x: 0, y: 0, w: 100, h: 50 }, 1),
    { x: 0, y: 0, w: 100, h: 100 }, 'a2');
  assertEq(applyAspect({ x: 0, y: 0, w: 100, h: 50 }, 0),
    { x: 0, y: 0, w: 100, h: 50 }, 'a3 自由不锁');
});

// ===== 3. Namer 纯函数 =====
function splitExt(name) {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) {
    return { base: name, ext: '' };
  }
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

function makeName(originalName, used) {
  if (!used.has(originalName)) {
    used.add(originalName);
    return originalName;
  }
  const parts = splitExt(originalName);
  let i = 1;
  let candidate;
  do {
    candidate = parts.base + '_' + i + parts.ext;
    i++;
  } while (used.has(candidate));
  used.add(candidate);
  return candidate;
}

// ===== Namer 测试 =====
test('splitExt 分离扩展名', function () {
  assertEq(splitExt('截图1.png'), { base: '截图1', ext: '.png' }, 's1');
  assertEq(splitExt('a.b.c.jpg'), { base: 'a.b.c', ext: '.jpg' }, 's2 多点');
  assertEq(splitExt('无扩展名'), { base: '无扩展名', ext: '' }, 's3 无点');
});

test('makeName 首次不重名保持原名', function () {
  const used = new Set();
  assertEq(makeName('截图1.png', used), '截图1.png', 'm1');
  assertTrue(used.has('截图1.png'), 'm1 used');
});

test('makeName 重名追加序号', function () {
  const used = new Set(['截图1.png']);
  assertEq(makeName('截图1.png', used), '截图1_1.png', 'm2');
  assertTrue(used.has('截图1_1.png'), 'm2 used');
});

test('makeName 多重重名递增', function () {
  const used = new Set(['a.png', 'a_1.png']);
  assertEq(makeName('a.png', used), 'a_2.png', 'm3');
});

test('makeName 保留多点文件名结构', function () {
  const used = new Set(['x.y.z.png']);
  assertEq(makeName('x.y.z.png', used), 'x.y.z_1.png', 'm4');
});

// ===== 4. ImageList =====
function createImageList() {
  const items = [];
  let current = 0;

  function isImage(file) {
    return file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/webp';
  }

  function loadSize(item) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        item.natW = img.naturalWidth;
        item.natH = img.naturalHeight;
        resolve();
      };
      img.onerror = function () { resolve(); };
      img.src = item.url;
    });
  }

  async function addFiles(files) {
    let added = 0;
    const pending = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!isImage(f)) continue;
      const item = { file: f, name: f.name, url: URL.createObjectURL(f), natW: 0, natH: 0 };
      items.push(item);
      pending.push(loadSize(item));
      added++;
    }
    await Promise.all(pending);
    if (current >= items.length && items.length > 0) current = 0;
    return added;
  }

  function getCount() { return items.length; }
  function getAll() { return items; }
  function getCurrent() { return items.length > 0 ? items[current] : null; }
  function getIndex() { return current; }
  function setCurrent(i) {
    if (i >= 0 && i < items.length) current = i;
  }
  function next() { if (current < items.length - 1) current++; }
  function prev() { if (current > 0) current--; }

  return {
    addFiles: addFiles, getCount: getCount, getAll: getAll,
    getCurrent: getCurrent, getIndex: getIndex,
    setCurrent: setCurrent, next: next, prev: prev
  };
}

// ===== 5. CropCanvas =====
// 设计要点: sel 单例永远存储用户拖框的【原图坐标】,绝不被 load/clamp 改写。
// 切换样图或遇到更小的图时,只在渲染/导出时用 clampSelection 局部夹紧,
// 保证"统一套用"的选区模板不被意外缩小。
function createCropCanvas(canvasEl, onUpdate) {
  const ctx = canvasEl.getContext('2d');
  let item = null;
  let scale = 1;
  let drawW = 0, drawH = 0, offX = 0, offY = 0;
  let sel = null;
  let aspect = 0;
  let imgEl = null;

  let mode = 'idle';
  let handle = null;
  let startMx = 0, startMy = 0;
  let startSel = null;

  function fitCanvas() {
    if (!item || !item.natW) return;
    const cw = canvasEl.clientWidth || canvasEl.width;
    const ch = canvasEl.clientHeight || canvasEl.height;
    const sx = cw / item.natW;
    const sy = ch / item.natH;
    scale = Math.min(sx, sy);
    drawW = item.natW * scale;
    drawH = item.natH * scale;
    offX = (cw - drawW) / 2;
    offY = (ch - drawH) / 2;
    canvasEl.width = cw;
    canvasEl.height = ch;
  }

  function load(newItem, keepSelection) {
    item = newItem;
    if (!keepSelection) sel = null;
    if (!imgEl) imgEl = new Image();
    imgEl.onload = function () {
      fitCanvas();
      // 注意:此处不修改 sel 单例。选区始终保持用户定义的原坐标。
      drawReal();
      emit();
    };
    imgEl.src = item.url;
  }

  function setAspect(r) { aspect = r; }
  function getSelection() { return sel; }
  function setSelection(s) { sel = s; drawReal(); emit(); }

  function emit() { if (onUpdate) onUpdate(sel); }

  function drawReal() {
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    if (!item || !imgEl || !imgEl.complete || !item.natW) return;
    ctx.drawImage(imgEl, offX, offY, drawW, drawH);
    drawOverlay();
  }

  // 渲染时用局部 clamp(只影响显示,不写回 sel)
  function drawOverlay() {
    if (!sel || sel.w <= 0 || sel.h <= 0) return;
    const r = clampSelection(sel, { w: item.natW, h: item.natH });
    if (r.w <= 0 || r.h <= 0) return;
    const sx = offX + r.x * scale;
    const sy = offY + r.y * scale;
    const sw = r.w * scale;
    const sh = r.h * scale;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(offX, offY, drawW, drawH);
    ctx.clearRect(sx, sy, sw, sh);
    ctx.drawImage(imgEl, r.x, r.y, r.w, r.h, sx, sy, sw, sh);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, sw, sh);
    drawHandles(sx, sy, sw, sh);
  }

  function handlePoints(x, y, w, h) {
    return [
      { x: x, y: y }, { x: x + w / 2, y: y }, { x: x + w, y: y },
      { x: x + w, y: y + h / 2 }, { x: x + w, y: y + h },
      { x: x + w / 2, y: y + h }, { x: x, y: y + h }, { x: x, y: y + h / 2 }
    ];
  }

  function drawHandles(x, y, w, h) {
    const pts = handlePoints(x, y, w, h);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i].x, pts[i].y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  function toImageCoord(mx, my) {
    return { x: displayToImage(mx - offX, scale), y: displayToImage(my - offY, scale) };
  }

  function hitHandle(mx, my) {
    if (!sel || sel.w <= 0) return null;
    const r = clampSelection(sel, { w: item.natW, h: item.natH });
    const sx = offX + r.x * scale, sy = offY + r.y * scale;
    const sw = r.w * scale, sh = r.h * scale;
    const pts = handlePoints(sx, sy, sw, sh);
    const names = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    for (let i = 0; i < pts.length; i++) {
      if (Math.abs(mx - pts[i].x) <= 7 && Math.abs(my - pts[i].y) <= 7) return names[i];
    }
    if (mx >= sx && mx <= sx + sw && my >= sy && my <= sy + sh) return 'body';
    return null;
  }

  function onMouseDown(e) {
    if (!item) return;
    e.preventDefault();
    const rect = canvasEl.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const h = hitHandle(mx, my);
    startMx = mx; startMy = my;
    if (h) {
      handle = h;
      mode = (h === 'body') ? 'move' : 'resize';
      startSel = { x: sel.x, y: sel.y, w: sel.w, h: sel.h };
    } else {
      const p = toImageCoord(mx, my);
      sel = { x: p.x, y: p.y, w: 0, h: 0 };
      mode = 'create';
    }
  }

  function onMouseMove(e) {
    if (mode === 'idle' || !item) return;
    const rect = canvasEl.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const p = toImageCoord(mx, my);
    const imgB = { w: item.natW, h: item.natH };

    if (mode === 'create') {
      const sp = toImageCoord(startMx, startMy);
      const raw = { x: sp.x, y: sp.y, w: p.x - sp.x, h: p.y - sp.y };
      sel = clampSelection(normalizeSelection(raw), imgB);
      if (aspect) sel = clampSelection(applyAspect(sel, aspect), imgB);
    } else if (mode === 'move') {
      const dx = displayToImage(mx - startMx, scale);
      const dy = displayToImage(my - startMy, scale);
      sel = clampSelection({ x: startSel.x + dx, y: startSel.y + dy, w: startSel.w, h: startSel.h }, imgB);
    } else if (mode === 'resize') {
      sel = clampSelection(resizeSel(startSel, handle, p), imgB);
      if (aspect) sel = clampSelection(applyAspect(sel, aspect), imgB);
    }
    drawReal();
    emit();
  }

  function resizeSel(start, h, p) {
    let x = start.x, y = start.y, x2 = start.x + start.w, y2 = start.y + start.h;
    if (h.indexOf('w') !== -1) x = p.x;
    if (h.indexOf('e') !== -1) x2 = p.x;
    if (h.indexOf('n') !== -1) y = p.y;
    if (h.indexOf('s') !== -1) y2 = p.y;
    return normalizeSelection({ x: x, y: y, w: x2 - x, h: y2 - y });
  }

  function onMouseUp() { mode = 'idle'; handle = null; }

  function onKey(e) {
    if (!item || !sel || sel.w <= 0) return;
    const step = e.shiftKey ? 10 : 1;
    let nx = sel.x, ny = sel.y;
    if (e.key === 'ArrowLeft') nx -= step;
    else if (e.key === 'ArrowRight') nx += step;
    else if (e.key === 'ArrowUp') ny -= step;
    else if (e.key === 'ArrowDown') ny += step;
    else return;
    e.preventDefault();
    sel = clampSelection({ x: nx, y: ny, w: sel.w, h: sel.h }, { w: item.natW, h: item.natH });
    drawReal();
    emit();
  }

  function bind() {
    canvasEl.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKey);
  }

  return {
    load: load, setAspect: setAspect,
    getSelection: getSelection, setSelection: setSelection,
    fitCanvas: function () { fitCanvas(); drawReal(); },
    bind: bind
  };
}

// ===== 6. Cropper =====
function cropImage(srcImg, sel, mimeType, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sel.w));
  canvas.height = Math.max(1, Math.round(sel.h));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(srcImg, sel.x, sel.y, sel.w, sel.h, 0, 0, canvas.width, canvas.height);
  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (blob) resolve(blob); else reject(new Error('toBlob 失败'));
    }, mimeType, quality || 0.92);
  });
}

// 加载后立即 revoke Object URL,避免每张导出泄漏(img 已解码,revoke 不影响 drawImage)
function loadImageFromFile(file) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片加载失败: ' + file.name)); };
    img.src = url;
  });
}

function mimeFor(file) {
  if (file.type === 'image/jpeg') return 'image/jpeg';
  if (file.type === 'image/webp') return 'image/webp';
  return 'image/png';
}

// ===== 7. Exporter =====
// 每张图各自 clamp sel 到自身边界,避免越界产生透明边(sel 是统一模板,可能超出小图)
async function exportAll(list, sel, onProgress) {
  const all = list.getAll();
  const zip = new JSZip();
  const used = new Set();
  const report = { total: all.length, success: 0, failed: [], renamed: [] };

  for (let i = 0; i < all.length; i++) {
    const item = all[i];
    try {
      const img = await loadImageFromFile(item.file);
      const csel = clampSelection(sel, { w: img.naturalWidth, h: img.naturalHeight });
      const blob = await cropImage(img, csel, mimeFor(item.file));
      const name = makeName(item.name, used);
      if (name !== item.name) report.renamed.push({ from: item.name, to: name });
      zip.file(name, blob);
      report.success++;
    } catch (err) {
      report.failed.push({ name: item.name, error: err.message });
    }
    if (onProgress) onProgress('crop', i + 1, all.length);
    await new Promise(function (r) { setTimeout(r, 0); });
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' }, function (meta) {
    if (onProgress) onProgress('zip', Math.round(meta.percent), 100);
  });
  triggerDownload(zipBlob, 'cropped-' + Date.now() + '.zip');
  return report;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

// ===== 主入口 =====
window.addEventListener('DOMContentLoaded', function () {
  // ?selftest 模式:跑断言并把结果渲染到页面
  if (window.location.search.indexOf('selftest') !== -1) {
    const box = document.getElementById('selfTestBox');
    box.classList.remove('hidden');
    const results = runSelfTests();
    let text = '通过 ' + results.passed + ' / 失败 ' + results.failed + '\n\n';
    for (let i = 0; i < results.details.length; i++) {
      const d = results.details[i];
      text += (d.ok ? '[PASS] ' : '[FAIL] ') + d.name + (d.ok ? '' : '  —  ' + d.err) + '\n';
    }
    if (results.details.length === 0) {
      text += '(暂无测试用例)';
    }
    box.textContent = text;
    return;
  }

  // 正常模式
  const list = createImageList();
  window.__list = list;

  const fileInput = document.getElementById('fileInput');
  const folderInput = document.getElementById('folderInput');
  const btnImport = document.getElementById('btnImport');
  const btnFolder = document.getElementById('btnFolder');
  const countLabel = document.getElementById('countLabel');
  const thumbsEl = document.getElementById('thumbs');
  const reportEl = document.getElementById('report');

  const hintEl = document.querySelector('.dropzone-hint');
  async function handleFiles(files) {
    const added = await list.addFiles(files);
    countLabel.textContent = '已导入 ' + list.getCount() + ' 张';
    renderThumbs();
    if (hintEl) hintEl.style.display = list.getCount() > 0 ? 'none' : '';
    if (added > 0 && window.__onListChanged) window.__onListChanged();
  }

  function renderThumbs() {
    thumbsEl.innerHTML = '';
    const all = list.getAll();
    const cur = list.getIndex();
    for (let i = 0; i < all.length; i++) {
      const img = document.createElement('img');
      img.src = all[i].url;
      img.dataset.index = String(i);
      if (i === cur) img.classList.add('active');
      img.addEventListener('click', function () {
        list.setCurrent(i);
        renderThumbs();
        showCurrent(true);
      });
      thumbsEl.appendChild(img);
    }
  }

  btnImport.addEventListener('click', function () { fileInput.click(); });
  btnFolder.addEventListener('click', function () { folderInput.click(); });
  fileInput.addEventListener('change', function () { handleFiles(fileInput.files); fileInput.value = ''; });
  folderInput.addEventListener('change', function () { handleFiles(folderInput.files); folderInput.value = ''; });

  // 拖入
  const dropzone = document.getElementById('dropzone');
  dropzone.addEventListener('dragover', function (e) { e.preventDefault(); dropzone.classList.add('dragover'); });
  dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('dragover'); });
  dropzone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  // ===== CropCanvas 接入 =====
  const canvasEl = document.getElementById('canvas');
  const selXEl = document.getElementById('selX');
  const selYEl = document.getElementById('selY');
  const selWEl = document.getElementById('selW');
  const selHEl = document.getElementById('selH');
  const btnExport = document.getElementById('btnExport');
  const curIndexEl = document.getElementById('curIndex');
  const totalCountEl = document.getElementById('totalCount');

  const cropCanvas = createCropCanvas(canvasEl, function (sel) {
    if (sel && sel.w > 0 && sel.h > 0) {
      selXEl.textContent = String(sel.x);
      selYEl.textContent = String(sel.y);
      selWEl.textContent = String(sel.w);
      selHEl.textContent = String(sel.h);
      btnExport.disabled = false;
    } else {
      selXEl.textContent = '-'; selYEl.textContent = '-';
      selWEl.textContent = '-'; selHEl.textContent = '-';
      btnExport.disabled = true;
    }
    window.__currentSel = sel;
  });
  cropCanvas.bind();
  window.__cropCanvas = cropCanvas;

  function showCurrent(keepSel) {
    const cur = list.getCurrent();
    curIndexEl.textContent = String(list.getIndex() + 1);
    totalCountEl.textContent = String(list.getCount());
    if (!cur) return;
    const first = list.getAll()[0];
    if (keepSel && first && (first.natW !== cur.natW || first.natH !== cur.natH)) {
      reportEl.textContent = '注意:第 ' + (list.getIndex() + 1) + ' 张尺寸(' + cur.natW + '×' + cur.natH +
        ')与样图(' + first.natW + '×' + first.natH + ')不同,选区可能偏移';
    }
    cropCanvas.load(cur, keepSel);
  }

  window.__onListChanged = function () { showCurrent(false); };

  document.getElementById('btnPrev').addEventListener('click', function () {
    list.prev(); renderThumbs(); showCurrent(true);
  });
  document.getElementById('btnNext').addEventListener('click', function () {
    list.next(); renderThumbs(); showCurrent(true);
  });

  // 比例锁
  const aspectSelect = document.getElementById('aspectSelect');
  aspectSelect.addEventListener('change', function () {
    const v = parseFloat(aspectSelect.value);
    cropCanvas.setAspect(v);
    const sel = cropCanvas.getSelection();
    if (sel && sel.w > 0 && v > 0) {
      const cur = list.getCurrent();
      if (cur) cropCanvas.setSelection(clampSelection(applyAspect(sel, v), { w: cur.natW, h: cur.natH }));
    }
  });

  // 预览裁切(revoke 上一次的预览 URL,避免累积泄漏)
  const btnPreview = document.getElementById('btnPreview');
  const previewBox = document.getElementById('previewBox');
  const previewImg = document.getElementById('previewImg');
  btnPreview.addEventListener('click', async function () {
    const cur = list.getCurrent();
    const sel = cropCanvas.getSelection();
    if (!cur || !sel || sel.w <= 0) return;
    try {
      const img = await loadImageFromFile(cur.file);
      const csel = clampSelection(sel, { w: img.naturalWidth, h: img.naturalHeight });
      const blob = await cropImage(img, csel, mimeFor(cur.file));
      if (previewImg.dataset.url) URL.revokeObjectURL(previewImg.dataset.url);
      const purl = URL.createObjectURL(blob);
      previewImg.src = purl;
      previewImg.dataset.url = purl;
      previewBox.classList.remove('hidden');
    } catch (err) {
      reportEl.textContent = '预览失败: ' + err.message;
    }
  });

  // 导出
  const progressEl = document.getElementById('progress');
  btnExport.addEventListener('click', async function () {
    const sel = cropCanvas.getSelection();
    if (!sel || sel.w <= 0 || list.getCount() === 0) return;
    btnExport.disabled = true;
    progressEl.classList.remove('hidden');
    progressEl.innerHTML = '<div class="progress-bar-wrap"><div class="progress-bar" style="width:0"></div></div><div class="progress-text">准备中...</div>';
    const bar = progressEl.querySelector('.progress-bar');
    const ptext = progressEl.querySelector('.progress-text');

    const report = await exportAll(list, sel, function (phase, current, total) {
      if (phase === 'zip') {
        ptext.textContent = '打包中 ' + current + '%';
        bar.style.width = current + '%';
      } else {
        const pct = Math.round((current / total) * 100);
        ptext.textContent = '已处理 ' + current + ' / ' + total;
        bar.style.width = pct + '%';
      }
    });

    let msg = '完成:成功 ' + report.success + ' / ' + report.total;
    if (report.renamed.length > 0) {
      msg += ';改名 ' + report.renamed.length + ' 项';
      for (let i = 0; i < report.renamed.length; i++) {
        msg += '\n  ' + report.renamed[i].from + ' → ' + report.renamed[i].to;
      }
    }
    if (report.failed.length > 0) {
      msg += ';失败 ' + report.failed.length + ' 项';
      for (let i = 0; i < report.failed.length; i++) {
        msg += '\n  ' + report.failed[i].name + ': ' + report.failed[i].error;
      }
    }
    reportEl.textContent = msg;
    btnExport.disabled = false;
  });

  window.addEventListener('resize', function () { cropCanvas.fitCanvas(); });
});
