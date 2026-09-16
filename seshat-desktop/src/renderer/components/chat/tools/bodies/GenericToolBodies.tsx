import type { ToolUseBlock } from '../../lib/chatTypes'
import { CodePanel, prettyJsonOrRaw } from '../ToolDetails'

export function GenericBody({ tool }: { tool: ToolUseBlock }) {
  return (
    <div className="grid gap-2">
      <CodePanel title="Input" value={tool.input} />
      {tool._partialInput && <CodePanel title="Partial input" value={tool._partialInput} />}
      {tool._result?.content && <CodePanel title={tool._result.is_error || tool._result.isError ? 'Error' : 'Result'} value={prettyJsonOrRaw(tool._result.content)} />}
    </div>
  )
}

export function JsonBody({ tool }: { tool: ToolUseBlock }) {
  if (!tool._result?.content) return <GenericBody tool={tool} />
  return <CodePanel title={tool._result.is_error || tool._result.isError ? 'Error' : 'Result'} value={prettyJsonOrRaw(tool._result.content)} />
}

export function ProseBody({ tool }: { tool: ToolUseBlock }) {
  if (!tool._result?.content) return <GenericBody tool={tool} />
  return (
    <div className="rounded-md bg-[var(--surface-muted)] px-3 py-2 text-[12px] leading-6 text-[var(--text-secondary)] whitespace-pre-wrap">
      {tool._result.content}
    </div>
  )
}
