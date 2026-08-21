import { SectionsEditor } from '../features/editor/sections/SectionsEditor'

// M1 task #4 adds the section editor on top of the #3 pagination preview. The
// editor keeps the same `?fixture=` / `?pageSize=` query params, so the
// pagination e2e from #3 continues to address the preview unchanged.
export function App() {
  return <SectionsEditor />
}
