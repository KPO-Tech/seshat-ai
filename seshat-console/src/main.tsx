import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, App as AntApp } from 'antd'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import { consoleTheme } from '@/theme/tokens'
import { queryClient } from '@/api/queryClient'
import { router } from '@/routes/router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider theme={consoleTheme}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
)
