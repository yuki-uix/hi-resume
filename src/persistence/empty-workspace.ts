import { CURRENT_SCHEMA_VERSION } from '../domain/composition/schema'
import type { Workspace } from '../domain/composition/types'
import { asSectionId } from '../domain/pool/ids'
import type { Section, SectionId } from '../domain/pool/types'

/**
 * The first-launch workspace: every built-in section, zero content.
 *
 * This is the production startup path's answer to an empty IndexedDB. It is
 * deliberately *not* the `?fixture=` workspace — there are no entries, no
 * bullets, no summary prose, and an empty contact block, so a fresh install
 * shows a blank resume the user fills in by hand. Nothing in here may overlap
 * with the fixture content (`src/domain/__fixtures__/workspace.ts`), because
 * the acceptance test asserts the empty preview contains none of the fixture's
 * strings.
 *
 * Section ids are stable strings (not minted per launch) so a later JSON export
 * and the pool can address them across imports, matching the fixture's id
 * convention.
 */

export const EMPTY_SECTION = {
  summary: asSectionId('sec_summary'),
  work: asSectionId('sec_work'),
  project: asSectionId('sec_project'),
  education: asSectionId('sec_education'),
  skill: asSectionId('sec_skill'),
  language: asSectionId('sec_language'),
} as const

/** The built-in section definitions, in the PRD's canonical display order. */
function builtInSections(): Record<SectionId, Section> {
  return {
    [EMPTY_SECTION.summary]: {
      id: EMPTY_SECTION.summary,
      kind: 'summary',
      title: '个人简介',
      layout: 'text',
      removable: false,
    },
    [EMPTY_SECTION.work]: {
      id: EMPTY_SECTION.work,
      kind: 'work',
      title: '工作经历',
      layout: 'entries',
      removable: false,
    },
    [EMPTY_SECTION.project]: {
      id: EMPTY_SECTION.project,
      kind: 'project',
      title: '项目经历',
      layout: 'entries',
      removable: false,
    },
    [EMPTY_SECTION.education]: {
      id: EMPTY_SECTION.education,
      kind: 'education',
      title: '教育经历',
      layout: 'entries',
      removable: false,
    },
    [EMPTY_SECTION.skill]: {
      id: EMPTY_SECTION.skill,
      kind: 'skill',
      title: '技能',
      layout: 'entries',
      removable: false,
    },
    [EMPTY_SECTION.language]: {
      id: EMPTY_SECTION.language,
      kind: 'language',
      title: '语言',
      layout: 'entries',
      removable: false,
    },
  }
}

export function createEmptyWorkspace(): Workspace {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    pool: {
      sections: builtInSections(),
      entries: {},
      bullets: {},
      basics: { name: '' },
    },
    master: {
      sectionOrder: [
        EMPTY_SECTION.summary,
        EMPTY_SECTION.work,
        EMPTY_SECTION.project,
        EMPTY_SECTION.education,
        EMPTY_SECTION.skill,
        EMPTY_SECTION.language,
      ],
      visibleSections: [
        EMPTY_SECTION.summary,
        EMPTY_SECTION.work,
        EMPTY_SECTION.project,
        EMPTY_SECTION.education,
        EMPTY_SECTION.skill,
        EMPTY_SECTION.language,
      ],
      sectionTitles: {},
      // An empty selection is the explicit "nothing yet" marker for each
      // entries-layout section; a missing key would also read as empty, but the
      // key existing makes the "add the first entry" path uniform.
      entrySelection: {
        [EMPTY_SECTION.work]: [],
        [EMPTY_SECTION.project]: [],
        [EMPTY_SECTION.education]: [],
        [EMPTY_SECTION.skill]: [],
        [EMPTY_SECTION.language]: [],
      },
      bulletSelection: {},
    },
    variants: [],
    settings: { pageSize: 'A4' },
  }
}
