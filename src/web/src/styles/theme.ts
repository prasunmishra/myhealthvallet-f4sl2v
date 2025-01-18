/**
 * Core theme configuration file that defines the application's theme system
 * Implements WCAG 2.1 AAA compliant theming with light/dark mode support
 * @version 1.0.0
 */

import { lightThemeColors, darkThemeColors, ColorPalette } from '../styles/colors';
import { SPACING, BREAKPOINTS, CONTAINER_WIDTHS, COMPONENT_SIZES } from '../styles/dimensions';
import { fontFamilies, fontSizes, fontWeights, lineHeights } from '../styles/fonts';

// Z-index configuration for consistent layering
interface ZIndexConfig {
  modal: number;
  overlay: number;
  dropdown: number;
  header: number;
  sidebar: number;
  content: number;
}

// Transition configuration for smooth animations
interface TransitionsConfig {
  duration: {
    shortest: number;
    shorter: number;
    short: number;
    standard: number;
    complex: number;
  };
  easing: {
    easeInOut: string;
    easeOut: string;
    easeIn: string;
    sharp: string;
  };
}

// Shadow configuration for depth and elevation
interface ShadowsConfig {
  none: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

// Shape configuration for consistent border radius
interface ShapeConfig {
  borderRadius: {
    none: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    full: string;
  };
}

// Typography configuration interface
interface TypographyConfig {
  fontFamilies: typeof fontFamilies;
  fontSizes: typeof fontSizes;
  fontWeights: typeof fontWeights;
  lineHeights: typeof lineHeights;
}

// Complete theme interface
export interface Theme {
  colors: ColorPalette;
  spacing: typeof SPACING;
  breakpoints: typeof BREAKPOINTS;
  containerWidths: typeof CONTAINER_WIDTHS;
  componentSizes: typeof COMPONENT_SIZES;
  typography: TypographyConfig;
  zIndex: ZIndexConfig;
  transitions: TransitionsConfig;
  shadows: ShadowsConfig;
  shape: ShapeConfig;
}

// Default z-index configuration
const defaultZIndex: ZIndexConfig = {
  modal: 1000,
  overlay: 900,
  dropdown: 800,
  header: 700,
  sidebar: 600,
  content: 1,
};

// Default transition configuration
const defaultTransitions: TransitionsConfig = {
  duration: {
    shortest: 150,
    shorter: 200,
    short: 250,
    standard: 300,
    complex: 375,
  },
  easing: {
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    sharp: 'cubic-bezier(0.4, 0, 0.6, 1)',
  },
};

// Default shadow configuration
const defaultShadows: ShadowsConfig = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
};

// Default shape configuration
const defaultShape: ShapeConfig = {
  borderRadius: {
    none: 0,
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: '9999px',
  },
};

/**
 * Creates a complete theme configuration with runtime validation
 * @param mode - Theme mode ('light' | 'dark')
 * @param customTheme - Optional custom theme overrides
 * @returns Complete theme configuration
 */
export const createTheme = (
  mode: 'light' | 'dark',
  customTheme: Partial<Theme> = {}
): Theme => {
  // Select base color palette based on mode
  const baseColors = mode === 'light' ? lightThemeColors : darkThemeColors;

  // Create base theme configuration
  const baseTheme: Theme = {
    colors: baseColors,
    spacing: SPACING,
    breakpoints: BREAKPOINTS,
    containerWidths: CONTAINER_WIDTHS,
    componentSizes: COMPONENT_SIZES,
    typography: {
      fontFamilies,
      fontSizes,
      fontWeights,
      lineHeights,
    },
    zIndex: defaultZIndex,
    transitions: defaultTransitions,
    shadows: defaultShadows,
    shape: defaultShape,
  };

  // Deep merge custom theme with base theme
  const theme = deepMerge(baseTheme, customTheme);

  // Validate final theme configuration
  if (!validateTheme(theme)) {
    throw new Error('Invalid theme configuration');
  }

  return theme;
};

/**
 * Validates theme configuration for completeness and correctness
 * @param theme - Theme configuration to validate
 * @returns Validation result
 */
export const validateTheme = (theme: Theme): boolean => {
  try {
    // Check required properties
    const requiredProps: (keyof Theme)[] = [
      'colors',
      'spacing',
      'breakpoints',
      'containerWidths',
      'componentSizes',
      'typography',
      'zIndex',
      'transitions',
      'shadows',
      'shape',
    ];

    for (const prop of requiredProps) {
      if (!theme[prop]) {
        throw new Error(`Missing required theme property: ${prop}`);
      }
    }

    // Validate typography configuration
    const { typography } = theme;
    if (!typography.fontFamilies || !typography.fontSizes || 
        !typography.fontWeights || !typography.lineHeights) {
      throw new Error('Invalid typography configuration');
    }

    return true;
  } catch (error) {
    console.error('Theme validation failed:', error);
    return false;
  }
};

/**
 * Deep merge utility for theme objects
 * @param target - Target object
 * @param source - Source object
 * @returns Merged object
 */
const deepMerge = <T extends object>(target: T, source: Partial<T>): T => {
  const output = { ...target };
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
};

/**
 * Type guard for object checking
 * @param item - Item to check
 * @returns Whether item is an object
 */
const isObject = (item: any): item is object => {
  return item && typeof item === 'object' && !Array.isArray(item);
};

// Export default light theme
export const defaultTheme = createTheme('light');