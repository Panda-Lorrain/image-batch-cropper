# 截图批量框选裁切工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个纯本地网页工具,导入一批截图后在一张样图上拖框,一键把同一选区套用到全部图并打包 zip 下载。

**Architecture:** 纯原生 HTML5 + Canvas + JS(无框架/无构建)。5 文件结构:`index.html` / `styles.css` / `app.js` / `vendor/jszip.min.js` / `README.md`。app.js 内按区段组织纯函数(Geometry、Namer)与有状态组件(ImageList、CropCanvas、Cropper、Exporter)。纯函数用内置 selftest(`?selftest`)做 TDD,交互部分用手动验收。

**Tech Stack:** HTML5 Canvas 2D、FileReader / URL.createObjectURL、JSZip 3.10.1(本地内联)、ES2020。

**对应 Spec:** `docs/superpowers/specs/2026-06-15-image-batch-cropper-design.md`

---

## 文件结构(锁定)

```
tools/image-cropper/
├── index.html          # 页面结构,加载 styles.css / vendor/jszip.min.js / app.js
├── styles.css          # 全部样式
├── app.js              # 全部 JS:selftest 框架 + Geometry + Namer + ImageList + CropCanvas + Cropper + Exporter + 主控制器
├── vendor/jszip.min.js # JSZip 3.10.1(第三方,本地内联)
└── README.md           # 使用说明 + 验收测试清单
```

app.js 内部区段顺序(注释分隔):
1. Self-test 框架
2. Geometry 纯函数
3. Namer 纯函数
4. ImageList
5. CropCanvas
6. Cropper
7. Exporter
8. 主控制器(DOM 事件绑定)

## 测试约定

- **纯函数(Geometry、Namer)**:每个任务先在 selftest 注册测试用例 → 打开 `index.html?selftest` 确认 FAIL → 实现 → 确认 PASS。
- **交互组件(ImageList/CropCanvas/Cropper/Exporter)**:手动验收(在浏览器操作 + 检查),验收步骤写明操作与预期。
- **commit**:每个任务末尾 commit,中文 message。

---

## Task 1: 项目骨架 + selftest 框架

**Files:**
- Create: `tools/image-cropper/index.html`
- Create: `tools/image-cropper/styles.css`
- Create: `tools/image-cropper/app.js`
- Create: `tools/image-cropper/vendor/jszip.min.js`(下载)
- Create: `tools/image-cropper/README.md`(占位)

- [ ] **Step 1: 创建目录与下载 JSZip**

Run:
```bash
mkdir -p tools/image-cropper/vendor
curl -L -o tools/image-cropper/vendor/jszip.min.js https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
```
Expected: `vendor/jszip.min.js` 创建成功(约 95KB)。若无网,手动从 `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js` 下载放入。

验证文件非空:
```bash
ls -la tools/image-cropper/vendor/jszip.min.js
```

- [ ] **Step 2: 创建 index.html**

Create `tools/image-cropper/index.html`:
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>截图批量裁切</title>
  <link rel="stylesheet" href="styles.css">
  <script src="vendor/jszip.min.js"></script>
</head>
<body>
  <div id="app">
    <header class="topbar">
      <h1>截图批量裁切</h1>
      <div class="topbar-actions">
        <input type="file" id="fileInput" accept="image/png,image/jpeg,image/webp" multiple hidden>
        <button id="btnImport" type="button">导入图片</button>
        <input type="file" id="folderInput" webkitdirectory multiple hidden>
        <button id="btnFolder" type="button">选文件夹</button>
        <span id="countLabel" class="count">已导入 0 张</span>
      </div>
    </header>

    <main class="workspace">
      <section class="canvas-area">
        <div id="dropzone" class="dropzone">
          <p class="dropzone-hint">拖入图片,或点上方按钮导入</p>
          <canvas id="canvas" width="800" height="500"></canvas>
        </div>
      </section>

      <aside class="panel">
        <div class="panel-row">
          <span>样图 <span id="curIndex">0</span> / <span id="totalCount">0</span></span>
          <button id="btnPrev" type="button">&lt;</button>
          <button id="btnNext" type="button">&gt;</button>
        </div>
        <div id="thumbs" class="thumbs"></div>
        <div class="panel-row selection-info">
          <div>选区 x=<span id="selX">-</span> y=<span id="selY">-</span></div>
          <div><span id="selW">-</span> × <span id="selH">-</span> px</div>
        </div>
        <div class="panel-row">
          <label>比例锁</label>
          <select id="aspectSelect">
            <option value="0">自由</option>
            <option value="1">1:1</option>
            <option value="1.7778">16:9</option>
            <option value="1.3333">4:3</option>
          </select>
        </div>
        <button id="btnPreview" type="button" class="action">预览裁切</button>
        <button id="btnExport" type="button" class="action primary" disabled>裁切全部并保存</button>
        <div id="progress" class="progress hidden"></div>
        <div id="report" class="report"></div>
        <div id="previewBox" class="preview-box hidden">
          <h3>预览</h3>
          <img id="previewImg" alt="预览">
        </div>
        <div id="selfTestBox" class="selftest hidden"></div>
      </aside>
    </main>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 3: 创建 styles.css**

Create `tools/image-cropper/styles.css`:
```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; background: #f5f6f8; color: #222; height: 100vh; overflow: hidden; }
#app { display: flex; flex-direction: column; height: 100vh; }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: #fff; border-bottom: 1px solid #e3e6ea; }
.topbar h1 { font-size: 16px; font-weight: 600; }
.topbar-actions { display: flex; align-items: center; gap: 8px; }
.count { color: #666; font-size: 13px; margin-left: 8px; }
button { padding: 6px 12px; border: 1px solid #d0d4da; background: #fff; border-radius: 6px; cursor: pointer; font-size: 13px; }
button:hover { background: #f0f2f5; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
button.primary:hover { background: #1d4ed8; }
button.action { width: 100%; padding: 10px; margin-top: 8px; font-size: 14px; }
.workspace { display: flex; flex: 1; min-height: 0; }
.canvas-area { flex: 1; padding: 12px; min-width: 0; }
.dropzone { position: relative; height: 100%; border: 2px dashed #c7ccd3; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: #fff; overflow: hidden; }
.dropzone.dragover { border-color: #2563eb; background: #eff6ff; }
.dropzone-hint { position: absolute; color: #9aa1aa; pointer-events: none; }
#canvas { max-width: 100%; max-height: 100%; display: block; }
.panel { width: 280px; padding: 12px; background: #fff; border-left: 1px solid #e3e6ea; overflow-y: auto; display: flex; flex-direction: column; }
.panel-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 13px; }
.selection-info { flex-direction: column; align-items: flex-start; gap: 2px; color: #444; }
.thumbs { display: flex; flex-wrap: wrap; gap: 4px; max-height: 120px; overflow-y: auto; margin-bottom: 10px; }
.thumbs img { width: 40px; height: 40px; object-fit: cover; border: 2px solid transparent; border-radius: 4px; cursor: pointer; }
.thumbs img.active { border-color: #2563eb; }
select { padding: 4px 8px; border: 1px solid #d0d4da; border-radius: 6px; font-size: 13px; }
.progress { height: 8px; background: #e3e6ea; border-radius: 4px; overflow: hidden; margin-top: 8px; }
.progress-bar { height: 100%; width: 0; background: #2563eb; transition: width 0.15s; }
.report { font-size: 12px; color: #555; margin-top: 8px; line-height: 1.5; }
.preview-box { margin-top: 10px; border-top: 1px solid #eee; padding-top: 10px; }
.preview-box img { max-width: 100%; border: 1px solid #ddd; border-radius: 6px; margin-top: 6px; }
.selftest { font-family: monospace; font-size: 12px; white-space: pre-wrap; background: #1e1e1e; color: #d4d4d4; padding: 10px; border-radius: 6px; margin-top: 10px; max-height: 300px; overflow-y: auto; }
.hidden { display: none !important; }
label { font-size: 13px; color: #444; }
```

- [ ] **Step 4: 创建 app.js 骨架 + selftest 框架**

Create `tools/image-cropper/app.js`:
```javascript
'use strict';

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
  // 正常模式:初始化工具(后续任务填充)
  // initTool();
});
```

- [ ] **Step 5: 创建 README.md 占位**

Create `tools/image-cropper/README.md`:
```markdown
# 截图批量框选裁切工具

纯本地网页工具:导入一批截图 → 在样图上拖框 → 一键裁切全部 → zip 下载。

## 使用
1. 双击 `index.html` 用浏览器打开(推荐 Edge/Chrome,任意现代浏览器均可)。
2. 点"导入图片"或"选文件夹",或直接拖图进页面。
3. 在样图上按住鼠标拖出裁切框,可拖手柄/方向键微调。
4. 用 `<` `>` 切换样图核对选区;点"预览裁切"看效果。
5. 点"裁切全部并保存",得到 zip(文件名与原图一致,重名自动 `_1/_2`)。

## 自检
打开 `index.html?selftest` 查看纯逻辑测试结果。

## 验收测试清单
(Task 10 补充)
```

- [ ] **Step 6: 手动验收骨架**

操作:双击 `tools/image-cropper/index.html` 打开。
Expected:
- 顶栏显示标题与三个按钮、"已导入 0 张"。
- 左侧虚线框 dropzone 显示提示文字。
- 右侧面板显示样图计数、缩略图区、选区信息、比例锁下拉、预览/导出按钮(导出禁用)。

操作:在地址栏 URL 后加 `?selftest` 回车。
Expected:右侧底部出现黑色 selftest 框,显示"通过 0 / 失败 0"与"(暂无测试用例)"。

- [ ] **Step 7: Commit**

```bash
git add tools/image-cropper/
git commit -m "feat: 裁切工具项目骨架 + selftest 框架"
```

---

## Task 2: Geometry 纯函数 + selftest(TDD)

**Files:**
- Modify: `tools/image-cropper/app.js`(在"Self-test 框架"区段后新增 Geometry 区段与测试)

- [ ] **Step 1: 先写失败测试(selftest 用例)**

在 app.js 的"主入口"注释**之前**插入 Geometry 测试区段:
```javascript
// ===== 2. Geometry 纯函数测试 =====
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
```

- [ ] **Step 2: 打开 ?selftest 确认 FAIL**

打开 `index.html?selftest`。
Expected: 5 条全部 FAIL,错误信息含"displayToImage is not defined"。

- [ ] **Step 3: 实现 Geometry 纯函数**

在 app.js 测试区段**之前**(紧接 Self-test 框架之后)插入实现:
```javascript
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
```

- [ ] **Step 4: 打开 ?selftest 确认 PASS**

刷新 `index.html?selftest`。
Expected: "通过 5 / 失败 0",全部 `[PASS]`。

- [ ] **Step 5: Commit**

```bash
git add tools/image-cropper/app.js
git commit -m "feat: Geometry 坐标换算纯函数 + selftest"
```

---

## Task 3: Namer 纯函数 + selftest(TDD)

**Files:**
- Modify: `tools/image-cropper/app.js`(在 Geometry 测试之后新增 Namer 实现 + 测试)

- [ ] **Step 1: 先写失败测试**

在 Geometry 测试区段之后追加:
```javascript
// ===== 3. Namer 纯函数测试 =====
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
```

- [ ] **Step 2: 打开 ?selftest 确认 FAIL**

刷新 `index.html?selftest`。
Expected: 新增 5 条 FAIL("splitExt is not defined")。

- [ ] **Step 3: 实现 Namer**

在 Geometry 实现`applyAspect`之后、Geometry 测试之前,新增 Namer 实现区段(实现统一放测试之前,保持"实现区 → 测试区"顺序):
```javascript
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
```

- [ ] **Step 4: 打开 ?selftest 确认 PASS**

刷新 `index.html?selftest`。
Expected: "通过 10 / 失败 0"。

- [ ] **Step 5: Commit**

```bash
git add tools/image-cropper/app.js
git commit -m "feat: Namer 命名与重名去重纯函数 + selftest"
```

---

## Task 4: ImageList + 导入(选文件/拖入/文件夹) + 缩略图条

**Files:**
- Modify: `tools/image-cropper/app.js`(新增 ImageList 区段 + 主控制器导入逻辑)

- [ ] **Step 1: 实现 ImageList**

在 Namer 实现之后新增:
```javascript
// ===== 4. ImageList =====
function createImageList() {
  const items = []; // { file, name, url, natW, natH }
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
```

- [ ] **Step 2: 主控制器绑定导入(替换 Task 1 的 initTool 占位)**

把 app.js 主入口 `window.addEventListener('DOMContentLoaded', ...)` 内的 `// 正常模式` 分支替换为:
```javascript
  const list = createImageList();
  window.__list = list; // 调试用

  const fileInput = document.getElementById('fileInput');
  const folderInput = document.getElementById('folderInput');
  const btnImport = document.getElementById('btnImport');
  const btnFolder = document.getElementById('btnFolder');
  const countLabel = document.getElementById('countLabel');
  const thumbsEl = document.getElementById('thumbs');

  async function handleFiles(files) {
    const added = await list.addFiles(files);
    countLabel.textContent = '已导入 ' + list.getCount() + ' 张';
    renderThumbs();
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
        if (window.__onListChanged) window.__onListChanged();
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

  window.__onListChanged = function () {
    // 占位:Task 5 接入 CropCanvas 后在此刷新画布
  };
```

- [ ] **Step 3: 手动验收**

操作:打开 `index.html`,点"导入图片"选 3 张图。
Expected: 顶栏"已导入 3 张";右侧缩略图条出现 3 张缩略图,第 1 张高亮蓝边。

操作:再拖 2 张图进左侧虚线框。
Expected: 计数变 5,缩略图条增至 5;拖入时虚线框变蓝。

操作:点"选文件夹"选一个含图片的文件夹。
Expected: 该文件夹下图片被导入,计数累加。

操作:点不同缩略图。
Expected: 被点的高亮。

- [ ] **Step 4: Commit**

```bash
git add tools/image-cropper/app.js
git commit -m "feat: ImageList 图片管理 + 导入(选文件/拖入/文件夹) + 缩略图条"
```

---

## Task 5: CropCanvas 渲染样图 + 拖框 + 坐标显示

**Files:**
- Modify: `tools/image-cropper/app.js`(新增 CropCanvas 区段 + 接入主控制器)

- [ ] **Step 1: 实现 CropCanvas(渲染 + 拖框)**

在 ImageList `createImageList` 之后新增:
```javascript
// ===== 5. CropCanvas =====
function createCropCanvas(canvasEl, onUpdate) {
  const ctx = canvasEl.getContext('2d');
  let item = null;       // 当前样图
  let scale = 1;         // 显示缩放比(显示 = 原图 * scale)
  let drawW = 0, drawH = 0, offX = 0, offY = 0; // 图在 canvas 上的绘制位置/尺寸
  let sel = null;        // 选区(原图坐标 {x,y,w,h})
  let aspect = 0;        // 比例锁(0=自由)

  // 拖拽状态
  let mode = 'idle';     // idle | create | move | resize
  let handle = null;     // 'nw','n','ne','e','se','s','sw','w','body'
  let startMx = 0, startMy = 0; // 鼠标起始(显示坐标)
  let startSel = null;

  function fitCanvas() {
    if (!item || !item.natW) return;
    const cw = canvasEl.clientWidth;
    const ch = canvasEl.clientHeight;
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

  function load(newItem) {
    item = newItem;
    sel = null;
    fitCanvas();
    draw();
    emit();
  }

  function setAspect(r) { aspect = r; }

  function getSelection() { return sel; }
  function setSelection(s) { sel = s; draw(); emit(); }

  function emit() { if (onUpdate) onUpdate(sel); }

  function imgRect() {
    // canvas 上的图片矩形(显示坐标)
    return { x: offX, y: offY, w: drawW, h: drawH };
  }

  function draw() {
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    if (!item) return;
    // 图
    ctx.drawImage(item.url ? null : null, 0, 0); // 占位,下面真正画
    const img = new Image();
    // 注意:为避免每次 new Image 异步,改用预加载的 HTMLImageElement
  }

  // 改用持久 HTMLImageElement 渲染(覆盖上面的 draw)
  let imgEl = null;
  function ensureImgEl() {
    if (!imgEl) imgEl = new Image();
  }

  function drawReal() {
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    if (!item || !imgEl) return;
    ctx.drawImage(imgEl, offX, offY, drawW, drawH);
    drawOverlay();
  }

  function drawOverlay() {
    const r = imgRect();
    // 选区
    if (sel && sel.w > 0 && sel.h > 0) {
      const sx = offX + sel.x * scale;
      const sy = offY + sel.y * scale;
      const sw = sel.w * scale;
      const sh = sel.h * scale;
      // 遮罩
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.clearRect(sx, sy, sw, sh);
      // 重画被清除的图区
      ctx.drawImage(imgEl, sx, sy, sw, sh, sx, sy, sw, sh);
      // 框线
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sw, sh);
      // 手柄
      drawHandles(sx, sy, sw, sh);
    }
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

  function handlePoints(x, y, w, h) {
    return [
      { x: x, y: y }, { x: x + w / 2, y: y }, { x: x + w, y: y },
      { x: x + w, y: y + h / 2 }, { x: x + w, y: y + h },
      { x: x + w / 2, y: y + h }, { x: x, y: y + h }, { x: x, y: y + h / 2 }
    ];
  }

  function toImageCoord(mx, my) {
    return { x: displayToImage(mx - offX, scale), y: displayToImage(my - offY, scale) };
  }

  function hitHandle(mx, my) {
    if (!sel || sel.w <= 0) return null;
    const sx = offX + sel.x * scale, sy = offY + sel.y * scale;
    const sw = sel.w * scale, sh = sel.h * scale;
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
      let raw = { x: startSel ? startSel.x : 0, y: 0, w: 0, h: 0 };
      const sp = toImageCoord(startMx, startMy);
      raw = { x: sp.x, y: sp.y, w: p.x - sp.x, h: p.y - sp.y };
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

  function bind() {
    canvasEl.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // 初始化:加载样图时创建持久 imgEl
  function loadWithImg(newItem) {
    item = newItem;
    sel = null;
    ensureImgEl();
    imgEl.onload = function () { fitCanvas(); drawReal(); emit(); };
    imgEl.src = item.url;
  }

  return {
    load: loadWithImg, setAspect: setAspect,
    getSelection: getSelection, setSelection: setSelection,
    fitCanvas: function () { fitCanvas(); drawReal(); },
    bind: bind
  };
}
```

> 说明:实现里先定义了一个空 `draw()` 占位再覆盖为 `drawReal()`,执行时**只保留 `drawReal` 版本**,删除空 `draw()` 占位函数以免混淆。最终保留的渲染路径是 `loadWithImg → imgEl.onload → fitCanvas → drawReal`。

- [ ] **Step 2: 主控制器接入 CropCanvas**

把主控制器里 `window.__onListChanged` 占位替换,并在导入后初始化 CropCanvas:
```javascript
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

  window.__onListChanged = function () {
    const cur = list.getCurrent();
    curIndexEl.textContent = String(list.getIndex() + 1);
    totalCountEl.textContent = String(list.getCount());
    if (cur) cropCanvas.load(cur);
  };

  // 窗口缩放重排
  window.addEventListener('resize', function () { cropCanvas.fitCanvas(); });
```

并把"样图切换"按钮(prev/next)接入(本任务先接线,完整切换在 Task 7):
```javascript
  document.getElementById('btnPrev').addEventListener('click', function () {
    list.prev(); renderThumbs(); window.__onListChanged();
  });
  document.getElementById('btnNext').addEventListener('click', function () {
    list.next(); renderThumbs(); window.__onListChanged();
  });
```

- [ ] **Step 3: 手动验收**

操作:导入 2 张图,在第一张上按住鼠标拖一个框。
Expected:
- 拖动时实时出现蓝色选区框,框外区域变暗遮罩。
- 右侧选区信息实时显示 x/y/w/h 数值(原图像素)。
- "裁切全部并保存"按钮从禁用变可用。

操作:点 `>` 切到第二张。
Expected: 第二张图显示,选区清空(切换样图时选区重置),需重新拖框。

- [ ] **Step 4: Commit**

```bash
git add tools/image-cropper/app.js
git commit -m "feat: CropCanvas 样图渲染 + 拖框创建选区 + 坐标显示"
```

---

## Task 6: CropCanvas 手柄调整 + 键盘微调 + 比例锁

**Files:**
- Modify: `tools/image-cropper/app.js`

- [ ] **Step 1: 确认手柄调整已实现**

Task 5 的 `createCropCanvas` 已含 `hitHandle` / `resizeSel` / move 逻辑(`mode='resize'|'move'`)。本任务补充键盘微调与比例锁接线,并修正一个边界:`onMouseMove` 里 `mode==='create'` 分支的 `startSel` 在创建时为旧值,需改用 `startMx/startMy` 计算(已在 Task 5 用 `sp = toImageCoord(startMx, startMy)` 修正)。

- [ ] **Step 2: 比例锁接线**

在主控制器接入比例锁下拉:
```javascript
  const aspectSelect = document.getElementById('aspectSelect');
  aspectSelect.addEventListener('change', function () {
    const v = parseFloat(aspectSelect.value);
    cropCanvas.setAspect(v);
    // 对已有选区立即应用
    const sel = cropCanvas.getSelection();
    if (sel && sel.w > 0 && v > 0) {
      cropCanvas.setSelection(clampSelection(applyAspect(sel, v), { w: window.__list.getCurrent().natW, h: window.__list.getCurrent().natH }));
    }
  });
```

> 注:`clampSelection` / `applyAspect` 是全局纯函数,主控制器可直接调用。`window.__list` 在 Task 4 已暴露。

- [ ] **Step 3: 键盘微调**

在 CropCanvas 的 `bind()` 内追加键盘监听(监听 window keydown,仅当有选区时生效):
```javascript
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
```
并在 `bind()` 末尾加 `window.addEventListener('keydown', onKey);`

- [ ] **Step 4: 手动验收**

操作:拖出一个框,拖动其右下角手柄。
Expected: 选区大小随手柄变化,实时更新数值。

操作:在框内按住拖动。
Expected: 选区整体平移。

操作:按方向键、Shift+方向键。
Expected: 选区按 1px / 10px 移动。

操作:比例锁选 1:1,重新拖框。
Expected: 拖出的框始终保持正方形。

- [ ] **Step 5: Commit**

```bash
git add tools/image-cropper/app.js
git commit -m "feat: 选区手柄调整 + 键盘微调 + 比例锁"
```

---

## Task 7: 样图切换保留选区(统一套用基础)

**Files:**
- Modify: `tools/image-cropper/app.js`

**目标:** 切换样图时**保留当前选区**(原图坐标),让用户核对同一选区在不同图上的效果——这是"统一套用"的前提。

- [ ] **Step 1: 切换时保留选区**

修改 `createCropCanvas` 的 `loadWithImg`,切图时不清空 sel:
```javascript
  function loadWithImg(newItem, keepSelection) {
    item = newItem;
    if (!keepSelection) sel = null;
    ensureImgEl();
    imgEl.onload = function () {
      fitCanvas();
      // 若保留选区,裁剪到新图边界内
      if (sel) {
        sel = clampSelection(sel, { w: item.natW, h: item.natH });
      }
      drawReal();
      emit();
    };
    imgEl.src = item.url;
  }
```

- [ ] **Step 2: 主控制器切换时传 keepSelection=true**

修改 prev/next 与缩略图点击的切换调用,把 `cropCanvas.load(cur)` 改为带保留:
```javascript
  function showCurrent(keepSel) {
    const cur = list.getCurrent();
    curIndexEl.textContent = String(list.getIndex() + 1);
    totalCountEl.textContent = String(list.getCount());
    if (cur) cropCanvas.load(cur, keepSel);
  }
```
把 `window.__onListChanged` 改为 `showCurrent(false)`(首次/导入新图不保留),把 prev/next/缩略图点击改为 `showCurrent(true)`(切换核对时保留)。

具体:导入新批次(列表变化)用 `showCurrent(false)`;用户主动 prev/next/点缩略图用 `showCurrent(true)`。

更新各处:
- `window.__onListChanged = function () { showCurrent(false); };`
- prev/next 回调里 `list.prev(); renderThumbs(); showCurrent(true);`
- 缩略图点击回调里 `list.setCurrent(i); renderThumbs(); showCurrent(true);`

- [ ] **Step 3: 尺寸不一致警告**

在 `showCurrent(true)` 内,若当前图尺寸与样图(第一张)不同,提示:
```javascript
  function showCurrent(keepSel) {
    const cur = list.getCurrent();
    curIndexEl.textContent = String(list.getIndex() + 1);
    totalCountEl.textContent = String(list.getCount());
    if (!cur) return;
    // 尺寸不一致警告
    const first = list.getAll()[0];
    if (keepSel && first && (first.natW !== cur.natW || first.natH !== cur.natH)) {
      const warn = '注意:第 ' + (list.getIndex() + 1) + ' 张尺寸(' + cur.natW + '×' + cur.natH +
                   ')与样图(' + first.natW + '×' + first.natH + ')不同,选区可能偏移';
      flashReport(warn);
    }
    cropCanvas.load(cur, keepSel);
  }

  function flashReport(msg) {
    const el = document.getElementById('report');
    el.textContent = msg;
  }
```

- [ ] **Step 4: 手动验收**

操作:导入 2 张同尺寸图,拖框,点 `>` 切到第二张。
Expected: 第二张图显示,**选区框保留**在同一原图坐标位置。

操作:再导入一张不同尺寸的图,切到它。
Expected: 出现尺寸不一致警告文字;选区被裁剪到该图边界内。

- [ ] **Step 5: Commit**

```bash
git add tools/image-cropper/app.js
git commit -m "feat: 样图切换保留选区 + 尺寸不一致警告"
```

---

## Task 8: Cropper(单张裁切)+ 预览

**Files:**
- Modify: `tools/image-cropper/app.js`

- [ ] **Step 1: 实现 Cropper**

在 Exporter 区段之前(即 CropCanvas 之后)新增:
```javascript
// ===== 6. Cropper =====
function cropImage(imgEl, sel, mimeType, quality) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sel.w));
  canvas.height = Math.max(1, Math.round(sel.h));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(imgEl, sel.x, sel.y, sel.w, sel.h, 0, 0, canvas.width, canvas.height);
  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (blob) resolve(blob); else reject(new Error('toBlob 失败'));
    }, mimeType, quality || 0.92);
  });
}

// 由 File 加载为 HTMLImageElement
function loadImageFromFile(file) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error('图片加载失败: ' + file.name)); };
    img.src = URL.createObjectURL(file);
  });
}

// 根据原文件类型决定输出 MIME
function mimeFor(file) {
  if (file.type === 'image/jpeg') return 'image/jpeg';
  if (file.type === 'image/webp') return 'image/webp';
  return 'image/png'; // png 默认
}
```

- [ ] **Step 2: 预览裁切按钮**

在主控制器接入预览:
```javascript
  const btnPreview = document.getElementById('btnPreview');
  const previewBox = document.getElementById('previewBox');
  const previewImg = document.getElementById('previewImg');

  btnPreview.addEventListener('click', async function () {
    const cur = list.getCurrent();
    const sel = cropCanvas.getSelection();
    if (!cur || !sel || sel.w <= 0) return;
    try {
      const img = await loadImageFromFile(cur.file);
      const blob = await cropImage(img, sel, mimeFor(cur.file));
      previewImg.src = URL.createObjectURL(blob);
      previewBox.classList.remove('hidden');
    } catch (err) {
      flashReport('预览失败: ' + err.message);
    }
  });
```

- [ ] **Step 3: 手动验收**

操作:导入图,拖框,点"预览裁切"。
Expected: 右侧出现预览图,内容正好是选区框住的区域,尺寸与选区 w×h 一致。

操作:拖不同区域再预览。
Expected: 预览随之更新。

- [ ] **Step 4: Commit**

```bash
git add tools/image-cropper/app.js
git commit -m "feat: Cropper 单张裁切 + 预览裁切"
```

---

## Task 9: Exporter 批量裁切 + zip 下载 + 进度 + 汇总

**Files:**
- Modify: `tools/image-cropper/app.js`

- [ ] **Step 1: 实现 Exporter**

在 Cropper 之后新增:
```javascript
// ===== 7. Exporter =====
async function exportAll(list, sel, onProgress) {
  const all = list.getAll();
  const zip = new JSZip();
  const used = new Set();
  const report = { total: all.length, success: 0, failed: [], renamed: [] };
  const folder = zip;

  for (let i = 0; i < all.length; i++) {
    const item = all[i];
    try {
      const img = await loadImageFromFile(item.file);
      const blob = await cropImage(img, sel, mimeFor(item.file));
      const name = makeName(item.name, used);
      if (name !== item.name) report.renamed.push({ from: item.name, to: name });
      folder.file(name, blob);
      report.success++;
    } catch (err) {
      report.failed.push({ name: item.name, error: err.message });
    }
    if (onProgress) onProgress(i + 1, all.length);
    // 让出主线程,避免卡顿
    await new Promise(function (r) { setTimeout(r, 0); });
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' }, function (meta) {
    if (onProgress) onProgress('zipping', Math.round(meta.percent));
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
```

> 注:`Date.now()` 仅在导出文件名(用户可见的下载名),非测试断言路径,可用。

- [ ] **Step 2: 主控制器接入导出**

```javascript
  const btnExport = document.getElementById('btnExport');
  const progressEl = document.getElementById('progress');
  const reportEl = document.getElementById('report');

  btnExport.addEventListener('click', async function () {
    const sel = cropCanvas.getSelection();
    if (!sel || sel.w <= 0 || list.getCount() === 0) return;
    btnExport.disabled = true;
    progressEl.classList.remove('hidden');
    progressEl.innerHTML = '<div class="progress-bar" style="width:0"></div><div class="progress-text">准备中...</div>';
    const bar = progressEl.querySelector('.progress-bar');
    const ptext = progressEl.querySelector('.progress-text');

    const report = await exportAll(list, sel, function (cur, total) {
      if (total === 'zipping') {
        ptext.textContent = '打包中 ' + cur + '%';
        bar.style.width = cur + '%';
      } else {
        const pct = Math.round((cur / total) * 100);
        ptext.textContent = '已处理 ' + cur + ' / ' + total;
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
```

补 CSS 进度文字(Task 1 styles.css 已有 .progress,补文字样式)。在 styles.css 末尾追加:
```css
.progress-text { font-size: 12px; color: #555; margin-top: 4px; }
```

- [ ] **Step 3: 手动验收(核心流程)**

操作:导入 5 张同尺寸 PNG,拖框,点"裁切全部并保存"。
Expected:
- 进度条从 0 推进到 100%,文字"已处理 i / 5" → "打包中..."。
- 浏览器下载 `cropped-<时间戳>.zip`。
- 解压 zip:内含 5 张图,文件名与原图一致,每张内容为选区裁切结果。
- 右侧汇总"完成:成功 5 / 5"。

操作:导入两个同名 `截图1.png`(从不同文件夹),导出。
Expected: zip 内 `截图1.png` + `截图1_1.png`;汇总"改名 1 项"并列出映射。

操作:导入 png + jpg 混合,导出。
Expected: 各自保持原格式(png 仍 png,jpg 仍 jpg)。

- [ ] **Step 4: Commit**

```bash
git add tools/image-cropper/app.js tools/image-cropper/styles.css
git commit -m "feat: Exporter 批量裁切 + zip 下载 + 进度 + 重名去重汇总"
```

---

## Task 10: README 验收清单 + 最终全链路验收

**Files:**
- Modify: `tools/image-cropper/README.md`

- [ ] **Step 1: 补全 README 验收清单**

把 README.md 的"验收测试清单"区段替换为:
```markdown
## 验收测试清单

打开 `index.html` 后逐项验证:

1. **导入-选文件**:点"导入图片"选多张图 → 计数正确,缩略图显示。
2. **导入-文件夹**:点"选文件夹" → 该目录图片全部导入。
3. **导入-拖入**:拖图进左侧虚线框 → 框变蓝,图片导入。
4. **拖框**:在样图上拖鼠标 → 出现蓝色选区,框外变暗,右侧实时显示 x/y/w/h。
5. **手柄调整**:拖选区角/边手柄 → 大小变化;拖框体 → 平移。
6. **键盘微调**:方向键 1px、Shift+方向键 10px 移动选区。
7. **比例锁**:选 1:1 拖框 → 始终正方形。
8. **样图切换**:`>` `<` 切图 → 选区保留;缩略图点选 → 切到该张。
9. **尺寸警告**:切到不同尺寸的图 → 出现偏移警告。
10. **预览**:点"预览裁切" → 显示选区裁后效果。
11. **批量导出**:点"裁切全部并保存" → 进度条推进 → 下载 zip → 解压张数与命名正确、裁切区域与预览一致。
12. **重名去重**:导入同名图导出 → zip 内 `_1/_2` 去重,汇总列出改名。
13. **混合格式**:png+jpg 混合 → 各保原格式。
14. **零选区保护**:无选区时"裁切全部"按钮禁用。
15. **离线**:断网后双击打开,功能正常(JSZip 本地内联)。
16. **规模**:导入 50+ 张导出,进度正常、UI 不卡死。
17. **跨浏览器**:Firefox/Safari 打开,导出 zip 正常(不依赖 FSA)。
18. **自检**:打开 `?selftest` → Geometry + Namer 共 10 条全 PASS。

## 限制(本期)
- 统一套用模式(不逐张微调)。
- 仅 zip 下载(不写本地文件夹)。
- 不做智能裁白边/去水印。
```

- [ ] **Step 2: 全链路手动验收**

按 README 清单第 1–13、18 项执行。
Expected: 全部通过。

打开 `index.html?selftest`。
Expected: "通过 10 / 失败 0"。

- [ ] **Step 3: Commit**

```bash
git add tools/image-cropper/README.md
git commit -m "docs: 裁切工具验收测试清单"
```

---

## Self-Review(plan 作者自查)

**1. Spec 覆盖**
- F1 批量导入(三种方式)→ Task 4 ✓
- F2 样图拖框 → Task 5 ✓
- F3 手柄调整 → Task 5/6 ✓
- F4 选区反馈(坐标/尺寸)→ Task 5 ✓
- F5 样图切换 + 缩略图条 → Task 4(缩略图)+ Task 7(切换保留)✓
- F6 预览裁切 → Task 8 ✓
- F7 批量裁切 + zip 下载 + 进度 → Task 9 ✓
- F8 比例锁 → Task 6 ✓
- NF1 零安装 → 全程无构建 ✓
- NF2 离线 → JSZip 本地内联(Task 1)✓
- NF3 跨浏览器 → 不依赖 FSA,zip 路径 ✓
- NF4 隐私 → 全本地 ✓
- NF5 性能(分片)→ Exporter `setTimeout(0)` 让出 ✓
- 重名去重 → Namer(Task 3)+ Exporter(Task 9)✓
- 错误处理(非图片/零选区/尺寸不一致/单张失败/重名/JSZip 缺失)→ 各任务覆盖 ✓
  - JSZip 缺失检测:补充说明见下文"遗留补强"。

**2. 占位符扫描** — 无 TBD/TODO;每步含完整代码或具体操作。

**3. 类型/命名一致性**
- `createImageList()` 返回 `{addFiles,getCount,getAll,getCurrent,getIndex,setCurrent,next,prev}` — Task 4 定义,Task 5/7/8/9 调用一致 ✓
- `createCropCanvas(el, onUpdate)` 返回 `{load,setAspect,getSelection,setSelection,fitCanvas,bind}` — 一致 ✓;`load(item, keepSelection)` 在 Task 7 扩展第二参数 ✓
- `cropImage(imgEl, sel, mime, quality)` / `loadImageFromFile(file)` / `mimeFor(file)` — Task 8 定义,Task 9 复用 ✓
- `exportAll(list, sel, onProgress)` — Task 9 定义 ✓
- Geometry 函数 `displayToImage/imageToDisplay/normalizeSelection/clampSelection/applyAspect` — Task 2 定义,Task 5/6/7 调用一致 ✓
- Namer `splitExt/makeName` — Task 3 定义,Task 9 调用一致 ✓

**遗留补强(执行时注意,非阻塞):**
- Task 1 可在 app.js 主入口最前加 JSZip 缺失检测:`if (typeof window.JSZip === 'undefined') { alert('依赖 JSZip 加载失败,请确认 vendor/jszip.min.js 存在'); }` — 执行 Task 1 时顺带加入。
- Task 5 的 `createCropCanvas` 实现含一个说明性的空 `draw()` 占位,执行时**删除空 `draw()`**,只保留 `drawReal()` 路径。
