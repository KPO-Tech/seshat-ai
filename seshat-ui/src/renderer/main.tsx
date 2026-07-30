import './styles/tokens.css'
import './styles/globals.css'
import './styles/shared.css'

import React from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import { router } from './router'
import { useUIStore } from './stores/ui'

// Apply saved theme before first paint
useUIStore.getState().applyTheme()

const root = document.getElementById('root')!
createRoot(root).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
