import React from 'react'; // v18.0.0
import styled from '@emotion/styled'; // v11.11.0
import useBreakpoint from '../../hooks/useBreakpoint';
import { CONTAINER_WIDTHS, SPACING } from '../../styles/dimensions';

/**
 * Props interface for the ResponsiveContainer component
 */
interface ResponsiveContainerProps {
  children: React.ReactNode;
  fullWidth?: boolean;
  noPadding?: boolean;
  className?: string;
}

/**
 * Determines the container width based on current breakpoint and fullWidth flag
 * @param breakpoint - Current viewport breakpoint
 * @param fullWidth - Whether container should be full width
 * @returns Appropriate container width value
 */
const getContainerWidth = (breakpoint: string, fullWidth: boolean): string => {
  if (fullWidth) {
    return '100%';
  }

  switch (breakpoint) {
    case 'mobile':
      return CONTAINER_WIDTHS.MOBILE;
    case 'tablet':
      return CONTAINER_WIDTHS.TABLET;
    case 'desktop':
    case 'largeDesktop':
      return CONTAINER_WIDTHS.DESKTOP;
    default:
      // SSR default case
      return CONTAINER_WIDTHS.MOBILE;
  }
};

/**
 * Styled container component with dynamic width and padding
 */
const Container = styled.div<{ width: string; noPadding: boolean }>`
  width: ${props => props.width};
  max-width: ${CONTAINER_WIDTHS.MAX};
  margin: 0 auto;
  padding: ${props => props.noPadding ? 0 : `0 ${SPACING.MEDIUM}px`};
  box-sizing: border-box;
  transition: width 0.3s ease-in-out;
`;

/**
 * ResponsiveContainer component that provides responsive container behavior
 * Automatically adjusts width and layout based on screen size breakpoints
 * 
 * @param props.children - Child components to be rendered inside the container
 * @param props.fullWidth - Whether the container should span full viewport width
 * @param props.noPadding - Whether to disable container padding
 * @param props.className - Optional CSS class name for additional styling
 */
const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  children,
  fullWidth = false,
  noPadding = false,
  className,
}) => {
  const { breakpoint } = useBreakpoint();
  const containerWidth = getContainerWidth(breakpoint, fullWidth);

  return (
    <Container
      width={containerWidth}
      noPadding={noPadding}
      className={className}
    >
      {children}
    </Container>
  );
};

export default ResponsiveContainer;