import React from 'react';
import styled, { keyframes } from 'styled-components';
import { Theme } from '../../styles/theme';
import { ANIMATION_DURATIONS, ANIMATION_EASINGS } from '../../styles/animations';

// Size mapping for predefined spinner sizes
const SIZE_MAP = {
  small: 24,
  medium: 40,
  large: 56,
} as const;

interface SpinnerProps {
  size?: number | 'small' | 'medium' | 'large';
  color?: string;
  thickness?: number;
  className?: string;
  testId?: string;
  ariaLabel?: string;
}

// Hardware-accelerated rotation animation
const rotate = keyframes`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`;

// Styled container with proper accessibility attributes
const SpinnerContainer = styled.div<{ size: number }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${props => props.size}px;
  height: ${props => props.size}px;
  position: relative;
  pointer-events: none;
`;

// Optimized circular spinner element with theme support
const SpinnerCircle = styled.div<{
  size: number;
  thickness: number;
  spinnerColor: string;
}>`
  position: absolute;
  width: ${props => props.size}px;
  height: ${props => props.size}px;
  border: ${props => props.thickness}px solid;
  border-color: ${props => props.spinnerColor} transparent transparent transparent;
  border-radius: 50%;
  animation: ${rotate} ${ANIMATION_DURATIONS.NORMAL}ms ${ANIMATION_EASINGS.EASE_IN_OUT} infinite;
  will-change: transform;
  transform: translateZ(0);
  backface-visibility: hidden;

  @media (prefers-reduced-motion: reduce) {
    animation-duration: ${ANIMATION_DURATIONS.SLOW}ms;
  }
`;

const LoadingSpinner: React.FC<SpinnerProps> = React.memo(({
  size = 'medium',
  color,
  thickness = 2,
  className,
  testId = 'loading-spinner',
  ariaLabel = 'Loading...',
}) => {
  // Calculate final size based on prop type
  const finalSize = typeof size === 'number' ? size : SIZE_MAP[size];

  // Get theme-based color if not explicitly provided
  const getSpinnerColor = (theme: Theme): string => {
    if (color) return color;
    return theme.colors.primary[500];
  };

  return (
    <SpinnerContainer
      size={finalSize}
      className={className}
      data-testid={testId}
      role="progressbar"
      aria-label={ariaLabel}
      aria-busy="true"
      aria-live="polite"
    >
      <SpinnerCircle
        size={finalSize}
        thickness={thickness}
        spinnerColor={props => getSpinnerColor(props.theme)}
      />
    </SpinnerContainer>
  );
});

LoadingSpinner.displayName = 'LoadingSpinner';

export default LoadingSpinner;