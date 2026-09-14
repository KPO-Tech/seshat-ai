import type { ReactNode } from 'react'
import { NexusLogo } from '@/components/NexusLogo'
import { Titlebar } from '@/components/layout/Titlebar'

type Props = {
  children: ReactNode
  title: string
  subtitle: string
}

export function AuthLayout({ children, title, subtitle }: Props) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Titlebar center="SeshatOS" />
      <div className="flex min-h-0 flex-1 overflow-hidden bg-app-bg">
        <div className="hidden w-[42%] min-w-80 max-w-[560px] shrink-0 flex-col items-center justify-center border-r border-app-border bg-app-surface px-[39px] py-[45px] min-[721px]:flex min-[1400px]:w-[44%] min-[1400px]:max-w-[680px]">
          <div className="flex w-full max-w-[340px] flex-col items-center gap-[21px] text-center">
            <NexusLogo size={66} />

            <div>
              <div className="mb-2.5 text-[19px] font-bold text-app-text">SeshatOS</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-app-primary">
                AI Agent Runtime
              </div>
            </div>

            <div className="h-px w-7 bg-app-border" />

            <p className="m-0 max-w-[260px] text-xs leading-[1.8] text-app-text-secondary">
              Orchestrate teams of AI agents to plan, delegate and execute complex missions.
            </p>

            <div className="mx-auto flex max-w-[260px] flex-col gap-2.5 self-stretch">
              {[
                'Multi-agent orchestration',
                'Persistent workspaces',
                'Autonomous execution',
              ].map((feat) => (
                <div key={feat} className="flex items-center gap-[9px]">
                  <div className="size-[5px] shrink-0 rounded-full bg-[var(--color-accent)]" />
                  <span className="text-[11px] tracking-[0.01em] text-app-text-muted">{feat}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-y-auto bg-app-bg px-3.5 py-[22px] min-[721px]:px-[22px] min-[721px]:py-[34px]">
          <div className="w-full max-w-[440px] animate-[fade-in_0.2s_ease-out]">
            <div className="mb-8 text-center">
              <h1 className="m-0 mb-2 text-[21px] font-bold tracking-[-0.3px] text-app-primary">{title}</h1>
              <p className="m-0 text-xs leading-normal text-app-text-secondary">{subtitle}</p>
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
