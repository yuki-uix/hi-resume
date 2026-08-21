import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// The resume renders with a bundled CJK font, not the macOS system fonts:
// Chromium emits system CJK glyphs as Type 3 procedures whose ToUnicode maps
// land on Kangxi-radical code points (U+2Fxx) instead of the unified-ideograph
// block, which breaks ATS keyword matching. The font is a single TrueType
// (glyf) variable font bundled locally — nothing is fetched at runtime — so
// Chromium embeds it as a CIDFontType2 with a correct ToUnicode map instead.
import './features/preview/fonts.css'

import { App } from './app/App'

const container = document.getElementById('root')
if (!container) throw new Error('#root not found')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
