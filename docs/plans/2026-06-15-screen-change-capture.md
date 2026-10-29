# 屏幕区域变化检测截图器 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans 逐任务实施。步骤用 `- [ ]` 勾选跟踪。

**Goal:** 构建一个纯本地网页工具,用户捕获屏幕/窗口,框选一个区域,工具监控该区域,出现显著状态变化时自动截图,最后打包成 zip 下载。

**Architecture:** 纯 HTML5 + Canvas + 原生 JS(无框架/无构建)。Node 内置模块起的 localhost 静态服务器绕开 `file://` 对 `getDisplayMedia` 的限制。核心检测算法 = 帧间差异(纯函数) + 状态机(稳定检测/冷却/超时)。纯逻辑单元内嵌 selftest,`?selftest` 模式或 Node 沙箱验证。

**Tech Stack:** 原生 JS(ES2020)、Canvas 2D、`getDisplayMedia`、JSZip 3.10.1、Node `http/fs/path`(零依赖服务器)、Windows `.bat`。

---

## 文件结构

| 文件 | 职责 | 创建/复制 |
|---|---|---|
| `index.html` | 页面结构(预览 video + 框选 overlay + 右侧参数/截图面板) | 创建 |
| `styles.css` | 样式 | 创建 |
| `app.js` | 主逻辑(含 Namer/DiffDetector/ChangeTracker/几何/Sampler/Snapshotter/Store/Exporter/控制器 + selftest) | 创建 |
| `vendor/jszip.min.js` | JSZip 3.10.1 | 从 ImageCropper 复制 |
| `server.js` | Node 最小静态服务器 | 创建 |
| `start.bat` | 一键启动 | 创建 |
| `.gitignore` | 忽略 node_modules 等 | 创建 |
| `README.md` | 用法 + 验收清单 + 边界说明 | 创建 |

**约定(全计划一致,勿改名):**
- DOM id:`#video` `#overlay` `#btn-select` `#btn-start` `#btn-pause` `#btn-shot` `#btn-stop` `#btn-export` `#status-state` `#status-count` `#in-sample` `#in-pixel` `#in-high` `#in-low` `#in-stable` `#in-cooldown` `#in-timeout` `#thumbs` `#report`
- 选区用 video 原始像素坐标:`sel = { x, y, w, h }`
- 纯函数: `padNum` `formatSeconds` `makeName` `diffRatio` `previewToVideo` `clampRect`
- 类: `ChangeTracker` `SnapshotStore`
- 函数: `startCapture` `sampleRegion` `snapshotRegion` `exportZip` `triggerDownload`

---

## Task 1: 基础设施(服务器 + 启动器 + 页面骨架)

**Files:**
- Create: `E:\ScreenChangeCapture\server.js`
- Create: `E:\ScreenChangeCapture\start.bat`
- Create: `E:\ScreenChangeCapture\.gitignore`
- Copy: `E:\ImageCropper\vendor\jszip.min.js` → `E:\ScreenChangeCapture\vendor\jszip.min.js`
- Create: `E:\ScreenChangeCapture\index.html`(骨架)
- Create: `E:\ScreenChangeCapture\styles.css`(基础)
- Create: `E:\ScreenChangeCapture\app.js`(空 selftest 入口)

- [ ] **Step 1: 复制 JSZip**

```bash
mkdir -p "E:/ScreenChangeCapture/vendor"
cp "E:/ImageCropper/vendor/jszip.min.js" "E:/ScreenChangeCapture/vendor/jszip.min.js"
ls -la "E:/ScreenChangeCapture/vendor/jszip.min.js"
```
Expected: 文件存在,约 97630 字节。

- [ ] **Step 2: 写 `server.js`**

```js
// server.js — 最小静态服务器,仅用 Node 内置模块,零依赖
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  // 防目录穿越
  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('ScreenChangeCapture server: http://127.0.0.1:' + PORT);
});
```

- [ ] **Step 3: 写 `start.bat`**

```bat
@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js,请先安装 Node.js (https://nodejs.org)
  pause
  exit /b 1
)
start "" http://127.0.0.1:5173
node server.js
pause
```

- [ ] **Step 4: 写 `.gitignore`**

```
node_modules/
*.log
.DS_Store
```

- [ ] **Step 5: 写 `index.html` 骨架**(仅引入资源 + 空 body,后续 task 填充)

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>屏幕区域变化检测截图器</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app">
    <div class="topbar">
      <h1>屏幕区域变化检测截图器</h1>
      <div class="topbar-actions">
        <span class="status-pill" id="status-state">未启动</span>
        <span class="count" id="status-count">已截 0 张</span>
      </div>
    </div>
    <div class="workspace">
      <div class="preview-area">
        <div class="preview-wrap" id="preview-wrap">
          <video id="video" autoplay muted playsinline></video>
          <canvas id="overlay"></canvas>
          <div class="preview-hint" id="preview-hint">点右上「选择屏幕」开始</div>
        </div>
      </div>
      <div class="panel" id="panel">
        <!-- Task 10/11 填充参数、按钮、截图列表、导出 -->
        <div class="placeholder">参数与控制面板(后续填充)</div>
      </div>
    </div>
  </div>
  <script src="vendor/jszip.min.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 6: 写 `styles.css` 基础**

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; background: #f5f6f8; color: #222; height: 100vh; overflow: hidden; }
#app { display: flex; flex-direction: column; height: 100vh; }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e3e6ea; }
.topbar h1 { font-size: 16px; font-weight: 600; }
.topbar-actions { display: flex; align-items: center; gap: 12px; }
.status-pill { font-size: 13px; padding: 3px 10px; border-radius: 12px; background: #eef0f3; color: #555; }
.status-pill.changing { background: #fef3c7; color: #92400e; }
.status-pill.cooldown { background: #ede9fe; color: #5b21b6; }
.count { color: #666; font-size: 13px; }
.workspace { display: flex; flex: 1; min-height: 0; }
.preview-area { flex: 1; padding: 12px; min-width: 0; }
.preview-wrap { position: relative; width: 100%; height: 100%; background: #000; border-radius: 10px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
#video { max-width: 100%; max-height: 100%; display: block; }
#overlay { position: absolute; pointer-events: auto; }
.preview-hint { position: absolute; color: #9aa1aa; pointer-events: none; font-size: 14px; }
.panel { width: 320px; padding: 12px; background: #fff; border-left: 1px solid #e3e6ea; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
button { padding: 6px 12px; border: 1px solid #d0d4da; background: #fff; border-radius: 6px; cursor: pointer; font-size: 13px; }
button:hover { background: #f0f2f5; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
button.primary:hover { background: #1d4ed8; }
.placeholder { color: #9aa1aa; font-size: 13px; text-align: center; padding: 20px 0; }
```

- [ ] **Step 7: 写 `app.js` 空入口**(只放 selftest 框架 + URL 检测,后续 task 填充模块)

```js
// app.js — 屏幕区域变化检测截图器
'use strict';

// === selftest 框架(后续 task 填充用例) ===
const selftest = {
  results: [],
  ok(name) { this.results.push({ name, pass: true }); console.log('  ✓ ' + name); },
  fail(name, msg) { this.results.push({ name, pass: false, msg }); console.error('  ✗ ' + name + ' — ' + msg); },
};

function runSelftest() {
  console.log('=== selftest 开始 ===');
  selftest.results = [];
  // Task 2-5 在此插入用例
  const passed = selftest.results.filter(r => r.pass).length;
  const total = selftest.results.length;
  console.log('=== selftest: ' + passed + '/' + total + ' 通过 ===');
  return { passed, total, results: selftest.results };
}

// ?selftest 模式:浏览器自动跑并显示
if (typeof window !== 'undefined' && window.location && window.location.search.indexOf('selftest') >= 0) {
  window.addEventListener('DOMContentLoaded', () => {
    const r = runSelftest();
    const el = document.createElement('pre');
    el.className = 'selftest';
    el.textContent = 'selftest ' + r.passed + '/' + r.total + ' 通过\n\n' +
      r.results.map(x => (x.pass ? '✓ ' : '✗ ') + x.name + (x.pass ? '' : '  — ' + x.msg)).join('\n');
    document.body.appendChild(el);
  });
}
```

- [ ] **Step 8: 验证服务器启动**

Run: `cd "E:/ScreenChangeCapture" && node server.js`(另开终端或后台跑)
然后用浏览器开 `http://127.0.0.1:5173/` 与 `http://127.0.0.1:5173/?selftest`
Expected: 页面正常加载;`?selftest` 显示 "selftest 0/0 通过"。

- [ ] **Step 9: Commit**

```bash
cd "E:/ScreenChangeCapture"
git add -A
git commit -m "feat: 基础设施(Node 静态服务器 + 启动器 + 页面骨架)"
```

---

## Task 2: Namer 命名器(纯函数,TDD)

**Files:**
- Modify: `E:\ScreenChangeCapture\app.js`(在 selftest 框架后、`runSelftest` 前插入模块)

- [ ] **Step 1: 在 `app.js` 插入 Namer 实现**

在 `selftest` 对象定义之后、`function runSelftest()` 之前插入:

```js
// === Namer(纯函数) ===
function padNum(n, width) {
  const s = String(n);
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}
function formatSeconds(ms) {
  return (ms / 1000).toFixed(1) + 's';
}
function makeName(index, elapsedMs) {
  // index 1-based; elapsedMs 距监控开始的毫秒
  return 'change_' + padNum(index, 3) + '_' + formatSeconds(elapsedMs) + '.png';
}
```

- [ ] **Step 2: 在 `runSelftest()` 里 `// Task 2-5 在此插入用例` 处插入用例**

```js
  // Namer
  if (makeName(1, 12300) === 'change_001_12.3s.png') selftest.ok('Namer 基本命名'); else selftest.fail('Namer 基本命名', makeName(1, 12300));
  if (makeName(42, 0) === 'change_042_0.0s.png') selftest.ok('Namer 序号补零'); else selftest.fail('Namer 序号补零', makeName(42, 0));
  if (makeName(1000, 6500) === 'change_1000_6.5s.png') selftest.ok('Namer 大序号不截断'); else selftest.fail('Namer 大序号不截断', makeName(1000, 6500));
```

- [ ] **Step 3: 验证(Node 语法 + 沙箱跑 selftest)**

Run:
```bash
cd "E:/ScreenChangeCapture"
node --check app.js && echo "syntax ok"
node -e "const fs=require('fs');const code=fs.readFileSync('app.js','utf8');const win={};const sandbox={window:win,location:{search:''},console};const m={exports:{}};const fn=new Function('window','location','console','module',code);fn(win,sandbox.location,sandbox.console,m);require('vm');" 2>/dev/null; node -e "
const fs=require('fs');const code=fs.readFileSync('app.js','utf8');
let win={};let loc={search:''};let results=[];
const st={results:[],ok(n){this.results.push({name:n,pass:true});},fail(n,m){this.results.push({name:n,pass:false,msg:m});}};
const wrap='const selftest='+JSON.stringify({results:[]})+';selftest.ok=function(n){this.results.push({name:n,pass:true});console.log(\"  ok \"+n)};selftest.fail=function(n,m){this.results.push({name:n,pass:false,msg:m});console.log(\"  fail \"+n)};';
"
```
(若沙箱命令过于复杂,直接用浏览器 `?selftest` 验证更可靠。)
Expected: 3 条 Namer 用例全通过。

简化验证(推荐):浏览器开 `http://127.0.0.1:5173/?selftest`,Expected: "selftest 3/3 通过"。

- [ ] **Step 4: Commit**

```bash
cd "E:/ScreenChangeCapture"
git add app.js
git commit -m "feat: Namer 命名器(序号+秒数)"
```

---

## Task 3: DiffDetector 差异检测(纯函数,TDD)

**Files:**
- Modify: `E:\ScreenChangeCapture\app.js`

- [ ] **Step 1: 在 Namer 之后插入 DiffDetector**

```js
// === DiffDetector(纯函数):两帧 ImageData → 变化像素比例 ===
// frame = { data: Uint8ClampedArray, width, height }
function diffRatio(a, b, pixelThreshold) {
  const w = a.width, h = a.height;
  if (b.width !== w || b.height !== h) throw new Error('diffRatio size mismatch');
  const da = a.data, db = b.data;
  const total = w * h;
  let changed = 0;
  for (let i = 0; i < total; i++) {
    const off = i * 4;
    const dr = da[off] - db[off]; if (dr < 0) { /*abs below*/ }
    const r = Math.abs(dr);
    const g = Math.abs(da[off + 1] - db[off + 1]);
    const bl = Math.abs(da[off + 2] - db[off + 2]);
    let m = r > g ? r : g;
    if (bl > m) m = bl;
    if (m > pixelThreshold) changed++;
  }
  return changed / total;
}

// 测试辅助:构造小 ImageData-like
function makeFrame(w, h, fillValue) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const off = i * 4;
    data[off] = fillValue; data[off + 1] = fillValue; data[off + 2] = fillValue; data[off + 3] = 255;
  }
  return { data, width: w, height: h };
}
```

- [ ] **Step 2: 插入 selftest 用例**

```js
  // DiffDetector
  const f0 = makeFrame(2, 2, 100);
  const f1 = makeFrame(2, 2, 100); // 相同
  const f2 = makeFrame(2, 2, 200); // 全变(差 100)
  // 半变:2x2=4 像素,改 2 个
  const f3 = makeFrame(2, 2, 100); f3.data[0] = 200; f3.data[4] = 200;
  // 噪声:差 10 < 阈值 30
  const f4 = makeFrame(2, 2, 100); f4.data[0] = 110; f4.data[4] = 110; f4.data[8] = 110; f4.data[12] = 110;
  if (diffRatio(f0, f1, 30) === 0) selftest.ok('Diff 相同=0'); else selftest.fail('Diff 相同=0', String(diffRatio(f0, f1, 30)));
  if (diffRatio(f0, f2, 30) === 1) selftest.ok('Diff 全变=1'); else selftest.fail('Diff 全变=1', String(diffRatio(f0, f2, 30)));
  if (diffRatio(f0, f3, 30) === 0.5) selftest.ok('Diff 半变=0.5'); else selftest.fail('Diff 半变=0.5', String(diffRatio(f0, f3, 30)));
  if (diffRatio(f0, f4, 30) === 0) selftest.ok('Diff 噪声<阈不算'); else selftest.fail('Diff 噪声<阈不算', String(diffRatio(f0, f4, 30)));
```

- [ ] **Step 3: 验证**(浏览器 `?selftest`)
Expected: 4 条 Diff 用例通过,累计 7/7。

- [ ] **Step 4: Commit**

```bash
cd "E:/ScreenChangeCapture"
git add app.js
git commit -m "feat: DiffDetector 变化像素比例检测"
```

---

## Task 4: ChangeTracker 状态机(TDD)

**Files:**
- Modify: `E:\ScreenChangeCapture\app.js`

- [ ] **Step 1: 在 DiffDetector 之后插入 ChangeTracker 类**

```js
// === ChangeTracker 状态机:IDLE → CHANGING → 截图 → COOLDOWN → IDLE ===
// feed(ratio, now) 返回 true 表示该帧应截图
class ChangeTracker {
  constructor(opts) {
    this.highRatio = opts.highRatio;
    this.lowRatio = opts.lowRatio;
    this.stableFrames = opts.stableFrames;
    this.cooldownMs = opts.cooldownMs;
    this.changeTimeoutMs = opts.changeTimeoutMs;
    this.reset();
  }
  reset() {
    this.state = 'IDLE';
    this.stableCount = 0;
    this.changeStart = 0;
    this.cooldownEnd = 0;
  }
  feed(ratio, now) {
    if (this.state === 'COOLDOWN') {
      if (now >= this.cooldownEnd) { this.state = 'IDLE'; }
      else { return false; }
    }
    if (this.state === 'IDLE') {
      if (ratio > this.highRatio) {
        this.state = 'CHANGING';
        this.changeStart = now;
        this.stableCount = 0;
      }
      return false;
    }
    // CHANGING
    if (ratio < this.lowRatio) {
      this.stableCount++;
      if (this.stableCount >= this.stableFrames) {
        this._cooldown(now);
        return true;
      }
    } else {
      this.stableCount = 0;
    }
    if (now - this.changeStart >= this.changeTimeoutMs) {
      this._cooldown(now);
      return true;
    }
    return false;
  }
  _cooldown(now) {
    this.state = 'COOLDOWN';
    this.cooldownEnd = now + this.cooldownMs;
  }
}
```

- [ ] **Step 2: 插入 selftest 用例**

```js
  // ChangeTracker
  (function () {
    const t = new ChangeTracker({ highRatio: 0.03, lowRatio: 0.005, stableFrames: 3, cooldownMs: 1000, changeTimeoutMs: 3000 });
    let now = 0;
    // 静止帧不触发
    let r1 = t.feed(0.001, now); now += 100;
    if (r1 === false && t.state === 'IDLE') selftest.ok('CT 静止不触发'); else selftest.fail('CT 静止不触发', t.state);
    // 超阈进入 CHANGING,但不立即截图
    t.feed(0.1, now); now += 100;
    if (t.state === 'CHANGING') selftest.ok('CT 超阈进入CHANGING'); else selftest.fail('CT 超阈进入CHANGING', t.state);
    // 稳定 3 帧 → 触发截图
    t.feed(0.001, now); now += 100; // stable 1
    t.feed(0.001, now); now += 100; // stable 2
    let trig = t.feed(0.001, now); now += 100; // stable 3 → 触发
    if (trig === true && t.state === 'COOLDOWN') selftest.ok('CT 稳定后触发截图'); else selftest.fail('CT 稳定后触发截图', t.state + ' trig=' + trig);
    // 冷却期内不触发
    let r2 = t.feed(0.5, now); now += 100;
    if (r2 === false && t.state === 'COOLDOWN') selftest.ok('CT 冷却期抑制'); else selftest.fail('CT 冷却期抑制', t.state);
    // 冷却结束恢复 IDLE
    now += 1000;
    t.feed(0.001, now);
    if (t.state === 'IDLE') selftest.ok('CT 冷却后恢复IDLE'); else selftest.fail('CT 冷却后恢复IDLE', t.state);
  })();
  // 超时强制截图
  (function () {
    const t = new ChangeTracker({ highRatio: 0.03, lowRatio: 0.005, stableFrames: 3, cooldownMs: 1000, changeTimeoutMs: 3000 });
    let now = 0;
    t.feed(0.1, now); now += 100; // 进入 CHANGING
    // 持续高频变化,3 秒内不稳定
    let trig = false;
    for (let i = 0; i < 35; i++) { trig = t.feed(0.5, now); now += 100; if (trig) break; }
    if (trig === true) selftest.ok('CT 超时强制截图'); else selftest.fail('CT 超时强制截图', 'no trigger');
  })();
```

- [ ] **Step 3: 验证**(浏览器 `?selftest`)
Expected: 6 条 CT 用例通过,累计 13/13。

- [ ] **Step 4: Commit**

```bash
cd "E:/ScreenChangeCapture"
git add app.js
git commit -m "feat: ChangeTracker 状态机(稳定检测+冷却+超时)"
```

---

## Task 5: 几何映射 + SnapshotStore(纯逻辑,TDD)

**Files:**
- Modify: `E:\ScreenChangeCapture\app.js`

- [ ] **Step 1: 插入几何映射**

```js
// === 几何映射(纯函数) ===
// 预览显示尺寸 → video 原始像素
function previewToVideo(px, py, previewW, previewH, videoW, videoH) {
  return {
    x: Math.round(px * videoW / previewW),
    y: Math.round(py * videoH / previewH),
  };
}
// 选区 clamp 到 video 边界
function clampRect(r, videoW, videoH) {
  let x = Math.max(0, Math.min(r.x, videoW));
  let y = Math.max(0, Math.min(r.y, videoH));
  let w = Math.min(Math.max(1, r.w), videoW - x);
  let h = Math.min(Math.max(1, r.h), videoH - y);
  return { x, y, w, h };
}
```

- [ ] **Step 2: 插入 SnapshotStore**

```js
// === SnapshotStore(截图列表) ===
class SnapshotStore {
  constructor() { this.items = []; }
  add(item) { this.items.push(item); }
  remove(idx) { if (idx >= 0 && idx < this.items.length) this.items.splice(idx, 1); }
  getAll() { return this.items.slice(); }
  count() { return this.items.length; }
  clear() { this.items = []; }
}
```

- [ ] **Step 3: 插入 selftest 用例**

```js
  // 几何映射
  const p = previewToVideo(100, 50, 400, 300, 800, 600);
  if (p.x === 200 && p.y === 100) selftest.ok('Geom 预览→video 映射'); else selftest.fail('Geom 预览→video 映射', JSON.stringify(p));
  const cl = clampRect({ x: -10, y: -10, w: 9999, h: 9999 }, 800, 600);
  if (cl.x === 0 && cl.y === 0 && cl.w === 800 && cl.h === 600) selftest.ok('Geom clamp 越界'); else selftest.fail('Geom clamp 越界', JSON.stringify(cl));
  // SnapshotStore
  const store = new SnapshotStore();
  store.add({ name: 'a' }); store.add({ name: 'b' });
  if (store.count() === 2) selftest.ok('Store add/count'); else selftest.fail('Store add/count', String(store.count()));
  store.remove(0);
  if (store.count() === 1 && store.getAll()[0].name === 'b') selftest.ok('Store remove'); else selftest.fail('Store remove', String(store.count()));
```

- [ ] **Step 4: 验证**(浏览器 `?selftest`)
Expected: 4 条通过,累计 17/17。

- [ ] **Step 5: Commit**

```bash
cd "E:/ScreenChangeCapture"
git add app.js
git commit -m "feat: 几何映射 + SnapshotStore"
```

---

## Task 6: ZipExporter

**Files:**
- Modify: `E:\ScreenChangeCapture\app.js`

- [ ] **Step 1: 插入导出函数**

```js
// === ZipExporter ===
function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function blobToArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsArrayBuffer(blob);
  });
}
async function exportZip(store, zipName) {
  const zip = new JSZip();
  const all = store.getAll();
  for (const it of all) {
    const buf = await blobToArrayBuffer(it.blob);
    zip.file(it.name, buf);
  }
  const out = await zip.generateAsync({ type: 'blob' });
  triggerDownload(out, zipName);
}
```

- [ ] **Step 2: Commit**(此模块依赖 JSZip/浏览器,手动验收在 Task 11/12)

```bash
cd "E:/ScreenChangeCapture"
git add app.js
git commit -m "feat: ZipExporter(zip 打包下载)"
```

---

## Task 7: ScreenCapture + Sampler + Snapshotter(浏览器模块)

**Files:**
- Modify: `E:\ScreenChangeCapture\app.js`

- [ ] **Step 1: 插入浏览器模块**

```js
// === ScreenCapture ===
async function startCapture() {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30 },
    audio: false,
  });
  return stream;
}

// === Sampler:从 video 抓框选区域 ImageData ===
let _sampleCanvas = null;
function sampleRegion(video, rect) {
  if (!_sampleCanvas) _sampleCanvas = document.createElement('canvas');
  const w = Math.max(1, Math.round(rect.w));
  const h = Math.max(1, Math.round(rect.h));
  _sampleCanvas.width = w; _sampleCanvas.height = h;
  const ctx = _sampleCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// === Snapshotter:从 video 裁框选区域 → PNG blob ===
function snapshotRegion(video, rect) {
  const c = document.createElement('canvas');
  const w = Math.max(1, Math.round(rect.w));
  const h = Math.max(1, Math.round(rect.h));
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    c.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
  });
}
```

- [ ] **Step 2: 语法验证**

```bash
cd "E:/ScreenChangeCapture" && node --check app.js && echo "syntax ok"
```
Expected: "syntax ok"。

- [ ] **Step 3: Commit**(手动验收在 Task 11 整体联调)

```bash
cd "E:/ScreenChangeCapture"
git add app.js
git commit -m "feat: ScreenCapture + Sampler + Snapshotter"
```

---

## Task 8: HTML 完整结构 + CSS 完整样式

**Files:**
- Modify: `E:\ScreenChangeCapture\index.html`(替换 panel 占位 + 补元素)
- Modify: `E:\ScreenChangeCapture\styles.css`(追加面板/截图列表/参数样式)

- [ ] **Step 1: 替换 `index.html` 的 `<div class="panel" id="panel">...</div>` 为完整面板**

```html
      <div class="panel" id="panel">
        <div class="section">
          <div class="section-title">操作</div>
          <div class="btn-row">
            <button class="primary" id="btn-select">选择屏幕</button>
            <button id="btn-start" disabled>开始监控</button>
          </div>
          <div class="btn-row">
            <button id="btn-pause" disabled>暂停</button>
            <button id="btn-shot" disabled>立即截图</button>
          </div>
          <div class="btn-row">
            <button id="btn-stop" disabled>停止</button>
            <button id="btn-export" disabled>导出 zip</button>
          </div>
        </div>

        <div class="section">
          <div class="section-title">检测参数</div>
          <label class="field">采样间隔(ms)<input type="number" id="in-sample" value="150" min="50" max="2000" step="10"></label>
          <label class="field">像素差阈值<input type="number" id="in-pixel" value="30" min="1" max="255" step="1"></label>
          <label class="field">变化比例高阈(%)<input type="number" id="in-high" value="3" min="0.1" max="100" step="0.1"></label>
          <label class="field">变化比例低阈(%)<input type="number" id="in-low" value="0.5" min="0.05" max="100" step="0.05"></label>
          <label class="field">稳定帧数<input type="number" id="in-stable" value="3" min="1" max="20" step="1"></label>
          <label class="field">冷却(ms)<input type="number" id="in-cooldown" value="1500" min="0" max="30000" step="100"></label>
          <label class="field">变化超时(ms)<input type="number" id="in-timeout" value="3000" min="500" max="30000" step="100"></label>
        </div>

        <div class="section">
          <div class="section-title">截图列表 <span class="count-inline" id="status-count2">0</span></div>
          <div class="thumbs" id="thumbs"></div>
        </div>
      </div>
```

- [ ] **Step 2: 在 `styles.css` 末尾追加面板样式**

```css
.section { border-top: 1px solid #f0f1f3; padding-top: 10px; }
.section:first-child { border-top: none; padding-top: 0; }
.section-title { font-size: 12px; color: #888; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
.btn-row { display: flex; gap: 6px; margin-bottom: 6px; }
.btn-row button { flex: 1; }
.field { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #444; margin-bottom: 6px; }
.field input { width: 90px; padding: 3px 6px; border: 1px solid #d0d4da; border-radius: 4px; font-size: 12px; }
.count-inline { color: #2563eb; font-weight: 600; }
.thumbs { display: flex; flex-wrap: wrap; gap: 4px; max-height: 260px; overflow-y: auto; }
.thumb { position: relative; width: 56px; height: 56px; }
.thumb img { width: 56px; height: 56px; object-fit: cover; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; }
.thumb .del { position: absolute; top: -6px; right: -6px; width: 16px; height: 16px; border-radius: 50%; background: #ef4444; color: #fff; border: none; font-size: 11px; line-height: 16px; padding: 0; cursor: pointer; }
.selftest { font-family: monospace; font-size: 12px; white-space: pre-wrap; background: #1e1e1e; color: #d4d4d4; padding: 10px; border-radius: 6px; margin-top: 10px; max-height: 300px; overflow-y: auto; }
.preview-hint.hidden { display: none; }
```

- [ ] **Step 3: Commit**

```bash
cd "E:/ScreenChangeCapture"
git add index.html styles.css
git commit -m "feat: 完整面板结构(操作/参数/截图列表)"
```

---

## Task 9: RegionPicker 拖框选交互

**Files:**
- Modify: `E:\ScreenChangeCapture\app.js`(追加全局状态 + overlay 事件)

- [ ] **Step 1: 在 app.js 浏览器模块之后、控制器之前插入选区状态与绘制**

```js
// === 选区状态(全局,video 像素坐标) ===
let sel = null;            // { x, y, w, h } video 像素
let dragging = false;
let dragStart = null;      // overlay 坐标

const overlay = document.getElementById('overlay');
const video = document.getElementById('video');
const previewWrap = document.getElementById('preview-wrap');

// 让 overlay 与 video 显示区对齐
function syncOverlaySize() {
  // overlay 用 video 的渲染尺寸(clientWidth/Height)
  overlay.width = video.clientWidth;
  overlay.height = video.clientHeight;
  overlay.style.width = video.clientWidth + 'px';
  overlay.style.height = video.clientHeight + 'px';
}

function drawOverlay() {
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!sel) return;
  // 把 video 像素选区映射回 overlay 显示坐标
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
```

- [ ] **Step 2: 绑定鼠标拖拽**

```js
overlay.addEventListener('mousedown', (e) => {
  if (!video.videoWidth) return;
  dragging = true;
  const r = overlay.getBoundingClientRect();
  dragStart = { x: e.clientX - r.left, y: e.clientY - r.top };
});
overlay.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const r = overlay.getBoundingClientRect();
  const cx = e.clientX - r.left, cy = e.clientY - r.top;
  const px = Math.min(dragStart.x, cx), py = Math.min(dragStart.y, cy);
  const pw = Math.abs(cx - dragStart.x), ph = Math.abs(cy - dragStart.y);
  // overlay 坐标 → video 像素
  const a = previewToVideo(px, py, overlay.width, overlay.height, video.videoWidth, video.videoHeight);
  const b = previewToVideo(px + pw, py + ph, overlay.width, overlay.height, video.videoWidth, video.videoHeight);
  sel = clampRect({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }, video.videoWidth, video.videoHeight);
  drawOverlay();
});
window.addEventListener('mouseup', () => {
  if (dragging) {
    dragging = false;
    if (sel && (sel.w < 2 || sel.h < 2)) sel = null;
    drawOverlay();
    updateButtons();
  }
});
```

- [ ] **Step 3: video loadedmetadata 时同步尺寸**

```js
video.addEventListener('loadedmetadata', () => {
  syncOverlaySize();
  drawOverlay();
});
window.addEventListener('resize', () => { syncOverlaySize(); drawOverlay(); });
```

- [ ] **Step 4: 语法验证 + Commit**

```bash
cd "E:/ScreenChangeCapture" && node --check app.js && echo "syntax ok"
git add app.js
git commit -m "feat: RegionPicker 拖框选交互 + overlay 绘制"
```

---

## Task 10: 参数读取 + 控制按钮状态

**Files:**
- Modify: `E:\ScreenChangeCapture\app.js`

- [ ] **Step 1: 插入参数读取与按钮状态**

```js
// === 参数读取 ===
function readParams() {
  return {
    sampleInterval: num('in-sample', 150),
    pixelThreshold: num('in-pixel', 30),
    highRatio: num('in-high', 3) / 100,
    lowRatio: num('in-low', 0.5) / 100,
    stableFrames: num('in-stable', 3),
    cooldownMs: num('in-cooldown', 1500),
    changeTimeoutMs: num('in-timeout', 3000),
  };
}
function num(id, def) {
  const v = parseFloat(document.getElementById(id).value);
  return isNaN(v) ? def : v;
}

// === 按钮状态 ===
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

let capturing = false;   // 是否已选屏
let monitoring = false;  // 是否在监控
let paused = false;

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
```

- [ ] **Step 2: 语法验证 + Commit**

```bash
cd "E:/ScreenChangeCapture" && node --check app.js && echo "syntax ok"
git add app.js
git commit -m "feat: 参数读取 + 按钮状态管理"
```

---

## Task 11: 主控制器(选屏/采样循环/截图入列/暂停/手动/停止/导出)

**Files:**
- Modify: `E:\ScreenChangeCapture\app.js`

- [ ] **Step 1: 插入 store 实例与全局监控状态**

```js
const store = new SnapshotStore();
let tracker = null;
let timer = null;
let lastFrame = null;     // 上一帧 ImageData
let monitorStart = 0;     // 监控开始时间戳
let shotIndex = 0;
```

- [ ] **Step 2: 选屏按钮**

```js
btnSelect.addEventListener('click', async () => {
  try {
    const stream = await startCapture();
    video.srcObject = stream;
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      // 用户在浏览器原生 UI 停止共享
      stopMonitor();
      capturing = false; updateButtons();
    });
    capturing = true;
    elHint.classList.add('hidden');
    updateButtons();
  } catch (e) {
    elState.textContent = '选屏失败';
    console.error(e);
  }
});
```

- [ ] **Step 3: 开始监控**

```js
function startMonitor() {
  if (!capturing || !sel) return;
  const p = readParams();
  tracker = new ChangeTracker(p);
  lastFrame = sampleRegion(video, sel);
  monitorStart = performance.now();
  shotIndex = 0;
  monitoring = true; paused = false;
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
  store.add({ name, blob, url, ts: now });
  renderThumbs();
  updateCount();
}
```

- [ ] **Step 4: 暂停/手动/停止/导出**

```js
btnStart.addEventListener('click', startMonitor);
btnPause.addEventListener('click', () => {
  paused = !paused;
  if (!paused) { lastFrame = sampleRegion(video, sel); } // 恢复时重置基准帧,避免暂停期间变化误触发
  updateButtons();
});
btnShot.addEventListener('click', () => {
  if (!capturing || !sel) return;
  takeSnapshot(performance.now() - monitorStart);
});
btnStop.addEventListener('click', stopMonitor);
function stopMonitor() {
  monitoring = false;
  if (timer) { clearInterval(timer); timer = null; }
  setStatePill('已停止');
  updateButtons();
}
btnExport.addEventListener('click', async () => {
  btnExport.disabled = true;
  const ts = new Date(monitorStart ? monitorStart : Date.now());
  const pad = (n) => String(n).padStart(2, '0');
  const zipName = 'screenshots_' + ts.getFullYear() + pad(ts.getMonth()+1) + pad(ts.getDate()) + '_' + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds()) + '.zip';
  await exportZip(store, zipName);
  btnExport.disabled = store.count() === 0;
});
```

- [ ] **Step 5: 截图列表渲染**

```js
function renderThumbs() {
  elThumbs.innerHTML = '';
  const all = store.getAll();
  for (let i = 0; i < all.length; i++) {
    const it = all[i];
    const div = document.createElement('div');
    div.className = 'thumb';
    const img = document.createElement('img');
    img.src = it.url; img.title = it.name;
    img.addEventListener('click', () => window.open(it.url));
    const del = document.createElement('button');
    del.className = 'del'; del.textContent = '×'; del.title = '删除';
    del.addEventListener('click', (ev) => {
      ev.stopPropagation();
      URL.revokeObjectURL(it.url);
      store.remove(i);
      renderThumbs(); updateCount();
    });
    div.appendChild(img); div.appendChild(del);
    elThumbs.appendChild(div);
  }
}
```

- [ ] **Step 6: 初始化按钮状态**

```js
updateCount();
updateButtons();
```

- [ ] **Step 7: 语法验证**

```bash
cd "E:/ScreenChangeCapture" && node --check app.js && echo "syntax ok"
```
Expected: "syntax ok"。

- [ ] **Step 8: Commit**

```bash
cd "E:/ScreenChangeCapture"
git add app.js
git commit -m "feat: 主控制器(采样循环+状态机驱动+截图入列+控制+导出)"
```

---

## Task 12: selftest 集成核对 + README + 验收

**Files:**
- Create: `E:\ScreenChangeCapture\README.md`

- [ ] **Step 1: 确认 selftest 全绿**

浏览器开 `http://127.0.0.1:5173/?selftest`
Expected: "selftest 17/17 通过"(Namer 3 + Diff 4 + CT 6 + 几何/Store 4)。若有失败,按失败信息修正。

- [ ] **Step 2: 写 README**

```markdown
# 屏幕区域变化检测截图器

捕获屏幕/窗口,框选一个区域,区域出现**显著状态变化**时自动截图,打包 zip 下载。

## 启动

1. 确保已装 Node.js(https://nodejs.org)
2. 双击 `start.bat`
3. 浏览器自动打开 `http://127.0.0.1:5173`

> 必须通过 localhost 访问。屏幕捕获 API(getDisplayMedia)在 `file://` 下被禁用。

## 用法

1. 点【选择屏幕】→ 浏览器弹窗选要共享的屏幕/窗口/标签
2. 在预览上**拖一个矩形框**,圈住要监控的区域
3. 点【开始监控】
4. 区域出现显著变化 → 自动截图,加入右侧列表
5. 【暂停】临时停手;【立即截图】手动补一张;【停止】结束
6. 点【导出 zip】下载全部截图

截图命名:`change_001_12.3s.png`(序号 + 距监控开始的秒数)。

## 检测原理

帧间差异 + 稳定检测 + 冷却:
- 每隔「采样间隔」抓一帧区域,与上一帧比「变化像素比例」
- 比例 > 高阈 → 进入「变化中」
- 连续 N 帧比例 < 低阈 → 判定稳定 → 截图 → 冷却
- 变化超过「超时」还没稳定 → 强制截当前帧 → 冷却

## 参数说明(右侧面板可调)

| 参数 | 默认 | 说明 |
|---|---|---|
| 采样间隔 | 150ms | 多久抓一帧比较 |
| 像素差阈值 | 30 | 单像素 RGB 差超过此才算「该像素变了」 |
| 变化比例高阈 | 3% | 超过判定显著变化 |
| 变化比例低阈 | 0.5% | 低于判定趋于稳定 |
| 稳定帧数 | 3 | 连续几帧低于低阈才算稳定 |
| 冷却 | 1500ms | 截图后多久不再触发 |
| 变化超时 | 3000ms | 变化持续多久强制截 |

## 边界(必读)

- **持续大幅运动的区域**会进入「变化→超时强制截→冷却」循环,等于降频定时截图。这是算法本质限制。应对:调高高阈、调冷却、或用暂停手动控。
- 每次启动浏览器会弹屏幕共享权限,这是浏览器规范,无法绕过。

## 自检

`http://127.0.0.1:5173/?selftest` 跑纯逻辑自检(命名/差异/状态机/几何,17 条)。

## 技术栈

纯 HTML5 + Canvas + 原生 JS,无框架。JSZip 3.10.1 打包。Node 内置模块起的 localhost 静态服务器。
```

- [ ] **Step 3: 最终验收清单(手动)**

逐项在浏览器操作确认:
- [ ] 双击 start.bat → 浏览器自动开,页面正常
- [ ] `?selftest` 显示 17/17 通过
- [ ] 选择屏幕 → 预览出现
- [ ] 拖框选 → 蓝框出现,开始监控按钮变可用
- [ ] 开始监控 → 状态显示 IDLE
- [ ] 框选区域出现显著变化 → 自动截图,列表+计数更新,状态走 CHANGING→COOLDOWN→IDLE
- [ ] 暂停/继续 正常
- [ ] 立即截图 手动出一张
- [ ] 停止 → 状态「已停止」
- [ ] 导出 zip → 下载一个含所有 PNG 的 zip
- [ ] 缩略图点击放大、删除单张正常

- [ ] **Step 4: Commit**

```bash
cd "E:/ScreenChangeCapture"
git add README.md
git commit -m "docs: README 用法+参数+边界+验收清单"
```

---

## 完成标准

- 所有 task 的 `- [ ]` 已勾选
- `node --check app.js` 通过
- `?selftest` 17/17 通过
- 手动验收清单全过
- git 历史清晰(每 task 一 commit)

## Self-Review(计划作者)

**Spec 覆盖:** §3 算法 → Task 3/4;§5 模块 → Task 2-7/9-11;§6 流程 → Task 11;§7 UI → Task 8/9;§8 截图打包 → Task 6/11;§9 测试 → Task 2-5/12;§10 非目标 → 已排除(无录屏/OCR/上传/多区域);§11 技术约束 → Task 1/7。无遗漏。

**Placeholder 扫描:** 无 TBD/TODO;每个代码步骤都给了完整代码;无「类似 Task N」省略。

**类型一致性:** DOM id、函数名(padNum/formatSeconds/makeName/diffRatio/previewToVideo/clampRect)、类名(ChangeTracker/SnapshotStore)、属性名(state/stableCount/changeStart/cooldownEnd/items)在所有 task 间一致。`sel`、`store`、`tracker`、`timer`、`lastFrame`、`monitorStart`、`shotIndex` 全局变量在 Task 9-11 间引用一致。

---

## 执行方式

计划完成,保存于 `docs/plans/2026-06-15-screen-change-capture.md`。两种执行选项:

1. **Subagent-Driven(推荐)** — 每个 task 派一个全新 subagent,任务间评审,快速迭代
2. **Inline 执行** — 在当前会话用 executing-plans,分批带检查点

请选择执行方式。
