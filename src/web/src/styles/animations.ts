/**
 * Core animation configuration and utility functions
 * Implements design system specifications for consistent motion design
 * @version 1.0.0
 */

import { keyframes, css } from 'styled-components';
import { SPACING } from './dimensions';

// Standard animation durations in milliseconds
export const ANIMATION_DURATIONS = {
  FAST: 150,
  NORMAL: 300,
  SLOW: 500,
} as const;

// Standard easing functions
export const ANIMATION_EASINGS = {
  EASE_IN: 'cubic-bezier(0.4, 0, 1, 1)',
  EASE_OUT: 'cubic-bezier(0, 0, 0.2, 1)',
  EASE_IN_OUT: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

// Duration for users with reduced motion preference
const REDUCED_MOTION_DURATION = 0;

// Animation configuration interfaces
export interface AnimationConfig {
  duration?: number;
  easing?: string;
  delay?: number;
  respectReducedMotion?: boolean;
}

export type SlideDirection = 'left' | 'right' | 'up' | 'down';

export interface SlideAnimationConfig extends AnimationConfig {
  direction: SlideDirection;
  distance?: number;
}

/**
 * Utility function to check if reduced motion is preferred
 */
export const shouldReduceMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

// Keyframe definitions
export const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

export const fadeOut = keyframes`
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
`;

export const slideIn = keyframes`
  from {
    transform: translateX(-${SPACING.BASE}px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
`;

export const slideOut = keyframes`
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(${SPACING.BASE}px);
    opacity: 0;
  }
`;

/**
 * Creates a fade animation with customizable configuration
 * Supports reduced motion preferences
 */
export const createFadeAnimation = ({
  duration = ANIMATION_DURATIONS.NORMAL,
  easing = ANIMATION_EASINGS.EASE_OUT,
  delay = 0,
  respectReducedMotion = true,
}: AnimationConfig = {}): string => {
  const actualDuration = respectReducedMotion && shouldReduceMotion()
    ? REDUCED_MOTION_DURATION
    : duration;

  return css`
    animation: ${fadeIn} ${actualDuration}ms ${easing} ${delay}ms;
    will-change: opacity;
    @media (prefers-reduced-motion: reduce) {
      animation-duration: ${REDUCED_MOTION_DURATION}ms;
    }
  `;
};

/**
 * Creates a slide animation with customizable configuration
 * Supports reduced motion preferences and directional sliding
 */
export const createSlideAnimation = ({
  direction,
  duration = ANIMATION_DURATIONS.NORMAL,
  easing = ANIMATION_EASINGS.EASE_OUT,
  delay = 0,
  distance = SPACING.BASE,
  respectReducedMotion = true,
}: SlideAnimationConfig): string => {
  const actualDuration = respectReducedMotion && shouldReduceMotion()
    ? REDUCED_MOTION_DURATION
    : duration;

  const getTransform = () => {
    switch (direction) {
      case 'left':
        return `translateX(-${distance}px)`;
      case 'right':
        return `translateX(${distance}px)`;
      case 'up':
        return `translateY(-${distance}px)`;
      case 'down':
        return `translateY(${distance}px)`;
      default:
        return 'none';
    }
  };

  return css`
    animation: ${slideIn} ${actualDuration}ms ${easing} ${delay}ms;
    will-change: transform, opacity;
    transform: ${getTransform()};
    @media (prefers-reduced-motion: reduce) {
      animation-duration: ${REDUCED_MOTION_DURATION}ms;
      transition: none;
    }
  `;
};

/**
 * Helper function to create transition strings
 * Supports multiple properties and reduced motion
 */
export const createTransition = (
  properties: string[],
  { duration = ANIMATION_DURATIONS.NORMAL, easing = ANIMATION_EASINGS.EASE_OUT }: AnimationConfig = {}
): string => {
  const transition = properties
    .map(prop => `${prop} ${duration}ms ${easing}`)
    .join(', ');

  return css`
    transition: ${transition};
    @media (prefers-reduced-motion: reduce) {
      transition: none;
    }
  `;
};

/**
 * Performance-optimized animation mixins
 * Uses transform and opacity for better rendering performance
 */
export const performanceOptimizedAnimation = css`
  backface-visibility: hidden;
  perspective: 1000;
  transform: translateZ(0);
  will-change: transform, opacity;
`;