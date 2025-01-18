import React from 'react'; // ^18.0.0
import styled from '@emotion/styled'; // ^11.0.0
import { ErrorBoundary } from 'react-error-boundary'; // ^4.0.0
import { Theme } from '../../styles/theme';
import { ColorPalette } from '../../styles/colors';

// Icon size mapping in pixels
const SIZE_MAP = {
  small: 16,
  medium: 24,
  large: 32,
} as const;

// Maximum allowed icon size
const MAX_ICON_SIZE = 64;

interface IconProps {
  name: string;
  size?: number | 'small' | 'medium' | 'large';
  color?: keyof ColorPalette | string;
  path?: string;
  title?: string;
  className?: string;
  onClick?: (event: React.MouseEvent) => void;
  ariaLabel?: string;
  testId?: string;
  isLoading?: boolean;
  isRTL?: boolean;
  role?: 'img' | 'presentation';
}

const IconWrapper = styled.span<{
  size: number;
  color: string;
  isLoading?: boolean;
  isRTL?: boolean;
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${props => props.size}px;
  height: ${props => props.size}px;
  color: ${props => props.color};
  line-height: 1;
  transition: all 0.2s ease;
  cursor: ${props => (props.onClick ? 'pointer' : 'inherit')};
  position: relative;
  outline: none;
  transform: ${props => props.isRTL ? 'scaleX(-1)' : 'none'};

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  animation: ${props => props.isLoading ? 'spin 1s linear infinite' : 'none'};

  &:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }

  svg {
    width: 100%;
    height: 100%;
    fill: currentColor;
  }
`;

const getSizeInPixels = (size?: number | 'small' | 'medium' | 'large'): number => {
  if (typeof size === 'number') {
    if (size > MAX_ICON_SIZE) {
      throw new Error(`Icon size cannot exceed ${MAX_ICON_SIZE}px`);
    }
    return size;
  }
  
  return size ? SIZE_MAP[size] : SIZE_MAP.medium;
};

const ErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <IconWrapper size={24} color="currentColor" role="presentation">
    ⚠️
  </IconWrapper>
);

export const Icon: React.FC<IconProps> = ({
  name,
  size,
  color = 'primary',
  path,
  title,
  className,
  onClick,
  ariaLabel,
  testId = 'icon',
  isLoading = false,
  isRTL = false,
  role = 'img',
}) => {
  const iconSize = React.useMemo(() => getSizeInPixels(size), [size]);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <IconWrapper
        size={iconSize}
        color={color}
        className={className}
        onClick={onClick}
        isLoading={isLoading}
        isRTL={isRTL}
        data-testid={testId}
        role={role}
        aria-label={ariaLabel || title}
        title={title}
      >
        {path ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            focusable="false"
          >
            <path d={path} />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            focusable="false"
          >
            <use href={`#icon-${name}`} />
          </svg>
        )}
      </IconWrapper>
    </ErrorBoundary>
  );
};

// Type export for component props
export type { IconProps };