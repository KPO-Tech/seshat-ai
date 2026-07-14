import { Suspense, lazy } from 'react'
import { Spin } from 'antd'
import type { ComponentType, LazyExoticComponent, ReactElement } from 'react'

export function lazyPage<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>): LazyExoticComponent<T> {
  return lazy(loader)
}

export function renderLazyPage(Page: LazyExoticComponent<ComponentType<any>>): ReactElement {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
          <Spin size="large" />
        </div>
      }
    >
      <Page />
    </Suspense>
  )
}
