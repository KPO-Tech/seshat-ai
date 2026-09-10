import { Section, CodeBox, HeaderCard } from '../common'
import type { ToolViewProps } from '../types'

const CSS = `
.tb-mcp-header {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.tb-mcp-server {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-accent);
  background: rgba(239, 124, 47, 0.1);
  border: 1px solid rgba(239, 124, 47, 0.25);
  border-radius: 4px;
  padding: 1px 5px;
}

.tb-mcp-tool {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
}

.tb-mcp-args {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-top: 1px solid var(--color-border-subtle);
}

.tb-mcp-arg {
  display: grid;
  grid-template-columns: minmax(90px, max-content) minmax(0, 1fr);
  gap: 10px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--color-border-subtle);
  font-size: 11px;
  line-height: 1.45;
}

.tb-mcp-arg-key {
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-family: monospace;
}

.tb-mcp-arg-value {
  color: var(--color-text);
  font-family: monospace;
  overflow-wrap: anywhere;
}

.tb-mcp-empty {
  padding: 8px 10px;
  color: var(--color-text-muted);
  font-size: 11px;
}
`

type ParsedMcpName = { server: string; tool: string }

// MCP tools reach the client under two different naming shapes:
//  - the common one: each MCP tool is individually registered as
//    "mcp__<server>__<tool>" (see MCPToolPrefix in the engine) — the
//    server/tool split is entirely in the name.
//  - the generic fallback "mcp" tool, invoked with a `tool`/`_tool` input
//    field carrying the same "mcp__server__tool" string (and sometimes a
//    separate `server`/`_server` field) — see mcp/tool.go's Call().
// Without unpacking this, the default label renderer turns the double
// underscores into double spaces ("mcp  github  search issues"), which is
// illegible and doesn't distinguish the server from the tool at all.
function parseMcpToolName(name: string, input: Record<string, unknown>): ParsedMcpName | null {
  const splitDynamicName = (dynamicName: string): ParsedMcpName => {
    const rest = dynamicName.slice('mcp__'.length)
    const sepIndex = rest.indexOf('__')
    return sepIndex >= 0
      ? { server: rest.slice(0, sepIndex), tool: rest.slice(sepIndex + 2) }
      : { server: '', tool: rest }
  }

  if (name.startsWith('mcp__')) return splitDynamicName(name)

  if (name === 'mcp') {
    const toolField = (typeof input.tool === 'string' && input.tool)
      || (typeof input._tool === 'string' && input._tool)
      || ''
    if (toolField.startsWith('mcp__')) return splitDynamicName(toolField)
    const server = (typeof input.server === 'string' && input.server)
      || (typeof input._server === 'string' && input._server)
      || ''
    return toolField || server ? { server, tool: toolField } : null
  }

  return null
}

export function McpToolView({ tool, result }: ToolViewProps) {
  const parsed = parseMcpToolName(tool.name, tool.input)
  const args = Object.entries(tool.input).filter(
    ([key]) => !['tool', '_tool', 'server', '_server'].includes(key),
  )
  const title = parsed?.server ? `MCP - ${parsed.server}` : 'MCP'
  const toolName = parsed?.tool || tool.name

  return (
    <>
      <style>{CSS}</style>

      <HeaderCard
        header={
          <>
            <span>{title}</span>
            <span className="tb-hcard-header-path" title={toolName}>{toolName}</span>
          </>
        }
      >
        {args.length > 0 ? (
          <div className="tb-mcp-args">
            {args.map(([key, value]) => (
                <div key={key} className="tb-mcp-arg">
                  <span className="tb-mcp-arg-key">{key}</span>
                  <span className="tb-mcp-arg-value">
                    {typeof value === 'string' ? value : JSON.stringify(value)}
                  </span>
                </div>
              ))}
          </div>
        ) : (
          <div className="tb-mcp-empty">No arguments.</div>
        )}
      </HeaderCard>

      {result?.content && !result.isError && (
        <Section label="Result">
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
