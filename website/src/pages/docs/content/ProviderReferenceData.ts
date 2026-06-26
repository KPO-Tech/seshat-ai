export type ProviderRow = {
  id: string
  label: string
  auth: string
  transport: string
  base: string
  notes: string
}

export type CapabilityRow = {
  capability: string
  providers: string
  configPath: string
  notes: string
}

export type ProviderSetupRow = {
  provider: string
  authFlow: string
  envVars: string
  configKeys: string
  notes: string
}

export const PROVIDERS: ProviderRow[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    auth: 'API key',
    transport: 'Anthropic Messages API',
    base: 'https://api.anthropic.com',
    notes: 'Direct Claude provider. Prompt caching and structured output are first-class here, and DefaultConfigs() ships Claude-oriented aliases like sonnet and haiku.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    auth: 'API key',
    transport: 'OpenAI-compatible /chat/completions',
    base: 'https://api.openai.com/v1',
    notes: 'Primary GPT path. Also reused by the current image generation, text-to-speech, and speech-to-text capability providers.',
  },
  {
    id: 'ollama',
    label: 'Ollama',
    auth: 'None by default',
    transport: 'Local /api/chat',
    base: 'http://localhost:11434',
    notes: 'Local inference path. Models are discovered dynamically from the local daemon rather than from a static registry list.',
  },
  {
    id: 'bedrock',
    label: 'AWS Bedrock',
    auth: 'AWS credentials',
    transport: 'Anthropic-shaped Claude path via AWS',
    base: 'Region-driven integration',
    notes: 'Used for Claude through AWS. Runtime validation expects AWS region configuration before the provider can be used safely.',
  },
  {
    id: 'vertex',
    label: 'Vertex AI',
    auth: 'GCP project + region',
    transport: 'Anthropic-shaped Claude path via GCP',
    base: 'Project and region derived',
    notes: 'Used for Claude on Google Cloud. Requires ANTHROPIC_VERTEX_PROJECT_ID and CLOUD_ML_REGION.',
  },
  {
    id: 'foundry',
    label: 'Azure AI Foundry',
    auth: 'API key + resource header',
    transport: 'Anthropic-shaped Claude path via Azure',
    base: 'https://your-resource.services.ai.azure.com/anthropic/v1',
    notes: 'Azure-hosted Claude path. The runtime sets the Foundry resource header when configured.',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    auth: 'API key',
    transport: 'Gemini generateContent API',
    base: 'https://generativelanguage.googleapis.com/v1beta',
    notes: 'Very large context window path with audio-capable models. Current capability-provider options include Gemini for image generation.',
  },
  {
    id: 'z-ai',
    label: 'Z.ai',
    auth: 'x-api-key',
    transport: 'OpenAI-compatible body + custom auth header',
    base: 'https://api.z.ai/api/paas/v4',
    notes: 'GLM provider. The current client forces streaming for Z.ai requests and ships aliases such as glm-5 and glm-4.5.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    auth: 'API key',
    transport: 'OpenAI-compatible /chat/completions',
    base: 'https://openrouter.ai/api/v1',
    notes: 'Routing hub for multi-vendor models. Good fit when users want one key spanning Claude, GPT, DeepSeek, Qwen, or Llama families.',
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    auth: 'API key',
    transport: 'MiniMax chatcompletion_v2 endpoint',
    base: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
    notes: 'Long-output provider with strong multilingual and long-horizon positioning in the provider registry.',
  },
  {
    id: 'workers-ai',
    label: 'Workers AI',
    auth: 'API key',
    transport: 'Edge chat route with provider-specific model pathing',
    base: 'https://workers.ai/v1/chat',
    notes: 'Cloudflare edge inference path. Model identifiers are route-style ids such as @cf/meta/llama-3.1-70b-instruct.',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    auth: 'API key',
    transport: 'OpenAI-compatible /chat/completions',
    base: 'https://api.mistral.ai/v1',
    notes: 'Direct Mistral provider with familiar OpenAI-compatible transport for the runtime.',
  },
  {
    id: 'codex',
    label: 'Codex',
    auth: 'OAuth device flow',
    transport: 'OpenAI Responses API /responses',
    base: 'https://chatgpt.com/backend-api/codex',
    notes: 'Special path. Codex uses ChatGPT Pro OAuth, always streams, sends Codex-specific headers, and keeps a dedicated cookie jar for chatgpt.com / Cloudflare flows.',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    auth: 'API key',
    transport: 'OpenAI-compatible /chat/completions',
    base: 'https://api.deepseek.com/v1',
    notes: 'Direct DeepSeek path with chat and reasoner aliases in DefaultConfigs().',
  },
  {
    id: 'opencode',
    label: 'OpenCode Zen',
    auth: 'API key',
    transport: 'OpenAI-compatible /chat/completions',
    base: 'https://opencode.ai/zen/v1',
    notes: 'Curated gateway exposing Claude, Codex, and GLM-style models behind one provider id.',
  },
  {
    id: 'kimi',
    label: 'Kimi (Moonshot AI)',
    auth: 'API key',
    transport: 'OpenAI-compatible target expected',
    base: 'No default base URL block in DefaultConfigs()',
    notes: 'Kimi exists in the provider registry and string resolver, but internal/providers/config.go does not currently ship a matching default config entry. Treat it as partially wired until that gap is closed.',
  },
]

export const CAPABILITY_ROWS: CapabilityRow[] = [
  {
    capability: 'Core reasoning',
    providers: 'Anthropic, OpenAI, Ollama, Bedrock, Vertex, Foundry, Gemini, Z.ai, OpenRouter, MiniMax, Workers AI, Mistral, Codex, DeepSeek, OpenCode, Kimi',
    configPath: 'ClientConfig.Model + ProviderConfig',
    notes: 'This is the main session model path used by the mono-run loop.',
  },
  {
    capability: 'Image generation',
    providers: 'OpenAI, Gemini',
    configPath: 'ClientConfig.ImageGeneration',
    notes: 'Current TUI capability picker exposes OpenAI and Gemini for generate_image.',
  },
  {
    capability: 'Text to speech',
    providers: 'OpenAI',
    configPath: 'ClientConfig.TextToSpeech',
    notes: 'Current runtime wiring only initialises OpenAI for text_to_speech.',
  },
  {
    capability: 'Speech to text',
    providers: 'OpenAI',
    configPath: 'ClientConfig.SpeechToText',
    notes: 'Current runtime wiring only initialises OpenAI for speech_to_text.',
  },
]

export const PROVIDER_SETUP_ROWS: ProviderSetupRow[] = [
  {
    provider: 'anthropic',
    authFlow: 'API key',
    envVars: 'ANTHROPIC_API_KEY',
    configKeys: 'ClientConfig.APIKey or ProviderConfig.APIKey',
    notes: 'Direct Claude path. Provider config also supports alias mapping and routing setup.',
  },
  {
    provider: 'openai',
    authFlow: 'API key',
    envVars: 'OPENAI_API_KEY',
    configKeys: 'ClientConfig.APIKey or ProviderConfig.APIKey',
    notes: 'Also reused by current image, TTS, and STT capability providers when configured.',
  },
  {
    provider: 'ollama',
    authFlow: 'Usually none',
    envVars: 'OLLAMA_HOST, optional OLLAMA_API_KEY',
    configKeys: 'ProviderConfig.BaseURL or detected local host',
    notes: 'Local daemon path. Runtime discovery checks OLLAMA_HOST and localhost defaults.',
  },
  {
    provider: 'bedrock',
    authFlow: 'AWS credentials',
    envVars: 'AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION',
    configKeys: 'ProviderConfig.Region',
    notes: 'Validation explicitly requires AWS_REGION. Transport derives the rest from AWS auth state.',
  },
  {
    provider: 'vertex',
    authFlow: 'GCP project + region',
    envVars: 'ANTHROPIC_VERTEX_PROJECT_ID, CLOUD_ML_REGION',
    configKeys: 'ProviderConfig.ProjectID, ProviderConfig.Region',
    notes: 'Claude-on-GCP path. Validation fails until both project id and region are present.',
  },
  {
    provider: 'foundry',
    authFlow: 'API key + Azure resource',
    envVars: 'ANTHROPIC_FOUNDRY_API_KEY, ANTHROPIC_FOUNDRY_BASE_URL, ANTHROPIC_FOUNDRY_RESOURCE',
    configKeys: 'ProviderConfig.APIKey, BaseURL, Region',
    notes: 'Uses Azure-style api-key auth plus the Foundry resource header when configured.',
  },
  {
    provider: 'gemini',
    authFlow: 'API key',
    envVars: 'GOOGLE_API_KEY for auth resolution; GOOGLE_GEMINI_API_KEY appears in validation messages',
    configKeys: 'ClientConfig.APIKey or ProviderConfig.APIKey',
    notes: 'There is a current naming mismatch in code between auth resolution and validation messaging, worth normalizing later.',
  },
  {
    provider: 'z-ai',
    authFlow: 'x-api-key',
    envVars: 'Z_AI_API_KEY',
    configKeys: 'ProviderConfig.APIKey',
    notes: 'OpenAI-compatible body format, but auth headers are provider-specific.',
  },
  {
    provider: 'openrouter',
    authFlow: 'API key',
    envVars: 'OPENROUTER_API_KEY',
    configKeys: 'ProviderConfig.APIKey',
    notes: 'Useful as a one-key routing layer across many vendors.',
  },
  {
    provider: 'minimax',
    authFlow: 'API key',
    envVars: 'MINIMAX_API_KEY',
    configKeys: 'ProviderConfig.APIKey',
    notes: 'Default config maps MiniMax aliases and long-output models.',
  },
  {
    provider: 'workers-ai',
    authFlow: 'API key',
    envVars: 'CLOUDFLARE_API_KEY',
    configKeys: 'ProviderConfig.APIKey',
    notes: 'Model ids are route-style Cloudflare identifiers.',
  },
  {
    provider: 'mistral',
    authFlow: 'API key',
    envVars: 'MISTRAL_API_KEY',
    configKeys: 'ProviderConfig.APIKey',
    notes: 'OpenAI-compatible transport with Mistral-specific base URL.',
  },
  {
    provider: 'codex',
    authFlow: 'OAuth device flow or CODEX_ACCESS_TOKEN / CODEX_API_KEY override',
    envVars: 'CODEX_ACCESS_TOKEN, CODEX_API_KEY, optional OPENAI_CLIENT_ID, optional SESHAT_AUTH_PATH',
    configKeys: 'OAuth token persisted in ~/.seshat/auth.json or explicit ProviderConfig.APIKey',
    notes: 'Special login path. Runtime can resolve refreshed OAuth tokens from the local auth store or reuse an explicit bearer token.',
  },
  {
    provider: 'deepseek',
    authFlow: 'API key',
    envVars: 'DEEPSEEK_API_KEY',
    configKeys: 'ProviderConfig.APIKey',
    notes: 'OpenAI-compatible direct provider with chat/reasoner aliases.',
  },
  {
    provider: 'opencode',
    authFlow: 'API key',
    envVars: 'OPENCODE_API_KEY',
    configKeys: 'ProviderConfig.APIKey',
    notes: 'Gateway provider exposing curated Claude, Codex, and GLM options.',
  },
  {
    provider: 'kimi',
    authFlow: 'API key',
    envVars: 'No dedicated env mapping in providerEnvVar today',
    configKeys: 'Would require explicit ProviderConfig/API key wiring',
    notes: 'Provider registry support exists, but the default config/auth wiring is still incomplete compared to the others.',
  },
]
