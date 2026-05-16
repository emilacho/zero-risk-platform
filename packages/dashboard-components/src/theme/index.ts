/**
 * Mission Control dashboard theme tokens.
 *
 * Dark mode by default · violet #7c3aed primary · cyan #06b6d4 accent
 * (per dispatch CC#4 · Dribbble dashboard refs).
 *
 * Consumable as:
 *   - plain TS object (`theme.colors.primary.500`)
 *   - Tailwind config extension (drop into `tailwind.config.ts > theme.extend.colors`)
 *   - CSS variable strings (`themeCssVars` for `<style>` injection or
 *     `style={...}` on a root layout element)
 */

export const theme = {
  colors: {
    // Backgrounds — layered dark surface
    bg: {
      base: '#0a0a0f',       // outermost · near-black with hint of blue
      surface: '#13131a',    // cards / panels
      surfaceHover: '#1a1a24',
      surfaceActive: '#22222e',
      muted: '#0f0f15',
    },
    // Foregrounds
    fg: {
      primary: '#fafafa',    // headings · KPI digits
      secondary: '#a1a1aa',  // labels · captions
      muted: '#71717a',      // disabled · meta
      inverse: '#0a0a0f',    // for chips on bright bg
    },
    // Borders
    border: {
      subtle: '#27272f',
      default: '#33333d',
      strong: '#52525b',
    },
    // Primary — violet (per dispatch)
    primary: {
      50: '#f5f3ff',
      100: '#ede9fe',
      300: '#c4b5fd',
      400: '#a78bfa',
      500: '#7c3aed',   // ← canonical primary
      600: '#6d28d9',
      700: '#5b21b6',
      900: '#2e1065',
    },
    // Accent — cyan (per dispatch)
    accent: {
      50: '#ecfeff',
      300: '#67e8f9',
      400: '#22d3ee',
      500: '#06b6d4',   // ← canonical accent
      600: '#0891b2',
      700: '#0e7490',
    },
    // Status semantics — sparingly used
    success: '#10b981',
    warning: '#f59e0b',
    danger:  '#ef4444',
    info:    '#06b6d4',
    // Data-viz palette — chart series colors, tuned for dark bg
    dataViz: [
      '#7c3aed',  // primary violet
      '#06b6d4',  // accent cyan
      '#a78bfa',  // light violet
      '#22d3ee',  // light cyan
      '#10b981',  // emerald (4th series)
      '#f59e0b',  // amber (5th series)
      '#ef4444',  // red (6th · failures)
      '#ec4899',  // pink (7th)
    ],
  },
  // Sparkline / chart density
  chart: {
    gridStroke: '#27272f',
    axisStroke: '#52525b',
    tooltipBg: '#13131a',
    tooltipBorder: '#33333d',
  },
  // Typography
  font: {
    sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, "JetBrains Mono", "Fira Code", Menlo, monospace',
  },
  // Radii
  radius: {
    sm: '0.375rem',
    md: '0.5rem',
    lg: '0.75rem',
    xl: '1rem',
    full: '9999px',
  },
  // Shadows — subtle on dark bg
  shadow: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.4)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.4), 0 2px 4px -2px rgb(0 0 0 / 0.4)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.5), 0 4px 6px -4px rgb(0 0 0 / 0.5)',
    glow: '0 0 24px -4px rgb(124 58 237 / 0.4)',  // violet glow for emphasis
    glowAccent: '0 0 24px -4px rgb(6 182 212 / 0.4)',  // cyan glow
  },
  // Motion timings
  motion: {
    fast: '120ms',
    base: '200ms',
    slow: '320ms',
  },
} as const

/**
 * CSS variables string — drop into a `<style>` block or `style={{}}` on
 * the dashboard root layout element. Variable names follow `--zr-<group>-<key>`.
 */
export const themeCssVars = `
:root {
  --zr-bg-base: ${theme.colors.bg.base};
  --zr-bg-surface: ${theme.colors.bg.surface};
  --zr-bg-surface-hover: ${theme.colors.bg.surfaceHover};
  --zr-fg-primary: ${theme.colors.fg.primary};
  --zr-fg-secondary: ${theme.colors.fg.secondary};
  --zr-fg-muted: ${theme.colors.fg.muted};
  --zr-border-subtle: ${theme.colors.border.subtle};
  --zr-border-default: ${theme.colors.border.default};
  --zr-primary-500: ${theme.colors.primary[500]};
  --zr-primary-400: ${theme.colors.primary[400]};
  --zr-primary-600: ${theme.colors.primary[600]};
  --zr-accent-500: ${theme.colors.accent[500]};
  --zr-accent-400: ${theme.colors.accent[400]};
  --zr-success: ${theme.colors.success};
  --zr-warning: ${theme.colors.warning};
  --zr-danger: ${theme.colors.danger};
  --zr-radius-md: ${theme.radius.md};
  --zr-radius-lg: ${theme.radius.lg};
  --zr-shadow-md: ${theme.shadow.md};
  --zr-shadow-glow: ${theme.shadow.glow};
}
`

export type Theme = typeof theme
