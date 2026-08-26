# Bundled fonts

`LiberationSans-Regular.ttf` and `LiberationSans-Bold.ttf` are SIL OFL Latin faces. PDF embeds them so pdftoppm does not substitute a different Helvetica. Layout measure and SVG raster use the same files.

`VivaSansCJK.ttf` is the packaged full library (Droid Sans Fallback Full, Apache 2.0). PDF embeds this face without subsetting — pdf-lib's TTF subset drops most CJK outlines, so poppler would paint only a few glyphs. Host `VIVA_PDF_CJK_FONT` / `--cjk-font` / `cjkFontPath` still win when set.

`VivaSansFallback.ttf` is a leftover example-lexicon subset kept as last resort. Rebuild it with `python3 scripts/subset-cjk-font.py` only if you need a tiny fallback; do not ship it as the package default.
