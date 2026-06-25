import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Nav from './components/Nav'
import Footer from './components/Footer'
import Home from './pages/home'
import Services from './pages/services'
import DocsLayout from './pages/docs/DocsLayout'
import SectionPage from './pages/docs/SectionPage'
import ArticlePage from './pages/docs/ArticlePage'
import Welcome from './pages/docs/Welcome'
import Contribution from './pages/docs/Contribution'

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

function AppShell() {
  const { pathname } = useLocation()
  const isDocs = pathname.startsWith('/docs') || pathname.startsWith('/fr/docs')

  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/docs" element={<DocsLayout />}>
          <Route index element={<Welcome />} />
          <Route path="contribution" element={<Contribution />} />
          <Route path=":section" element={<SectionPage />} />
          <Route path=":section/:article" element={<ArticlePage />} />
        </Route>
        <Route path="/fr" element={<Home />} />
        <Route path="/fr/services" element={<Services />} />
        <Route path="/fr/docs" element={<DocsLayout />}>
          <Route index element={<Welcome />} />
          <Route path="contribution" element={<Contribution />} />
          <Route path=":section" element={<SectionPage />} />
          <Route path=":section/:article" element={<ArticlePage />} />
        </Route>
      </Routes>
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
