export interface ProviderModelOption {
  id: string
  label: string
  description?: string
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  codex: 'Codex',
  mistral: 'Mistral AI',
  gemini: 'Google Gemini',
  minimax: 'MiniMax',
  openrouter: 'OpenRouter',
  deepseek: 'DeepSeek',
  opencode: 'OpenCode Zen',
  'z-ai': 'Z.ai',
  ollama: 'Ollama',
  kimi: 'Kimi (Moonshot AI)',
  'workers-ai': 'Cloudflare Workers AI',
}

const PROVIDER_MODELS: Record<string, ProviderModelOption[]> = {
  anthropic: [
    { id: 'claude-sonnet-4-20250514', label: 'Sonnet 4', description: 'Latest flagship Claude model for most agentic tasks.' },
    { id: 'claude-3-5-sonnet-20241022', label: 'Sonnet 3.5', description: 'Strong coding and reasoning model.' },
    { id: 'claude-3-5-haiku-20241022', label: 'Haiku 3.5', description: 'Fastest Claude model for low-latency tasks.' },
  ],
  openai: [
    { id: 'gpt-5.5', label: 'GPT-5.5', description: 'Frontier model for complex work.' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', description: 'Small and cost-efficient everyday model.' },
    { id: 'gpt-4o', label: 'GPT-4o', description: 'Multimodal general-purpose flagship.' },
  ],
  codex: [
    { id: 'gpt-5.6-sol', label: 'GPT-5.6-Sol', description: 'Flagship Codex model via ChatGPT Pro subscription.' },
    { id: 'gpt-5.5', label: 'GPT-5.5', description: 'Codex model via ChatGPT Pro subscription.' },
    { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', description: 'Fast and efficient via Codex.' },
  ],
  mistral: [
    { id: 'mistral-large-latest', label: 'Mistral Large', description: 'Best reasoning model from Mistral.' },
    { id: 'mistral-small-latest', label: 'Mistral Small', description: 'Efficient general-purpose model.' },
    { id: 'open-mistral-7b', label: 'Open Mistral 7B', description: 'Lightweight open model.' },
  ],
  gemini: [
    { id: 'gemini-2.0-pro', label: 'Gemini 2.0 Pro', description: 'Most capable Gemini model.' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', description: 'Fast long-context model.' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', description: 'Fast and cost-effective.' },
  ],
  minimax: [
    { id: 'MiniMax-M2.7', label: 'MiniMax M2.7', description: 'Latest flagship model.' },
    { id: 'MiniMax-M2.5', label: 'MiniMax M2.5', description: 'Strong long-horizon model.' },
    { id: 'MiniMax-M2.1', label: 'MiniMax M2.1', description: 'Balanced multilingual model.' },
  ],
  openrouter: [
    { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', description: 'Claude through OpenRouter.' },
    { id: 'openai/gpt-4o', label: 'GPT-4o', description: 'OpenAI flagship through OpenRouter.' },
    { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1', description: 'Reasoning model through OpenRouter.' },
  ],
  deepseek: [
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', description: 'Fast, cost-effective default. 1M context.' },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', description: 'Flagship, highest-capability model.' },
    { id: 'deepseek-v4-flash-vision-exp', label: 'DeepSeek V4 Flash Vision (exp)', description: 'Same as Flash, adds image understanding.' },
  ],
  opencode: [
    { id: 'claude-sonnet-4', label: 'Claude Sonnet 4', description: 'Claude via OpenCode Zen.' },
    { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', description: 'Codex via OpenCode Zen.' },
    { id: 'glm-5.1', label: 'GLM-5.1', description: 'GLM via OpenCode Zen.' },
  ],
  'z-ai': [
    { id: 'glm-5.1', label: 'GLM-5.1', description: 'Latest flagship GLM model.' },
    { id: 'glm-4.7', label: 'GLM-4.7', description: 'Long-context model.' },
    { id: 'glm-4.5', label: 'GLM-4.5', description: 'Balanced reasoning model.' },
  ],
  kimi: [
    { id: 'kimi-k3', label: 'Kimi K3', description: 'Flagship, 1M-token context, vision and reasoning.' },
    { id: 'kimi-k2.7-code', label: 'Kimi K2.7 Code', description: 'Coding specialist for long-horizon agentic work.' },
    { id: 'kimi-k2.6', label: 'Kimi K2.6', description: 'Multimodal model with vision and thinking mode.' },
  ],
  'workers-ai': [
    { id: '@cf/meta/llama-3.1-70b-instruct', label: 'Llama 3.1 70B', description: 'Edge inference via Cloudflare.' },
    { id: '@cf/deepseek-ai/deepseek-r1', label: 'DeepSeek-R1', description: 'Reasoning model at the edge.' },
    { id: '@cf/qwen/qwen2.5-coder-7b', label: 'Qwen2.5 Coder 7B', description: 'Lightweight coding model at the edge.' },
  ],
}

export function getProviderLabel(provider: string | undefined | null) {
  if (!provider) return 'Provider'
  return PROVIDER_LABELS[provider] ?? provider
}

export function getProviderModels(provider: string | undefined | null, defaultModel?: string | null): ProviderModelOption[] {
  const providerKey = provider?.toLowerCase() ?? ''
  const items = [...(PROVIDER_MODELS[providerKey] ?? [])]
  const normalizedDefault = defaultModel?.trim()
  if (normalizedDefault && !items.some((item) => item.id === normalizedDefault)) {
    items.unshift({ id: normalizedDefault, label: normalizedDefault, description: 'Configured default model.' })
  }
  return items
}
