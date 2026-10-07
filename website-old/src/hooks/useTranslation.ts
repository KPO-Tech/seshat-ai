import { useLocation } from 'react-router-dom'
import { en } from '../i18n/en'
import { fr } from '../i18n/fr'

export function useTranslation() {
  const { pathname } = useLocation()
  const lang = pathname.startsWith('/fr') ? 'fr' : 'en'
  const t = lang === 'fr' ? fr : en
  const linkTo = (path: string) =>
    lang === 'fr' ? `/fr${path === '/' ? '' : path}` : path
  return { t, lang, linkTo }
}
