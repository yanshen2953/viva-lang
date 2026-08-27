# 修改说明

## 0.2.0 — 2026-08-27

合入 `main` 的这一版：验收棘轮收到目标，Arrival 上的黑色 play veil 不再频闪，安装包 / Docker / CI 与当前代码对齐。

### 验收（同一份 `examples/arrival.viva`）

| 项 | 值 | 官方比较器 width 640 |
| --- | --- | --- |
| 三尺互差 | 1% | 考试尺已锁 |
| 每页 ink IoU | 0.90 | 第1页 0.949 / 第2页 0.980 |
| sidecar 重叠 | 0.95 | 1.000 |
| 页面 MSE | 0.15 | 0.011 |

四道门（眼睛 / 手 / 导出 / agent）仍走这一份源码。

### 画质

- SVG 与 PDF 圆角、Liberation Sans 三边对齐、CJK 整字嵌入（`subset: false`），Arrival 第1页 ink 才能到 0.90。
- 比较器 8 连通膨胀 3 步，对齐 1–2px 光晕，不拿膨胀冒充门。
- PDF 抽字优先 `pdftotext -layout`，避开 CID 碰撞。

### 交互

- figure 已占 `panel: body` 时不再画整页 `#000` play veil。
- 没有 `panel: beatN` 的空拍 veil 在编译时剥掉。Clock（`__t` / `__beat` / `__veilN`）仍保留。
- Clock 驱动的 veil 不再套 220ms CSS 过渡，避免和每帧 `__veilN` 对着干频闪。
- 故事板 `panel: beatN` 仍画帷幕。

### 安装与环境

- npm 包升到 **0.2.0**，仓库内 tarball：`packages/viva-lang-0.2.0.tgz`。
- Docker 镜像复制 `assets/`（Liberation + CJK），并安装 `poppler-utils`、`ffmpeg`，容器内可走 `check --visual` 和 beat gif/mp4。
- `install/install.sh` / `install.ps1` 改为 `npm run build`（不再只 `build:lib`），`viva serve` 才能带上 embed。
- CI Node 22，与镜像一致；继续安装 ffmpeg + poppler。
- Playground 浏览器包不再打进 Node 字体路径。

### 不做

- 不加语言关键字。
- 不用 `simulate()` 冒充浏览器门。
- CJK 嵌入保持 `subset: false`。
