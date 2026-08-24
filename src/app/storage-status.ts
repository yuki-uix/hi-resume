/**
 * Storage-status wording — the deliverable of #44.
 *
 * The workspace lives in IndexedDB and nowhere else, so the status line must say
 * plainly where the data is and that it can be lost. Two hard rules govern every
 * string exported here:
 *
 * 1. Nothing may claim the data is "safe" ("安全") or "backed up" ("已备份"/"已保存").
 *    Clearing the browser's site data deletes it, and until file-binding lands
 *    (#45) the app cannot honestly say otherwise. Better the user worries than
 *    believes a lie.
 * 2. `navigator.storage.persist()` returning `true` only reduces *automatic*
 *    eviction under disk pressure — it does not protect against manual clearing.
 *    So even the "granted" wording must carry the same loss warning.
 */

/** What `navigator.storage.persist()` told us, including "not yet resolved". */
export type PersistState = 'pending' | 'granted' | 'denied'

/** Where the data lives. Rendered in every state, so "浏览器" is always visible. */
export const STORAGE_LOCATION = '数据仅存于此浏览器'

/** Shown while the `persist()` request has not yet resolved. */
export const PERSIST_PENDING = '正在确认持久化存储…'

/**
 * Risk wording per `persist()` outcome. Both branches name the one loss the app
 * can never prevent — the user clearing site data — and neither says "safe".
 * The only difference is the automatic-eviction risk: granted lowers it, denied
 * leaves it open.
 */
export const PERSIST_RISK: Record<'granted' | 'denied', string> = {
  granted: '已获得持久化存储权限，浏览器会尽量保留数据；清除浏览器站点数据仍会丢失。',
  denied: '未获得持久化存储权限，浏览器可能在磁盘空间不足时清理数据；清除浏览器站点数据也会丢失。',
}
