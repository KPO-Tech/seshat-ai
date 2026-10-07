import { MemoryRouter } from 'react-router-dom'
import AppServer from './AppServer'
export { PRERENDER_ROUTES, getLocaleFromPath, getRouteMeta } from './seo/routeMeta'

export function createServerApp(url: string) {
  return (
    <MemoryRouter initialEntries={[url]}>
      <AppServer />
    </MemoryRouter>
  )
}
