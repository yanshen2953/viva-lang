#!/usr/bin/env python3
"""Rebuild assets/fonts/VivaSansFallback.ttf from Droid Sans Fallback.

Keeps Latin / Greek / punctuation plus Han used by examples and a paper lexicon.
No new language keywords — this is an export-fidelity asset.
"""

from __future__ import annotations

import pathlib
import sys

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "fonts" / "VivaSansFallback.ttf"
SRC_CANDIDATES = [
    pathlib.Path("/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf"),
    pathlib.Path("/usr/share/fonts/truetype/droid/DroidSansFallback.ttf"),
]

# Common paper-report Han that examples may not yet use.
PAPER_LEXICON = """
图表组对照实验结果讨论方法样本均值标准差显著性时间周天浓度表达细胞小鼠患者
治疗安慰剂相对绝对百分温度压力剂量反应活性抑制促进差异相关回归模型预测观察
测量分析统计检验假设结论摘要引言参考文献补充材料数据图例坐标轴刻度单位毫米
厘米微米纳米心率血压体重年龄性别病例干预随机双盲随访终点风险比例比值置信
区间误差棒热图箱线小提琴散点折线柱状面板分栏投稿论文期刊标题注记说明来源作者
基金伦理知情同意纳入排除基线特征主要次要不良事件脱落依从疗效安全性药代动力学
递增最大耐受生物标志物基因蛋白通路磷酸化转录翻译代谢免疫炎症凋亡增殖迁移侵袭
肿瘤癌转移生存无进展总生存风险比对数秩卡方方差多因素单因素校正混杂偏倚选择
信息失访回忆发表意图编译器复杂性点击数字章节切换交互内容极小描述可计算世界
网页结构报告孪生模拟轻量语言负责同一套生成报告数字
单栏次每分
"""

UNICODE_RANGES = [
    range(0x0020, 0x007F),  # Basic Latin
    range(0x00A0, 0x0100),  # Latin-1
    range(0x0370, 0x0400),  # Greek
    range(0x2000, 0x2070),  # General punctuation
    range(0x2190, 0x21FF),  # Arrows (examples use →)
    range(0x2200, 0x2220),  # A short math slice (± × ÷ etc. live nearby; keep small)
    range(0x3000, 0x3040),  # CJK punctuation
    range(0xFF00, 0xFF61),  # Fullwidth forms
]


def collect_text() -> str:
    chars: set[str] = set()
    for r in UNICODE_RANGES:
        chars.update(chr(cp) for cp in r)
    chars.update(PAPER_LEXICON)
    chars.update("±×÷≈≤≥∞°µμ–—…·→←↑↓")
    for folder in (ROOT / "examples", ROOT / "tests" / "agent-exam" / "seeds"):
        if not folder.exists():
            continue
        for path in folder.rglob("*.viva"):
            chars.update(path.read_text(encoding="utf-8"))
    # Keep only BMP characters the source font is likely to have.
    return "".join(sorted(ch for ch in chars if ch and ord(ch) <= 0xFFFF))


def source_font() -> pathlib.Path:
    for path in SRC_CANDIDATES:
        if path.exists():
            return path
    raise SystemExit("DroidSansFallback*.ttf not found; set the source on this machine")


def main() -> None:
    src = source_font()
    text = collect_text()
    han = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    font = TTFont(src)
    options = Options()
    options.layout_features = ["*"]
    options.notdef_outline = True
    options.recommended_glyphs = True
    options.name_IDs = ["*"]
    options.name_legacy = True
    options.name_languages = ["*"]
    options.drop_tables = ["DSIG"]
    subsetter = Subsetter(options=options)
    subsetter.populate(text=text)
    subsetter.subset(font)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    font.save(OUT)
    size = OUT.stat().st_size
    print(f"wrote {OUT} ({size} bytes, {han} Han from corpus+lexicon, source {src.name})")
    if size > 900_000:
        print("warning: subset is large; trim PAPER_LEXICON if packaging is tight", file=sys.stderr)


if __name__ == "__main__":
    main()
