/**
 * Redux selectors for accessing and deriving notification state data
 * Implements memoized selectors for optimal performance and type safety
 * @version 1.0.0
 */

import { createSelector } from '@reduxjs/toolkit'; // version: ^1.9.5
import { RootState } from '../rootReducer';
import { NotificationsState } from './notifications.types';

/**
 * Base selector for accessing the notifications state slice
 * Provides type-safe access to the notifications feature state
 */
export const selectNotificationsState = (state: RootState): NotificationsState => state.notifications;

/**
 * Memoized selector for retrieving notification items array
 * Returns immutable array of notifications with proper typing
 */
export const selectNotifications = createSelector(
  [selectNotificationsState],
  (state: NotificationsState) => state.items
);

/**
 * Memoized selector for notifications loading state
 * Used for managing loading indicators and UI states
 */
export const selectNotificationsLoading = createSelector(
  [selectNotificationsState],
  (state: NotificationsState) => state.loading
);

/**
 * Memoized selector for notifications error state
 * Provides type-safe access to error messages
 */
export const selectNotificationsError = createSelector(
  [selectNotificationsState],
  (state: NotificationsState) => state.error
);

/**
 * Memoized selector for unread notifications count
 * Used for displaying notification badges and indicators
 */
export const selectUnreadCount = createSelector(
  [selectNotificationsState],
  (state: NotificationsState) => state.unreadCount
);

/**
 * Memoized selector for pagination data
 * Returns comprehensive pagination information for UI components
 */
export const selectPaginationData = createSelector(
  [selectNotificationsState],
  (state: NotificationsState) => ({
    currentPage: state.currentPage,
    pageSize: state.pageSize,
    total: state.total
  })
);

/**
 * Memoized selector for last update timestamp
 * Used for managing real-time updates and cache invalidation
 */
export const selectLastUpdated = createSelector(
  [selectNotificationsState],
  (state: NotificationsState) => state.lastUpdated
);

/**
 * Memoized selector for filtering notifications by type
 * @param type - The notification type to filter by
 */
export const selectNotificationsByType = createSelector(
  [selectNotifications, (_state: RootState, type: string) => type],
  (notifications, type) => notifications.filter(notification => notification.type === type)
);

/**
 * Memoized selector for filtering notifications by priority
 * @param priority - The priority level to filter by
 */
export const selectNotificationsByPriority = createSelector(
  [selectNotifications, (_state: RootState, priority: string) => priority],
  (notifications, priority) => notifications.filter(notification => notification.priority === priority)
);

/**
 * Memoized selector for retrieving unread notifications
 * Used for displaying unread notification lists
 */
export const selectUnreadNotifications = createSelector(
  [selectNotifications],
  (notifications) => notifications.filter(notification => !notification.readAt)
);

/**
 * Memoized selector for retrieving notifications within a date range
 * @param startDate - Start date for filtering
 * @param endDate - End date for filtering
 */
export const selectNotificationsByDateRange = createSelector(
  [
    selectNotifications,
    (_state: RootState, startDate: Date) => startDate,
    (_state: RootState, _startDate: Date, endDate: Date) => endDate
  ],
  (notifications, startDate, endDate) => notifications.filter(
    notification => {
      const createdAt = new Date(notification.createdAt);
      return createdAt >= startDate && createdAt <= endDate;
    }
  )
);

/**
 * Memoized selector for retrieving notifications with pagination
 * @param page - Page number
 * @param pageSize - Number of items per page
 */
export const selectPaginatedNotifications = createSelector(
  [
    selectNotifications,
    (_state: RootState, page: number) => page,
    (_state: RootState, _page: number, pageSize: number) => pageSize
  ],
  (notifications, page, pageSize) => {
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return notifications.slice(startIndex, endIndex);
  }
);

/**
 * Memoized selector for checking if there are any urgent notifications
 * Used for displaying urgent notification indicators
 */
export const selectHasUrgentNotifications = createSelector(
  [selectNotifications],
  (notifications) => notifications.some(
    notification => notification.priority === 'URGENT' && !notification.readAt
  )
);

/**
 * Memoized selector for retrieving notification metadata
 * Used for analytics and tracking purposes
 */
export const selectNotificationsMetadata = createSelector(
  [selectNotificationsState],
  (state: NotificationsState) => ({
    total: state.total,
    unreadCount: state.unreadCount,
    lastUpdated: state.lastUpdated,
    currentPage: state.currentPage,
    pageSize: state.pageSize
  })
);