import { Routes, Route, useLocation } from 'react-router-dom'
import Nav from './components/Nav'
import Footer from './components/Footer'
import Home from './pages/home'
import Services from './pages/services'
import OpenSource from './pages/open-source'
import DocsLayout from './pages/docs/DocsLayout'
import SectionPage from './pages/docs/SectionPage'
import ArticlePageServer from './pages/docs/ArticlePageServer'
import Welcome from './pages/docs/Welcome'
import Contribution from './pages/docs/Contribution'

export default function AppServer() {
  const { pathname } = useLocation()
  const isDocs = pathname.startsWith('/docs') || pathname.startsWith('/fr/docs')

  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/services" element={<Services />} />
        <Route path="/open-source" element={<OpenSource />} />
        <Route path="/docs" element={<DocsLayout />}>
          <Route index element={<Welcome />} />
          <Route path="contribution" element={<Contribution />} />
          <Route path=":section" element={<SectionPage />} />
          <Route path=":section/:article" element={<ArticlePageServer />} />
        </Route>
        <Route path="/fr" element={<Home />} />
        <Route path="/fr/services" element={<Services />} />
        <Route path="/fr/open-source" element={<OpenSource />} />
        <Route path="/fr/docs" element={<DocsLayout />}>
          <Route index element={<Welcome />} />
          <Route path="contribution" element={<Contribution />} />
          <Route path=":section" element={<SectionPage />} />
          <Route path=":section/:article" element={<ArticlePageServer />} />
        </Route>
      </Routes>
      {!isDocs && <Footer />}
    </>
  )
}
