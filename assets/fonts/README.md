# VivaSansFallback.ttf

Subset of [Droid Sans Fallback](https://android.googlesource.com/platform/frameworks/base/+/master/data/fonts/) (Apache 2.0).

Contains Basic Latin, Latin-1, Greek, general/CJK punctuation, and Han used by Viva examples plus a paper-report lexicon. Rebuild with `python3 scripts/subset-cjk-font.py` from `DroidSansFallbackFull.ttf` if the example corpus grows.

Override at runtime with `VIVA_PDF_CJK_FONT`.
