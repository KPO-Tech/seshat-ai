import { theme, type ThemeConfig } from 'antd'

// ─── Palette ────────────────────────────────────────────────────────────────
// Light theme for Seshat Console - value-for-value matched to seshat-ui's
// own light-mode tokens (styles/tokens.css, [data-theme='light']), not a
// third palette invented independently, so the desktop app's Admin Console
// and this web console read as one design system rather than two.
export const palette = {
  ink: '#1E1C1A',
  inkSecondary: '#746F69',
  inkTertiary: '#938C84',
  inkDisabled: '#B2AAA2',
  canvas: '#F6F4F1',
  surface: '#FFFFFF',
  surfaceElevated: '#F3EEE8',
  surfaceSubtle: '#FAF8F5',
  border: '#DDD5CC',
  borderSubtle: '#E6DED5',
  borderGlow: 'rgba(239, 124, 47, 0.25)',
  accent: '#EF7C2F',
  accentHover: '#D9691E',
  accentActive: '#C25E1A',
  accentSoft: 'rgba(239, 124, 47, 0.10)',
  accentSoftBorder: 'rgba(239, 124, 47, 0.28)',
  accentSecondary: '#C89A6A',
  success: '#5F9B6A',
  successSoft: 'rgba(95, 155, 106, 0.12)',
  warning: '#C58B45',
  warningSoft: 'rgba(197, 139, 69, 0.12)',
  danger: '#B96256',
  dangerSoft: 'rgba(185, 98, 86, 0.12)',
  info: '#6485B8',
  infoSoft: 'rgba(100, 133, 184, 0.12)',
  hover: 'rgba(30, 28, 26, 0.04)',
  active: 'rgba(30, 28, 26, 0.08)',
  sidebarBg: '#FFFFFF',
  sidebarText: '#746F69',
  sidebarTextMuted: '#938C84',
  sidebarActiveBg: 'rgba(239, 124, 47, 0.10)',
  sidebarActiveText: '#D9691E',
} as const

export const fontStack =
  '"Plus Jakarta Sans", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
export const monoStack =
  'ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Menlo, Consolas, monospace'

export const consoleTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    fontFamily: fontStack,
    colorPrimary: palette.accent,
    colorPrimaryHover: palette.accentHover,
    colorPrimaryActive: palette.accentActive,
    colorInfo: palette.info,
    colorLink: palette.accentHover,
    colorLinkHover: palette.accentActive,
    colorSuccess: palette.success,
    colorWarning: palette.warning,
    colorError: palette.danger,
    colorTextBase: palette.ink,
    colorTextSecondary: palette.inkSecondary,
    colorTextTertiary: palette.inkTertiary,
    colorTextDisabled: palette.inkDisabled,
    colorBgBase: palette.canvas,
    colorBgContainer: palette.surface,
    colorBgLayout: palette.canvas,
    colorBgElevated: palette.surfaceElevated,
    colorBorder: palette.border,
    colorBorderSecondary: palette.borderSubtle,
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,
    // Matched to seshat-ui's own scale (styles/tokens.css: --font-size-base
    // 13px, .app-control height 30px) - antd's defaults (14px/36-40px) read
    // noticeably roomier than the desktop app once the two sit side by
    // side. This only reaches antd's own components (Button, Input,
    // Select, Table, Menu, ...) - hand-styled dimensions elsewhere in this
    // app (AppLayout.tsx's sidebar/topbar, the console-page-header/
    // console-table rules in index.css) aren't derived from this token and
    // need their own pass if the goal is matching seshat-ui everywhere.
    fontSize: 13,
    controlHeight: 30,
    wireframe: false,
  },
  components: {
    Layout: {
      siderBg: palette.sidebarBg,
      headerBg: palette.surface,
      bodyBg: palette.canvas,
    },
    // AppLayout.tsx's sidebar <Menu> renders with theme="light" (matching
    // the app-wide light theme) - the unprefixed tokens below apply there,
    // not the dark* ones antd's Menu also exposes for a theme="dark" menu.
    Menu: {
      itemBg: palette.sidebarBg,
      subMenuItemBg: palette.sidebarBg,
      itemColor: palette.sidebarText,
      itemHoverColor: palette.sidebarActiveText,
      itemHoverBg: palette.hover,
      itemSelectedBg: palette.sidebarActiveBg,
      itemSelectedColor: palette.sidebarActiveText,
      groupTitleColor: palette.sidebarTextMuted,
      itemBorderRadius: 6,
      itemMarginInline: 8,
    },
    Card: {
      colorBgContainer: palette.surface,
      borderRadiusLG: 14,
      boxShadowTertiary: '0 2px 8px -2px rgba(30, 28, 26, 0.08), 0 1px 2px rgba(30, 28, 26, 0.04)',
    },
    Table: {
      colorBgContainer: palette.surface,
      headerBg: palette.surfaceElevated,
      headerColor: palette.inkSecondary,
      borderColor: palette.borderSubtle,
      rowHoverBg: 'rgba(30, 28, 26, 0.03)',
      borderRadius: 12,
    },
    Input: {
      colorBgContainer: palette.surface,
      activeBorderColor: palette.accent,
      hoverBorderColor: palette.accentHover,
      colorBorder: palette.border,
      borderRadius: 8,
    },
    Select: {
      colorBgContainer: palette.surface,
      optionSelectedBg: palette.accentSoft,
      colorBorder: palette.border,
      borderRadius: 8,
    },
    Drawer: {
      colorBgElevated: palette.surface,
    },
    Modal: {
      contentBg: palette.surface,
      headerBg: palette.surface,
    },
    Button: {
      fontWeight: 500,
      borderRadius: 8,
      primaryShadow: '0 2px 10px rgba(239, 124, 47, 0.22)',
      defaultBorderColor: palette.border,
      defaultBg: 'rgba(30, 28, 26, 0.02)',
      defaultHoverBg: 'rgba(30, 28, 26, 0.05)',
      defaultHoverBorderColor: palette.inkTertiary,
    },
    Tag: {
      borderRadiusSM: 6,
      defaultBg: 'rgba(30, 28, 26, 0.04)',
      defaultColor: palette.inkSecondary,
    },
    Dropdown: {
      colorBgElevated: palette.surfaceElevated,
    },
    Tabs: {
      itemColor: palette.inkSecondary,
      itemHoverColor: palette.ink,
      itemSelectedColor: palette.accentHover,
      inkBarColor: palette.accent,
    },
  },
}
