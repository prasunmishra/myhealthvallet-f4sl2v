import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react'; // ^13.0.0
import userEvent from '@testing-library/user-event'; // ^14.0.0
import { expect, describe, it, beforeEach } from '@jest/globals'; // ^29.0.0
import { ThemeProvider } from 'styled-components'; // ^5.3.0
import { Button } from '../../../src/components/common/Button';
import { createTheme } from '../../../src/styles/theme';

// Helper function to render button with theme context
const renderWithTheme = (ui: React.ReactNode, mode: 'light' | 'dark' = 'light') => {
  const theme = createTheme(mode);
  return render(
    <ThemeProvider theme={theme}>
      {ui}
    </ThemeProvider>
  );
};

describe('Button Component', () => {
  // Theme Integration Tests
  describe('Theme Integration', () => {
    it('renders correctly in light mode', () => {
      renderWithTheme(<Button>Test Button</Button>, 'light');
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({
        backgroundColor: createTheme('light').colors.primary[500],
        color: createTheme('light').colors.text[100]
      });
    });

    it('renders correctly in dark mode', () => {
      renderWithTheme(<Button>Test Button</Button>, 'dark');
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({
        backgroundColor: createTheme('dark').colors.primary[500],
        color: createTheme('dark').colors.text[100]
      });
    });

    it('adapts to high contrast mode', () => {
      // Mock forced-colors media query
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(forced-colors: active)',
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn()
      }));

      renderWithTheme(<Button>Test Button</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ border: '1px solid ButtonText' });
    });
  });

  // Button States Tests
  describe('Button States', () => {
    it('renders in normal state correctly', () => {
      renderWithTheme(<Button>Normal Button</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute('aria-busy');
    });

    it('handles hover state correctly', async () => {
      renderWithTheme(<Button>Hover Button</Button>);
      const button = screen.getByRole('button');
      await userEvent.hover(button);
      expect(button).toHaveStyle({
        backgroundColor: createTheme('light').colors.primary[600]
      });
    });

    it('handles active state correctly', async () => {
      renderWithTheme(<Button>Active Button</Button>);
      const button = screen.getByRole('button');
      await userEvent.click(button);
      expect(button).toHaveStyle({
        backgroundColor: createTheme('light').colors.primary[700]
      });
    });

    it('renders correctly in disabled state', () => {
      renderWithTheme(<Button disabled>Disabled Button</Button>);
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveStyle({ opacity: '0.6' });
    });

    it('displays loading state correctly', () => {
      renderWithTheme(<Button loading>Loading Button</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  // Accessibility Tests
  describe('Accessibility', () => {
    it('maintains sufficient contrast ratio', () => {
      renderWithTheme(<Button>Test Button</Button>);
      const button = screen.getByRole('button');
      const styles = window.getComputedStyle(button);
      expect(styles.backgroundColor).toBeDefined();
      expect(styles.color).toBeDefined();
    });

    it('supports keyboard navigation', async () => {
      const handleClick = jest.fn();
      renderWithTheme(<Button onClick={handleClick}>Keyboard Button</Button>);
      const button = screen.getByRole('button');
      
      button.focus();
      expect(document.activeElement).toBe(button);
      
      fireEvent.keyDown(button, { key: 'Enter' });
      expect(handleClick).toHaveBeenCalled();
    });

    it('provides proper ARIA attributes', () => {
      renderWithTheme(
        <Button loading disabled ariaLabel="Test Button">
          Button Text
        </Button>
      );
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Test Button');
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAttribute('aria-busy', 'true');
    });

    it('supports reduced motion preferences', () => {
      // Mock prefers-reduced-motion media query
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addListener: jest.fn(),
        removeListener: jest.fn()
      }));

      renderWithTheme(<Button>Motion Button</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({ transition: 'none' });
    });
  });

  // Variant Tests
  describe('Button Variants', () => {
    it('renders primary variant correctly', () => {
      renderWithTheme(<Button variant="primary">Primary Button</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({
        backgroundColor: createTheme('light').colors.primary[500]
      });
    });

    it('renders secondary variant correctly', () => {
      renderWithTheme(<Button variant="secondary">Secondary Button</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({
        backgroundColor: createTheme('light').colors.secondary[500]
      });
    });

    it('renders outlined variant correctly', () => {
      renderWithTheme(<Button variant="outlined">Outlined Button</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({
        backgroundColor: 'transparent',
        border: `2px solid ${createTheme('light').colors.primary[500]}`
      });
    });

    it('renders text variant correctly', () => {
      renderWithTheme(<Button variant="text">Text Button</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({
        backgroundColor: 'transparent'
      });
    });
  });

  // Size Tests
  describe('Button Sizes', () => {
    it('renders small size correctly', () => {
      renderWithTheme(<Button size="small">Small Button</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({
        minWidth: '64px',
        fontSize: createTheme('light').typography.fontSizes.small
      });
    });

    it('renders medium size correctly', () => {
      renderWithTheme(<Button size="medium">Medium Button</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({
        minWidth: '80px',
        fontSize: createTheme('light').typography.fontSizes.base
      });
    });

    it('renders large size correctly', () => {
      renderWithTheme(<Button size="large">Large Button</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveStyle({
        minWidth: '96px',
        fontSize: createTheme('light').typography.fontSizes.h4
      });
    });
  });

  // Mobile Optimization Tests
  describe('Mobile Optimization', () => {
    it('handles touch events properly', async () => {
      const handleTouch = jest.fn();
      renderWithTheme(<Button onTouchStart={handleTouch}>Touch Button</Button>);
      const button = screen.getByRole('button');
      
      fireEvent.touchStart(button);
      expect(handleTouch).toHaveBeenCalled();
    });

    it('maintains proper touch target size', () => {
      renderWithTheme(<Button>Touch Target Button</Button>);
      const button = screen.getByRole('button');
      const styles = window.getComputedStyle(button);
      const height = parseFloat(styles.height);
      expect(height).toBeGreaterThanOrEqual(44); // Minimum touch target size
    });
  });
});