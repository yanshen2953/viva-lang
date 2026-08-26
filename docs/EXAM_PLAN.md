# 验收计划：怎么知道 Viva 做完了

四道门（眼睛 / 手 / 导出 / agent）已经过了地板，见 `docs/GAPS.md`。地板过了不等于做完。本文定义**能失败的**验收测试，并给出施工路线。

## 一条判据：测试必须能因为变差而红

存在性断言不算验收。

```ts
expect(names).toContain("a");        // 加了格子就绿，画质变差也绿
expect(err).toBeLessThan(0.02);      // 度量退化立刻红
```

所以每组测试都必须满足三条：

1. **有真值**：拿浏览器 / PDF / 栅格像素当参照，不拿自己的估计值当参照。
2. **有阈值**：数字写进断言，退化就红。
3. **能定位**：失败信息指名到具体字符串、节点或页，不是「不相等」。

新增测试若不满足这三条，不算进度。

## 阈值棘轮

画质阈值只许调紧，不许调松。调松要在 PR 里写明原因。当前值：

| 项 | 现值 | 目标 |
| --- | --- | --- |
| 三尺互差 | 2% | 1% |
| 每页 ink IoU | 0.60 | 0.90 |
| sidecar 重叠 | 0.85 | 0.95 |
| 页面 MSE | 0.45 | 0.15 |

---

## 分组与路线

五轮。轮内的轨道互不依赖，可以并行施工；轮之间有依赖，必须按序。

```text
R1 度量真值 ──┐
R1 手         ├─> R2 画面同构 ─> R3 印刷语义 ─┐
R1 插件       ┘   R2 时间        R3 契约       ├─> R5 发布与棘轮
                  R2 契约        R4 agent 闭环 ┘
```

### R1：先造尺（并行 3 轨）

没有尺，后面所有画质改动都判断不了是进步还是回退。这是唯一必须先做的一轮。

| 轨 | 任务 | 验收 | 状态 |
| --- | --- | --- | --- |
| R1-A | 布局尺 vs 浏览器 vs PDF 三方互测 | 任意两把尺对同一串误差 < 2%，含中英混排 | **已完成** `tests/exam/text-ruler.test.ts` |
| R1-B | 节点 bbox vs 浏览器 `getBBox()` | 旋转文本、折行标题、色条标题的盒子误差 < 3% | **已完成** `tests/exam/node-bbox.test.ts` |
| R1-C | 插件生命周期契约 | 仓库外插件声明依赖注册 layout，参与 page/folio/interaction；未注册 post-pass 不能改插件产物 | **已完成** `tests/exam/plugin-lifecycle.test.ts` |

R1-A 已经抓到一个真缺陷：PDF 整串用一种字体，`夜港 HARBOR` 里的 `HARBOR` 被 CJK 字体加宽，与布局和浏览器差 20.6%。改成按字体分段绘制后降到 0.9%。

### R2：画面同构（并行 3 轨，依赖 R1-A/B）

| 轨 | 任务 | 验收 | 状态 |
| --- | --- | --- | --- |
| R2-A | 分角色 ink IoU | 轴题 / 色条 / violin 轮廓 / 虚线 / 旋转文本各自 fixture，逐项阈值，不再只看整页 | **已完成** `tests/exam/role-ink.test.ts` |
| R2-B | PDF 文本可提取 | 从 PDF 抽出的字符串等于源串，不只是 `missingGlyphs` 为空 | **已完成** `tests/exam/pdf-text.test.ts` |
| R2-C | 分页不重画 | 第 2 页与第 1 页 ink 差异下界，禁止跨页重复底板 | **已完成** `tests/exam/page-diff.test.ts` |

### R3：印刷语义（并行 4 轨，依赖 R2）

| 轨 | 任务 | 验收 | 状态 |
| --- | --- | --- | --- |
| R3-A | 物理尺寸 | 89 / 183 mm 在 PDF point 上的误差 < 0.05 mm | **已完成** `tests/exam/print-semantics.test.ts` |
| R3-B | 最小字号 | 自动收缩后无文本低于期刊下限，越界即红 | **已完成** `check.struct.minFont` 5 pt |
| R3-C | chrome 出格升级为错误 | `check.struct.chromeOverflow` 从 warning 变 error，示例全部清零 | **已完成** |
| R3-D | 刻度标签不重叠 | 任意两个刻度标签盒子不相交；轴题与刻度不相交 | **已完成** `check.struct.tickOverlap` |

### R4：手、时间、agent（并行 3 轨）

R4-A 和 R4-B 不依赖前面几轮，可以和 R2 并行开工。R4-C 要等 R2/R3，因为它判画质。

| 轨 | 任务 | 验收 | 状态 |
| --- | --- | --- | --- |
| R4-A | 输入栈精度 | 命中测试在 mark 边界内外 1 px 结果相反；mark 上起刷与空地起刷一致；扫掠顶住 / 滑墙 / 编组一步 | **已完成** `tests/exam/input-clock.test.ts` |
| R4-B | Clock 保真 | Runtime `__t` 与导出帧同一时刻同一拍；剪辑轨 `holds`/`ins`/`outs`/`order`/`cuts`/`tracks` 产出预期主时间线 | **已完成** |
| R4-C | agent 闭环成功率 | N 次短意图，过四门的比例有下界；注入失败后有限轮内自修成功；slim prompt token 有上限 | **已完成** `tests/exam/agent-contract.test.ts` |

### R5：契约、发布、棘轮（并行 3 轨）

| 轨 | 任务 | 验收 | 状态 |
| --- | --- | --- | --- |
| R5-A | logical / painted 契约 | 定义 `visible:false` / `opacity:0` / ease 中间态归属；删掉测试侧 `nodePainted()` 过滤仍绿 | **已完成** `paintedNodesFromIr()` |
| R5-B | 干净环境安装 | npm tgz / 脚本 / Docker 三条路各自在干净环境装完可用；容器不依赖宿主字体也能出 CJK PDF | **已完成** `tests/exam/release-contract.test.ts` |
| R5-C | 棘轮收紧 | 把上表阈值推到目标值，每次只紧一档 | **已紧一档** ink IoU 0.55→0.60（arrival 第1页实测 0.713；sidecar/MSE 维持） |

---

## 每轮的做法

固定四步，不要跳：

1. **探真值**：先写探针脚本量出当前真实数字（例：`scripts/probe-text-ruler.mts`）。
2. **按实测定阈值**：阈值来自实测，不是先写一个好看的数。
3. **反证测试能红**：故意把阈值压紧一档，确认测试失败并指名到具体项，再改回。
4. **跑全量再推**：`npx vitest run` 全绿才推分支。成熟后才进 `main`。

第 3 步是这套计划的关键。没有反证过的测试，不能算验收。

## 不算做完的说法

- 「接口齐了」
- 「`npm test` 绿了」
- 「已经是 Nature 级」
- 「全面超过某个产品」

做完的定义：上表所有阈值达到目标值，且四道门在同一份 `examples/arrival.viva` 上连续通过。
