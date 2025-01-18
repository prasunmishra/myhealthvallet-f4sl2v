import React, { memo } from 'react'; // ^18.0.0
import styled from '@emotion/styled'; // ^11.0.0
import { useTheme } from '../../hooks/useTheme';
import { Theme } from '../../styles/theme';

// Props interface with comprehensive styling and interaction options
interface CardProps {
  children: React.ReactNode;
  elevation?: 0 | 1 | 2 | 3 | number;
  padding?: string | number;
  borderRadius?: string | number;
  backgroundColor?: string;
  onClick?: () => void;
  className?: string;
  testId?: string;
  ariaLabel?: string;
}

// Helper function to generate accessible and performant box shadow
const getElevationShadow = (elevation: number = 0): string => {
  // Validate elevation level
  const validElevation = Math.min(Math.max(elevation, 0), 3);
  
  // Calculate shadow opacities based on elevation
  const primaryOpacity = 0.1 + validElevation * 0.05;
  const ambientOpacity = 0.05 + validElevation * 0.03;
  
  // Generate elevation-based offsets
  const yOffset = validElevation * 2;
  const blur = validElevation * 4 + 4;
  const spread = validElevation;
  
  // Combine shadows with fallback support
  return `
    0px ${yOffset}px ${blur}px ${spread}px rgba(0, 0, 0, ${primaryOpacity}),
    0px ${yOffset / 2}px ${blur / 2}px ${spread / 2}px rgba(0, 0, 0, ${ambientOpacity})
  `;
};

// Styled container component with advanced visual features
const StyledCard = styled.div<CardProps>`
  background-color: ${props => props.backgroundColor || props.theme.colors.surface[100]};
  border-radius: ${props => props.borderRadius || props.theme.shape.borderRadius.md}px;
  padding: ${props => props.padding || props.theme.spacing.MEDIUM}px;
  box-shadow: ${props => getElevationShadow(props.elevation)};
  transition: box-shadow 0.3s ease-in-out, transform 0.2s ease-in-out;
  cursor: ${props => props.onClick ? 'pointer' : 'default'};
  will-change: transform, box-shadow;
  position: relative;
  overflow: hidden;

  /* Hover effects only on devices with hover capability */
  @media (hover: hover) {
    &:hover {
      transform: ${props => props.onClick ? 'translateY(-2px)' : 'none'};
      box-shadow: ${props => props.onClick ? getElevationShadow((props.elevation || 0) + 1) : getElevationShadow(props.elevation)};
    }
  }

  /* Active state for touch interactions */
  &:active {
    transform: ${props => props.onClick ? 'translateY(1px)' : 'none'};
    box-shadow: ${props => props.onClick ? getElevationShadow((props.elevation || 0) - 1) : getElevationShadow(props.elevation)};
  }

  /* Responsive padding adjustments */
  @media (max-width: ${props => props.theme.breakpoints.MOBILE}px) {
    padding: ${props => props.theme.spacing.SMALL}px;
  }

  /* High contrast outline for focus state */
  &:focus-visible {
    outline: 2px solid ${props => props.theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

// Main card component with theme integration and accessibility features
const Card: React.FC<CardProps> = memo(({
  children,
  elevation = 1,
  padding,
  borderRadius,
  backgroundColor,
  onClick,
  className,
  testId = 'card',
  ariaLabel,
  ...props
}) => {
  const { theme } = useTheme();

  return (
    <StyledCard
      elevation={elevation}
      padding={padding}
      borderRadius={borderRadius}
      backgroundColor={backgroundColor}
      onClick={onClick}
      className={className}
      data-testid={testId}
      aria-label={ariaLabel}
      role={onClick ? 'button' : 'region'}
      tabIndex={onClick ? 0 : undefined}
      {...props}
    >
      {children}
    </StyledCard>
  );
});

// Display name for debugging
Card.displayName = 'Card';

export default Card;