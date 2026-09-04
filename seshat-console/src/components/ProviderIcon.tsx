import type { ReactElement } from 'react'

type IconProps = { size?: number }

function AnthropicIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#D97757" />
      <path
        d="M20.83 9h-3.2L11 27h3.6l1.1-3.2h5.8l1.1 3.2H26L20.83 9zm-4.3 11.4L19.23 13l2.7 7.4h-5.4z"
        fill="white"
      />
    </svg>
  )
}

function OpenAIIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#10A37F" />
      <path
        d="M26.4 15.1a6.5 6.5 0 0 0-.56-5.34 6.57 6.57 0 0 0-7.07-3.15A6.57 6.57 0 0 0 13.8 4.6a6.57 6.57 0 0 0-6.26 4.55 6.57 6.57 0 0 0-4.38 3.18 6.63 6.63 0 0 0 .82 7.76 6.57 6.57 0 0 0 .56 5.35 6.57 6.57 0 0 0 7.07 3.15 6.55 6.55 0 0 0 4.95 2.01 6.57 6.57 0 0 0 6.26-4.56 6.57 6.57 0 0 0 4.38-3.17 6.63 6.63 0 0 0-.8-7.77zm-9.78 13.7a4.87 4.87 0 0 1-3.13-1.13l.15-.09 5.2-3.01a.86.86 0 0 0 .43-.75v-7.34l2.2 1.27a.08.08 0 0 1 .04.06v6.08a4.9 4.9 0 0 1-4.89 4.9zm-10.5-4.5a4.88 4.88 0 0 1-.58-3.28l.15.1 5.2 3a.86.86 0 0 0 .86 0l6.35-3.67v2.54a.09.09 0 0 1-.03.07l-5.26 3.04a4.9 4.9 0 0 1-6.69-1.8zm-1.36-11.38a4.88 4.88 0 0 1 2.55-2.15v6.18a.86.86 0 0 0 .43.75l6.35 3.66-2.2 1.27a.08.08 0 0 1-.08 0L6.6 19.4a4.9 4.9 0 0 1-.84-6.49zm18.04 4.2L16.5 13.46l2.2-1.27a.08.08 0 0 1 .08 0l5.2 3.01a4.9 4.9 0 0 1-.76 8.83V17.8a.86.86 0 0 0-.43-.75zm2.19-3.3-.16-.1-5.2-3a.86.86 0 0 0-.86 0l-6.35 3.67v-2.54a.09.09 0 0 1 .03-.07l5.26-3.04a4.9 4.9 0 0 1 7.28 5.08zm-13.74 4.52-2.2-1.27a.08.08 0 0 1-.04-.06v-6.08a4.9 4.9 0 0 1 8.03-3.76l-.16.09-5.2 3a.86.86 0 0 0-.43.75v7.33zm1.19-2.58 2.83-1.63 2.83 1.63v3.26l-2.83 1.63-2.83-1.63v-3.26z"
        fill="white"
      />
    </svg>
  )
}

function CodexIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#0B6B5C" />
      <path d="M12 11 6 18l6 7" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <path d="m24 11 6 7-6 7" stroke="white" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      <path d="m20.5 9-5 18" stroke="#9FF5DE" strokeWidth={2.4} strokeLinecap="round" />
    </svg>
  )
}

function MistralIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#EF7C2F" />
      <rect x="7" y="7" width="6" height="6" fill="white" />
      <rect x="23" y="7" width="6" height="6" fill="white" />
      <rect x="15" y="7" width="6" height="6" fill="#EF7C2F" />
      <rect x="7" y="15" width="6" height="6" fill="white" />
      <rect x="15" y="15" width="6" height="6" fill="white" />
      <rect x="23" y="15" width="6" height="6" fill="white" />
      <rect x="7" y="23" width="6" height="6" fill="white" />
      <rect x="15" y="23" width="6" height="6" fill="#EF7C2F" />
      <rect x="23" y="23" width="6" height="6" fill="white" />
    </svg>
  )
}

function DeepSeekIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#2563EB" />
      <path
        d="M8 19c0-5.2 4.1-9.5 9.5-9.5 4.9 0 8.9 3.5 9.4 8.1l3.1.8-3.3 2.4c-.9 3.7-4.3 6.7-9.2 6.7C12.1 27.5 8 24.2 8 19Z"
        fill="white"
      />
      <path
        d="M13.5 18.4c1.4 1.7 3.2 2.5 5.4 2.5 2 0 3.8-.6 5.3-1.9"
        stroke="#2563EB"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle cx="14.2" cy="15.6" r="1.4" fill="#2563EB" />
    </svg>
  )
}

function GeminiIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#4285F4" />
      <path d="M18 4C18 4 20.5 12.5 28 18C20.5 23.5 18 32 18 32C18 32 15.5 23.5 8 18C15.5 12.5 18 4 18 4Z" fill="white" />
    </svg>
  )
}

function KimiIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#111827" />
      <circle cx="18" cy="18" r="11" fill="#F5F2EC" />
      <circle cx="15.5" cy="15.5" r="11" fill="#111827" />
      <path d="M12 24V12M12 18l8-6M15.4 17.1 24 24" stroke="#F5F2EC" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function OllamaIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#1A1A2E" />
      <circle cx="13" cy="14" r="3" fill="white" />
      <circle cx="23" cy="14" r="3" fill="white" />
      <path d="M10 20c0 0 2 6 8 6s8-6 8-6" stroke="white" strokeWidth={2} strokeLinecap="round" fill="none" />
      <circle cx="13" cy="14" r="1.2" fill="#1A1A2E" />
      <circle cx="23" cy="14" r="1.2" fill="#1A1A2E" />
    </svg>
  )
}

function OpenCodeZenIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#7C3AED" />
      <path d="M11 13c2.1-2.2 4.4-3.3 7-3.3s4.9 1.1 7 3.3" stroke="white" strokeWidth={2.2} strokeLinecap="round" />
      <path d="M11 23c2.1 2.2 4.4 3.3 7 3.3s4.9-1.1 7-3.3" stroke="white" strokeWidth={2.2} strokeLinecap="round" />
      <path d="M10 18h16" stroke="#D8B4FE" strokeWidth={2.2} strokeLinecap="round" />
      <path d="m15 14-3.8 4 3.8 4M21 14l3.8 4-3.8 4" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function OpenRouterIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#6B39CB" />
      <path d="M8 13h12l-4-4M20 13l-4 4" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28 23H16l4 4M16 23l4-4" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function WorkersAIIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#F38020" />
      <path d="M9 22.5c.7-3.5 3.1-5.6 6.4-5.6 2.4 0 4.2.9 5.4 2.7 1-.7 2.1-1 3.3-1 2.4 0 4 1.4 4.9 3.9H9Z" fill="white" />
      <path d="M11.8 16.8c1.3-3 3.6-4.7 6.8-4.7 3.5 0 6 1.9 7.3 5.4-.6-.2-1.2-.3-1.9-.3-1.1 0-2.1.3-3 .8-1.4-1.6-3.2-2.4-5.6-2.4-1.3 0-2.5.4-3.6 1.2Z" fill="#FFF3E6" />
      <path d="M13 24h10M16 27h7" stroke="#7C2D12" strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

function MiniMaxIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#0D1B2A" />
      <path d="M8 26V10l6 10 4-6 4 6 6-10v16" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function ZAiIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#1E3A5F" />
      <path d="M8 10h20L11 26h17" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

// Foundry/Bedrock/Vertex were missing from this map entirely - not just a
// style mismatch like the other icons below, but a real gap: Foundry is
// one of the 13 providers this page actually renders (its "Azure AI
// Foundry" card fell through to GenericProviderIcon's plain gray circle
// instead of a branded icon), and Bedrock/Vertex are one filter-condition
// change away from showing up here too (both apps currently exclude them
// via the same oauth/aws/gcp authType filter - see ProviderSettingsPage.tsx).
// Copied from seshat-ui's own ProviderIcon.tsx (components/ui/ProviderIcon.tsx)
// for exact visual parity between the two apps' Admin Consoles, matching
// the same reasoning shared/connector-catalog was built for.
function FoundryIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#0078D4" />
      <path d="M15 8h6l7 20h-6.2l-1.4-4.4h-5l-1.4 4.4H8L15 8zm1 12h4l-2-6.4L16 20z" fill="white" />
    </svg>
  )
}

function BedrockIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#232F3E" />
      <path d="M9 24V13l9-5 9 5v11l-9 5-9-5z" stroke="#FF9900" strokeWidth={2} strokeLinejoin="round" fill="none" />
      <path d="M9 13l9 5 9-5M18 18v11" stroke="#FF9900" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  )
}

function VertexIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#1A73E8" />
      <path d="M18 7l9 15.6H9L18 7z" fill="white" />
      <circle cx="18" cy="24" r="2.4" fill="#1A73E8" />
    </svg>
  )
}

function GenericProviderIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#54515B" />
      <circle cx="18" cy="18" r="6" stroke="white" strokeWidth={2} fill="none" />
      <path d="M18 9v4M18 23v4M9 18h4M23 18h4" stroke="white" strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

const ICON_MAP: Record<string, (props: IconProps) => ReactElement> = {
  anthropic: AnthropicIcon,
  openai: OpenAIIcon,
  codex: CodexIcon,
  mistral: MistralIcon,
  gemini: GeminiIcon,
  ollama: OllamaIcon,
  openrouter: OpenRouterIcon,
  minimax: MiniMaxIcon,
  'z-ai': ZAiIcon,
  deepseek: DeepSeekIcon,
  opencode: OpenCodeZenIcon,
  kimi: KimiIcon,
  foundry: FoundryIcon,
  'workers-ai': WorkersAIIcon,
  bedrock: BedrockIcon,
  vertex: VertexIcon,
}

export function ProviderIcon({ provider, size = 36 }: IconProps & { provider: string }) {
  const Icon = ICON_MAP[provider.toLowerCase()] ?? GenericProviderIcon
  return <Icon size={size} />
}
