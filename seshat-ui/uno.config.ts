import { defineConfig, presetMini, presetWind3, transformerDirectives, transformerVariantGroup } from 'unocss'
import { presetExtra } from 'unocss-preset-extra'

const textColors = {
  't-primary': 'var(--text-primary)',
  't-secondary': 'var(--text-secondary)',
  't-tertiary': 'var(--bg-6)',
  't-disabled': 'var(--text-disabled)',
}

const semanticColors = {
  primary: 'var(--primary)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  info: 'var(--info)',
}

const backgroundColors = {
  base: 'var(--bg-base)',
  1: 'var(--bg-1)',
  2: 'var(--bg-2)',
  3: 'var(--bg-3)',
  4: 'var(--bg-4)',
  5: 'var(--bg-5)',
  6: 'var(--bg-6)',
  8: 'var(--bg-8)',
  9: 'var(--bg-9)',
  10: 'var(--bg-10)',
  hover: 'var(--bg-hover)',
  active: 'var(--bg-active)',
}

const borderColors = {
  'b-base': 'var(--border-base)',
  'b-light': 'var(--border-light)',
}

const brandColors = {
  brand: 'var(--brand)',
  'brand-light': 'var(--brand-light)',
  'brand-hover': 'var(--brand-hover)',
}

const componentColors = {
  'message-user': 'var(--message-user-bg)',
  'message-tips': 'var(--message-tips-bg)',
}

const specialColors = {
  fill: 'var(--fill)',
  inverse: 'var(--inverse)',
}

export default defineConfig({
  presets: [presetMini(), presetExtra(), presetWind3()],
  transformers: [transformerVariantGroup(), transformerDirectives({ enforce: 'pre' })],
  content: {
    pipeline: {
      include: [/\.[jt]sx?($|\?)/, /\.css($|\?)/],
      exclude: [/[\\/]node_modules[\\/]/, /\.html($|\?)/],
    },
  },
  rules: [
    [/^text-([1-4])$/, ([, d]: RegExpMatchArray) => ({ color: `var(--color-text-${d})` })],
    [/^bg-fill-([1-4])$/, ([, d]: RegExpMatchArray) => ({ 'background-color': `var(--color-fill-${d})` })],
    ['bg-popup', { 'background-color': 'var(--color-bg-popup)' }],
    ['bg-fill-0', { 'background-color': 'var(--fill-0)' }],
    ['text-white', { color: 'var(--text-white)' }],
    ['animate-spin-slow', { animation: 'spin 2s linear infinite' }],
  ],
  preflights: [
    {
      getCSS: () => `
        * { color: inherit; }
        @keyframes wiggle {
          0%, 20%, 100% { transform: rotate(0deg); }
          4% { transform: rotate(8deg); }
          8% { transform: rotate(-8deg); }
          12% { transform: rotate(6deg); }
          16% { transform: rotate(-4deg); }
        }
      `,
    },
  ],
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
    'flex-col-center': 'flex flex-col items-center justify-center',
    'text-ellipsis': 'overflow-hidden text-ellipsis whitespace-nowrap',
  },
  theme: {
    colors: {
      ...textColors,
      ...semanticColors,
      ...backgroundColors,
      ...borderColors,
      ...brandColors,
      ...componentColors,
      ...specialColors,
    },
  },
})
