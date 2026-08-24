# CJK fonts

`VivaSansCJK.ttf` is the packaged full library (Droid Sans Fallback Full, Apache 2.0). PDF export prefers this file, then a host `VIVA_PDF_CJK_FONT` / `--cjk-font` / `cjkFontPath`, then system CJK fonts.

`VivaSansFallback.ttf` is a leftover example-lexicon subset kept as last resort. Rebuild it with `python3 scripts/subset-cjk-font.py` only if you need a tiny fallback; do not ship it as the package default.
