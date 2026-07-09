import type { ThemeConfig } from 'antd'

// ─── Palette ────────────────────────────────────────────────────────────────
// A deliberate palette, not stock Ant Design blue: deep jade as the single
// accent, a sage-tinted (not pure white) canvas, and a permanently dark
// sidebar — a chosen identity (à la Linear/Vercel), not a light/dark toggle.
export const palette = {
  ink: '#101915',
  inkSecondary: '#48594f',
  inkTertiary: '#8a9a90',
  canvas: '#f6f7f4',
  surface: '#ffffff',
  surfaceSunken: '#eef1ed',
  border: '#e2e6e0',
  accent: '#0e7d64',
  accentHover: '#0a6350',
  accentSoft: '#e3f2ec',
  success: '#2f9e57',
  warning: '#c8791f',
  danger: '#c9463b',
  info: '#3b6ea5',
  sidebarBg: '#0b120f',
  sidebarText: '#a9bab1',
  sidebarTextMuted: '#5f746a',
  sidebarActiveBg: '#0e7d64',
  sidebarActiveText: '#ffffff',
} as const

export const fontStack =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, "Helvetica Neue", Arial, sans-serif'
export const monoStack =
  'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace'

export const consoleTheme: ThemeConfig = {
  token: {
    fontFamily: fontStack,
    colorPrimary: palette.accent,
    colorInfo: palette.info,
    colorLink: palette.accent,
    colorSuccess: palette.success,
    colorWarning: palette.warning,
    colorError: palette.danger,
    colorTextBase: palette.ink,
    colorBgBase: palette.canvas,
    colorBgContainer: palette.surface,
    colorBgLayout: palette.canvas,
    colorBorder: palette.border,
    colorBorderSecondary: palette.border,
    borderRadius: 8,
    borderRadiusLG: 10,
    fontSize: 14,
    controlHeight: 34,
    wireframe: false,
  },
  components: {
    Layout: {
      siderBg: palette.sidebarBg,
      headerBg: palette.surface,
      bodyBg: palette.canvas,
    },
    Menu: {
      darkItemBg: palette.sidebarBg,
      darkSubMenuItemBg: palette.sidebarBg,
      darkItemColor: palette.sidebarText,
      darkItemHoverColor: palette.sidebarActiveText,
      darkItemSelectedBg: palette.sidebarActiveBg,
      darkItemSelectedColor: palette.sidebarActiveText,
      darkGroupTitleColor: palette.sidebarTextMuted,
      itemBorderRadius: 6,
      itemMarginInline: 8,
    },
    Card: {
      borderRadiusLG: 12,
      boxShadowTertiary: '0 1px 2px rgba(16, 25, 21, 0.04), 0 1px 6px -2px rgba(16, 25, 21, 0.06)',
    },
    Table: {
      headerBg: palette.surface,
      headerColor: palette.inkSecondary,
      borderColor: palette.border,
      rowHoverBg: palette.surfaceSunken,
    },
    Button: {
      fontWeight: 500,
      primaryShadow: 'none',
    },
  },
}
