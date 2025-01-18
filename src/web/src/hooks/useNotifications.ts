/**
 * @fileoverview Custom React hook for managing notifications in the PHRSAT web application
 * @version 1.0.0
 * 
 * Provides comprehensive notification management including:
 * - Real-time updates via WebSocket
 * - Offline support with queue
 * - Priority-based handling
 * - Advanced error handling
 * - Batch operations
 */

import { useEffect, useCallback } from 'react'; // version: ^18.2.0
import { useDispatch, useSelector } from 'react-redux'; // version: ^8.0.5
import { 
  fetchNotifications, 
  markAsRead, 
  receiveRealTimeNotification 
} from '../store/notifications/notifications.actions';
import { 
  NotificationsService,
} from '../services/notifications.service';
import { 
  Notification,
  NotificationType 
} from '../types/notifications.types';

// Initialize NotificationsService as a singleton
const notificationService = new NotificationsService();

interface UseNotificationsOptions {
  page?: number;
  size?: number;
  type?: NotificationType;
  priority?: number;
  groupBy?: string;
  includeRead?: boolean;
}

/**
 * Custom hook for comprehensive notification management
 */
export const useNotifications = (options: UseNotificationsOptions = {}) => {
  const dispatch = useDispatch();
  
  // Select notifications state from Redux store
  const notifications = useSelector((state: any) => state.notifications.items);
  const total = useSelector((state: any) => state.notifications.total);
  const loading = useSelector((state: any) => state.notifications.loading);
  const error = useSelector((state: any) => state.notifications.error);
  const connectionStatus = useSelector((state: any) => state.notifications.connectionStatus);

  /**
   * Initialize WebSocket connection and handle real-time updates
   */
  useEffect(() => {
    const handleNotification = (notification: Notification) => {
      dispatch(receiveRealTimeNotification(notification));
    };

    notificationService.subscribeToNotifications(handleNotification);

    return () => {
      notificationService.disconnect();
    };
  }, [dispatch]);

  /**
   * Fetch notifications with pagination and filtering
   */
  useEffect(() => {
    const fetchData = async () => {
      await dispatch(fetchNotifications({
        page: options.page || 1,
        size: options.size || 20,
        type: options.type,
        priority: options.priority,
        includeRead: options.includeRead,
        groupBy: options.groupBy
      }));
    };

    fetchData();
  }, [dispatch, options]);

  /**
   * Mark notification as read with offline support
   */
  const markNotificationAsRead = useCallback(async (id: string) => {
    try {
      await dispatch(markAsRead(id));
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }, [dispatch]);

  /**
   * Mark all notifications as read
   */
  const markAllAsRead = useCallback(async () => {
    try {
      const notificationIds = notifications.map((n: Notification) => n.id);
      await dispatch(markAsRead(notificationIds));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }, [dispatch, notifications]);

  /**
   * Refresh notifications
   */
  const refreshNotifications = useCallback(async () => {
    try {
      await dispatch(fetchNotifications({
        page: options.page || 1,
        size: options.size || 20,
        type: options.type,
        priority: options.priority,
        includeRead: options.includeRead,
        groupBy: options.groupBy
      }));
    } catch (error) {
      console.error('Error refreshing notifications:', error);
      throw error;
    }
  }, [dispatch, options]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    dispatch({ type: 'notifications/clearError' });
  }, [dispatch]);

  /**
   * Reconnect WebSocket
   */
  const reconnect = useCallback(async () => {
    try {
      await notificationService.reconnect();
    } catch (error) {
      console.error('Error reconnecting to WebSocket:', error);
      throw error;
    }
  }, []);

  return {
    notifications,
    total,
    loading,
    error,
    connectionStatus,
    markNotificationAsRead,
    markAllAsRead,
    refreshNotifications,
    clearError,
    reconnect
  };
};

export default useNotifications;