import { CodeBox, Section } from '../common'
import type { ToolViewProps } from '../types'

export function RagSearchToolView({ tool, result }: ToolViewProps) {
  const query = typeof tool.input.query === 'string' ? tool.input.query : ''
  const corpusId = typeof tool.input.corpus_id === 'string' ? tool.input.corpus_id : ''

  return (
    <>
      <div className="tb-edit-path-row">
        {query && <span className="tb-grep-pattern">{query}</span>}
        {corpusId && <span className="tb-range-label">corpus: {corpusId}</span>}
      </div>

      {result?.content && !result.isError && (
        <Section label="Results">
          <CodeBox content={result.content} copyable />
        </Section>
      )}

      {result?.isError && result.content && (
        <Section label="Error">
          <pre className="tb-pre tb-pre--error">{result.content}</pre>
        </Section>
      )}
    </>
  )
}
