import { useParams } from 'react-router-dom'
import Installation from './content/Installation'
import QuickStart from './content/QuickStart'
import Configuration from './content/Configuration'
import FirstAgent from './content/FirstAgent'
import CLIUsage from './content/CLIUsage'
import ComingSoon from './ComingSoon'

const CONTENT: Record<string, Record<string, React.ReactNode>> = {
  'getting-started': {
    'installation': <Installation />,
    'quick-start': <QuickStart />,
    'configuration': <Configuration />,
    'first-agent': <FirstAgent />,
  },
  'guides': {
    'cli': <CLIUsage />,
  },
}

export default function ArticlePage() {
  const { section = '', article = '' } = useParams()
  const content = CONTENT[section]?.[article]
  if (content) return <>{content}</>
  return <ComingSoon />
}
