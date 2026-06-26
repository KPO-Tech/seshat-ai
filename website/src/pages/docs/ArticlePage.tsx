import { lazy, Suspense } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'
import { useParams } from 'react-router-dom'
import RouteLoader from '../../components/RouteLoader'
import { findArticle } from './docs-nav'
import { useDocsMeta } from './useDocsMeta'
import ComingSoon from './ComingSoon'

type LazyDocPage = LazyExoticComponent<ComponentType>

const CONTENT: Record<string, Record<string, LazyDocPage>> = {
  'getting-started': {
    installation: lazy(() => import('./content/Installation')),
    'quick-start': lazy(() => import('./content/QuickStart')),
    configuration: lazy(() => import('./content/Configuration')),
    'first-agent': lazy(() => import('./content/FirstAgent')),
  },
  concepts: {
    'what-is-seshat': lazy(() => import('./content/WhatIsSeshat')),
    'mono-run': lazy(() => import('./content/MonoRunArchitecture')),
    'runtime-modes': lazy(() => import('./content/RuntimeModes')),
    'agent-teams': lazy(() => import('./content/AgentTeamsMailboxes')),
    'memory-rag': lazy(() => import('./content/MemoryRAG')),
    'skills-mcp': lazy(() => import('./content/SkillsMCP')),
    tools: lazy(() => import('./content/ToolsProvidersConcept')),
  },
  guides: {
    cli: lazy(() => import('./content/CLIUsage')),
  },
  sdk: {
    go: lazy(() => import('./content/GoSDK')),
    providers: lazy(() => import('./content/GoSDKProviders')),
    agent: lazy(() => import('./content/GoSDKAgent')),
    prompt: lazy(() => import('./content/GoSDKPrompt')),
    'go-tools': lazy(() => import('./content/ToolsProviders')),
    workflows: lazy(() => import('./content/BuildingWorkflows')),
    'multi-agent': lazy(() => import('./content/MultiAgentScenarios')),
    'dev-integration': lazy(() => import('./content/DeveloperIntegration')),
    'grpc-api': lazy(() => import('./content/GrpcAPI')),
    'rest-api': lazy(() => import('./content/RestAPI')),
  },
  learn: {
    'agent-runtime': lazy(() => import('./content/LearnAgentRuntime')),
    'why-go': lazy(() => import('./content/LearnWhyGo')),
    'mono-run-explained': lazy(() => import('./content/LearnMonoRunExplained')),
    'technical-hypotheses': lazy(() => import('./content/LearnTechnicalHypotheses')),
  },
}

export default function ArticlePage() {
  const { section = '', article = '' } = useParams()
  const articleMeta = findArticle(section, article)
  const Content = CONTENT[section]?.[article]

  if (articleMeta) {
    useDocsMeta(
      `${articleMeta.title} | Seshat Docs`,
      articleMeta.desc ?? `Documentation for ${articleMeta.title} in the Seshat docs.`,
    )
  }

  if (Content) {
    return (
      <Suspense fallback={<RouteLoader label="Loading documentation…" />}>
        <Content />
      </Suspense>
    )
  }

  return <ComingSoon />
}
