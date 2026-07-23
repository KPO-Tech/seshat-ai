import { AskUserToolView } from './renderers/AskUserToolView'
import { BashToolView } from './renderers/BashToolView'
import { BrowserToolView } from './renderers/BrowserToolView'
import { EditToolView } from './renderers/EditToolView'
import { GenericToolView } from './renderers/GenericToolView'
import { GlobToolView } from './renderers/GlobToolView'
import { GrepToolView } from './renderers/GrepToolView'
import { ImageGenToolView } from './renderers/ImageGenToolView'
import { McpToolView } from './renderers/McpToolView'
import { RagSearchToolView } from './renderers/RagSearchToolView'
import { ReadToolView } from './renderers/ReadToolView'
import { SttToolView } from './renderers/SttToolView'
import { TaskToolView } from './renderers/TaskToolView'
import { TtsToolView } from './renderers/TtsToolView'
import { WebFetchToolView } from './renderers/WebFetchToolView'
import { WebSearchToolView } from './renderers/WebSearchToolView'
import { WriteToolView } from './renderers/WriteToolView'
import type { ToolBlockProps, ToolViewProps } from './types'

// Shared per-tool-name body dispatch, used by both ToolBlock (full card) and
// QuietGroupItem (grouped, per-item expansion) so the two rendering surfaces
// never fall out of sync with each other.
export function renderBody(props: ToolViewProps, onSubmitPrompt?: ToolBlockProps['onSubmitPrompt']) {
  const { tool } = props
  // MCP tool names are dynamic ("mcp__<server>__<tool>", one case per server/tool
  // pair the user has connected) — a static switch case can't enumerate them, so
  // this is checked ahead of the switch instead.
  if (tool.name.startsWith('mcp__') || tool.name === 'mcp') {
    return <McpToolView {...props} />
  }
  switch (tool.name) {
    case 'bash':
      return <BashToolView {...props} />
    case 'ask_user_question':
      return <AskUserToolView {...props} onSubmitPrompt={onSubmitPrompt} />
    case 'read':
    case 'file_read':
    case 'read_file':
      return <ReadToolView {...props} />
    case 'task_create':
    case 'task_update':
    case 'task_list':
      return <TaskToolView {...props} />
    case 'web_search':
      return <WebSearchToolView {...props} />
    case 'web_fetch':
    case 'read_document_url':
    case 'read_url':
      return <WebFetchToolView {...props} />
    case 'edit':
    case 'file_edit':
    case 'edit_file':
      return <EditToolView {...props} />
    case 'write':
    case 'file_write':
    case 'write_file':
      return <WriteToolView {...props} />
    case 'glob':
      return <GlobToolView {...props} />
    case 'grep':
      return <GrepToolView {...props} />
    case 'generate_image':
      return <ImageGenToolView {...props} />
    case 'text_to_speech':
      return <TtsToolView {...props} />
    case 'speech_to_text':
      return <SttToolView {...props} />
    case 'rag_search':
      return <RagSearchToolView {...props} />
    case 'browser_open':
    case 'browser_navigate':
    case 'browser_snapshot':
    case 'browser_extract':
    case 'browser_list_pages':
    case 'browser_network_list':
    case 'browser_list_downloads':
    case 'browser_search_content':
    case 'browser_get_network_policy':
    case 'browser_set_network_policy':
    case 'browser_select_page':
    case 'browser_close_page':
    case 'browser_click':
    case 'browser_type':
    case 'browser_press':
    case 'browser_scroll':
    case 'browser_wait':
    case 'browser_screenshot':
      return <BrowserToolView {...props} />
    default:
      return <GenericToolView {...props} />
  }
}
