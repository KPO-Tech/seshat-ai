import { History, LinkCloud } from '@icon-park/react'
import { JOB_TEMPLATES, type JobTemplate } from '../lib/jobTemplates'

// Wrapping grid of ready-to-use jobs, matching OpenHands' own "Start from a
// proven workflow" section (a grid, not a horizontal-scroll strip - that
// avoids the hard-clipped-edge-with-no-scroll-hint problem a fixed-width
// flex rail has). See jobTemplates.ts's doc comment for why this exists at
// all (see and test a populated job without creating one from scratch
// first). Selecting a card opens the full "New Job" form pre-filled
// (SchedulingPage wires onUse to openDraftForm) - a template is curated,
// deterministic content, unlike an agent-drafted job, so it skips the
// lightweight JobDraftCard confirmation that LLM output gets.
export function JobTemplateGallery({ onUse }: { onUse: (template: JobTemplate) => void }) {
  return (
    <div className="sch-template-grid">
      {JOB_TEMPLATES.map((template) => (
        <button
          key={template.id}
          type="button"
          className="sch-template-card"
          onClick={() => onUse(template)}
        >
          <span className="sch-template-card-category">{template.category}</span>
          <span className="sch-template-card-name">{template.name}</span>
          <span className="sch-template-card-desc">{template.description}</span>
          <span className="sch-template-card-trigger">
            {template.trigger_type === 'webhook' ? <LinkCloud size={11} /> : <History size={11} />}
            <span>{template.trigger_type === 'webhook' ? `webhook (${template.webhook_method})` : `cron ${template.cron_expr}`}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
