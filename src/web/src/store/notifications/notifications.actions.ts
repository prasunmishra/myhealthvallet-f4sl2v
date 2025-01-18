/**
 * @fileoverview Redux action creators for notification management in PHRSAT
 * @version 1.0.0
 * 
 * Implements comprehensive notification management including:
 * - Real-time updates with WebSocket integration
 * - Offline support with local storage sync
 * - Analytics tracking for notification interactions
 * - Secure notification handling with proper authentication
 */

import { createAction } from '@reduxjs/toolkit'; // version: ^1.9.5
import { ThunkAction } from 'redux-thunk'; // version: ^2.4.2
import { analytics } from '@segment/analytics-next'; // version: ^1.51.3

import { NotificationsActionTypes } from './notifications.types';
import NotificationService from '../../services/notifications.service';

// Constants
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;
const OFFLINE_QUEUE_KEY = 'notification_offline_queue';
const notificationService = new NotificationService();

/**
 * Action creator for fetching notifications with pagination and filtering
 */
export const fetchNotifications = (
  page: number = 1,
  size: number = 20,
  filters?: NotificationFilter
): ThunkAction<Promise<void>, RootState, unknown, any> => {
  return async (dispatch) => {
    try {
      dispatch({ type: NotificationsActionTypes.FETCH_NOTIFICATIONS });

      analytics.track('Notifications Fetch Initiated', {
        page,
        size,
        filters
      });

      const response = await notificationService.getNotifications(page, size, filters);

      dispatch({
        type: NotificationsActionTypes.FETCH_NOTIFICATIONS_SUCCESS,
        payload: response
      });

      analytics.track('Notifications Fetch Succeeded', {
        count: response.items.length,
        total: response.total
      });
    } catch (error) {
      dispatch({
        type: NotificationsActionTypes.FETCH_NOTIFICATIONS_FAILURE,
        payload: error.message
      });

      analytics.track('Notifications Fetch Failed', {
        error: error.message
      });

      if (!navigator.onLine) {
        const offlineQueue = JSON.parse(
          localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'
        );
        offlineQueue.push({ type: 'fetch', params: { page, size, filters } });
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(offlineQueue));
      }
    }
  };
};

/**
 * Action creator for marking notifications as read with bulk support
 */
export const markNotificationAsRead = (
  notificationIds: string | string[]
): ThunkAction<Promise<void>, RootState, unknown, any> => {
  return async (dispatch) => {
    const ids = Array.isArray(notificationIds) ? notificationIds : [notificationIds];

    try {
      dispatch({
        type: NotificationsActionTypes.MARK_AS_READ,
        payload: ids
      });

      analytics.track('Mark Notifications Read', {
        count: ids.length
      });

      if (ids.length === 1) {
        await notificationService.markAsRead(ids[0]);
      } else {
        await notificationService.bulkMarkAsRead(ids);
      }
    } catch (error) {
      if (!navigator.onLine) {
        const offlineQueue = JSON.parse(
          localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'
        );
        offlineQueue.push({ type: 'markAsRead', ids });
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(offlineQueue));
      }

      analytics.track('Mark Notifications Read Failed', {
        error: error.message,
        count: ids.length
      });
    }
  };
};

/**
 * Action creator for handling real-time notifications
 */
export const receiveRealTimeNotification = createAction(
  NotificationsActionTypes.RECEIVE_REAL_TIME_NOTIFICATION,
  (notification: Notification) => {
    analytics.track('Real-time Notification Received', {
      type: notification.type,
      priority: notification.priority
    });

    if (!navigator.onLine) {
      const offlineQueue = JSON.parse(
        localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'
      );
      offlineQueue.push({ type: 'realtime', notification });
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(offlineQueue));
    }

    return {
      payload: {
        ...notification,
        receivedAt: new Date().toISOString()
      }
    };
  }
);

/**
 * Action creator for syncing offline notifications
 */
export const syncOfflineNotifications = (): ThunkAction<Promise<void>, RootState, unknown, any> => {
  return async (dispatch) => {
    if (!navigator.onLine) return;

    const offlineQueue = JSON.parse(
      localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]'
    );

    if (offlineQueue.length === 0) return;

    try {
      dispatch({
        type: NotificationsActionTypes.SYNC_OFFLINE_NOTIFICATIONS
      });

      await notificationService.syncOfflineNotifications(offlineQueue);
      localStorage.removeItem(OFFLINE_QUEUE_KEY);

      analytics.track('Offline Notifications Synced', {
        count: offlineQueue.length
      });
    } catch (error) {
      analytics.track('Offline Notifications Sync Failed', {
        error: error.message,
        count: offlineQueue.length
      });
    }
  };
};

/**
 * Action creator for handling notification expiration
 */
export const handleNotificationExpiration = createAction(
  NotificationsActionTypes.UPDATE_NOTIFICATION,
  (notification: Notification) => {
    analytics.track('Notification Expired', {
      id: notification.id,
      type: notification.type
    });

    return {
      payload: {
        ...notification,
        expired: true,
        expirationHandledAt: new Date().toISOString()
      }
    };
  }
);

/**
 * Action creator for creating a new notification
 */
export const createNotification = createAction(
  NotificationsActionTypes.CREATE_NOTIFICATION,
  (notification: Notification) => {
    analytics.track('Notification Created', {
      type: notification.type,
      priority: notification.priority
    });

    return {
      payload: {
        ...notification,
        createdAt: new Date().toISOString()
      }
    };
  }
);