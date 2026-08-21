import type { ReactNode } from 'react'

import type { Basics, SectionKind } from '../../domain/pool/types'
import type { RenderEntry, RenderModel, RenderSection } from '../../domain/composition/render-model'
import type { PageBlock } from '../../features/preview/types'
import './template.css'

/**
 * The one MVP template. It never reaches into the item pool and never decides
 * which sections exist or in what order — it only turns the flat
 * `RenderModel` (ordering, visibility, renaming and overrides already applied)
 * into pagination blocks.
 *
 * Sections are dispatched by `kind` through a renderer registry. There is no
 * if/else chain enumerating built-in kinds, and no hard-coded order array:
 * `custom` (and any kind without a dedicated renderer) falls through to the
 * generic renderer, so adding a custom section never requires touching this
 * file. The generic renderer is the only one MVP needs; it distinguishes
 * `layout: 'entries'` from `layout: 'text'`, which is what actually changes
 * the body shape.
 */

type SectionRenderer = (section: RenderSection) => PageBlock[]

function SectionTitle({ section }: { section: RenderSection }): ReactNode {
  return (
    <h2 className="resume-section-title" data-section-id={section.id}>
      {section.title}
    </h2>
  )
}

function SectionText({ section }: { section: RenderSection }): ReactNode {
  return <p className="resume-text-body">{section.text}</p>
}

function EntryView({ entry }: { entry: RenderEntry }): ReactNode {
  return (
    <article className="resume-entry" data-entry-id={entry.id}>
      <div className="resume-entry-head">
        <h3 className="resume-entry-title">{entry.title}</h3>
        {entry.period && <div className="resume-entry-period">{formatPeriod(entry.period)}</div>}
      </div>
      {entry.subtitle && <div className="resume-entry-subtitle">{entry.subtitle}</div>}
      {entry.bullets.length > 0 && (
        <ul className="resume-bullets">
          {entry.bullets.map((bullet) => (
            <li key={bullet.id} className="resume-bullet" data-bullet-id={bullet.id}>
              {bullet.text}
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

function Basics({ basics }: { basics: Basics }): ReactNode {
  const contact = [basics.email, basics.phone, basics.location]
    .filter((value): value is string => value !== undefined)
    .join(' · ')

  return (
    <header className="resume-basics">
      <h1 className="resume-name">{basics.name}</h1>
      {basics.headline && <div className="resume-headline">{basics.headline}</div>}
      {contact && <div className="resume-contact">{contact}</div>}
      {basics.links && basics.links.length > 0 && (
        <div className="resume-links">
          {basics.links.map((link) => (
            <span key={link.label}>
              <a href={link.url} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            </span>
          ))}
        </div>
      )}
    </header>
  )
}

function formatPeriod(period: { start: string; end?: string }): string {
  return `${period.start} – ${period.end ?? 'Present'}`
}

/** The generic renderer: entries sections become a list, text sections prose. */
function renderGenericSection(section: RenderSection): PageBlock[] {
  const blocks: PageBlock[] = [
    { key: `section:${section.id}`, kind: 'section-header', node: <SectionTitle section={section} /> },
  ]

  if (section.layout === 'entries') {
    for (const entry of section.entries) {
      blocks.push({ key: `entry:${entry.id}`, kind: 'content', node: <EntryView entry={entry} /> })
    }
  } else if (section.text !== undefined) {
    blocks.push({ key: `text:${section.id}`, kind: 'content', node: <SectionText section={section} /> })
  }

  return blocks
}

/**
 * kind → renderer. Empty today: MVP has a single visual treatment, so every
 * built-in kind and every `custom` kind share the generic renderer. This is the
 * extension point for kind-specific layouts later, and it is why a new custom
 * section renders without a code change.
 */
const SECTION_RENDERERS: Partial<Record<SectionKind, SectionRenderer>> = {}

function rendererFor(kind: SectionKind): SectionRenderer {
  return SECTION_RENDERERS[kind] ?? renderGenericSection
}

/** Flatten a render model into the ordered pagination blocks a template emits. */
export function buildBlocks(model: RenderModel): PageBlock[] {
  const blocks: PageBlock[] = [
    { key: 'basics', kind: 'content', node: <Basics basics={model.basics} /> },
  ]

  for (const section of model.sections) {
    blocks.push(...rendererFor(section.kind)(section))
  }

  return blocks
}
