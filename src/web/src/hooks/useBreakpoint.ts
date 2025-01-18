import { useState, useEffect } from 'react'; // v18.0.0
import { BREAKPOINTS } from '../styles/dimensions';

/**
 * Type definition for the breakpoint values returned by the hook
 */
type Breakpoint = 'mobile' | 'tablet' | 'desktop' | 'largeDesktop';

/**
 * Interface defining the return type of the useBreakpoint hook
 */
interface UseBreakpointReturn {
  breakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isLargeDesktop: boolean;
}

/**
 * Determines the current breakpoint based on window width
 * @param width - Current window width in pixels
 * @returns Current breakpoint identifier
 */
const getBreakpoint = (width: number): Breakpoint => {
  if (width < BREAKPOINTS.MOBILE) {
    return 'mobile';
  }
  if (width >= BREAKPOINTS.MOBILE && width < BREAKPOINTS.TABLET) {
    return 'mobile';
  }
  if (width >= BREAKPOINTS.TABLET && width < BREAKPOINTS.DESKTOP) {
    return 'tablet';
  }
  if (width >= BREAKPOINTS.DESKTOP && width < BREAKPOINTS.LARGE_DESKTOP) {
    return 'desktop';
  }
  return 'largeDesktop';
};

/**
 * Custom hook for responsive breakpoint detection
 * Provides real-time viewport size monitoring with SSR compatibility
 * and optimized performance through RAF
 * 
 * @returns Object containing current breakpoint and boolean flags for responsive behavior
 */
const useBreakpoint = (): UseBreakpointReturn => {
  // Initialize with SSR-safe window check
  const [width, setWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : BREAKPOINTS.MOBILE
  );

  // Track animation frame for cleanup
  const [rafId, setRafId] = useState<number | null>(null);

  useEffect(() => {
    // Handler for window resize events using requestAnimationFrame
    const handleResize = () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      
      const newRafId = window.requestAnimationFrame(() => {
        setWidth(window.innerWidth);
      });
      
      setRafId(newRafId);
    };

    // Add event listener
    window.addEventListener('resize', handleResize);
    
    // Set initial width
    handleResize();

    // Cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [rafId]);

  // Calculate current breakpoint
  const breakpoint = getBreakpoint(width);

  // Derive boolean flags based on current breakpoint
  const isMobile = breakpoint === 'mobile';
  const isTablet = breakpoint === 'tablet';
  const isDesktop = breakpoint === 'desktop';
  const isLargeDesktop = breakpoint === 'largeDesktop';

  return {
    breakpoint,
    isMobile,
    isTablet,
    isDesktop,
    isLargeDesktop,
  };
};

export default useBreakpoint;