export const TOOL_BLOCK_CSS = `
.tb-root {
  border: 1px solid var(--color-border-subtle);
  border-radius: 12px;
  overflow: hidden;
  width: 100%;
  background: var(--color-bg);
}

.tb-root--completed { border-color: rgba(52, 211, 153, 0.18); }
.tb-root--failed { border-color: rgba(248, 113, 113, 0.22); }
.tb-root--running { border-color: rgba(239, 124, 47, 0.22); }
.tb-root--awaiting_approval { border-color: rgba(251, 191, 36, 0.32); }

.tb-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  background: var(--color-surface);
  border: none;
  cursor: pointer;
  text-align: left;
}

.tb-header:hover { background: var(--color-hover); }

.tb-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.tb-copy-line {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow: hidden;
}

.tb-icon {
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.tb-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.2;
  flex-shrink: 0;
}

.tb-snippet {
  font-size: 12px;
  color: var(--color-text-muted);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--color-border-subtle);
  border-radius: 5px;
  padding: 1px 7px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 420px;
}

.tb-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.tb-chevron {
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  transition: transform 0.18s;
}

.tb-chevron--open { transform: rotate(180deg); }

.tb-status {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
}

.tb-status-icon { display: flex; align-items: center; }

.tb-status--completed .tb-status-icon,
.tb-status--completed .tb-status-label { color: #34d399; }
.tb-status--failed .tb-status-icon,
.tb-status--failed .tb-status-label { color: #f87171; }
.tb-status--running .tb-status-icon,
.tb-status--running .tb-status-label { color: var(--color-accent); }
.tb-status--pending .tb-status-icon,
.tb-status--pending .tb-status-label { color: var(--color-text-muted); }
.tb-status--awaiting_approval .tb-status-icon,
.tb-status--awaiting_approval .tb-status-label { color: #f5c451; }

.tb-spin { animation: tb-spin 1s linear infinite; }

@keyframes tb-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.tb-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  display: inline-block;
}

.tb-duration {
  font-size: 11px;
  font-weight: 400;
  color: var(--color-text-muted);
}

.tb-body {
  padding: 14px 14px 10px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid var(--color-border-subtle);
}

.tb-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tb-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.tb-code {
  position: relative;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 8px;
  overflow: hidden;
}

.tb-code--error { background: rgba(248, 113, 113, 0.06); }

.tb-pre {
  margin: 0;
  padding: 10px 12px;
  font-family: monospace;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 260px;
  overflow-y: auto;
}

.tb-code--error .tb-pre { color: #fca5a5; }

.tb-inline-copy {
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text);
}

.tb-copy {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid var(--color-border-subtle);
  border-radius: 5px;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 3px 5px;
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.15s;
}

.tb-code:hover .tb-copy { opacity: 1; }
.tb-copy:hover { background: var(--color-hover); color: var(--color-text); }

.tb-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-text-muted);
  font-family: monospace;
  padding-top: 2px;
}

.tb-approval {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid rgba(251, 191, 36, 0.22);
  border-radius: 10px;
  background: rgba(251, 191, 36, 0.06);
}

.tb-approval-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tb-approval-copy strong {
  font-size: 13px;
  color: var(--color-text);
}

.tb-approval-copy p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-muted);
}

.tb-approval-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.tb-approval-btn {
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 7px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.tb-approval-btn--deny {
  background: transparent;
  border-color: var(--color-border-subtle);
  color: var(--color-text-muted);
}

.tb-approval-btn--allow {
  background: rgba(52, 211, 153, 0.14);
  border-color: rgba(52, 211, 153, 0.3);
  color: #34d399;
}

.tb-ask-card {
  border: 1px solid var(--color-border-subtle);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.02);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tb-ask-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tb-ask-chip,
.tb-ask-meta,
.tb-ask-answer-label {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.tb-ask-chip {
  background: rgba(239, 124, 47, 0.12);
  color: var(--color-accent);
}

.tb-ask-meta {
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-text-muted);
}

.tb-ask-question {
  font-size: 14px;
  line-height: 1.55;
  color: var(--color-text);
}

.tb-ask-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tb-ask-option {
  border: 1px solid var(--color-border-subtle);
  border-radius: 10px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.02);
  width: 100%;
  text-align: left;
  cursor: pointer;
}

.tb-ask-option--selected {
  border-color: rgba(52, 211, 153, 0.28);
  background: rgba(52, 211, 153, 0.08);
}

.tb-ask-option:disabled {
  cursor: default;
}

.tb-ask-option-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tb-ask-option-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}

.tb-ask-option-description {
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-text-muted);
}

.tb-ask-answer {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.tb-ask-answer-label {
  background: rgba(52, 211, 153, 0.12);
  color: #34d399;
}

.tb-ask-answer-value {
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text);
}

.tb-ask-note {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-muted);
}

.tb-ask-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-top: 1px solid var(--color-border-subtle);
  padding-top: 12px;
}

.tb-ask-custom {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tb-ask-custom-label {
  font-size: 12px;
  color: var(--color-text-muted);
}

.tb-ask-textarea {
  width: 100%;
  resize: vertical;
  min-height: 78px;
  border-radius: 10px;
  border: 1px solid var(--color-border-subtle);
  background: rgba(0, 0, 0, 0.24);
  color: var(--color-text);
  padding: 10px 12px;
  font: inherit;
  line-height: 1.45;
  outline: none;
}

.tb-ask-textarea:focus {
  border-color: rgba(239, 124, 47, 0.32);
}

.tb-ask-actions {
  display: flex;
  justify-content: flex-end;
}

.tb-ask-submit {
  border: 1px solid rgba(52, 211, 153, 0.3);
  border-radius: 8px;
  padding: 8px 12px;
  background: rgba(52, 211, 153, 0.14);
  color: #34d399;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.tb-ask-submit:disabled {
  opacity: 0.45;
  cursor: default;
}

.tb-links {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tb-link-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 10px;
  padding: 10px 12px;
  text-decoration: none;
  background: rgba(255, 255, 255, 0.02);
  transition: background 0.15s ease, border-color 0.15s ease;
}

.tb-link-item:hover {
  background: var(--color-hover);
  border-color: rgba(239, 124, 47, 0.24);
}

.tb-link-index {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
  flex-shrink: 0;
  padding-top: 1px;
}

.tb-link-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.tb-link-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.4;
}

.tb-link-url {
  font-size: 12px;
  color: var(--color-accent);
  line-height: 1.4;
  word-break: break-all;
}

.tb-note {
  font-size: 12px;
  line-height: 1.55;
  color: var(--color-text-muted);
}

.tb-plan-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tb-plan-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 10px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.02);
}

.tb-plan-item--in_progress {
  border-color: rgba(239, 124, 47, 0.28);
  background: rgba(239, 124, 47, 0.05);
}

.tb-plan-item--completed {
  opacity: 0.74;
}

.tb-plan-marker {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 5px;
  background: var(--color-text-muted);
  flex-shrink: 0;
}

.tb-plan-item--in_progress .tb-plan-marker {
  background: var(--color-accent);
}

.tb-plan-item--completed .tb-plan-marker {
  background: #34d399;
}

.tb-plan-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.tb-plan-title {
  font-size: 13px;
  line-height: 1.45;
  color: var(--color-text);
}

.tb-plan-detail {
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-text-secondary);
}

.tb-task-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 10px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.02);
}

.tb-task-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--color-text);
}

.tb-task-detail {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.tb-task-meta {
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
`
