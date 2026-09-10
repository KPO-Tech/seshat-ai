export const TOOL_BLOCK_CSS = `
.tb-section {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.tb-section-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.tb-code {
  position: relative;
  background: color-mix(in srgb, var(--color-bg) 84%, black);
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  overflow: hidden;
}

.tb-code--error {
  background: rgba(var(--color-error-rgb), 0.06);
  border-color: rgba(var(--color-error-rgb), 0.18);
}

.tb-code--bare {
  border: none;
  background: transparent;
  border-radius: 0;
}

/* ── Header card: a bordered box with a compact "what is this" strip
   directly attached to its body - see common.tsx's HeaderCard. ── */
.tb-hcard {
  border: 1px solid var(--color-border-subtle);
  border-radius: 6px;
  background: color-mix(in srgb, var(--color-bg) 72%, white);
  overflow: hidden;
}

.tb-hcard-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  font-size: 12px;
  font-family: inherit;
  font-weight: 650;
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border-subtle);
  background: color-mix(in srgb, var(--color-surface-elevated) 70%, var(--color-bg));
  white-space: nowrap;
  overflow: hidden;
}

.tb-hcard-header-path {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-text-muted);
}

.tb-hcard-header-link {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-text);
  text-decoration: none;
}

.tb-hcard-header-link:hover {
  color: var(--color-accent);
  text-decoration: underline;
}

.tb-hcard-header-stat {
  flex-shrink: 0;
  margin-left: auto;
  padding-left: 8px;
  color: var(--color-text-disabled);
  font-size: 10px;
  font-weight: 500;
}

.tb-hcard-body {
  padding: 0;
}

.tb-code-highlight {
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-subtle) transparent;
}

.tb-code-highlight::-webkit-scrollbar { width: 4px; height: 4px; }
.tb-code-highlight::-webkit-scrollbar-track { background: transparent; }
.tb-code-highlight::-webkit-scrollbar-thumb {
  background: var(--color-border-subtle);
  border-radius: 3px;
}

.tb-pre {
  margin: 0;
  padding: 8px 9px;
  font-family: monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 220px;
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
  padding: 10px;
  border: 1px solid rgba(251, 191, 36, 0.22);
  border-radius: 8px;
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
  border-radius: 7px;
  padding: 6px 10px;
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
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  padding: 10px;
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
  padding: 3px 7px;
  font-size: 10px;
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
  font-size: 13px;
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
  border-radius: 8px;
  padding: 9px 10px;
  background: rgba(255, 255, 255, 0.02);
  width: 100%;
  text-align: left;
  cursor: pointer;
}

.tb-ask-option--selected {
  border-color: rgba(var(--color-success-rgb), 0.28);
  background: rgba(var(--color-success-rgb), 0.08);
}

.tb-ask-option:disabled,
.tb-ask-option--readonly {
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

.tb-ask-card--pending {
  padding: 8px 12px;
}

.tb-ask-pending-note {
  font-size: 12px;
  font-style: italic;
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
  border-radius: 8px;
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
  border-radius: 7px;
  padding: 7px 10px;
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
  gap: 0;
  max-height: 220px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-subtle) transparent;
}

.tb-links::-webkit-scrollbar { width: 4px; }
.tb-links::-webkit-scrollbar-track { background: transparent; }
.tb-links::-webkit-scrollbar-thumb {
  background: var(--color-border-subtle);
  border-radius: 4px;
}

.tb-link-item {
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  border-bottom: 1px solid var(--color-border-subtle);
  border-radius: 0;
  padding: 8px 10px;
  text-decoration: none;
  background: transparent;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.tb-link-item:last-child {
  border-bottom: none;
}

.tb-link-item:hover {
  background: color-mix(in srgb, var(--color-accent) 7%, transparent);
}

.tb-link-favicon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--color-surface) 74%, var(--color-bg));
}

.tb-link-favicon img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tb-link-favicon--fallback {
  background: color-mix(in srgb, var(--color-accent) 88%, black);
  font-size: 9px;
  font-weight: 700;
  color: white;
}

.tb-link-copy {
  display: flex;
  flex-direction: column;
  gap: 0;
  flex: 1 1 auto;
  min-width: 0;
}

.tb-link-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text);
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tb-link-domain {
  flex: 0 0 auto;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--color-text-muted);
}

.tb-links-more {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 10px 9px 38px;
  border-top: 1px solid var(--color-border-subtle);
  border-right: none;
  border-bottom: none;
  border-left: none;
  background: transparent;
  font-size: 11px;
  color: var(--color-text-muted);
  cursor: pointer;
  text-align: left;
}

.tb-links-more:hover {
  background: color-mix(in srgb, var(--color-accent) 7%, transparent);
  color: var(--color-text-secondary);
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
  gap: 9px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  padding: 9px 10px;
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

/* ── File tool shared path row ── */
.tb-edit-path-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 0;
  flex-wrap: wrap;
}

/* Diff's own path row: a thin one-line strip fused directly to the top of
   .tb-diff below it (no gap, matching border-radius split) instead of
   floating as a separate, unstyled line above a separately-bordered box -
   see .tb-difv's gap:0 and .tb-diff's border-top:none/flattened top
   corners, which make the two read as one bordered unit. */
.tb-difv .tb-edit-path-row {
  border: 1px solid var(--color-border-subtle);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: rgba(255, 255, 255, 0.03);
  padding: 6px 9px;
  justify-content: space-between;
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

/* ── Web fetch view ── */
.tb-fetch-card {
  display: flex;
  flex-direction: column;
}

/* ── Diff view ── */
.tb-diff {
  position: relative;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11.5px;
  line-height: 1.55;
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.2);
  max-height: 360px;
  overflow-y: auto;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-subtle) transparent;
}

.tb-diff::-webkit-scrollbar { width: 4px; height: 4px; }
.tb-diff::-webkit-scrollbar-track { background: transparent; }
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
/* Border/background come from the enclosing HeaderCard (.tb-hcard) now -
   Glob and List Directory are its only two users and both always render it
   inside one. */
.tb-file-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 240px;
  overflow-y: auto;
  overflow-x: hidden;
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
.tb-file-item-size { opacity: 0.55; }

.tb-prose {
  position: relative;
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.2);
}

.tb-prose--bare {
  border: none;
  background: transparent;
  border-radius: 0;
}

.tb-prose-text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 320px;
  overflow-y: auto;
  padding: 9px 10px;
}

.tb-prose .tb-copy { top: 6px; right: 6px; }

.tb-patch-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  border: 1px solid var(--color-border-subtle);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.2);
  padding: 4px;
}

.tb-patch-line {
  font-size: 12px;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  padding: 3px 8px;
  border-radius: 5px;
  color: var(--color-text-secondary);
}

.tb-patch-line--add { color: #6ee7b7; }
.tb-patch-line--del { color: #fca5a5; }
.tb-patch-line--update { color: var(--color-accent); }
.tb-patch-line--move { color: var(--color-text-muted); }

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

/* ── write_file HTML preview trigger ── */
.tb-write-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.tb-write-preview-btn {
  border: 1px solid rgba(239, 124, 47, 0.3);
  background: rgba(239, 124, 47, 0.1);
  color: var(--color-accent);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.tb-write-preview-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.tb-write-preview-error {
  font-size: 11px;
  color: var(--color-error);
}
`
