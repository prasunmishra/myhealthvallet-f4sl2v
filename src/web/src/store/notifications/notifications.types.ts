/**
 * @fileoverview Redux-specific type definitions for the PHRSAT notification system
 * Defines action types, state interfaces, and action payloads for notification management
 * Version: 1.9.5 (@reduxjs/toolkit)
 */

import { PayloadAction } from '@reduxjs/toolkit';
import { Notification, NotificationList } from '../../types/notifications.types';

/**
 * Comprehensive enum of all notification-related Redux action types
 */
export enum NotificationsActionTypes {
  FETCH_NOTIFICATIONS = '@notifications/FETCH_NOTIFICATIONS',
  FETCH_NOTIFICATIONS_SUCCESS = '@notifications/FETCH_NOTIFICATIONS_SUCCESS',
  FETCH_NOTIFICATIONS_FAILURE = '@notifications/FETCH_NOTIFICATIONS_FAILURE',
  CREATE_NOTIFICATION = '@notifications/CREATE_NOTIFICATION',
  UPDATE_NOTIFICATION = '@notifications/UPDATE_NOTIFICATION',
  MARK_AS_READ = '@notifications/MARK_AS_READ',
  MARK_ALL_AS_READ = '@notifications/MARK_ALL_AS_READ',
  RECEIVE_REAL_TIME_NOTIFICATION = '@notifications/RECEIVE_REAL_TIME_NOTIFICATION',
  CLEAR_NOTIFICATIONS = '@notifications/CLEAR_NOTIFICATIONS'
}

/**
 * Interface defining the shape of the notifications Redux state
 * Includes pagination, loading states, and error handling
 */
export interface NotificationsState {
  /** Immutable array of notification items */
  readonly items: readonly Notification[];
  
  /** Loading state indicator */
  loading: boolean;
  
  /** Error message if any */
  error: string | null;
  
  /** Total count of notifications */
  total: number;
  
  /** Current page number for pagination */
  currentPage: number;
  
  /** Number of items per page */
  pageSize: number;
  
  /** Count of unread notifications */
  unreadCount: number;
  
  /** Timestamp of last state update */
  lastUpdated: Date | null;
}

/**
 * Interface for notification fetch action payload
 * Supports pagination and filtering
 */
export interface FetchNotificationsPayload {
  /** Page number to fetch */
  page: number;
  
  /** Number of items per page */
  size: number;
  
  /** Optional filters for the fetch operation */
  filters?: {
    /** Filter by read status */
    read?: boolean;
    /** Filter by notification types */
    types?: string[];
    /** Filter by date range */
    dateRange?: {
      start: Date;
      end: Date;
    };
  };
}

/**
 * Interface for notification update action payload
 * Includes security context and audit information
 */
export interface UpdateNotificationPayload {
  /** ID of the notification to update */
  id: string;
  
  /** Timestamp when notification was read */
  readAt: Date;
  
  /** User ID for audit tracking */
  userId: string;
  
  /** Optional metadata updates */
  metadata?: Record<string, unknown>;
}

/**
 * Type definitions for Redux actions with typed payloads
 */
export type FetchNotificationsAction = PayloadAction<FetchNotificationsPayload>;
export type FetchNotificationsSuccessAction = PayloadAction<NotificationList>;
export type FetchNotificationsFailureAction = PayloadAction<string>;
export type CreateNotificationAction = PayloadAction<Notification>;
export type UpdateNotificationAction = PayloadAction<UpdateNotificationPayload>;
export type MarkAsReadAction = PayloadAction<string>;
export type MarkAllAsReadAction = PayloadAction<string>; // userId
export type ReceiveRealTimeNotificationAction = PayloadAction<Notification>;
export type ClearNotificationsAction = PayloadAction<void>;