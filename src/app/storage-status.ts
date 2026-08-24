/**
 * Storage-status wording — the deliverable of #44, extended by #45.
 *
 * The status line must say plainly where the data is and how it can be lost.
 * Three hard rules govern every string exported here:
 *
 * 1. Nothing may claim the data is "safe" ("安全") or "backed up" ("已备份"/"已保存").
 *    Clearing the browser's site data deletes the cached copy, and even a bound
 *    file can be deleted, moved, or have its permission revoked. Better the user
 *    worries than believes a lie.
 * 2. `navigator.storage.persist()` returning `true` only reduces *automatic*
 *    eviction under disk pressure — it does not protect against manual clearing.
 *    So even the "granted" wording must carry the same loss warning.
 * 3. Once a file is bound the app may state the *fact* ("每次自动保存都会写入文件
 *    X") but not the *conclusion* — binding removes one failure mode, not all of
 *    them, and the wording says which.
 *
 * ## Everything here is data, on purpose
 *
 * `storage-status.test.ts` walks every export of this module and rejects any
 * forbidden word it finds, so a new constant is covered the moment it is added —
 * no list to remember to update. That only works while the exports are strings
 * and string containers, so the guard also *fails on a function export*. Wording
 * that needs a runtime value (a file name, a timestamp) is exported as a fixed
 * prefix and composed at the call site.
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

/* ------------------------------------------------------------------ #45 --- */

/** The entry point, shown only where the File System Access API exists. */
export const BIND_ACTION_LABEL = '绑定到文件'

/** Explains what binding buys, in the issue's own mental model. */
export const BIND_HINT = '把工作区写入你自己的一个 JSON 文件。清除浏览器数据后，重新选择该文件即可恢复内容。'

/**
 * Replaces {@link STORAGE_LOCATION} once bound — leaving "仅存于此浏览器" up
 * would be false. Composed with the file name at the call site.
 */
export const FILE_BOUND_PREFIX = '每次自动保存都会写入文件 '

/**
 * The caveat that keeps the bound state honest. Binding removes exactly one
 * failure mode (clearing site data); the file itself is still the user's to
 * lose, and this names how.
 */
export const FILE_BOUND_RISK = '文件由你自己保管：若它被删除、被移动或权限被撤销，应用将无法再写入，届时会在此处报错。'

/** Prefix for a failed file write. Composed with the browser's own message. */
export const FILE_WRITE_FAILED_PREFIX = '写入文件失败：'

/** The consequence of that failure, stated so the user knows what is stale. */
export const FILE_WRITE_FAILED_DETAIL = '这次编辑只写入了此浏览器，文件里仍是上一次的内容。'

/**
 * The bound file was changed by something else, so the save left it alone rather
 * than overwriting that change. States what happens next, because doing nothing
 * would otherwise look like data quietly going missing.
 */
export const FILE_CHANGED_ELSEWHERE =
  '文件已被其他程序修改，未覆盖它。这次编辑只写入了此浏览器；下次启动时会让你选择保留哪一份。'

/** Prefix for a bound file that can no longer be read (deleted or moved). */
export const FILE_READ_FAILED_PREFIX = '无法读取已绑定的文件：'

/** The picked file holds something that is not a workspace. Nothing is touched. */
export const FILE_INVALID = '该文件不是有效的工作区 JSON。未绑定，也没有覆盖文件里的任何内容。'

/** Prefix for a failure while picking or binding a file. */
export const BIND_FAILED_PREFIX = '绑定失败：'

/**
 * Permission outcomes that leave the app unbound. Both end by naming where the
 * edits actually go, so "not bound" never reads as "not saved anywhere".
 */
export const BIND_PERMISSION: Record<'denied' | 'prompt', string> = {
  denied: '未获得该文件的写入权限，当前未绑定文件；编辑只写入此浏览器。',
  prompt: '需要重新授权才能写入该文件，当前未绑定文件；编辑只写入此浏览器。',
}

/** Re-request permission — must run from a click, so it is its own button. */
export const REGRANT_ACTION_LABEL = '重新授权'

/* --- The conflict prompt: the cached copy is ahead of the file ------------ */

export const CONFLICT_TITLE = '文件与浏览器副本不一致'

/**
 * States the cause and, crucially, that nothing has been written yet — the user
 * is choosing, not confirming something already done.
 *
 * The claim is "the browser copy holds edits the file never received", not "the
 * browser copy is newer". Those come apart in the real case this prompt exists
 * for: a failed write leaves the cache ahead, and then something else touches
 * the file, giving it the later mtime. Both timestamps are shown, and the
 * sentence stays true either way.
 */
export const CONFLICT_BODY =
  '浏览器里的副本包含没能写入文件的修改（上一次写入失败，或文件被其他程序改过）。请选择保留哪一份；在你做出选择之前，两边都不会被写入。'

/** Labels for the two timestamps the user compares. */
export const CONFLICT_SIDE: Record<'cache' | 'file', string> = {
  cache: '浏览器副本',
  file: '文件',
}

/** The two choices, each naming what it overwrites rather than what it keeps. */
export const CONFLICT_CHOICE: Record<'file' | 'cache', string> = {
  file: '用文件覆盖浏览器副本',
  cache: '用浏览器副本覆盖文件',
}

/** Irreversibility, said once, plainly. */
export const CONFLICT_WARN = '被覆盖的那一份无法找回。'
