/**
 * Platform detection utilities with caching for optimal performance
 * @module platform.utils
 * @version 1.0.0
 */

// External imports
import UAParser from 'ua-parser-js'; // v1.0.35

// Constants for breakpoints (in pixels)
const BREAKPOINT_MOBILE = 768;
const BREAKPOINT_TABLET = 1024;

// Singleton instance of UAParser
const UA_PARSER_INSTANCE = new UAParser();

// Cache storage for platform detection results
let CACHED_DEVICE_TYPE: DeviceType | null = null;
let CACHED_PLATFORM_OS: PlatformOS | null = null;

/**
 * Enumeration of supported device types
 */
export enum DeviceType {
    MOBILE = 'mobile',
    TABLET = 'tablet',
    DESKTOP = 'desktop'
}

/**
 * Enumeration of supported platform operating systems
 */
export enum PlatformOS {
    IOS = 'ios',
    ANDROID = 'android',
    WEB = 'web'
}

/**
 * Gets the current window width safely
 * @returns {number} Current window width or 0 if not available
 */
const getWindowWidth = (): number => {
    return typeof window !== 'undefined' ? window.innerWidth : 0;
};

/**
 * Checks if the current platform is a desktop device
 * @returns {boolean} True if the platform is desktop
 */
export const isDesktop = (): boolean => {
    if (CACHED_DEVICE_TYPE) {
        return CACHED_DEVICE_TYPE === DeviceType.DESKTOP;
    }
    const deviceType = getDeviceType();
    return deviceType === DeviceType.DESKTOP;
};

/**
 * Checks if the current platform is a mobile device
 * @returns {boolean} True if the platform is mobile
 */
export const isMobile = (): boolean => {
    if (CACHED_DEVICE_TYPE) {
        return CACHED_DEVICE_TYPE === DeviceType.MOBILE;
    }
    const deviceType = getDeviceType();
    return deviceType === DeviceType.MOBILE;
};

/**
 * Checks if the current platform is a tablet device
 * @returns {boolean} True if the platform is tablet
 */
export const isTablet = (): boolean => {
    if (CACHED_DEVICE_TYPE) {
        return CACHED_DEVICE_TYPE === DeviceType.TABLET;
    }
    const deviceType = getDeviceType();
    return deviceType === DeviceType.TABLET;
};

/**
 * Determines the current device type based on user agent and screen size
 * @returns {DeviceType} The detected device type
 */
export const getDeviceType = (): DeviceType => {
    if (CACHED_DEVICE_TYPE) {
        return CACHED_DEVICE_TYPE;
    }

    const width = getWindowWidth();
    const device = UA_PARSER_INSTANCE.getDevice();
    const deviceType = device.type?.toLowerCase() || '';

    let result: DeviceType;

    // Primary detection through UA Parser
    if (deviceType === 'mobile' || width < BREAKPOINT_MOBILE) {
        result = DeviceType.MOBILE;
    } else if (deviceType === 'tablet' || (width >= BREAKPOINT_MOBILE && width < BREAKPOINT_TABLET)) {
        result = DeviceType.TABLET;
    } else {
        result = DeviceType.DESKTOP;
    }

    // Cache the result
    CACHED_DEVICE_TYPE = result;
    return result;
};

/**
 * Determines the current platform operating system
 * @returns {PlatformOS} The detected platform OS
 */
export const getPlatformOS = (): PlatformOS => {
    if (CACHED_PLATFORM_OS) {
        return CACHED_PLATFORM_OS;
    }

    const os = UA_PARSER_INSTANCE.getOS();
    const osName = os.name?.toLowerCase() || '';

    let result: PlatformOS;

    // Determine platform OS
    if (osName.includes('ios') || osName.includes('iphone') || osName.includes('ipad')) {
        result = PlatformOS.IOS;
    } else if (osName.includes('android')) {
        result = PlatformOS.ANDROID;
    } else {
        result = PlatformOS.WEB;
    }

    // Cache the result
    CACHED_PLATFORM_OS = result;
    return result;
};

/**
 * Clears the cached platform detection results
 * Useful when testing or when platform detection needs to be re-evaluated
 */
export const clearPlatformCache = (): void => {
    CACHED_DEVICE_TYPE = null;
    CACHED_PLATFORM_OS = null;
};