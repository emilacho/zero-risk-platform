/**
 * Zero Risk · Design Tokens · TypeScript Exports
 *
 * Type-safe consumer surface for the canonical token system.
 * Generated FROM tokens.json (single source of truth).
 *
 * Usage:
 *   import { tokens, colors, spacing, motion } from '@/design-system/tokens'
 *   const buttonColor = colors.primary[700]            // '#3D2466'
 *   const cardPadding = spacing[5]                     // '24px'
 *   const fadeIn = motion.easing.easeOutExpo           // 'cubic-bezier(0.16, 1, 0.3, 1)'
 *
 * Or, with Tailwind extend (see tailwind.config.ts):
 *   <div className="bg-primary-700 p-5 shadow-neon-cyan" />
 */

// ─────────────────────────────────────────────────────────
// COLOR
// ─────────────────────────────────────────────────────────

export const colors = {
  primary: {
    100: '#F1ECF7',
    200: '#DCCCEC',
    300: '#B795D6',
    400: '#8A5FBC',
    500: '#5D3F94',
    600: '#4A3179',
    700: '#3D2466',
    800: '#2E1B4D',
    900: '#1C1030',
  },
  accent: {
    100: '#E8FAFB',
    200: '#C6F2F4',
    300: '#8FE5E8',
    400: '#4DD4D8',
    500: '#2FB8BC',
    600: '#209B9F',
    700: '#167D80',
    800: '#0F5F62',
    900: '#084044',
  },
  neutral: {
    100: '#F1F5F9',
    200: '#E2E8F0',
    300: '#CBD5E1',
    400: '#94A3B8',
    500: '#64748B',
    600: '#475569',
    700: '#334155',
    800: '#1E293B',
    900: '#0F172A',
  },
  success: {
    100: '#DFFAEE',
    200: '#B3F2D5',
    300: '#7AEABA',
    400: '#3DDDA0',
    500: '#00D084',
    600: '#00A86A',
    700: '#008455',
    800: '#006640',
    900: '#00422B',
  },
  warning: {
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
  },
  danger: {
    100: '#FFE4EB',
    200: '#FFC2CF',
    300: '#FF94AC',
    400: '#FF6088',
    500: '#FF3366',
    600: '#DB1B4F',
    700: '#B0143F',
    800: '#841030',
    900: '#5E0A22',
  },
  // info is an alias of accent · 0 cost reuse
  info: {
    100: '#E8FAFB',
    200: '#C6F2F4',
    300: '#8FE5E8',
    400: '#4DD4D8',
    500: '#2FB8BC',
    600: '#209B9F',
    700: '#167D80',
    800: '#0F5F62',
    900: '#084044',
  },
  surface: {
    light: {
      background: '#FFFFFF',
      elevated: '#FAFAFA',
      overlay: '#F4F4F5',
      border: '#E4E4E7',
      borderStrong: '#D4D4D8',
    },
    dark: {
      background: '#0A0A0F',
      elevated: '#16161D',
      overlay: '#1F1F28',
      border: '#2A2A35',
      borderStrong: '#3F3F4A',
    },
  },
  text: {
    light: {
      primary: '#0F172A',
      secondary: '#475569',
      tertiary: '#94A3B8',
      inverse: '#FFFFFF',
      onPrimary: '#FFFFFF',
      onAccent: '#0F172A',
    },
    dark: {
      primary: '#F8FAFC',
      secondary: '#CBD5E1',
      tertiary: '#94A3B8',
      inverse: '#0F172A',
      onPrimary: '#FFFFFF',
      onAccent: '#0F172A',
    },
  },
} as const

// ─────────────────────────────────────────────────────────
// SPACING (4px base · 10 stops)
// ─────────────────────────────────────────────────────────

export const spacing = {
  0: '0',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '24px',
  6: '32px',
  7: '48px',
  8: '64px',
  9: '96px',
  10: '128px',
} as const

// ─────────────────────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────────────────────

export const typography = {
  fontFamily: {
    display: "'Space Grotesk', system-ui, -apple-system, sans-serif",
    heading: "'Inter', system-ui, -apple-system, sans-serif",
    body: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
  },
  display: {
    sm: { size: '32px', lineHeight: '34px' },
    md: { size: '48px', lineHeight: '50px' },
    lg: { size: '64px', lineHeight: '67px' },
    xl: { size: '80px', lineHeight: '84px' },
    '2xl': { size: '96px', lineHeight: '100px' },
    letterSpacing: '-0.02em',
    fontWeight: 700,
  },
  heading: {
    sm: { size: '20px', lineHeight: '24px' },
    md: { size: '24px', lineHeight: '29px' },
    lg: { size: '28px', lineHeight: '33px' },
    xl: { size: '32px', lineHeight: '38px' },
    letterSpacing: '-0.01em',
    fontWeight: 700,
  },
  body: {
    sm: { size: '14px', lineHeight: '20px' },
    md: { size: '16px', lineHeight: '24px' },
    lg: { size: '18px', lineHeight: '29px' },
    letterSpacing: '0',
    fontWeight: 400,
  },
  mono: {
    sm: { size: '12px', lineHeight: '18px' },
    md: { size: '14px', lineHeight: '21px' },
    lg: { size: '16px', lineHeight: '24px' },
    letterSpacing: '0',
    fontWeight: 400,
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
} as const

// ─────────────────────────────────────────────────────────
// MOTION
// ─────────────────────────────────────────────────────────

export const motion = {
  easing: {
    easeOutExpo: 'cubic-bezier(0.16, 1, 0.3, 1)',
    easeInOutCubic: 'cubic-bezier(0.65, 0, 0.35, 1)',
    easeOutBack: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    easeOutBounce: 'cubic-bezier(0.68, -0.55, 0.27, 1.55)',
    easeOutQuad: 'cubic-bezier(0.5, 1, 0.89, 1)',
    linear: 'linear',
    default: 'cubic-bezier(0.16, 1, 0.3, 1)', // alias of easeOutExpo
  },
  duration: {
    instant: '0ms',
    fast: '150ms',
    medium: '300ms',
    slow: '500ms',
    cinematic: '800ms',
    default: '300ms', // alias of medium
  },
  durationMs: {
    instant: 0,
    fast: 150,
    medium: 300,
    slow: 500,
    cinematic: 800,
  },
  stagger: {
    tight: '60ms',
    default: '100ms',
    loose: '150ms',
  },
  staggerMs: {
    tight: 60,
    default: 100,
    loose: 150,
  },
  spring: {
    snap: { stiffness: 300, damping: 25 },
    soft: { stiffness: 180, damping: 30 },
    bouncy: { stiffness: 400, damping: 18 },
  },
} as const

// ─────────────────────────────────────────────────────────
// RADIUS
// ─────────────────────────────────────────────────────────

export const radius = {
  none: '0',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '24px',
  '3xl': '32px',
  full: '9999px',
} as const

// ─────────────────────────────────────────────────────────
// SHADOW
// ─────────────────────────────────────────────────────────

export const shadow = {
  none: 'none',
  subtle: '0 1px 2px 0 rgba(15, 23, 42, 0.05), 0 1px 3px 0 rgba(15, 23, 42, 0.10)',
  medium: '0 4px 6px -1px rgba(15, 23, 42, 0.05), 0 10px 15px -3px rgba(15, 23, 42, 0.10)',
  strong: '0 10px 25px -5px rgba(15, 23, 42, 0.10), 0 20px 50px -10px rgba(15, 23, 42, 0.15)',
  neonViolet: '0 0 20px rgba(61, 36, 102, 0.40), 0 0 40px rgba(61, 36, 102, 0.20)',
  neonCyan: '0 0 20px rgba(77, 212, 216, 0.40), 0 0 40px rgba(77, 212, 216, 0.20)',
} as const

// ─────────────────────────────────────────────────────────
// BREAKPOINT
// ─────────────────────────────────────────────────────────

export const breakpoint = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const

// ─────────────────────────────────────────────────────────
// Z-INDEX
// ─────────────────────────────────────────────────────────

export const zIndex = {
  base: 0,
  raised: 10,
  dropdown: 100,
  sticky: 200,
  overlay: 300,
  modal: 400,
  popover: 500,
  toast: 600,
  tooltip: 700,
} as const

// ─────────────────────────────────────────────────────────
// ROOT EXPORT
// ─────────────────────────────────────────────────────────

export const tokens = {
  colors,
  spacing,
  typography,
  motion,
  radius,
  shadow,
  breakpoint,
  zIndex,
} as const

// ─────────────────────────────────────────────────────────
// TYPE EXPORTS · for type-safe consumer code
// ─────────────────────────────────────────────────────────

export type ColorRamp = keyof typeof colors
export type ColorStop = '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'
export type SpacingToken = keyof typeof spacing
export type EasingToken = keyof typeof motion.easing
export type DurationToken = keyof typeof motion.duration
export type RadiusToken = keyof typeof radius
export type ShadowToken = keyof typeof shadow
export type BreakpointToken = keyof typeof breakpoint
export type ZIndexToken = keyof typeof zIndex

// Default export · root tokens object
export default tokens
