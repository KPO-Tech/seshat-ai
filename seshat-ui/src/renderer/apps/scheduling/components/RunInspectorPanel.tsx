import { useState, type ReactNode } from 'react'
import { Caution, CheckOne, Delete, Download, Edit, History, PauseOne, Play, PreviewOpen, Robot } from '@icon-park/react'
import { WindowCloseIcon } from '@/components/ui/WindowControlIcon'
import type { InspectorTab, Job, Run } from '../api/types'
import { RUN_STATUS_LABEL } from '../lib/schedulingJobs'
import { formatRunTime, latestRun, readPlanSteps } from '../lib/runInspector'
export function RunInspectorPanel({ job, runs, tab, onTabChange, onClose, onRunNow, onTogglePaused, onEdit }: {
  job: Job | null
  runs: Run[]
  tab: InspectorTab
  onTabChange: (tab: InspectorTab) => void
  onClose: () => void
  onRunNow: (job: Job) => void
  onTogglePaused: (job: Job) => void
  onEdit: (job: Job) => void
}) {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
  if (!job) {
    return (
      <aside className="sch-inspector">
        <button className="sch-inspector-close" onClick={onClose}><WindowCloseIcon size={13} /></button>
        <div className="sch-runs-empty">This job is no longer available.</div>
      </aside>
    )
  }
  const run = latestRun(runs)
  const planSteps = readPlanSteps(job)
  const outputs = runs.filter((item) => item.output_text || item.error_text)

  return (
    <aside className="sch-inspector">
      <div className="sch-inspector-topstrip">
        <div className="sch-inspector-titleline">
          <strong>{job.name}</strong>
          <span className={`sch-status-dot ${run?.status ?? job.status}`} />
          <span className="sch-mini-pill running">{run ? RUN_STATUS_LABEL[run.status] : job.status}</span>
          <span className="sch-mini-pill target">{job.execution_target}</span>
        </div>
        <div className="sch-inspector-icon-actions">
          <button onClick={() => onRunNow(job)} title="Run"><Play size={14} /><span>Run</span></button>
          <button onClick={() => onTogglePaused(job)} title={job.status === 'active' ? 'Pause' : 'Resume'}>{job.status === 'active' ? <PauseOne size={14} /> : <Play size={14} />}<span>{job.status === 'active' ? 'Pause' : 'Resume'}</span></button>
          <button onClick={() => onEdit(job)} title="Config"><Edit size={14} /><span>Config</span></button>
          <button onClick={onClose} title="Close"><WindowCloseIcon size={14} /><span>Close</span></button>
        </div>
      </div>

      <div className="sch-inspector-metarow">
        <div>
          <span>Next run</span>
          <strong>{job.next_run_at ? new Date(job.next_run_at).toLocaleString() : 'Not scheduled'}</strong>
        </div>
        <div>
          <span>Last run</span>
          <strong>{job.last_run_at ? new Date(job.last_run_at).toLocaleString() : 'Never'}</strong>
        </div>
        <div>
          <span>Retention</span>
          <strong>30 days</strong>
        </div>
      </div>

      <div className="sch-inspector-tabs wide">
        <button className={tab === 'plan' ? 'active' : ''} onClick={() => onTabChange('plan')}>Plan</button>
        <button className={tab === 'activity' ? 'active' : ''} onClick={() => onTabChange('activity')}>Activities</button>
        <button className={tab === 'outputs' ? 'active' : ''} onClick={() => onTabChange('outputs')}>Outputs</button>
      </div>

      {tab === 'activity' ? (
        <section className="sch-inspector-tabbody">
          {runs.length === 0 ? (
            <InspectorEmpty
              icon={<History size={18} />}
              title="No activity yet"
              description="Run this job manually or wait for the next scheduled execution. Agent activity and timestamps will appear here."
            />
          ) : (
            <div className="sch-activity-list">
              {runs.map((item) => {
                const hasTrace = (item.node_trace?.length ?? 0) > 0
                const expanded = expandedRunId === item.id && hasTrace
                return (
                  <div key={item.id}>
                    <div
                      className={`sch-activity-row ${hasTrace ? 'expandable' : ''}`}
                      onClick={hasTrace ? () => setExpandedRunId(expanded ? null : item.id) : undefined}
                    >
                      <span>{formatRunTime(item)}{hasTrace && <span className="sch-activity-caret">{expanded ? '▾' : '▸'}</span>}</span>
                      <strong>{RUN_STATUS_LABEL[item.status]}</strong>
                      {item.error_text && <p>{item.error_text}</p>}
                    </div>
                    {expanded && (
                      <div className="sch-node-trace">
                        {item.node_trace!.map((node) => (
                          <div key={node.id} className={`sch-node-trace-row ${node.skipped ? 'skipped' : node.success ? 'success' : 'failed'}`}>
                            <span className="sch-node-trace-icon">{node.skipped ? '—' : node.success ? <CheckOne size={12} /> : <Caution size={12} />}</span>
                            <span className="sch-node-trace-id">{node.id}</span>
                            <span className="sch-node-trace-type">{node.type}</span>
                            {typeof node.duration_ms === 'number' && <span className="sch-node-trace-duration">{node.duration_ms}ms</span>}
                            {(node.error || node.output) && (
                              <p className="sch-node-trace-detail">{node.error || JSON.stringify(node.output).slice(0, 200)}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      ) : tab === 'outputs' ? (
        <section className="sch-inspector-tabbody">
          {outputs.length === 0 ? (
          <InspectorEmpty
            icon={<PreviewOpen size={18} />}
            title="No outputs yet"
            description="The final answer and generated artifacts will appear here after a completed run. Old outputs are retained for 30 days."
          />
        ) : (
          <div className="sch-output-list">
            {outputs.map((item) => (
              <div key={item.id} className="sch-output-row">
                <div>
                  <strong>{item.error_text ? 'Error log' : 'Run output'}</strong>
                  <span>{formatRunTime(item)}</span>
                </div>
                <div className="sch-output-actions">
                  <button title="View"><PreviewOpen size={12} /></button>
                  <button title="Download"><Download size={12} /></button>
                  <button title="Delete"><Delete size={12} /></button>
                </div>
              </div>
            ))}
            <div className="sch-output-note">Outputs older than 30 days are deleted unless pinned.</div>
          </div>
          )}
        </section>
      ) : (
        <div className="sch-plan-split">
          <section className="sch-plan-pane">
            <div className="sch-plan-heading">Plan <span>Agent-generated plan</span></div>
            {planSteps.length === 0 ? (
              <InspectorEmpty
                icon={<Robot size={18} />}
                title="No live plan yet"
                description="When the scheduled agent emits task_create or task_update events, its plan will be tracked here instead of being guessed in advance."
              />
            ) : (
            <div className="sch-plan-list visual">
              {planSteps.map((step, index) => (
                <div key={step.id} className={`sch-plan-step visual ${step.status ?? 'pending'}`}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{(step.status ?? 'pending').replace('_', ' ')}</small>
                    {step.detail && <p>{step.detail}</p>}
                  </div>
                </div>
              ))}
            </div>
            )}
          </section>
          <section className="sch-activity-output-preview">
            <div className="sch-plan-heading">Activity output <span>{run ? formatRunTime(run) : 'Preview'}</span></div>
            {run?.output_text || run?.error_text ? (
              <p>{run.output_text || run.error_text}</p>
            ) : (
              <InspectorEmpty
                icon={<PreviewOpen size={18} />}
                title="Nothing selected"
                description="Select an activity after a run to preview its output and artifacts here."
              />
            )}
          </section>
        </div>
      )}
    </aside>
  )
}

function InspectorEmpty({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="sch-inspector-empty">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}

