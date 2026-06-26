import { useParams } from 'react-router-dom'
import Installation from './content/Installation'
import QuickStart from './content/QuickStart'
import Configuration from './content/Configuration'
import FirstAgent from './content/FirstAgent'
import CLIUsage from './content/CLIUsage'
import WhatIsSeshat from './content/WhatIsSeshat'
import MonoRunArchitecture from './content/MonoRunArchitecture'
import RuntimeModes from './content/RuntimeModes'
import AgentTeamsMailboxes from './content/AgentTeamsMailboxes'
import MemoryRAG from './content/MemoryRAG'
import SkillsMCP from './content/SkillsMCP'
import ToolsProvidersConcept from './content/ToolsProvidersConcept'
import ToolsProviders from './content/ToolsProviders'
import GoSDK from './content/GoSDK'
import GoSDKProviders from './content/GoSDKProviders'
import GoSDKAgent from './content/GoSDKAgent'
import GoSDKPrompt from './content/GoSDKPrompt'
import GrpcAPI from './content/GrpcAPI'
import ComingSoon from './ComingSoon'

const CONTENT: Record<string, Record<string, React.ReactNode>> = {
  'getting-started': {
    'installation': <Installation />,
    'quick-start': <QuickStart />,
    'configuration': <Configuration />,
    'first-agent': <FirstAgent />,
  },
  'concepts': {
    'what-is-seshat': <WhatIsSeshat />,
    'mono-run': <MonoRunArchitecture />,
    'runtime-modes': <RuntimeModes />,
    'agent-teams': <AgentTeamsMailboxes />,
    'memory-rag': <MemoryRAG />,
    'skills-mcp': <SkillsMCP />,
    'tools': <ToolsProvidersConcept />,
  },
  'guides': {
    'cli': <CLIUsage />,
  },
  'sdk': {
    'go': <GoSDK />,
    'providers': <GoSDKProviders />,
    'agent': <GoSDKAgent />,
    'prompt': <GoSDKPrompt />,
    'prompt-agent': <GoSDKAgent />,
    'go-tools': <ToolsProviders />,
    'grpc-api': <GrpcAPI />,
  },
}

export default function ArticlePage() {
  const { section = '', article = '' } = useParams()
  const content = CONTENT[section]?.[article]
  if (content) return <>{content}</>
  return <ComingSoon />
}
