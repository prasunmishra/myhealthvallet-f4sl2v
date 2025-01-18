/**
 * Core dimensions and spacing configuration file
 * Implements design system specifications for consistent layout and spacing
 * @version 1.0.0
 */

// Base unit for spacing calculations (in pixels)
const BASE_UNIT = 8;

/**
 * Spacing constants based on 8px base unit
 * Used for consistent component margins, padding and gaps
 */
export const SPACING = {
  BASE: BASE_UNIT, // 8px
  SMALL: BASE_UNIT * 2, // 16px
  MEDIUM: BASE_UNIT * 3, // 24px  
  LARGE: BASE_UNIT * 4, // 32px
  XLARGE: BASE_UNIT * 6, // 48px
} as const;

/**
 * Responsive breakpoint values in pixels
 * Defines viewport width thresholds for different device sizes
 */
export const BREAKPOINTS = {
  MOBILE: 320,
  TABLET: 768,
  DESKTOP: 1024,
  LARGE_DESKTOP: 1440,
} as const;

/**
 * Container width constants
 * Percentage-based fluid widths with max-width constraint
 * Follows responsive layout grid specifications
 */
export const CONTAINER_WIDTHS = {
  MOBILE: '100%', // Full width on mobile
  TABLET: '85%', // 85% width on tablet
  DESKTOP: '75%', // 75% width on desktop
  MAX: '1920px', // Maximum container width constraint
} as const;

/**
 * Fixed component dimension constants
 * Used for consistent layout structure across the application
 */
export const COMPONENT_SIZES = {
  HEADER_HEIGHT: BASE_UNIT * 8, // 64px header height
  BOTTOM_NAV_HEIGHT: BASE_UNIT * 7, // 56px bottom navigation height
  SIDEBAR_WIDTH: BASE_UNIT * 30, // 240px sidebar width
} as const;

/**
 * Media query breakpoint helpers
 * Usage: @media ${MEDIA_QUERIES.TABLET} { ... }
 */
export const MEDIA_QUERIES = {
  MOBILE: `(min-width: ${BREAKPOINTS.MOBILE}px)`,
  TABLET: `(min-width: ${BREAKPOINTS.TABLET}px)`,
  DESKTOP: `(min-width: ${BREAKPOINTS.DESKTOP}px)`,
  LARGE_DESKTOP: `(min-width: ${BREAKPOINTS.LARGE_DESKTOP}px)`,
} as const;

/**
 * Z-index stack order
 * Defines consistent z-index values for layered components
 */
export const Z_INDEX = {
  MODAL: 1000,
  OVERLAY: 900,
  DROPDOWN: 800,
  HEADER: 700,
  SIDEBAR: 600,
  CONTENT: 1,
} as const;