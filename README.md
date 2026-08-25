# Viva

一门给 Agent 写的交互视觉语言：源码极小，编译器长出图表、栏宽、页刀和可点可拖的世界。

![夜港 Harbor：点栈桥、拖船](./docs/gallery/harbor.png)

![夜曲 Nocturne：print-nature 四联投稿图](./docs/gallery/nocturne.png)

![极光台 Aurora：暗场科学图板](./docs/gallery/aurora.png)

动图（同一份源码采的交互，不是海报）：

![夜港交互](./docs/gallery/harbor.gif)

![极光台轨道](./docs/gallery/aurora.gif)

![夜曲拖针脚](./docs/gallery/nocturne-hand.gif)

源码：[`examples/harbor.viva`](./examples/harbor.viva) · [`examples/nocturne.viva`](./examples/nocturne.viva) · [`examples/aurora.viva`](./examples/aurora.viva)

---

## 安装

这是一门语言，先装编译器和 `viva` 命令。**不要只跑 Docker。**

### 1. npm 安装包（Win / macOS / Linux）

仓库里有现成的 npm 包，下载后全局安装即可：

- 安装包：[packages/viva-lang-0.1.0.tgz](./packages/viva-lang-0.1.0.tgz)
- 校验：[packages/SHA256SUMS](./packages/SHA256SUMS)

```bash
npm install -g ./packages/viva-lang-0.1.0.tgz
viva version
viva export examples/harbor.viva -f png --handbook dashboard -o harbor.png
```

发布到 npm 之后也可以：

```bash
npm install -g viva-lang
```

需要 Node.js ≥ 18。

### 2. 一键脚本

Linux / macOS：

```bash
bash install/one-click.sh
# 或本机已 clone：
bash install/install.sh
export PATH="$HOME/.local/bin:$PATH"
viva version
```

Windows：

```powershell
powershell -ExecutionPolicy Bypass -File install\install.ps1
```

脚本说明见 [`install/README.md`](./install/README.md)。自己打完整发布包：

```bash
npm run pack:release
# → release/viva-lang-*.tgz + 安装脚本 + Docker 附件
```

### 3. 从源码装（开发语言本身）

```bash
git clone https://github.com/yanshen2953/viva-lang.git
cd viva-lang
npm install
npm run build:lib
npm install -g .
viva version
```

本地 playground（改语言、看例子）：

```bash
npm run dev
```

打开 http://localhost:5173 ，默认就是夜港。

### 4. Docker（可选，给服务器）

只有要挂 HTTP Agent 桥的时候才用：

```bash
docker compose up -d --build
curl http://localhost:8765/api/health
```

---

## 语言长什么样

```viva
artifact "Hello Viva"

state count = 0

scene
  size: 880 480
  background: #0b1220
  layer main
    node counter
      x: 440
      y: 240
      text: count
      font: 72
      fill: #f8fafc
      align: center

event click on counter
  count = count + 1
```

```bash
viva compile examples/hello.viva
viva export examples/nocturne.viva -f pdf --handbook print-nature -o nocturne.pdf
viva export examples/nocturne.viva --beats -f mp4 --handbook print-nature -o nocturne.mp4
viva serve --port 8765
viva mcp
```

| 入口 | 做什么 |
| --- | --- |
| `viva` | 编译、检查、导出 SVG/PNG/PDF/gif/mp4 |
| `viva mcp` | Cursor / Claude Desktop 的 MCP |
| `viva serve` | Agent HTTP |
| `import from "viva-lang"` | Node SDK |
| `import from "viva-lang/embed"` | 浏览器内嵌 |

语法：[`docs/LANGUAGE.md`](./docs/LANGUAGE.md) · 接入：[`docs/DEPLOY.md`](./docs/DEPLOY.md) · 设计：[`docs/DESIGN.md`](./docs/DESIGN.md)

---

## 许可

[GPL-3.0-or-later](./LICENSE)。可商用、可改、可再分发；必须保留署名；衍生作品必须用同样的 GPL 开源。

Copyright (C) 2026 Viva Language Contributors
