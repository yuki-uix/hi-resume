import { expect, test } from '@playwright/test'

/**
 * AC 9 for issue #5: keystroke-to-preview-update P95 latency under 100ms on a
 * 200-bullet fixture.
 *
 * The probe goes through the real input path — Playwright types real keys into
 * the editor's textarea, and the page records, per keystroke, (a) the `input`
 * event timestamp and (b) the first `MutationObserver` timestamp at which the
 * preview's matching `[data-bullet-id]` text has caught up to the textarea's
 * value. Nothing here calls a store action or render function directly, so the
 * timing includes the full store update → render model → paginate → preview
 * commit cycle.
 */

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789abcd'

test('AC9: keystroke-to-preview P95 latency is under 100ms on 200 bullets', async ({ page }) => {
  await page.goto('/?fixture=bullets-200')
  await page.waitForSelector('[data-paginated="true"]')
  await page.waitForSelector('[data-testid="entries-editor"]')

  const input = page.locator('[data-bullet-edit-id="bul_perf_1"] [data-testid="bullet-text"]')
  // Focus + clear before instrumenting, so the clearing keystroke is not timed.
  await input.fill('')

  await page.evaluate(() => {
    const textarea = document.querySelector(
      '[data-bullet-edit-id="bul_perf_1"] [data-testid="bullet-text"]',
    ) as HTMLTextAreaElement
    const stage = document.querySelector('.preview-stage') as HTMLElement

    const keys: number[] = []
    const updates: number[] = []
    let lastMatched = textarea.value

    textarea.addEventListener('input', () => {
      keys.push(performance.now())
    })

    // The preview (pages) and the off-screen measurer are both under the stage;
    // a commit only counts once the visible bullet matches the current value.
    const observer = new MutationObserver(() => {
      const bullet = document.querySelector('[data-bullet-id="bul_perf_1"]')
      if (!bullet) return
      if (bullet.textContent === textarea.value && textarea.value !== lastMatched) {
        lastMatched = textarea.value
        updates.push(performance.now())
      }
    })
    observer.observe(stage, { subtree: true, childList: true, characterData: true })

    ;(window as unknown as { __perf: { keys: number[]; updates: number[] } }).__perf = { keys, updates }
  })

  await page.keyboard.type(CHARS, { delay: 30 })

  const result = await page.evaluate(() => {
    const { keys, updates } = (window as unknown as { __perf: { keys: number[]; updates: number[] } }).__perf
    const n = Math.min(keys.length, updates.length)
    const latencies: number[] = []
    for (let i = 0; i < n; i += 1) latencies.push(updates[i]! - keys[i]!)
    const sorted = [...latencies].sort((a, b) => a - b)
    return {
      keys: keys.length,
      updates: updates.length,
      samples: latencies.length,
      p95: sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      median: sorted[Math.floor(sorted.length / 2)] ?? 0,
    }
  })

  // Every typed character produced both an input event and a preview update.
  expect(result.keys).toBeGreaterThanOrEqual(CHARS.length)
  expect(result.updates).toBeGreaterThanOrEqual(CHARS.length)

  // eslint-disable-next-line no-console
  console.log(`AC9 latency (ms): ${JSON.stringify(result)}`)

  expect(result.p95).toBeLessThan(100)
})
