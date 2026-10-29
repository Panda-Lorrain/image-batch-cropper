# 屏幕区域变化检测截图器 — 设计文档

- **日期**:2026-06-15
- **位置**:`E:\ScreenChangeCapture`(独立于医疗项目 MDLM,刻意隔离)
- **状态**:已与用户确认关键决策,待实施

---

## 1. 目标

一个纯本地网页工具。用户捕获一个屏幕/窗口/浏览器标签页(在其中播放视频或显示任何画面),在预览画面上框选一个矩形区域;工具持续监控该区域,当区域内出现**显著状态变化**时自动截图,结束时把所有截图打包成一个 zip 下载。

典型用途:回放/监控/演示视频里某个数据区、状态区、告警区出现跳变,逐次捕获变化后的稳定画面。

---

## 2. 关键决策(已确认)

| 维度 | 决策 |
|---|---|
| 变化语义 | **显著状态变化**——忽略微小抖动与持续运动,抓"状态切换后重新稳定的画面" |
| 运行环境 | Node 本地静态服务器 + 一键 `.bat` 启动(`getDisplayMedia` 需 localhost 安全上下文,`file://` 在 Chrome 基本被禁用) |
| 截图范围 | 框选区域裁切(只截你框的那块) |
| 输出方式 | zip 打包下载(复用 ImageCropper 的 JSZip 方案) |
| 工具位置 | `E:\ScreenChangeCapture` |

---

## 3. 变化检测算法(方案 B,核心)

### 3.1 状态机

三态:`IDLE` / `CHANGING` / `COOLDOWN`。

```
IDLE ──(diff > 高阈)──► CHANGING ──(连续 N 帧 diff < 低阈,稳定)──► 截图 ──► COOLDOWN ──► IDLE
                                └──(超时未稳定)──────────────────► 强制截当前帧 ──► COOLDOWN
COOLDOWN 内忽略一切变化,过期才回 IDLE
```

### 3.2 DiffDetector(纯函数,核心可测单元)

输入两帧区域的 `ImageData`(等宽等高),输出**变化像素比例** ∈ [0,1]:

1. 对每个像素,计算 RGB 三通道差值的最大绝对差 `max(|r1-r2|, |g1-g2|, |b1-b2|)`
2. 若该差值 > `像素差阈值`,标记该像素为"变了"
3. `ratio = 变了像素数 / 区域总像素数`

判定:`ratio > 高阈` → 显著变化;`ratio < 低阈` → 趋于稳定。

### 3.3 参数(全部 UI 可调,以下是默认值)

| 参数 | 默认 | 作用 |
|---|---|---|
| 采样间隔 `sampleInterval` | 150ms | 每 150ms 抓一帧比较(≈6.7fps) |
| 像素差阈值 `pixelThreshold` | 30/255 | 单像素 RGB 差超过此才算"该像素变了" |
| 变化比例高阈 `highRatio` | 0.03 (3%) | 占比 > 3% 判定显著变化,进入 CHANGING |
| 变化比例低阈 `lowRatio` | 0.005 (0.5%) | 占比 < 0.5% 判定趋于稳定 |
| 稳定帧数 `stableFrames` | 3 | 连续 3 帧低于低阈才算真稳定 |
| 冷却 `cooldownMs` | 1500ms | 截图后 1.5 秒内不重复触发 |
| 变化超时 `changeTimeoutMs` | 3000ms | 变化超 3 秒未稳定 → 强制截当前帧 |

### 3.4 边界行为(必须写进 README)

- **持续大幅运动区域**:若框选区域是视频里一直在大幅动的部分(如平移、快速动画),会反复满足高阈 → 进入"CHANGING → 超时强制截 → 冷却"循环,等价于降频定时截图。**这是算法本质限制**。应对:调高"高阈"、调短/调长冷却、或用"暂停"按钮手动控制。
- **屏幕共享权限**:每次启动浏览器会弹"选择要共享的窗口/屏幕",这是 `getDisplayMedia` 规范,无法绕过。

---

## 4. 文件结构

```
E:\ScreenChangeCapture\
├── index.html          页面结构(预览区 + 右侧参数/截图面板)
├── styles.css          样式
├── app.js              主逻辑(内部按职责拆单元,见 §5)
├── vendor/
│   └── jszip.min.js    JSZip 3.10.1(从 ImageCropper 复制)
├── server.js           Node 最小静态服务器(localhost,绕开 file:// 限制)
├── start.bat           一键启动:起服务器 + 自动开默认浏览器
├── README.md           验收清单 + 用法 + 边界说明
└── docs/
    └── design.md       本设计文档
```

---

## 5. 模块拆分(`app.js` 内部)

每个单元单一职责、可独立理解测试。借鉴 ImageCropper 的 Geometry/Namer 纯函数模式。

| 单元 | 职责 | 可测性 |
|---|---|---|
| `ScreenCapture` | `getDisplayMedia` 封装,管 MediaStream + video 元素生命周期 | 需浏览器 |
| `RegionPicker` | 预览上拖框选;坐标从预览空间映射到 video 原始像素空间 | 几何纯函数可测 |
| `Sampler` | 从 video 裁框选区域到离屏 canvas → `getImageData` | 几何可测 |
| `DiffDetector` | **纯函数**:两帧 ImageData → 变化像素比例 | ✅ 完全可测 |
| `ChangeTracker` | **状态机**:IDLE/CHANGING/COOLDOWN + 稳定/冷却/超时判定 | ✅ 喂 diff 序列可测 |
| `Snapshotter` | 从 video 裁框选区域 → canvas → PNG blob | 需浏览器 |
| `SnapshotStore` | 截图列表 add/remove/getAll/count | ✅ 可测 |
| `Namer` | 序号 + 时间戳命名(纯函数) | ✅ 可测 |
| `ZipExporter` | JSZip 打包所有截图 + 触发下载 | 可测 |
| 主控制器 | 串联 UI 事件 + 各单元,驱动采样循环 | — |

采样循环:主控制器用 `setInterval(sampleInterval)` 驱动 → `Sampler` 抓区域帧 → `DiffDetector` 算 ratio → `ChangeTracker` 决定是否截图 → 触发则 `Snapshotter` 出图 + `SnapshotStore` 入列 + UI 更新。

---

## 6. 交互流程

```
1. 双击 start.bat → 服务器起 + 浏览器自动开 http://localhost:<port>
2. 点【选择屏幕】→ 浏览器弹共享选择 → 选屏幕/窗口/标签 → 预览出现
3. 在预览上拖一个矩形框,圈住要监控的区域
4. 点【开始监控】→ 进入 IDLE,开始采样
5. 检测到变化 → 自动截图 → 加入右侧缩略图列表
   右上角实时显示状态(IDLE/CHANGING/冷却) + 已截张数
6. 可随时【暂停/继续】或【立即截图】(手动补一张)
7. 点【停止】→ 结束监控
8. 点【导出 zip】→ 所有截图打包下载
```

---

## 7. UI 布局

- **左侧(主区)**:屏幕捕获 `<video>` 预览 + 叠加框选层(透明 canvas,鼠标拖框)。框选后画半透明矩形边框标示当前监控区域。
- **右侧面板**(约 300px):
  - 状态行:当前状态 + 已截张数
  - 参数区:采样间隔、像素差阈值、高阈/低阈、稳定帧数、冷却、超时(数字输入或滑块)
  - 操作按钮:选择屏幕 / 开始监控 / 暂停 / 立即截图 / 停止
  - 截图缩略图列表:可点击预览大图、可删单张
  - 导出按钮 + 进度

---

## 8. 截图与打包

- **截图内容**:框选区域裁切。从 `<video>` 当前帧用 `ctx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh)` 裁剪到离屏 canvas → `canvas.toBlob(png)`。
- **坐标**:`RegionPicker` 把预览上的框选坐标按 `videoWidth/previewWidth` 比例映射到 video 原始像素。
- **命名**:`change_001_12.3s.png`——序号(3 位补零)+ 距开始监控的秒数(1 位小数)。重名不冲突(序号递增)。
- **导出**:复用 ImageCropper 的 JSZip,把 `SnapshotStore` 全部 PNG 打成一个 zip,文件名 `screenshots_<开始时间>.zip`,触发下载。

---

## 9. 测试策略(沿用 ImageCropper 模式)

- `index.html?selftest` 跑纯逻辑自检,页面底部显示结果。
- 重点测:
  - **DiffDetector**:相同帧 ratio=0、全变=1、半变≈0.5、噪声(小幅色差)< 阈值不算变。
  - **ChangeTracker**:喂 ratio 序列,断言状态转换与截图触发点——IDLE→CHANGING(超阈)、CHANGING→截图(稳定)、超时强制截、冷却期内抑制。
  - **Namer**:序号补零 + 秒数格式。
  - **RegionPicker 几何**:预览坐标 → video 像素坐标的映射(含越界 clamp)。
- 验证手段:Node `--check` 语法检查 + VM 沙箱跑 selftest + 静态评审 + 对抗性 Bug 查找工作流(5 维度并行评审 + 验证发现)。

---

## 10. 非目标(YAGNI,明确不做)

- 不录视频/不录屏(只截图)
- 不做 OCR / 内容识别
- 不上传任何数据到网络(纯本地)
- 不支持多区域同时监控(单一框选区域)
- 不做历史时间轴回看
- 不做自动停止条件(由用户手动停止;可选:达到 N 张自动停——默认不做)

---

## 11. 技术约束

- 纯 HTML5 + Canvas + 原生 JS(ES2020),无框架、无构建。
- 浏览器:Chrome/Edge 最新版(`getDisplayMedia` + `toBlob` 支持)。
- Node:`server.js` 仅用 Node 内置 `http`/`fs`/`path`,零依赖,无需 `npm install`。
- 安全上下文:`http://localhost` 满足 `getDisplayMedia` 要求;`start.bat` 负责起服务并打开浏览器。
