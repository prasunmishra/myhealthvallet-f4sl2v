import { createGlobalStyle, css } from 'styled-components'; // v5.3.0
import { lightThemeColors, darkThemeColors } from './colors';
import { SPACING } from './dimensions';
import { fontFamilies, fontSizes } from './fonts';

// CSS Reset and Base Styles
const resetStyles = css`
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  /* Improve text rendering */
  html {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-size-adjust: 100%;
    text-rendering: optimizeLegibility;
    
    /* Base font size for rem calculations */
    font-size: ${fontSizes.base};
    
    /* Smooth scrolling with reduced motion preference */
    @media (prefers-reduced-motion: no-preference) {
      scroll-behavior: smooth;
    }
  }

  /* Set core body defaults */
  body {
    min-height: 100vh;
    line-height: 1.5;
    font-family: ${fontFamilies.primary};
    background-color: ${lightThemeColors.background};
    color: ${lightThemeColors.text[500]};
    
    /* Enable GPU acceleration */
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    
    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      background-color: ${darkThemeColors.background};
      color: ${darkThemeColors.text[500]};
    }
  }

  /* Remove list styles */
  ul, ol {
    list-style: none;
  }

  /* Improve media defaults */
  img, picture, video, canvas, svg {
    display: block;
    max-width: 100%;
  }

  /* Remove built-in form typography styles */
  input, button, textarea, select {
    font: inherit;
  }

  /* Avoid text overflows */
  p, h1, h2, h3, h4, h5, h6 {
    overflow-wrap: break-word;
    hyphens: auto;
  }
`;

// Accessibility Styles
const accessibilityStyles = css`
  /* Enhanced focus styles */
  :focus-visible {
    outline: 3px solid ${lightThemeColors.primary[500]};
    outline-offset: 2px;
    
    @media (prefers-color-scheme: dark) {
      outline-color: ${darkThemeColors.primary[500]};
    }
  }

  /* Remove focus outline for mouse users */
  :focus:not(:focus-visible) {
    outline: none;
  }

  /* Minimum tap target size */
  button, a, input, select {
    min-height: ${SPACING.TAP_TARGET}px;
    min-width: ${SPACING.TAP_TARGET}px;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }

  /* High contrast mode support */
  @media (forced-colors: active) {
    * {
      forced-color-adjust: none;
    }
  }
`;

// Print Styles
const printStyles = css`
  @media print {
    /* Ensure black text on white background */
    body {
      background-color: white !important;
      color: black !important;
    }

    /* Remove unnecessary elements */
    nav, footer, button, .no-print {
      display: none !important;
    }

    /* Ensure links are readable */
    a {
      text-decoration: underline;
      color: black !important;
    }

    /* Show full URLs after links */
    a[href^="http"]::after {
      content: " (" attr(href) ")";
    }

    /* Ensure proper page breaks */
    h1, h2, h3, h4, h5, h6 {
      page-break-after: avoid;
      break-after: avoid;
    }

    img {
      page-break-inside: avoid;
      break-inside: avoid;
    }
  }
`;

// RTL Support
const rtlStyles = css`
  [dir="rtl"] {
    text-align: right;
  }
`;

// Performance Optimizations
const performanceStyles = css`
  /* Content visibility optimization */
  .content-hidden {
    content-visibility: auto;
    contain-intrinsic-size: 0 500px;
  }

  /* GPU acceleration for animations */
  .gpu-accelerated {
    transform: translateZ(0);
    backface-visibility: hidden;
    perspective: 1000px;
  }
`;

// Global Styles Component
export const GlobalStyles = createGlobalStyle`
  ${resetStyles}
  ${accessibilityStyles}
  ${printStyles}
  ${rtlStyles}
  ${performanceStyles}

  /* Custom scrollbar styles */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: ${lightThemeColors.surface[200]};
    
    @media (prefers-color-scheme: dark) {
      background: ${darkThemeColors.surface[200]};
    }
  }

  ::-webkit-scrollbar-thumb {
    background: ${lightThemeColors.surface[400]};
    border-radius: 4px;
    
    @media (prefers-color-scheme: dark) {
      background: ${darkThemeColors.surface[400]};
    }

    &:hover {
      background: ${lightThemeColors.surface[500]};
      
      @media (prefers-color-scheme: dark) {
        background: ${darkThemeColors.surface[500]};
      }
    }
  }

  /* Selection styles */
  ::selection {
    background-color: ${lightThemeColors.primary[200]};
    color: ${lightThemeColors.text[900]};
    
    @media (prefers-color-scheme: dark) {
      background-color: ${darkThemeColors.primary[700]};
      color: ${darkThemeColors.text[100]};
    }
  }
`;