import type { Config } from 'tailwindcss'
import {
  colors as zrColors,
  spacing as zrSpacing,
  radius as zrRadius,
  shadow as zrShadow,
  motion as zrMotion,
  typography as zrTypography,
  breakpoint as zrBreakpoint,
  zIndex as zrZIndex,
} from './design-system/tokens'

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    './design-system/**/*.{html,ts,tsx}',
  ],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      // ─── Canonical D1 design tokens (consumed from design-system/tokens.ts) ───
      colors: {
        primary: zrColors.primary,
        accent: zrColors.accent,
        neutral: zrColors.neutral,
        success: zrColors.success,
        warning: zrColors.warning,
        danger: zrColors.danger,
        info: zrColors.info,
        // Legacy namespace · DO NOT use in new code · kept for backwards compat
        'zero-risk': {
          primary: '#1a1a2e',
          secondary: '#16213e',
          accent: '#0f3460',
          highlight: '#e94560',
        },
      },
      spacing: zrSpacing,
      borderRadius: zrRadius,
      boxShadow: {
        subtle: zrShadow.subtle,
        medium: zrShadow.medium,
        strong: zrShadow.strong,
        'neon-violet': zrShadow.neonViolet,
        'neon-cyan': zrShadow.neonCyan,
      },
      fontFamily: {
        display: ['Space Grotesk', 'system-ui', '-apple-system', 'sans-serif'],
        heading: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        body: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        'display-sm': [zrTypography.display.sm.size, { lineHeight: zrTypography.display.sm.lineHeight, letterSpacing: zrTypography.display.letterSpacing, fontWeight: zrTypography.display.fontWeight }],
        'display-md': [zrTypography.display.md.size, { lineHeight: zrTypography.display.md.lineHeight, letterSpacing: zrTypography.display.letterSpacing, fontWeight: zrTypography.display.fontWeight }],
        'display-lg': [zrTypography.display.lg.size, { lineHeight: zrTypography.display.lg.lineHeight, letterSpacing: zrTypography.display.letterSpacing, fontWeight: zrTypography.display.fontWeight }],
        'display-xl': [zrTypography.display.xl.size, { lineHeight: zrTypography.display.xl.lineHeight, letterSpacing: zrTypography.display.letterSpacing, fontWeight: zrTypography.display.fontWeight }],
        'display-2xl': [zrTypography.display['2xl'].size, { lineHeight: zrTypography.display['2xl'].lineHeight, letterSpacing: zrTypography.display.letterSpacing, fontWeight: zrTypography.display.fontWeight }],
        'heading-sm': [zrTypography.heading.sm.size, { lineHeight: zrTypography.heading.sm.lineHeight, letterSpacing: zrTypography.heading.letterSpacing, fontWeight: zrTypography.heading.fontWeight }],
        'heading-md': [zrTypography.heading.md.size, { lineHeight: zrTypography.heading.md.lineHeight, letterSpacing: zrTypography.heading.letterSpacing, fontWeight: zrTypography.heading.fontWeight }],
        'heading-lg': [zrTypography.heading.lg.size, { lineHeight: zrTypography.heading.lg.lineHeight, letterSpacing: zrTypography.heading.letterSpacing, fontWeight: zrTypography.heading.fontWeight }],
        'heading-xl': [zrTypography.heading.xl.size, { lineHeight: zrTypography.heading.xl.lineHeight, letterSpacing: zrTypography.heading.letterSpacing, fontWeight: zrTypography.heading.fontWeight }],
        'body-sm': [zrTypography.body.sm.size, { lineHeight: zrTypography.body.sm.lineHeight, fontWeight: zrTypography.body.fontWeight }],
        'body-md': [zrTypography.body.md.size, { lineHeight: zrTypography.body.md.lineHeight, fontWeight: zrTypography.body.fontWeight }],
        'body-lg': [zrTypography.body.lg.size, { lineHeight: zrTypography.body.lg.lineHeight, fontWeight: zrTypography.body.fontWeight }],
        'mono-sm': [zrTypography.mono.sm.size, { lineHeight: zrTypography.mono.sm.lineHeight, fontWeight: zrTypography.mono.fontWeight }],
        'mono-md': [zrTypography.mono.md.size, { lineHeight: zrTypography.mono.md.lineHeight, fontWeight: zrTypography.mono.fontWeight }],
        'mono-lg': [zrTypography.mono.lg.size, { lineHeight: zrTypography.mono.lg.lineHeight, fontWeight: zrTypography.mono.fontWeight }],
      },
      transitionDuration: {
        instant: '0ms',
        fast: zrMotion.duration.fast,
        medium: zrMotion.duration.medium,
        slow: zrMotion.duration.slow,
        cinematic: zrMotion.duration.cinematic,
      },
      transitionTimingFunction: {
        'ease-out-expo': zrMotion.easing.easeOutExpo,
        'ease-in-out-cubic': zrMotion.easing.easeInOutCubic,
        'ease-out-back': zrMotion.easing.easeOutBack,
        'ease-out-bounce': zrMotion.easing.easeOutBounce,
        'ease-out-quad': zrMotion.easing.easeOutQuad,
      },
      screens: {
        sm: zrBreakpoint.sm,
        md: zrBreakpoint.md,
        lg: zrBreakpoint.lg,
        xl: zrBreakpoint.xl,
        '2xl': zrBreakpoint['2xl'],
      },
      zIndex: {
        base: String(zrZIndex.base),
        raised: String(zrZIndex.raised),
        dropdown: String(zrZIndex.dropdown),
        sticky: String(zrZIndex.sticky),
        overlay: String(zrZIndex.overlay),
        modal: String(zrZIndex.modal),
        popover: String(zrZIndex.popover),
        toast: String(zrZIndex.toast),
        tooltip: String(zrZIndex.tooltip),
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
export default config
