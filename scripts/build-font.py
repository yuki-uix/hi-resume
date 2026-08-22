#!/usr/bin/env python3
"""Build the bundled static CJK fonts from the upstream Source Han Sans SC
variable font.

Issue #20: Chromium's print-to-PDF pipeline builds each embedded font's
ToUnicode map by *reverse-looking-up* cmap — for a glyph shared by a unified
ideograph and its Kangxi radical (e.g. 工 U+5DE5 vs ⼯ U+2F2F), it picks the
numerically smallest code point, i.e. the radical. ATS keyword matching then
reads U+2Fxx instead of U+4E00–U+9FFF.

The fix is to instantiate the variable font into two static TrueType builds
(so Chromium embeds them as CIDFontType2 rather than Type 3 procedures) and
drop every Kangxi/CJK-radical cmap mapping in U+2E80–U+2FDF. The resume never
uses radicals, so the removal is free, and the reverse lookup now only sees
the real ideograph.

Run (from the repo root):

    python3 -m venv .fontenv
    .fontenv/bin/pip install fonttools brotli
    .fontenv/bin/python scripts/build-font.py

or via pnpm:

    pnpm font:build

The script is a one-off build tool: its output is committed to the repo, but
the script itself never runs in the app or in CI.
"""

from __future__ import annotations

import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

# The Kangxi Radicals (U+2F00–U+2FDF) plus the CJK Radicals Supplement
# (U+2E80–U+2EFF) that Source Han Sans maps onto shared ideograph glyphs.
RADICAL_LO = 0x2E80
RADICAL_HI = 0x2FDF

SRC = Path(__file__).resolve().parent.parent / "src" / "features" / "preview"
VF = SRC / "SourceHanSansSC-VF.ttf.woff2"

# (wght axis value, subfamily name, output filename)
BUILDS = [
    (400, "Regular", "SourceHanSansSC-Regular.woff2"),
    (700, "Bold", "SourceHanSansSC-Bold.woff2"),
]

# The family name the CSS `@font-face` and the internal name table both use.
FAMILY = "Source Han Sans SC"


def rewrite_names(font: TTFont, subfamily: str) -> None:
    """Give each static build a clean, distinct, non-variable identity.

    `updateFontNames=True` on the instancer already pins subfamily/PostScript
    names and OS/2 weight to the instance, but it leaves the family as
    "… VF" and does not touch the non-English (zh) records — the zh subfamily
    would still read "Regular" on the Bold build. Two faces that share a
    PostScript name (or a family+subfamily pair) collide inside Chromium's
    font cache and only one weight gets embedded in the PDF, so each weight
    needs an unambiguous name set.
    """
    name_table = font["name"]
    ids = {1, 2, 4, 6, 16, 17}
    name_table.names = [n for n in name_table.names if n.nameID not in ids]
    values = {
        1: FAMILY,  # family
        2: subfamily,  # subfamily
        4: f"{FAMILY} {subfamily}",  # full name
        6: f"SourceHanSansSC-{subfamily}",  # PostScript name
        16: FAMILY,  # typographic family
        17: subfamily,  # typographic subfamily
    }
    for name_id, value in values.items():
        name_table.setName(value, name_id, 3, 1, 0x409)  # Windows Unicode, en-US


def strip_radicals(font: TTFont) -> int:
    """Remove every cmap mapping in U+2E80–U+2FDF. Returns the count removed."""
    removed = 0
    for table in font["cmap"].tables:
        for cp in [cp for cp in table.cmap if RADICAL_LO <= cp <= RADICAL_HI]:
            del table.cmap[cp]
            removed += 1
    return removed


def assert_radical_free(font: TTFont) -> None:
    """Fail loudly if any radical mapping survived (acceptance gate, not a log)."""
    leftovers = [
        cp
        for table in font["cmap"].tables
        for cp in table.cmap
        if RADICAL_LO <= cp <= RADICAL_HI
    ]
    if leftovers:
        raise AssertionError(
            f"radical cmap mappings remain after strip: "
            f"{[f'U+{cp:04X}' for cp in sorted(leftovers)[:20]]} ..."
        )


def assert_complete(font: TTFont, name: str) -> None:
    """Fail loudly if the font is missing its outline tables (the HarfBuzz
    shell-font failure mode) or the glyf table is not full-sized."""
    required = {"head", "glyf", "loca"}
    missing = required - set(font.keys())
    if missing:
        raise AssertionError(f"{name} is missing tables: {sorted(missing)}")

    glyf_size = len(font.getTableData("glyf"))
    # A full CJK font's outlines are megabytes; a shell font has a near-empty
    # glyf. 1 MB is a floor the real build clears by an order of magnitude and
    # the HarfBuzz shell falls well short of.
    if glyf_size < 1_000_000:
        raise AssertionError(f"{name} glyf table is {glyf_size} bytes — not a full font")


def build(weight: int, subfamily: str, out_name: str) -> Path:
    out = SRC / out_name
    font = TTFont(str(VF))
    try:
        static = instantiateVariableFont(
            font, {"wght": weight}, inplace=False, updateFontNames=True
        )
    finally:
        font.close()

    rewrite_names(static, subfamily)
    removed = strip_radicals(static)
    assert_radical_free(static)
    assert_complete(static, out_name)

    static.flavor = "woff2"
    static.save(str(out))
    static.close()

    size = out.stat().st_size
    print(f"{out_name}: wght={weight}  removed={removed} radical mappings  "
          f"{size / 1_000_000:.2f} MB")
    return out


def main() -> int:
    if not VF.exists():
        print(f"missing source font: {VF}", file=sys.stderr)
        return 1
    for weight, subfamily, out_name in BUILDS:
        build(weight, subfamily, out_name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
