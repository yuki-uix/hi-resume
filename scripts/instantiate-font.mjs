// Instantiate the bundled Source Han Sans SC variable font into static
// TrueType (glyf) fonts at the two weights the template uses (400 body, 700
// names/titles).
//
// Why: Chromium's print-to-PDF pipeline embeds *static* TrueType fonts as
// CIDFontType2 (with a correct ToUnicode map), but draws CFF-outline fonts and
// variable (gvar) fonts as Type 3 procedures — the #20 defect. The upstream
// full CJK font ships only as CFF (static) or TrueType (variable); this script
// pins the variable font's `wght` axis to produce the static glyf builds.
//
// The retained glyph set is the full unified-ideograph basic block plus the
// Latin/punctuation ranges the resume actually uses, so the bundled font is
// full-coverage, not a "common 3500" subset.
//
// Run:  node scripts/instantiate-font.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import subsetFont from 'subset-font'

const VF = new URL('../src/features/preview/SourceHanSansSC-VF.ttf.woff2', import.meta.url)

const RANGES = [
  [0x0020, 0x007e], // ASCII printable
  [0x00a0, 0x00ff], // Latin-1 supplement (·, é, …)
  [0x2000, 0x206f], // general punctuation (—, ’, “…)
  [0x3000, 0x303f], // CJK punctuation
  [0x4e00, 0x9fff], // CJK unified ideographs (full basic block)
  [0xff00, 0xffef], // fullwidth forms
]

let text = ''
for (const [lo, hi] of RANGES) {
  for (let cp = lo; cp <= hi; cp += 1) text += String.fromCodePoint(cp)
}

const vf = readFileSync(VF)

for (const [weight, file] of [
  [400, 'NotoSansCJKsc-Regular.ttf'],
  [700, 'NotoSansCJKsc-Bold.ttf'],
]) {
  const out = await subsetFont(vf, text, {
    targetFormat: 'sfnt',
    variationAxes: { wght: weight },
  })
  const dest = new URL(`../src/features/preview/${file}`, import.meta.url)
  writeFileSync(dest, out)
  console.log(`wrote ${file} (${out.length} bytes) at wght=${weight}`)
}
