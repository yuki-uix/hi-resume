import type { Workspace } from '../../domain/composition/types'
import { SchemaVersionMismatchError, WorkspaceReadError } from '../../persistence/errors'
import { validateWorkspace } from '../../persistence/migration'

/**
 * JSON is the portable backup format (docs/ARCHITECTURE.md §3「JSON 备份优先」).
 *
 * This module is the whole import/export contract and is deliberately pure: no
 * DOM, no IndexedDB, so it runs under plain node. Two rules make the round trip
 * lossless:
 *
 * - `serializeWorkspace` writes exactly the `Workspace` fields and nothing else
 *   — the editor store builds its workspace solely from the reducers and
 *   `createEmptyWorkspace`, so there are no runtime-only fields to leak, and the
 *   round-trip e2e test is the guard that keeps it that way.
 * - `parseWorkspaceFile` never rewrites a value. `parseWorkspace` (Zod) keeps
 *   every string — including timestamps like `updatedAt` / `appliedAt` — exactly
 *   as it arrived, and this module adds nothing on top. A fresh timestamp here
 *   would break "export → import → export is deep-equal" for any workspace that
 *   carries one.
 */

/** The file a backup is written to / read from. */
export const WORKSPACE_FILE_NAME = 'hi-resume-workspace.json'

export type WorkspaceSummary = {
  sections: number
  entries: number
  bullets: number
  variants: number
}

/** One line per problem, each already naming the path that failed. */
export type WorkspaceFileParseResult =
  | { ok: true; workspace: Workspace }
  | { ok: false; errors: string[] }

/**
 * Serialize a workspace for download. Pretty-printed for the "readable,
 * migratable" requirement, and trailing-newline terminated so it is a proper
 * text file. `JSON.parse` round-trips it exactly (AC6).
 */
export function serializeWorkspace(workspace: Workspace): string {
  return JSON.stringify(workspace, null, 2) + '\n'
}

/** The counts the import confirmation shows before overwriting anything. */
export function summarizeWorkspace(workspace: Workspace): WorkspaceSummary {
  return {
    sections: Object.keys(workspace.pool.sections).length,
    entries: Object.keys(workspace.pool.entries).length,
    bullets: Object.keys(workspace.pool.bullets).length,
    variants: workspace.variants.length,
  }
}

/**
 * Turn raw file text into a validated `Workspace`, or a list of readable errors.
 *
 * Three failures are distinguished, all before any state is touched:
 *  1. not valid JSON — one line with the parser's message;
 *  2. schema errors — the per-path Zod messages from the shared validation gate;
 *  3. an unsupported `schemaVersion` — the same version gate the IndexedDB load
 *     path uses, so load and import can never disagree about which versions this
 *     build understands.
 *
 * Import deliberately *validates but does not migrate*: `validateWorkspace` is
 * the validate-only half of the shared gate, so the export → import → export
 * round trip stays byte-for-byte.
 */
export function parseWorkspaceFile(text: string): WorkspaceFileParseResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return { ok: false, errors: [`不是合法的 JSON：${message}`] }
  }

  try {
    return { ok: true, workspace: validateWorkspace(data) }
  } catch (cause) {
    if (cause instanceof SchemaVersionMismatchError) {
      return {
        ok: false,
        errors: [
          `数据版本不兼容：该备份的 schemaVersion 为 ${cause.storedVersion}，高于当前应用支持的 ${cause.supportedVersion}，无法导入。`,
        ],
      }
    }
    if (cause instanceof WorkspaceReadError) {
      return { ok: false, errors: cause.message.split('; ') }
    }
    // Unreachable — every gate failure is one of the two types above; kept total
    // so the UI never has to catch a thrown version gate.
    return { ok: false, errors: ['无法识别该备份的 schemaVersion。'] }
  }
}
