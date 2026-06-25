import { useParams } from 'react-router-dom'
import Installation from './content/Installation'
import ComingSoon from './ComingSoon'

const CONTENT: Record<string, Record<string, React.ReactNode>> = {
  'getting-started': {
    'installation': <Installation />,
  },
}

export default function ArticlePage() {
  const { section = '', article = '' } = useParams()
  const content = CONTENT[section]?.[article]
  if (content) return <>{content}</>
  return <ComingSoon />
}
