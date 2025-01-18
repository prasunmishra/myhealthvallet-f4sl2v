import React from 'react'; // ^18.0.0
import styled from '@emotion/styled'; // ^11.11.0
import { keyframes } from '@emotion/react'; // ^11.11.0
import { useTheme } from '../../hooks/useTheme';
import { Theme } from '../../styles/theme';

// Props interface with comprehensive type definitions
interface ProgressBarProps {
  value: number | null;
  color?: string;
  height?: number;
  animated?: boolean;
  label?: string;
  className?: string;
  testId?: string;
}

// Indeterminate animation keyframes
const indeterminateAnimation = keyframes`
  0% {
    transform: translateX(-100%);
    width: 50%;
  }
  50% {
    transform: translateX(100%);
    width: 50%;
  }
  100% {
    transform: translateX(-100%);
    width: 50%;
  }
`;

// Styled container with accessibility enhancements
const ProgressBarContainer = styled.div<{ height?: number }>`
  background-color: ${({ theme }: { theme: Theme }) => theme.colors.surface[200]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.sm}px;
  overflow: hidden;
  position: relative;
  height: ${({ height }) => Math.min(Math.max(height || 4, 4), 32)}px;
  box-shadow: inset 0 0 0 1px ${({ theme }) => theme.colors.surface[300]};
  transition: opacity 0.2s ease-in-out;
  
  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

// Styled progress fill with performance optimizations
const ProgressBarFill = styled.div<{
  value: number;
  color?: string;
  animated?: boolean;
}>`
  background-color: ${({ color, theme }) => color || theme.colors.primary[500]};
  height: 100%;
  transition: width 0.3s ease-in-out;
  border-radius: ${({ theme }) => theme.shape.borderRadius.sm}px;
  width: ${({ value }) => value}%;
  will-change: transform, width;
  transform-origin: left center;
  
  ${({ animated }) =>
    animated &&
    `
    animation: ${indeterminateAnimation} 2s infinite linear;
  `}
  
  @media (prefers-reduced-motion: reduce) {
    animation: none;
    transition: none;
  }
`;

// Main component with comprehensive accessibility support
export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  color,
  height,
  animated = false,
  label,
  className,
  testId = 'progress-bar',
}) => {
  const { theme } = useTheme();
  
  // Validate and normalize progress value
  const normalizedValue = value === null ? 0 : Math.min(Math.max(value, 0), 100);
  
  // Determine if progress is indeterminate
  const isIndeterminate = value === null;

  return (
    <ProgressBarContainer
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={isIndeterminate ? undefined : normalizedValue}
      aria-valuetext={label || `${normalizedValue}%`}
      aria-label={label || 'Progress indicator'}
      className={className}
      data-testid={testId}
      height={height}
      theme={theme}
    >
      <ProgressBarFill
        value={normalizedValue}
        color={color}
        animated={isIndeterminate || animated}
        theme={theme}
      />
    </ProgressBarContainer>
  );
};

// Default export with display name for debugging
ProgressBar.displayName = 'ProgressBar';
export default ProgressBar;