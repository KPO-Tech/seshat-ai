import { CodeBox, Section } from '../common'
import type { ToolViewProps } from '../types'

export function GenericToolView({ tool, result }: ToolViewProps) {
  const inputStr = JSON.stringify(tool.input, null, 2)
  const metadataStr = result?.metadata ? JSON.stringify(result.metadata, null, 2) : ''

  return (
    <>
      <Section label="Input">
        <CodeBox content={inputStr} />
      </Section>

      {result?.content && (
        <Section label="Output">
          <CodeBox content={result.content} copyable />
        </Section>
      )}

      {!result?.content && metadataStr && (
        <Section label="Details">
          <CodeBox content={metadataStr} copyable />
        </Section>
      )}
    </>
  )
}
