import type { ToolUseBlock } from '../../../lib/chatTypes'

export type BrowserScreenshotResult = {
  src: string
  label: string
  url: string
  bytes?: number
}

export function parseBrowserScreenshot(tool: ToolUseBlock): BrowserScreenshotResult | null {
  if (!tool.name.toLowerCase().includes('screenshot')) return null
  const content = tool._result?.content
  if (!content) return null

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    const data = text(parsed.data_base64) || text(parsed.dataBase64) || text(parsed.image_base64)
    if (!data) return null
    const mime = text(parsed.mime_type) || text(parsed.mimeType) || 'image/png'
    const page = object(parsed.page)
    return {
      src: `data:${mime};base64,${data}`,
      label: truthy(parsed.full_page) || truthy(parsed.fullPage) ? 'Full page screenshot' : 'Viewport screenshot',
      url: text(page?.url) || text(parsed.url),
      bytes: number(parsed.bytes)
    }
  } catch {
    return null
  }
}

export function browserResultSummary(tool: ToolUseBlock) {
  const result = tool._result
  if (!result?.content) return ''
  const screenshot = parseBrowserScreenshot(tool)
  if (screenshot) return screenshot.label
  if (result.is_error || result.isError) return 'Browser action failed'
  return result.content.split(/\r?\n/).find((line) => line.trim())?.trim() ?? ''
}

function object(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function number(value: unknown) {
  return typeof value === 'number' ? value : undefined
}

function truthy(value: unknown) {
  return value === true || value === 'true'
}
