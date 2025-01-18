/**
 * High-performance React hook for platform and device type detection
 * @module usePlatform
 * @version 1.0.0
 */

import { useState, useEffect, useMemo, useCallback } from 'react'; // v18.0.0
import {
    DeviceType,
    PlatformOS,
    getDeviceType,
    getPlatformOS
} from '../utils/platform.utils';

/**
 * Return type for usePlatform hook with comprehensive platform information
 */
interface UsePlatformReturn {
    deviceType: DeviceType;
    platformOS: PlatformOS;
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
    isIOS: boolean;
    isAndroid: boolean;
    isWeb: boolean;
    isHighContrast: boolean;
}

/**
 * Custom hook for platform and device detection with performance optimizations
 * @returns {UsePlatformReturn} Memoized object containing platform information and boolean flags
 */
const usePlatform = (): UsePlatformReturn => {
    // Initialize state with lazy evaluation
    const [deviceType, setDeviceType] = useState<DeviceType>(() => getDeviceType());
    const [platformOS, setPlatformOS] = useState<PlatformOS>(() => getPlatformOS());
    const [isHighContrast, setIsHighContrast] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return window.matchMedia('(forced-colors: active)').matches;
    });

    // Debounced resize handler with proper cleanup
    const handleResize = useCallback(() => {
        const newDeviceType = getDeviceType();
        if (newDeviceType !== deviceType) {
            setDeviceType(newDeviceType);
        }
    }, [deviceType]);

    // Memoized debounce function
    const debouncedResize = useMemo(() => {
        let timeoutId: NodeJS.Timeout;
        return () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(handleResize, 250);
        };
    }, [handleResize]);

    // Effect for window resize handling
    useEffect(() => {
        if (typeof window === 'undefined') return;

        window.addEventListener('resize', debouncedResize);
        
        // High contrast mode detection
        const contrastMediaQuery = window.matchMedia('(forced-colors: active)');
        const handleContrastChange = (e: MediaQueryListEvent) => {
            setIsHighContrast(e.matches);
        };
        
        contrastMediaQuery.addEventListener('change', handleContrastChange);

        // Cleanup function
        return () => {
            window.removeEventListener('resize', debouncedResize);
            contrastMediaQuery.removeEventListener('change', handleContrastChange);
        };
    }, [debouncedResize]);

    // Memoized platform detection flags
    const platformFlags = useMemo(() => ({
        isMobile: deviceType === DeviceType.MOBILE,
        isTablet: deviceType === DeviceType.TABLET,
        isDesktop: deviceType === DeviceType.DESKTOP,
        isIOS: platformOS === PlatformOS.IOS,
        isAndroid: platformOS === PlatformOS.ANDROID,
        isWeb: platformOS === PlatformOS.WEB
    }), [deviceType, platformOS]);

    // Return memoized platform information
    return useMemo(() => ({
        deviceType,
        platformOS,
        isHighContrast,
        ...platformFlags
    }), [deviceType, platformOS, isHighContrast, platformFlags]);
};

export default usePlatform;