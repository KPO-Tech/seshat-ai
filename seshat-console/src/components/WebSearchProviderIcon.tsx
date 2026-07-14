import type { ReactElement } from 'react'

type IconProps = { size?: number }

function TavilyIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#1F8A70" />
      <circle cx="18" cy="18" r="7" stroke="white" strokeWidth={2} fill="none" />
      <path d="M23 23l5 5" stroke="white" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  )
}

function ExaIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#5B3CC4" />
      <path d="M10 10l16 16M26 10L10 26" stroke="white" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  )
}

function JinaIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#C6316F" />
      <circle cx="12" cy="18" r="3" fill="white" />
      <circle cx="24" cy="18" r="3" fill="white" />
      <path d="M12 18h12" stroke="white" strokeWidth={2} strokeLinecap="round" />
    </svg>
  )
}

function LangSearchIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#2E9E5B" />
      <circle cx="16" cy="16" r="6" stroke="white" strokeWidth={2} fill="none" />
      <path d="M20.5 20.5L27 27" stroke="white" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  )
}

function SearxngIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#2B2B33" />
      <circle cx="16" cy="16" r="6" stroke="white" strokeWidth={2} fill="none" />
      <path d="M20.5 20.5L27 27" stroke="white" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx="16" cy="16" r="2" fill="white" />
    </svg>
  )
}

function DdgIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#DE5833" />
      <circle cx="18" cy="17" r="8" fill="white" />
      <circle cx="15" cy="15" r="1.4" fill="#DE5833" />
      <circle cx="21" cy="15" r="1.4" fill="#DE5833" />
      <path d="M14 20c1 1.5 2.5 2 4 2s3-0.5 4-2" stroke="#DE5833" strokeWidth={1.5} strokeLinecap="round" fill="none" />
    </svg>
  )
}

function GenericSearchIcon({ size = 36 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#54515B" />
      <circle cx="16" cy="16" r="6" stroke="white" strokeWidth={2} fill="none" />
      <path d="M20.5 20.5L27 27" stroke="white" strokeWidth={2.5} strokeLinecap="round" />
    </svg>
  )
}

const ICON_MAP: Record<string, (props: IconProps) => ReactElement> = {
  tavily: TavilyIcon,
  exa: ExaIcon,
  jina: JinaIcon,
  langsearch: LangSearchIcon,
  searxng: SearxngIcon,
  ddg: DdgIcon,
}

export function WebSearchProviderIcon({ provider, size = 36 }: IconProps & { provider: string }) {
  const Icon = ICON_MAP[provider.toLowerCase()] ?? GenericSearchIcon
  return <Icon size={size} />
}
