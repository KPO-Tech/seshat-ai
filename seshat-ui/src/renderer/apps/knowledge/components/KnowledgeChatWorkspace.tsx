import type { MutableRefObject } from 'react'
import { Book, Robot } from '@icon-park/react'
import { ChatInput } from '@/components/chat/ChatInput'
import { MessageItem } from '@/components/chat/MessageItem'
import type { Corpus, Message as ApiMessage, ProviderModel, ProviderSetting } from '@/api/types'

export function KnowledgeChatWorkspace({
  messages,
  prompt,
  isStreaming,
  selectedCorpus,
  selectedCorpusId,
  scrollRef,
  onPromptChange,
  onSend,
  onStop,
  onApproveTool,
  onDenyTool,
  onSubmitToolPrompt,
  providers,
  selectedProviderId,
  selectedModelId,
  selectedModels,
  hasLoadedSelectedProviderModels,
  loadingModelsFor,
  onProviderSelect,
  onModelSelect,
}: {
  messages: ApiMessage[]
  prompt: string
  isStreaming: boolean
  selectedCorpus: Corpus | null
  selectedCorpusId: string
  scrollRef: MutableRefObject<HTMLDivElement | null>
  onPromptChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  onApproveTool: (toolUseId: string, remember?: boolean) => void
  onDenyTool: (toolUseId: string) => void
  onSubmitToolPrompt: (promptId: string, value: unknown) => void
  providers: ProviderSetting[]
  selectedProviderId: string | null
  selectedModelId: string | null
  selectedModels: ProviderModel[]
  hasLoadedSelectedProviderModels: boolean
  loadingModelsFor: string | null
  onProviderSelect: (id: string) => void
  onModelSelect: (id: string) => void
}) {
  const scopeLabel = selectedCorpusId === 'all' ? 'All included knowledge' : selectedCorpus?.name ?? 'Selected collection'
  const selectedProvider = providers.find((p) => p.id === selectedProviderId) ?? null
  const selectedModel = selectedModels.find((m) => m.model_id === selectedModelId) ?? null

  return (
    <div className="k-chat-page">
      <section className="k-chat-main">
        <header className="k-chat-head">
          <div className="k-chat-title">
            <Robot size={17} />
            <div>
              <span>Knowledge Agent</span>
              <strong>Chat</strong>
            </div>
          </div>
          <div className="k-chat-scope">
            <Book size={13} />
            {scopeLabel}
          </div>
        </header>

        <div className="k-chat-transcript" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="k-chat-empty">
              <Book size={34} />
              <h2>Ask the Knowledge Agent</h2>
              <p>Use this chat for deeper work around internal knowledge, cited analysis, and follow-up questions.</p>
            </div>
          ) : (
            <div className="k-chat-message-list">
              {messages.map((message, index) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  revealThinking={isStreaming && message.role === 'assistant' && index === messages.length - 1}
                  onApproveTool={onApproveTool}
                  onDenyTool={onDenyTool}
                  onSubmitToolPrompt={onSubmitToolPrompt}
                />
              ))}
            </div>
          )}
        </div>

        <ChatInput
          value={prompt}
          onChange={onPromptChange}
          onSend={onSend}
          onStop={onStop}
          isStreaming={isStreaming}
          placeholder="Ask the Knowledge Agent..."
          providerLabel={selectedProvider?.name ?? 'Provider'}
          modelLabel={selectedModel?.display_name || selectedModel?.model_id || 'Model'}
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

      <aside className="k-chat-side">
        <div className="k-chat-card">
          <span>Mode</span>
          <strong>Knowledge-first</strong>
          <p>Answers should prioritize indexed corpora and cite sources when available.</p>
        </div>
        <div className="k-chat-card muted">
          <span>Future tools</span>
          <strong>Reports, decks, browser workflows</strong>
          <p>Curated tools and skills can be attached here without changing the general assistant.</p>
        </div>
      </aside>
    </div>
  )
}
