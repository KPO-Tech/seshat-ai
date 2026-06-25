import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Nav from './components/Nav'
import Footer from './components/Footer'
import Home from './pages/home'
import Services from './pages/services'
import Docs from './pages/docs'

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

export default function App() {
  return (
    <BrowserRouter>
      <LanguageInit />
      <Nav />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/services" element={<Services />} />
          <Route path="/fr" element={<Home />} />
          <Route path="/fr/docs" element={<Docs />} />
          <Route path="/fr/services" element={<Services />} />
        </Routes>
      </main>
      <Footer />
    </BrowserRouter>
  )
}
