import { useEffect, useRef, type ComponentProps } from 'react'
import { Robot } from '@icon-park/react'
import type { ProviderModel, ProviderSetting } from '@/api/types'
import { ChatInput, CHAT_INPUT_CSS } from '@/components/chat/ChatInput'
import { MessageItem, MESSAGE_ITEM_CSS } from '@/components/chat/MessageItem'

type AgentMessage = ComponentProps<typeof MessageItem>['message']

type InboxAgentPanelProps = {
  sessionId?: string
  messages: AgentMessage[]
  prompt: string
  isStreaming: boolean
  selectedProviderId: string | null
  selectedModelId: string | null
  selectedModels: ProviderModel[]
  providers: ProviderSetting[]
  hasLoadedSelectedProviderModels: boolean
  loadingModelsFor: string | null
  onPromptChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  onProviderSelect: (id: string) => void
  onModelSelect: (id: string) => void
  onApproveTool: (toolUseId: string, remember?: boolean) => void
  onDenyTool: (toolUseId: string) => void
  onSubmitToolPrompt: (promptId: string, value: unknown) => void
}

export function InboxAgentPanel({
  sessionId,
  messages,
  prompt,
  isStreaming,
  selectedProviderId,
  selectedModelId,
  selectedModels,
  providers,
  hasLoadedSelectedProviderModels,
  loadingModelsFor,
  onPromptChange,
  onSend,
  onStop,
  onProviderSelect,
  onModelSelect,
  onApproveTool,
  onDenyTool,
  onSubmitToolPrompt,
}: InboxAgentPanelProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length, isStreaming])

  return (
    <section className="ib-agent-panel-card ib-agent-chat-card">
      <style>{CHAT_INPUT_CSS}</style>
      <style>{MESSAGE_ITEM_CSS}</style>
      <div className="ib-panel-headline">
        <Robot size={16} />
        <strong>Inbox Agent</strong>
      </div>
      <div className="ib-agent-transcript" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="ib-agent-empty">
            <Robot size={30} />
            <strong>Inbox Agent ready</strong>
            <span>Ask it to review open threads, summarize a selected conversation, or prepare draft replies.</span>
          </div>
        ) : (
          messages.map((message, index) => (
            <MessageItem
              key={message.id}
              message={message}
              sessionId={sessionId}
              compact
              revealThinking={isStreaming && message.role === 'assistant' && index === messages.length - 1}
              onApproveTool={onApproveTool}
              onDenyTool={onDenyTool}
              onSubmitToolPrompt={onSubmitToolPrompt}
            />
          ))
        )}
      </div>
      <ChatInput
        value={prompt}
        onChange={onPromptChange}
        onSend={onSend}
        onStop={onStop}
        placeholder="Ask the Inbox Agent..."
        maxHeight={120}
        isStreaming={isStreaming}
        statusText={isStreaming ? 'Inbox Agent is working' : undefined}
        providerLabel={providers.find((provider) => provider.id === selectedProviderId)?.name ?? 'Provider'}
        modelLabel={selectedModels.find((model) => model.model_id === selectedModelId)?.display_name || selectedModelId || 'Model'}
        providerOptions={providers.map((provider) => ({ id: provider.id, label: provider.name }))}
        modelOptions={
          selectedProviderId && hasLoadedSelectedProviderModels
            ? selectedModels.map((model) => ({ id: model.model_id, label: model.display_name || model.model_id }))
            : undefined
        }
        selectedProviderId={selectedProviderId}
        selectedModelId={selectedModelId}
        onProviderSelect={onProviderSelect}
        onModelSelect={onModelSelect}
        providerDisabled={providers.length === 0}
        modelDisabled={
          !selectedProviderId ||
          loadingModelsFor === selectedProviderId ||
          selectedModels.length === 0
        }
      />
    </section>
  )
}
