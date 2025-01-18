/**
 * @fileoverview Type definitions for the PHRSAT notification system
 * Defines types and interfaces for managing notifications including real-time updates,
 * notification content, filtering, and pagination.
 */

/**
 * Comprehensive enum defining all possible notification types in the system
 */
export enum NotificationType {
  HEALTH_ALERT = 'HEALTH_ALERT',
  APPOINTMENT_REMINDER = 'APPOINTMENT_REMINDER',
  DOCUMENT_PROCESSED = 'DOCUMENT_PROCESSED',
  DATA_SYNC = 'DATA_SYNC',
  SYSTEM_UPDATE = 'SYSTEM_UPDATE',
  ANALYSIS_COMPLETE = 'ANALYSIS_COMPLETE',
  SECURITY_ALERT = 'SECURITY_ALERT'
}

/**
 * Enum defining notification priority levels
 * Used for determining notification display order and urgency
 */
export enum NotificationPriority {
  URGENT = 'URGENT',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW'
}

/**
 * Interface defining the structure of notification content
 * Supports internationalization and rich media content
 */
export interface NotificationContent {
  /** Main title of the notification */
  title: string;
  
  /** Detailed message content */
  message: string;
  
  /** Additional structured data specific to the notification type */
  data: Record<string, unknown>;
  
  /** Internationalization key for translation support */
  localeKey: string;
  
  /** Optional URL for notification-related action */
  actionUrl: string | null;
  
  /** Optional URL for notification-related image */
  imageUrl: string | null;
}

/**
 * Comprehensive interface for notification objects
 * Includes all metadata and tracking information
 */
export interface Notification {
  /** Unique identifier for the notification */
  id: string;
  
  /** Type of the notification */
  type: NotificationType;
  
  /** Priority level of the notification */
  priority: NotificationPriority;
  
  /** Content of the notification */
  content: NotificationContent;
  
  /** Timestamp when the notification was created */
  createdAt: Date;
  
  /** Timestamp when the notification was read (null if unread) */
  readAt: Date | null;
  
  /** Optional timestamp when the notification expires */
  expiresAt: Date | null;
  
  /** ID of the user this notification belongs to */
  userId: string;
  
  /** Additional metadata for extensibility */
  metadata: Record<string, unknown>;
}

/**
 * Interface for filtering notifications in queries
 * Supports complex filtering scenarios
 */
export interface NotificationFilter {
  /** Filter by specific notification types */
  types: NotificationType[];
  
  /** Filter by priority levels */
  priorities: NotificationPriority[];
  
  /** Start date for date range filtering */
  startDate: Date;
  
  /** End date for date range filtering */
  endDate: Date;
  
  /** Filter by read status (null for all) */
  readStatus: boolean | null;
}

/**
 * Interface for paginated notification lists
 * Includes metadata for pagination and unread counts
 */
export interface NotificationList {
  /** Array of notification items */
  items: Notification[];
  
  /** Total count of notifications matching the filter */
  total: number;
  
  /** Count of unread notifications */
  unreadCount: number;
  
  /** Current page number */
  page: number;
  
  /** Number of items per page */
  size: number;
}