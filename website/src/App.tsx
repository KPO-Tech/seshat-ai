import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import RouteLoader from './components/RouteLoader'
import Nav from './components/Nav'
import Footer from './components/Footer'

const Home = lazy(() => import('./pages/home'))
const Services = lazy(() => import('./pages/services'))
const OpenSource = lazy(() => import('./pages/open-source'))
const DocsLayout = lazy(() => import('./pages/docs/DocsLayout'))
const SectionPage = lazy(() => import('./pages/docs/SectionPage'))
const ArticlePage = lazy(() => import('./pages/docs/ArticlePage'))
const Welcome = lazy(() => import('./pages/docs/Welcome'))
const Contribution = lazy(() => import('./pages/docs/Contribution'))

function LanguageInit() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    const stored = localStorage.getItem('seshat-lang')
    if (stored) return
    const isFrench = (navigator.language ?? '').toLowerCase().startsWith('fr')
    if (isFrench && !pathname.startsWith('/fr')) {
      navigate('/fr' + (pathname === '/' ? '' : pathname), { replace: true })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

export function AppShell() {
  const { pathname } = useLocation()
  const isDocs = pathname.startsWith('/docs') || pathname.startsWith('/fr/docs')

  return (
    <>
      <Nav />
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Services />} />
          <Route path="/open-source" element={<OpenSource />} />
          <Route path="/docs" element={<DocsLayout />}>
            <Route index element={<Welcome />} />
            <Route path="contribution" element={<Contribution />} />
            <Route path=":section" element={<SectionPage />} />
            <Route path=":section/:article" element={<ArticlePage />} />
          </Route>
          <Route path="/fr" element={<Home />} />
          <Route path="/fr/services" element={<Services />} />
          <Route path="/fr/open-source" element={<OpenSource />} />
          <Route path="/fr/docs" element={<DocsLayout />}>
            <Route index element={<Welcome />} />
            <Route path="contribution" element={<Contribution />} />
            <Route path=":section" element={<SectionPage />} />
            <Route path=":section/:article" element={<ArticlePage />} />
          </Route>
        </Routes>
      </Suspense>
      {!isDocs && <Footer />}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <LanguageInit />
      <AppShell />
    </BrowserRouter>
  )
}
