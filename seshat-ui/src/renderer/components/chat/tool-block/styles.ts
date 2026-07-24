export const TOOL_BLOCK_CSS = `
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

.tb-code--error { background: rgba(var(--color-error-rgb), 0.06); }

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
  background: rgba(var(--color-success-rgb), 0.14);
  border-color: rgba(var(--color-success-rgb), 0.3);
  color: var(--color-success);
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
  border-color: rgba(var(--color-success-rgb), 0.28);
  background: rgba(var(--color-success-rgb), 0.08);
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
  background: rgba(var(--color-success-rgb), 0.12);
  color: var(--color-success);
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
  border: 1px solid rgba(var(--color-success-rgb), 0.3);
  border-radius: 8px;
  padding: 8px 12px;
  background: rgba(var(--color-success-rgb), 0.14);
  color: var(--color-success);
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
  background: var(--color-success);
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

/* ── File tool shared path row ── */
.tb-edit-path-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 0;
  flex-wrap: wrap;
}

.tb-filepath {
  font-size: 12px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tb-filepath-full {
  font-size: 11px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.tb-range-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-accent);
  background: rgba(239, 124, 47, 0.1);
  border: 1px solid rgba(239, 124, 47, 0.2);
  border-radius: 5px;
  padding: 1px 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.tb-grep-pattern {
  font-size: 12px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-weight: 700;
  color: var(--color-accent);
}

.tb-fetch-url {
  font-size: 12px;
  color: var(--color-accent);
  word-break: break-all;
  line-height: 1.5;
}

/* ── Diff view ── */
.tb-diff {
  position: relative;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1.55;
  border-radius: 8px;
  overflow: hidden;
  max-height: 360px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.tb-diff::-webkit-scrollbar { width: 4px; }
.tb-diff::-webkit-scrollbar-thumb {
  background: var(--color-border-subtle);
  border-radius: 4px;
}

.tb-diff-copy {
  position: absolute;
  top: 6px;
  right: 6px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  color: var(--color-text-muted);
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 2;
}

.tb-diff:hover .tb-diff-copy { opacity: 1; }
.tb-diff-copy:hover { color: var(--color-text); }

.tb-diff-line {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 1px 10px;
}

.tb-diff-line--del {
  background: rgba(var(--color-error-rgb), 0.10);
}

.tb-diff-line--add {
  background: rgba(var(--color-success-rgb), 0.08);
}

.tb-diff-sign {
  flex-shrink: 0;
  width: 14px;
  font-weight: 700;
  user-select: none;
  text-align: center;
}

.tb-diff-line--del .tb-diff-sign { color: #fca5a5; }
.tb-diff-line--add .tb-diff-sign { color: #6ee7b7; }

.tb-diff-text {
  white-space: pre;
  word-break: break-all;
  flex: 1;
  min-width: 0;
}

.tb-diff-line--del .tb-diff-text { color: #fca5a5; }
.tb-diff-line--add .tb-diff-text { color: #6ee7b7; }

/* ── File list (glob) ── */
.tb-file-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 240px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.tb-file-item {
  font-size: 12px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  color: var(--color-text-secondary);
  padding: 3px 8px;
  border-radius: 5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.1s;
}

.tb-file-item:hover { background: rgba(255, 255, 255, 0.04); }

/* ── pre error variant ── */
.tb-pre--error {
  color: #fca5a5;
  background: rgba(var(--color-error-rgb), 0.08);
  border: 1px solid rgba(var(--color-error-rgb), 0.18);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
}
`
