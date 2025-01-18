import { useState, useEffect, useCallback } from 'react'; // ^18.0.0
import { debounce } from 'lodash'; // ^4.17.21
import { Theme, createTheme } from '../styles/theme';
import { themeConfig } from '../config/theme.config';

// Constants
const THEME_STORAGE_KEY = 'phrsat-theme-preference';
const THEME_TRANSITION_DURATION = 300;
const SYSTEM_THEME_CHECK_INTERVAL = 1000;

// Interfaces
export interface ThemeError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export interface UseThemeReturn {
  theme: Theme;
  currentTheme: string;
  setTheme: (theme: string) => void;
  toggleTheme: () => void;
  isLoading: boolean;
  error: ThemeError | null;
  systemTheme: string | null;
}

/**
 * Validates stored theme value against available themes
 */
const validateStoredTheme = (storedTheme: string): boolean => {
  return Object.keys(themeConfig.themes).includes(storedTheme);
};

/**
 * Custom hook for comprehensive theme management with error handling
 * and performance optimizations
 */
export const useTheme = (): UseThemeReturn => {
  // State initialization
  const [currentTheme, setCurrentTheme] = useState<string>(themeConfig.defaultTheme);
  const [theme, setThemeObject] = useState<Theme>(themeConfig.themes[themeConfig.defaultTheme]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<ThemeError | null>(null);
  const [systemTheme, setSystemTheme] = useState<string | null>(null);

  // System theme detection
  const detectSystemTheme = useCallback(() => {
    try {
      const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      return darkModeQuery.matches ? 'dark' : 'light';
    } catch (err) {
      setError({
        code: 'SYSTEM_THEME_DETECTION_ERROR',
        message: 'Failed to detect system theme',
        details: { error: err }
      });
      return 'light';
    }
  }, []);

  // Theme transition handling
  const applyThemeTransition = useCallback(() => {
    const root = document.documentElement;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!prefersReducedMotion) {
      root.style.transition = `background-color ${THEME_TRANSITION_DURATION}ms ease-in-out`;
      setTimeout(() => {
        root.style.transition = '';
      }, THEME_TRANSITION_DURATION);
    }
  }, []);

  // Theme switching function
  const setTheme = useCallback((newTheme: string) => {
    try {
      if (!validateStoredTheme(newTheme)) {
        throw new Error(`Invalid theme: ${newTheme}`);
      }

      setIsLoading(true);
      applyThemeTransition();

      const newThemeObject = createTheme(newTheme as 'light' | 'dark');
      document.documentElement.setAttribute('data-theme', newTheme);
      
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      setCurrentTheme(newTheme);
      setThemeObject(newThemeObject);
      setError(null);
    } catch (err) {
      setError({
        code: 'THEME_SWITCH_ERROR',
        message: 'Failed to switch theme',
        details: { theme: newTheme, error: err }
      });
    } finally {
      setIsLoading(false);
    }
  }, [applyThemeTransition]);

  // Theme toggle function
  const toggleTheme = useCallback(() => {
    const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
  }, [currentTheme, setTheme]);

  // System theme change handler
  const handleSystemThemeChange = useCallback(
    debounce((e: MediaQueryListEvent) => {
      const newSystemTheme = e.matches ? 'dark' : 'light';
      setSystemTheme(newSystemTheme);
      
      // Only update theme if using system preference
      if (!localStorage.getItem(THEME_STORAGE_KEY)) {
        setTheme(newSystemTheme);
      }
    }, SYSTEM_THEME_CHECK_INTERVAL),
    [setTheme]
  );

  // Initialize theme
  useEffect(() => {
    try {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      const initialSystemTheme = detectSystemTheme();
      setSystemTheme(initialSystemTheme);

      if (storedTheme && validateStoredTheme(storedTheme)) {
        setTheme(storedTheme);
      } else {
        setTheme(initialSystemTheme);
      }
    } catch (err) {
      setError({
        code: 'THEME_INIT_ERROR',
        message: 'Failed to initialize theme',
        details: { error: err }
      });
    } finally {
      setIsLoading(false);
    }
  }, [detectSystemTheme, setTheme]);

  // System theme change listener
  useEffect(() => {
    const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    darkModeQuery.addEventListener('change', handleSystemThemeChange);

    return () => {
      darkModeQuery.removeEventListener('change', handleSystemThemeChange);
      handleSystemThemeChange.cancel();
    };
  }, [handleSystemThemeChange]);

  return {
    theme,
    currentTheme,
    setTheme,
    toggleTheme,
    isLoading,
    error,
    systemTheme
  };
};