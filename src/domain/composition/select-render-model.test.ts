import { describe, expect, it } from 'vitest'

import { BULLET, ENTRY, SECTION, createWorkspace } from '../__fixtures__/workspace'
import { selectRenderModel } from './select-render-model'
import type { ResumeVariant } from './types'

// Every expected value below is written out by hand. Nothing in this file calls
// `resolveComposition` or `buildRenderModel` to work out what the selector should
// return — the assertions go through `selectRenderModel`, the real render path.

function variantWith(
  patch: Pick<ResumeVariant, 'composition' | 'textOverrides'>,
): ResumeVariant {
  return {
    id: 'variant_backend',
    name: 'Backend-leaning',
    composition: patch.composition,
    textOverrides: patch.textOverrides,
    application: { status: 'draft', events: [] },
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
}

function sectionIds(model: ReturnType<typeof selectRenderModel>): string[] {
  return model.sections.map((section) => section.id)
}

describe('selectRenderModel', () => {
  it('resolves a variant that hides a section out of the render model', () => {
    const workspace = createWorkspace()
    workspace.variants = [
      variantWith({
        composition: { visibleSections: [SECTION.summary, SECTION.work, SECTION.skill] },
        textOverrides: {},
      }),
    ]

    const model = selectRenderModel(workspace, { kind: 'variant', id: 'variant_backend' })

    expect(sectionIds(model)).toEqual(['sec_summary', 'sec_work', 'sec_skill'])
  })

  it('applies a variant textOverrides and leaves untouched entries at pool values', () => {
    const workspace = createWorkspace()
    workspace.variants = [
      variantWith({
        composition: {},
        textOverrides: {
          [ENTRY.acme]: 'Staff Platform Engineer',
          [BULLET.acme1]: 'Rebuilt billing on an event-sourced ledger.',
        },
      }),
    ]

    const model = selectRenderModel(workspace, { kind: 'variant', id: 'variant_backend' })
    const work = model.sections.find((section) => section.id === SECTION.work)
    const acme = work?.entries[0]
    const globex = work?.entries[1]

    expect(acme?.title).toBe('Staff Platform Engineer')
    // `ent_acme` selects its bullets [acme3, acme1]; only acme1 is overridden.
    expect(acme?.bullets[0]?.text).toBe('Cut p99 checkout latency from 1.8s to 420ms.')
    expect(acme?.bullets[1]?.text).toBe('Rebuilt billing on an event-sourced ledger.')
    // A sibling entry the override did not name is untouched.
    expect(globex?.title).toBe('Product Engineer')
  })

  it('inherits the master selection for keys the variant did not touch', () => {
    const workspace = createWorkspace()
    workspace.variants = [
      variantWith({
        composition: { entrySelection: { [SECTION.work]: [ENTRY.acme, ENTRY.initech] } },
        textOverrides: {},
      }),
    ]

    const model = selectRenderModel(workspace, { kind: 'variant', id: 'variant_backend' })
    const work = model.sections.find((section) => section.id === SECTION.work)
    const project = model.sections.find((section) => section.id === SECTION.project)

    // The variant dropped `ent_globex` from `sec_work`…
    expect(work?.entries.map((entry) => entry.id)).toEqual(['ent_acme', 'ent_initech'])
    // …while `sec_project` still inherits the master selection per-SectionId.
    expect(project?.entries.map((entry) => entry.id)).toEqual(['ent_atlas', 'ent_beacon'])
  })

  it('renders the master unchanged when the target is the master', () => {
    const model = selectRenderModel(createWorkspace(), { kind: 'master' })

    expect(sectionIds(model)).toEqual(['sec_summary', 'sec_work', 'sec_project', 'sec_skill'])
  })
})
