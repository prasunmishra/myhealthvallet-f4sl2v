// Font family constants with system font fallbacks
const PRIMARY_FONT = "Roboto, -apple-system, BlinkMacSystemFont, system-ui, Segoe UI, Helvetica Neue, Arial, sans-serif"
const SECONDARY_FONT = "SF Pro, -apple-system, BlinkMacSystemFont, system-ui, Segoe UI, Helvetica Neue, Arial, sans-serif"

// Base sizing constants
const BASE_FONT_SIZE = 16
const HEADING_SCALE_RATIO = 1.25
const MIN_FONT_SIZE = 12
const MAX_FONT_SIZE = 48

/**
 * Converts pixel values to rem units for responsive typography
 * @param px - Pixel value to convert
 * @returns Converted rem value with unit
 * @throws Error if pixel value is outside allowed range
 */
const pxToRem = (px: number): string => {
  if (px < MIN_FONT_SIZE) {
    throw new Error(`Font size ${px}px is below minimum allowed size of ${MIN_FONT_SIZE}px`)
  }
  if (px > MAX_FONT_SIZE) {
    throw new Error(`Font size ${px}px exceeds maximum allowed size of ${MAX_FONT_SIZE}px`)
  }
  return `${(px / BASE_FONT_SIZE).toFixed(4)}rem`
}

/**
 * Interface defining available font families with strict readonly properties
 */
interface FontFamilies {
  readonly primary: string
  readonly secondary: string
}

/**
 * Interface defining available font sizes with strict readonly properties
 */
interface FontSizes {
  readonly base: string
  readonly h1: string
  readonly h2: string
  readonly h3: string
  readonly h4: string
  readonly small: string
  readonly caption: string
}

/**
 * Interface defining available font weights with strict readonly properties
 */
interface FontWeights {
  readonly light: number
  readonly regular: number
  readonly medium: number
  readonly semibold: number
  readonly bold: number
}

/**
 * Interface defining available line heights with strict readonly properties
 */
interface LineHeights {
  readonly base: number
  readonly heading: number
  readonly tight: number
  readonly relaxed: number
}

/**
 * Font family configurations with fallback system fonts
 */
export const fontFamilies: FontFamilies = {
  primary: PRIMARY_FONT,
  secondary: SECONDARY_FONT
} as const

/**
 * Font size configurations in rem units for responsive scaling
 * Following a modular scale with ratio of 1.25
 */
export const fontSizes: FontSizes = {
  base: pxToRem(16),
  h1: pxToRem(48),
  h2: pxToRem(40),
  h3: pxToRem(32),
  h4: pxToRem(24),
  small: pxToRem(14),
  caption: pxToRem(12)
} as const

/**
 * Font weight configurations for different text styles
 * Using standard weight values for maximum compatibility
 */
export const fontWeights: FontWeights = {
  light: 300,
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700
} as const

/**
 * Line height configurations for optimal readability
 * Using unitless values for better scaling
 */
export const lineHeights: LineHeights = {
  base: 1.5,
  heading: 1.2,
  tight: 1.25,
  relaxed: 1.75
} as const