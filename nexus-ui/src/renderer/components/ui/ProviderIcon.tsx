import React from 'react'

type Props = { size?: number; className?: string }

export function AnthropicIcon({ size = 36, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" className={className}>
      <rect width="36" height="36" rx="9" fill="#D97757" />
      <path
        d="M20.83 9h-3.2L11 27h3.6l1.1-3.2h5.8l1.1 3.2H26L20.83 9zm-4.3 11.4L19.23 13l2.7 7.4h-5.4z"
        fill="white"
      />
    </svg>
  )
}

export function OpenAIIcon({ size = 36, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" className={className}>
      <rect width="36" height="36" rx="9" fill="#10A37F" />
      <path
        d="M26.4 15.1a6.5 6.5 0 0 0-.56-5.34 6.57 6.57 0 0 0-7.07-3.15A6.57 6.57 0 0 0 13.8 4.6a6.57 6.57 0 0 0-6.26 4.55 6.57 6.57 0 0 0-4.38 3.18 6.63 6.63 0 0 0 .82 7.76 6.57 6.57 0 0 0 .56 5.35 6.57 6.57 0 0 0 7.07 3.15 6.55 6.55 0 0 0 4.95 2.01 6.57 6.57 0 0 0 6.26-4.56 6.57 6.57 0 0 0 4.38-3.17 6.63 6.63 0 0 0-.8-7.77zm-9.78 13.7a4.87 4.87 0 0 1-3.13-1.13l.15-.09 5.2-3.01a.86.86 0 0 0 .43-.75v-7.34l2.2 1.27a.08.08 0 0 1 .04.06v6.08a4.9 4.9 0 0 1-4.89 4.9zm-10.5-4.5a4.88 4.88 0 0 1-.58-3.28l.15.1 5.2 3a.86.86 0 0 0 .86 0l6.35-3.67v2.54a.09.09 0 0 1-.03.07l-5.26 3.04a4.9 4.9 0 0 1-6.69-1.8zm-1.36-11.38a4.88 4.88 0 0 1 2.55-2.15v6.18a.86.86 0 0 0 .43.75l6.35 3.66-2.2 1.27a.08.08 0 0 1-.08 0L6.6 19.4a4.9 4.9 0 0 1-.84-6.49zm18.04 4.2L16.5 13.46l2.2-1.27a.08.08 0 0 1 .08 0l5.2 3.01a4.9 4.9 0 0 1-.76 8.83V17.8a.86.86 0 0 0-.43-.75zm2.19-3.3-.16-.1-5.2-3a.86.86 0 0 0-.86 0l-6.35 3.67v-2.54a.09.09 0 0 1 .03-.07l5.26-3.04a4.9 4.9 0 0 1 7.28 5.08zm-13.74 4.52-2.2-1.27a.08.08 0 0 1-.04-.06v-6.08a4.9 4.9 0 0 1 8.03-3.76l-.16.09-5.2 3a.86.86 0 0 0-.43.75v7.33zm1.19-2.58 2.83-1.63 2.83 1.63v3.26l-2.83 1.63-2.83-1.63v-3.26z"
        fill="white"
      />
    </svg>
  )
}

export function MistralIcon({ size = 36, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" className={className}>
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

export function GeminiIcon({ size = 36, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" className={className}>
      <rect width="36" height="36" rx="9" fill="#4285F4" />
      <path
        d="M18 4C18 4 20.5 12.5 28 18C20.5 23.5 18 32 18 32C18 32 15.5 23.5 8 18C15.5 12.5 18 4 18 4Z"
        fill="white"
      />
    </svg>
  )
}

export function OllamaIcon({ size = 36, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" className={className}>
      <rect width="36" height="36" rx="9" fill="#1A1A2E" />
      <circle cx="13" cy="14" r="3" fill="white" />
      <circle cx="23" cy="14" r="3" fill="white" />
      <path
        d="M10 20c0 0 2 6 8 6s8-6 8-6"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="13" cy="14" r="1.2" fill="#1A1A2E" />
      <circle cx="23" cy="14" r="1.2" fill="#1A1A2E" />
    </svg>
  )
}

export function OpenRouterIcon({ size = 36, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" className={className}>
      <rect width="36" height="36" rx="9" fill="#6B39CB" />
      <path
        d="M8 13h12l-4-4M20 13l-4 4"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M28 23H16l4 4M16 23l4-4"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function MiniMaxIcon({ size = 36, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" className={className}>
      <rect width="36" height="36" rx="9" fill="#0D1B2A" />
      <path
        d="M8 26V10l6 10 4-6 4 6 6-10v16"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function ZAiIcon({ size = 36, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" className={className}>
      <rect width="36" height="36" rx="9" fill="#1E3A5F" />
      <path
        d="M8 10h20L11 26h17"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function CodexIcon({ size = 36, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" className={className}>
      <rect width="36" height="36" rx="9" fill="#0D1117" />
      <path d="M10 14l-4 4 4 4" stroke="#3FB950" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M26 14l4 4-4 4" stroke="#3FB950" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 10l-6 16" stroke="#58A6FF" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function GenericProviderIcon({ size = 36, className }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" className={className}>
      <rect width="36" height="36" rx="9" fill="#54515B" />
      <circle cx="18" cy="18" r="6" stroke="white" strokeWidth="2" fill="none" />
      <path d="M18 9v4M18 23v4M9 18h4M23 18h4" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

const ICON_MAP: Record<string, (props: Props) => React.ReactElement> = {
  anthropic: AnthropicIcon,
  openai: OpenAIIcon,
  codex: CodexIcon,
  mistral: MistralIcon,
  gemini: GeminiIcon,
  ollama: OllamaIcon,
  openrouter: OpenRouterIcon,
  minimax: MiniMaxIcon,
  'z-ai': ZAiIcon,
}

export function ProviderIcon({ provider, size = 36, className }: Props & { provider: string }) {
  const Icon = ICON_MAP[provider.toLowerCase()] ?? GenericProviderIcon
  return <Icon size={size} className={className} />
}
