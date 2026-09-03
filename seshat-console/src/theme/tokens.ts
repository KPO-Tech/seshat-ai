import { theme, type ThemeConfig } from 'antd'

// ─── Palette ────────────────────────────────────────────────────────────────
// Modern, crisp dark theme for Seshat Console with warm obsidian tones,
// glowing orange accents, deep layered surfaces and high-contrast typography.
export const palette = {
  ink: '#F5F2EC',
  inkSecondary: '#B8B0A5',
  inkTertiary: '#8A8379',
  inkDisabled: '#5D574F',
  canvas: '#131217',
  surface: '#1C1B22',
  surfaceElevated: '#26242E',
  surfaceSubtle: '#18171E',
  border: '#32303C',
  borderSubtle: '#26242E',
  borderGlow: 'rgba(239, 124, 47, 0.35)',
  accent: '#EF7C2F',
  accentHover: '#FF8F3D',
  accentActive: '#D96B1E',
  accentSoft: 'rgba(239, 124, 47, 0.12)',
  accentSoftBorder: 'rgba(239, 124, 47, 0.28)',
  accentSecondary: '#C89A6A',
  success: '#22C55E',
  successSoft: 'rgba(34, 197, 94, 0.12)',
  warning: '#F59E0B',
  warningSoft: 'rgba(245, 158, 11, 0.12)',
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.12)',
  info: '#3B82F6',
  infoSoft: 'rgba(59, 130, 246, 0.12)',
  hover: 'rgba(245, 242, 236, 0.05)',
  active: 'rgba(245, 242, 236, 0.08)',
  sidebarBg: '#141318',
  sidebarText: '#B8B0A5',
  sidebarTextMuted: '#7A736A',
  sidebarActiveBg: 'rgba(239, 124, 47, 0.12)',
  sidebarActiveText: '#FF8F3D',
} as const

export const fontStack =
  '"Plus Jakarta Sans", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
export const monoStack =
  'ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Menlo, Consolas, monospace'

export const consoleTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    fontFamily: fontStack,
    colorPrimary: palette.accent,
    colorPrimaryHover: palette.accentHover,
    colorPrimaryActive: palette.accentActive,
    colorInfo: palette.info,
    colorLink: palette.accentHover,
    colorLinkHover: '#FFAE71',
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
      itemMarginInline: 10,
    },
    Card: {
      colorBgContainer: palette.surface,
      borderRadiusLG: 14,
      boxShadowTertiary: '0 2px 8px -2px rgba(0, 0, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.2)',
    },
    Table: {
      colorBgContainer: palette.surface,
      headerBg: palette.surfaceElevated,
      headerColor: palette.inkSecondary,
      borderColor: palette.borderSubtle,
      rowHoverBg: 'rgba(255, 255, 255, 0.03)',
      borderRadius: 12,
    },
    Input: {
      colorBgContainer: palette.canvas,
      activeBorderColor: palette.accent,
      hoverBorderColor: palette.accentHover,
      colorBorder: palette.border,
      borderRadius: 8,
    },
    Select: {
      colorBgContainer: palette.canvas,
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
      primaryShadow: '0 2px 10px rgba(239, 124, 47, 0.3)',
      defaultBorderColor: palette.border,
      defaultBg: 'rgba(255, 255, 255, 0.02)',
      defaultHoverBg: 'rgba(255, 255, 255, 0.06)',
      defaultHoverBorderColor: palette.inkTertiary,
    },
    Tag: {
      borderRadiusSM: 6,
      defaultBg: 'rgba(255, 255, 255, 0.04)',
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
