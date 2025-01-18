/**
 * Theme configuration file that implements the application's design system
 * Provides robust theme management with light/dark modes and system preference detection
 * @version 1.0.0
 */

import { ThemeProvider, DefaultTheme } from 'styled-components'; // v5.3.0
import { light, dark, Theme } from '../styles/theme';
import { lightThemeColors, darkThemeColors } from '../styles/colors';
import { SPACING, BREAKPOINTS } from '../styles/dimensions';

// Theme configuration constants
const DEFAULT_THEME = 'light';
const THEME_STORAGE_KEY = 'phrsat-theme-preference';

/**
 * Interface defining the structure of theme configuration
 */
export interface ThemeConfig {
  defaultTheme: string;
  themes: Record<string, Theme>;
}

/**
 * Detects system color scheme preference
 * Falls back to light theme if detection fails
 */
const getSystemTheme = (): 'light' | 'dark' => {
  try {
    // Add matchMedia polyfill for older browsers
    if (!window.matchMedia) {
      return DEFAULT_THEME as 'light';
    }

    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    return darkModeQuery.matches ? 'dark' : 'light';
  } catch (error) {
    console.error('Failed to detect system theme:', error);
    return DEFAULT_THEME as 'light';
  }
};

/**
 * Initializes theme configuration with validation and persistence
 * Implements system preference detection and theme change handling
 */
const initializeTheme = (): ThemeConfig => {
  try {
    // Check for stored theme preference
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const systemTheme = getSystemTheme();
    const initialTheme = storedTheme || systemTheme;

    // Create theme configuration
    const themeConfig: ThemeConfig = {
      defaultTheme: initialTheme,
      themes: {
        light: {
          ...light,
          colors: {
            ...lightThemeColors,
            primary: lightThemeColors.primary,
            secondary: lightThemeColors.secondary,
          },
          spacing: SPACING,
          breakpoints: BREAKPOINTS,
        },
        dark: {
          ...dark,
          colors: {
            ...darkThemeColors,
            primary: darkThemeColors.primary,
            secondary: darkThemeColors.secondary,
          },
          spacing: SPACING,
          breakpoints: BREAKPOINTS,
        },
      },
    };

    // Set up system theme change observer
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    darkModeQuery.addEventListener('change', (e: MediaQueryListEvent) => {
      if (!localStorage.getItem(THEME_STORAGE_KEY)) {
        document.documentElement.setAttribute(
          'data-theme',
          e.matches ? 'dark' : 'light'
        );
      }
    });

    // Cache initial theme
    document.documentElement.setAttribute('data-theme', initialTheme);

    return themeConfig;
  } catch (error) {
    console.error('Failed to initialize theme:', error);
    
    // Fallback to default theme configuration
    return {
      defaultTheme: DEFAULT_THEME,
      themes: {
        light: {
          ...light,
          colors: lightThemeColors,
          spacing: SPACING,
          breakpoints: BREAKPOINTS,
        },
        dark: {
          ...dark,
          colors: darkThemeColors,
          spacing: SPACING,
          breakpoints: BREAKPOINTS,
        },
      },
    };
  }
};

/**
 * Export validated theme configuration
 * Provides type-safe theme access throughout the application
 */
export const themeConfig = initializeTheme();

// Type assertion to ensure theme configuration matches DefaultTheme
declare module 'styled-components' {
  export interface DefaultTheme extends Theme {}
}