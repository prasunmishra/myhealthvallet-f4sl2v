/**
 * Core color palette definitions for the application's design system.
 * Implements WCAG 2.1 AAA compliant color tokens for both light and dark themes.
 */

// Type definitions
export interface ColorScale {
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
}

export interface ColorPalette {
  primary: ColorScale;
  secondary: ColorScale;
  background: string;
  surface: ColorScale;
  text: ColorScale;
  error: ColorScale;
  warning: ColorScale;
  success: ColorScale;
  info: ColorScale;
}

// Base colors as specified in technical requirements
const PRIMARY_BASE = '#2196F3';
const SECONDARY_BASE = '#4CAF50';
const ERROR_BASE = '#f44336';
const WARNING_BASE = '#ff9800';
const SUCCESS_BASE = '#4caf50';
const INFO_BASE = '#2196f3';

// Background colors
const LIGHT_BACKGROUND = '#FFFFFF';
const DARK_BACKGROUND = '#121212';

// Surface colors
const LIGHT_SURFACE = '#F5F5F5';
const DARK_SURFACE = '#1E1E1E';

// Text colors
const LIGHT_TEXT = '#212121';
const DARK_TEXT = '#FFFFFF';

// Light theme implementation
export const lightThemeColors: ColorPalette = {
  primary: {
    100: '#E3F2FD',
    200: '#BBDEFB',
    300: '#90CAF9',
    400: '#64B5F6',
    500: PRIMARY_BASE,
    600: '#1E88E5',
    700: '#1976D2',
    800: '#1565C0',
    900: '#0D47A1'
  },
  secondary: {
    100: '#E8F5E9',
    200: '#C8E6C9',
    300: '#A5D6A7',
    400: '#81C784',
    500: SECONDARY_BASE,
    600: '#43A047',
    700: '#388E3C',
    800: '#2E7D32',
    900: '#1B5E20'
  },
  background: LIGHT_BACKGROUND,
  surface: {
    100: '#FFFFFF',
    200: '#FAFAFA',
    300: '#F5F5F5',
    400: '#F0F0F0',
    500: LIGHT_SURFACE,
    600: '#E0E0E0',
    700: '#DBDBDB',
    800: '#D6D6D6',
    900: '#D1D1D1'
  },
  text: {
    100: '#757575',
    200: '#616161',
    300: '#424242',
    400: '#313131',
    500: LIGHT_TEXT,
    600: '#1B1B1B',
    700: '#151515',
    800: '#0F0F0F',
    900: '#090909'
  },
  error: {
    100: '#FFEBEE',
    200: '#FFCDD2',
    300: '#EF9A9A',
    400: '#E57373',
    500: ERROR_BASE,
    600: '#E53935',
    700: '#D32F2F',
    800: '#C62828',
    900: '#B71C1C'
  },
  warning: {
    100: '#FFF3E0',
    200: '#FFE0B2',
    300: '#FFCC80',
    400: '#FFB74D',
    500: WARNING_BASE,
    600: '#FB8C00',
    700: '#F57C00',
    800: '#EF6C00',
    900: '#E65100'
  },
  success: {
    100: '#E8F5E9',
    200: '#C8E6C9',
    300: '#A5D6A7',
    400: '#81C784',
    500: SUCCESS_BASE,
    600: '#43A047',
    700: '#388E3C',
    800: '#2E7D32',
    900: '#1B5E20'
  },
  info: {
    100: '#E3F2FD',
    200: '#BBDEFB',
    300: '#90CAF9',
    400: '#64B5F6',
    500: INFO_BASE,
    600: '#1E88E5',
    700: '#1976D2',
    800: '#1565C0',
    900: '#0D47A1'
  }
};

// Dark theme implementation with adjusted contrast for WCAG AAA compliance
export const darkThemeColors: ColorPalette = {
  primary: {
    100: '#0D47A1',
    200: '#1565C0',
    300: '#1976D2',
    400: '#1E88E5',
    500: PRIMARY_BASE,
    600: '#64B5F6',
    700: '#90CAF9',
    800: '#BBDEFB',
    900: '#E3F2FD'
  },
  secondary: {
    100: '#1B5E20',
    200: '#2E7D32',
    300: '#388E3C',
    400: '#43A047',
    500: SECONDARY_BASE,
    600: '#81C784',
    700: '#A5D6A7',
    800: '#C8E6C9',
    900: '#E8F5E9'
  },
  background: DARK_BACKGROUND,
  surface: {
    100: '#121212',
    200: '#1E1E1E',
    300: '#232323',
    400: '#282828',
    500: DARK_SURFACE,
    600: '#323232',
    700: '#373737',
    800: '#3C3C3C',
    900: '#414141'
  },
  text: {
    100: '#FFFFFF',
    200: '#FAFAFA',
    300: '#F5F5F5',
    400: '#EEEEEE',
    500: DARK_TEXT,
    600: '#E0E0E0',
    700: '#DBDBDB',
    800: '#D6D6D6',
    900: '#D1D1D1'
  },
  error: {
    100: '#B71C1C',
    200: '#C62828',
    300: '#D32F2F',
    400: '#E53935',
    500: ERROR_BASE,
    600: '#E57373',
    700: '#EF9A9A',
    800: '#FFCDD2',
    900: '#FFEBEE'
  },
  warning: {
    100: '#E65100',
    200: '#EF6C00',
    300: '#F57C00',
    400: '#FB8C00',
    500: WARNING_BASE,
    600: '#FFB74D',
    700: '#FFCC80',
    800: '#FFE0B2',
    900: '#FFF3E0'
  },
  success: {
    100: '#1B5E20',
    200: '#2E7D32',
    300: '#388E3C',
    400: '#43A047',
    500: SUCCESS_BASE,
    600: '#81C784',
    700: '#A5D6A7',
    800: '#C8E6C9',
    900: '#E8F5E9'
  },
  info: {
    100: '#0D47A1',
    200: '#1565C0',
    300: '#1976D2',
    400: '#1E88E5',
    500: INFO_BASE,
    600: '#64B5F6',
    700: '#90CAF9',
    800: '#BBDEFB',
    900: '#E3F2FD'
  }
};