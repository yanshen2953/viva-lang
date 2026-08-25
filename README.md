# Viva

[English](./README.en.md)

Viva 是一门很小的可视化语言。写一份 `.viva`，编译器生成可点击的图，也可以导出 PNG、PDF、gif、mp4。

![夜港](./docs/gallery/harbor.png)

![夜曲](./docs/gallery/nocturne.png)

![极光台](./docs/gallery/aurora.png)

点栈桥、拖船、转轨道：

![夜港交互](./docs/gallery/harbor.gif)

![极光台轨道](./docs/gallery/aurora.gif)

![夜曲拖针脚](./docs/gallery/nocturne-hand.gif)

对应源码：[`examples/harbor.viva`](./examples/harbor.viva)、[`examples/nocturne.viva`](./examples/nocturne.viva)、[`examples/aurora.viva`](./examples/aurora.viva)。

---

## 安装

先装编译器和 `viva` 命令。需要 Node.js 18 或更高。

### npm 包（Windows / macOS / Linux）

- 包：[packages/viva-lang-0.1.0.tgz](./packages/viva-lang-0.1.0.tgz)
- 校验和：[packages/SHA256SUMS](./packages/SHA256SUMS)

```bash
npm install -g ./packages/viva-lang-0.1.0.tgz
viva version
viva export examples/harbor.viva -f png --handbook dashboard -o harbor.png
```

如果已经发到 npm：

```bash
npm install -g viva-lang
```

### 安装脚本

Linux / macOS：

```bash
bash install/one-click.sh
# 已经 clone 过仓库的话：
bash install/install.sh
export PATH="$HOME/.local/bin:$PATH"
viva version
```

Windows：

```powershell
powershell -ExecutionPolicy Bypass -File install\install.ps1
```

说明在 [`install/README.md`](./install/README.md)。重新打包：

```bash
npm run pack:release
```

### 从源码装

```bash
git clone https://github.com/yanshen2953/viva-lang.git
cd viva-lang
npm install
npm run build:lib
npm install -g .
viva version
```

本地改语言、看例子：

```bash
npm run dev
```

浏览器打开 http://localhost:5173

### Docker

给已经装好 Docker、要在服务器上开 HTTP 接口的人：

```bash
docker compose up -d --build
curl http://localhost:8765/api/health
```

---

## 最短例子

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

| 命令 | 用途 |
| --- | --- |
| `viva` | 编译、检查、导出 |
| `viva mcp` | Cursor / Claude Desktop 的 MCP |
| `viva serve` | HTTP 接口 |
| `import from "viva-lang"` | Node SDK |
| `import from "viva-lang/embed"` | 网页里嵌一份图 |

语法见 [`docs/LANGUAGE.md`](./docs/LANGUAGE.md)，接入见 [`docs/DEPLOY.md`](./docs/DEPLOY.md)。

---

## 许可证

[GPL-3.0-or-later](./LICENSE)。可以商用，可以改。改过的版本要保留原作者署名，并且继续用 GPL。

Copyright (C) 2026 Viva Language Contributors
