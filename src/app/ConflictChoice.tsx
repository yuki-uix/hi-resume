import { useState } from 'react'

import { summarizeWorkspace } from '../features/export/json'
import type { PendingConflict } from './binding-flow'
import { formatDateTime } from './format-time'
import {
  CONFLICT_BODY,
  CONFLICT_CHOICE,
  CONFLICT_SIDE,
  CONFLICT_TITLE,
  CONFLICT_WARN,
} from './storage-status'
import './conflict-choice.css'

/**
 * The one prompt in #45 (issue: "本 issue 唯一需要仔细设计的地方").
 *
 * It appears only when the cached copy holds edits the file never received.
 * Everything about it is built around one promise made in {@link CONFLICT_BODY}:
 * **neither side has been written yet**. The buttons are the first write.
 *
 * There is deliberately no "merge" and no default-highlighted choice — both
 * versions are real work, and the app has no basis for picking. Each side shows
 * its timestamp and its contents, because "which one is mine" is answered by
 * what is in them, not by which is newer.
 */
export function ConflictChoice({
  conflict,
  onChoose,
  error,
}: {
  conflict: PendingConflict
  onChoose: (choice: 'file' | 'cache') => void
  error: string | null
}) {
  const [busy, setBusy] = useState<'file' | 'cache' | null>(null)

  const choose = (choice: 'file' | 'cache') => {
    setBusy(choice)
    onChoose(choice)
  }

  return (
    <div className="conflict" role="dialog" aria-modal="true" aria-label={CONFLICT_TITLE} data-testid="conflict-choice">
      <div className="conflict__panel">
        <h1 className="conflict__title">{CONFLICT_TITLE}</h1>
        <p className="conflict__body" data-testid="conflict-body">
          {CONFLICT_BODY}
        </p>

        <div className="conflict__sides">
          <Side
            label={CONFLICT_SIDE.file}
            testId="conflict-file"
            at={conflict.fileAt}
            detail={conflict.fileName}
            conflict={conflict}
            which="file"
          />
          <Side
            label={CONFLICT_SIDE.cache}
            testId="conflict-cache"
            at={conflict.cacheAt}
            detail="此浏览器"
            conflict={conflict}
            which="cache"
          />
        </div>

        <p className="conflict__warn">{CONFLICT_WARN}</p>

        {error !== null && (
          <p className="conflict__error" role="alert" data-testid="conflict-error">
            {error}
          </p>
        )}

        <div className="conflict__actions">
          <button
            type="button"
            className="conflict__button"
            data-testid="conflict-use-file"
            disabled={busy !== null}
            onClick={() => choose('file')}
          >
            {CONFLICT_CHOICE.file}
          </button>
          <button
            type="button"
            className="conflict__button"
            data-testid="conflict-use-cache"
            disabled={busy !== null}
            onClick={() => choose('cache')}
          >
            {CONFLICT_CHOICE.cache}
          </button>
        </div>
      </div>
    </div>
  )
}

function Side({
  label,
  testId,
  at,
  detail,
  conflict,
  which,
}: {
  label: string
  testId: string
  at: number
  detail: string
  conflict: PendingConflict
  which: 'file' | 'cache'
}) {
  const summary = summarizeWorkspace(which === 'file' ? conflict.fileWorkspace : conflict.cacheWorkspace)
  return (
    <div className="conflict__side" data-testid={testId}>
      <div className="conflict__side-label">{label}</div>
      <div className="conflict__side-time" data-testid={`${testId}-time`}>
        {formatDateTime(at)}
      </div>
      <div className="conflict__side-detail">{detail}</div>
      <div className="conflict__side-summary">
        {summary.sections} 个区块、{summary.entries} 条经历、{summary.bullets} 条要点、
        {summary.variants} 个岗位版本
      </div>
    </div>
  )
}
