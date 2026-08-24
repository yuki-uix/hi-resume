import type { BulletId, EntryId, SectionId } from './types'
import type { VariantId } from '../composition/types'

/**
 * ID generation and branding.
 *
 * IDs must survive a JSON round-trip and stay unique across imports, so they
 * are opaque strings rather than counters scoped to one session.
 */

/**
 * Structural type for the one method we need. Declaring it here rather than
 * relying on `lib.dom` keeps this module compilable with `lib: ["ES2022"]`,
 * which is what lets the domain layer run under plain node.
 */
type RandomUuidSource = { randomUUID: () => string }

let fallbackCounter = 0

/**
 * `crypto.randomUUID` exists in browsers and in node >= 19. The fallback keeps
 * ID generation working in older or stripped-down runtimes; it combines a
 * timestamp, a per-process counter and randomness so collisions need two calls
 * in the same millisecond to also draw the same 32-bit number.
 *
 * The global is read per call, not captured at module load, so the runtime
 * actually decides which branch runs.
 */
function randomToken(): string {
  const source = (globalThis as { crypto?: Partial<RandomUuidSource> }).crypto
  if (source && typeof source.randomUUID === 'function') {
    return source.randomUUID()
  }
  fallbackCounter += 1
  const time = Date.now().toString(36)
  const counter = fallbackCounter.toString(36)
  const noise = Math.floor(Math.random() * 0x1_0000_0000).toString(36)
  return `${time}-${counter}-${noise}`
}

/** Prefixes make an ID readable in a JSON backup without cross-referencing. */
export const ID_PREFIX = {
  section: 'sec_',
  entry: 'ent_',
  bullet: 'bul_',
  variant: 'var_',
} as const

export function newSectionId(): SectionId {
  return `${ID_PREFIX.section}${randomToken()}` as SectionId
}

export function newEntryId(): EntryId {
  return `${ID_PREFIX.entry}${randomToken()}` as EntryId
}

export function newBulletId(): BulletId {
  return `${ID_PREFIX.bullet}${randomToken()}` as BulletId
}

export function newVariantId(): VariantId {
  return `${ID_PREFIX.variant}${randomToken()}` as VariantId
}

/**
 * Brand an existing string. For values that already are IDs — parsed JSON,
 * test fixtures — never to mint a new one.
 */
export function asSectionId(raw: string): SectionId {
  return raw as SectionId
}

export function asEntryId(raw: string): EntryId {
  return raw as EntryId
}

export function asBulletId(raw: string): BulletId {
  return raw as BulletId
}
