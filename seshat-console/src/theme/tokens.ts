import type { ThemeConfig } from 'antd'

// A calmer, less "stock Ant Design blue" palette for a console that will be
// stared at for monitoring/configuration, not a marketing surface — same
// spirit as Casdoor's own shadcnTheme.js reskin, our own values.
export const consoleTheme: ThemeConfig = {
  token: {
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif",
    colorPrimary: '#1f7a70',
    colorInfo: '#1f7a70',
    colorLink: '#1f7a70',
    borderRadius: 6,
    colorTextBase: '#14201f',
    colorBgBase: '#ffffff',
  },
  components: {
    Layout: {
      siderBg: '#0f1714',
      headerBg: '#ffffff',
    },
    Menu: {
      darkItemBg: '#0f1714',
      darkSubMenuItemBg: '#0f1714',
    },
  },
}
