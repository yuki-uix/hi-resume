/// <reference types="vite/client" />

// Vite injects these as plain side-effect imports; TS needs a declaration for
// each. `vite/client` covers most, this covers the raw `.css` side-effect.
declare module '*.css'
