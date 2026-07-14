import { theme, type ThemeConfig } from 'antd'

// ─── Palette ────────────────────────────────────────────────────────────────
// Matches the product's real design system, not a console-only invention -
// values are ported directly from seshat-ui's dark theme
// (seshat-ui/src/renderer/styles/tokens.css: `:root, [data-theme='dark']`,
// the app's default/root look, not the light variant). Warm neutrals, a
// single orange brand accent, warm off-white text - same identity as the
// desktop app, not stock Ant Design blue on a white canvas.
export const palette = {
  ink: '#E7E2DA',
  inkSecondary: '#B6AEA3',
  inkTertiary: '#918A82',
  inkDisabled: '#6F6A64',
  canvas: '#2F2E34',
  surface: '#3A3941',
  surfaceElevated: '#4A4852',
  border: '#54515B',
  borderSubtle: '#4D4A54',
  accent: '#EF7C2F',
  accentHover: '#DB6E24',
  accentSoft: 'rgba(239, 124, 47, 0.14)',
  accentSecondary: '#C89A6A',
  success: '#6FAF7B',
  warning: '#D6A15F',
  danger: '#C96B5C',
  info: '#7D9CCF',
  hover: 'rgba(231, 226, 218, 0.06)',
  active: 'rgba(231, 226, 218, 0.1)',
  // The sidebar blends with the canvas (same background, separated only by
  // a border) rather than being a distinctly-colored block - this is how
  // seshat-ui's own Sidebar.tsx works (`background: var(--color-bg)`), not a
  // dashboard-style dark-sider-on-light-canvas split.
  sidebarBg: '#2F2E34',
  sidebarText: '#B6AEA3',
  sidebarTextMuted: '#918A82',
  sidebarActiveBg: 'rgba(239, 124, 47, 0.14)',
  sidebarActiveText: '#EF7C2F',
} as const

export const fontStack =
  '"Plus Jakarta Sans", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
export const monoStack =
  'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace'

export const consoleTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
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
    colorBgElevated: palette.surfaceElevated,
    colorBorder: palette.border,
    colorBorderSecondary: palette.borderSubtle,
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
      darkItemHoverBg: palette.hover,
      darkItemSelectedBg: palette.sidebarActiveBg,
      darkItemSelectedColor: palette.sidebarActiveText,
      darkGroupTitleColor: palette.sidebarTextMuted,
      itemBorderRadius: 8,
      itemMarginInline: 8,
    },
    Card: {
      colorBgContainer: palette.surface,
      borderRadiusLG: 12,
      boxShadowTertiary: '0 1px 2px rgba(0, 0, 0, 0.16), 0 1px 6px -2px rgba(0, 0, 0, 0.24)',
    },
    Table: {
      colorBgContainer: palette.surface,
      headerBg: palette.surfaceElevated,
      headerColor: palette.inkSecondary,
      borderColor: palette.border,
      rowHoverBg: palette.surfaceElevated,
    },
    Input: {
      colorBgContainer: palette.canvas,
      activeBorderColor: palette.accent,
      hoverBorderColor: palette.accentSecondary,
    },
    Select: {
      colorBgContainer: palette.canvas,
      optionSelectedBg: palette.accentSoft,
    },
    Drawer: {
      colorBgElevated: palette.surface,
    },
    Button: {
      fontWeight: 500,
      primaryShadow: 'none',
    },
  },
}
