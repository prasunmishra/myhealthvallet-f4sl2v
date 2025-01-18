/**
 * @fileoverview Redux reducer for managing notification state in the PHRSAT application
 * Implements type-safe state updates with optimistic updates and real-time notification handling
 * Version: 1.9.5 (@reduxjs/toolkit)
 */

import { createReducer, PayloadAction } from '@reduxjs/toolkit';
import { 
  NotificationsState, 
  NotificationsActionTypes,
  FetchNotificationsSuccessAction,
  UpdateNotificationPayload,
  FetchNotificationsFailureAction
} from './notifications.types';
import { Notification } from '../../types/notifications.types';

/**
 * Initial state for notifications with strict type enforcement
 */
const initialState: NotificationsState = {
  items: [],
  loading: false,
  error: null,
  total: 0,
  currentPage: 1,
  pageSize: 10,
  unreadCount: 0,
  lastUpdated: null
};

/**
 * Type-safe reducer for notifications state management
 * Implements optimistic updates and real-time notification handling
 */
const notificationsReducer = createReducer(initialState, (builder) => {
  builder
    // Handle fetch notifications request
    .addCase(NotificationsActionTypes.FETCH_NOTIFICATIONS, (state) => {
      state.loading = true;
      state.error = null;
    })

    // Handle successful notifications fetch
    .addCase(
      NotificationsActionTypes.FETCH_NOTIFICATIONS_SUCCESS,
      (state, action: FetchNotificationsSuccessAction) => {
        const { items, total, unreadCount, page, size } = action.payload;
        state.items = items;
        state.total = total;
        state.unreadCount = unreadCount;
        state.currentPage = page;
        state.pageSize = size;
        state.loading = false;
        state.error = null;
        state.lastUpdated = new Date();
      }
    )

    // Handle fetch notifications failure
    .addCase(
      NotificationsActionTypes.FETCH_NOTIFICATIONS_FAILURE,
      (state, action: FetchNotificationsFailureAction) => {
        state.loading = false;
        state.error = action.payload;
        state.lastUpdated = new Date();
      }
    )

    // Handle marking single notification as read with optimistic update
    .addCase(
      NotificationsActionTypes.MARK_AS_READ,
      (state, action: PayloadAction<UpdateNotificationPayload>) => {
        const { id, readAt } = action.payload;
        const notification = state.items.find(item => item.id === id);
        
        if (notification && !notification.readAt) {
          state.unreadCount = Math.max(0, state.unreadCount - 1);
          state.items = state.items.map(item =>
            item.id === id
              ? { ...item, readAt }
              : item
          );
          state.lastUpdated = new Date();
        }
      }
    )

    // Handle marking all notifications as read
    .addCase(
      NotificationsActionTypes.MARK_ALL_AS_READ,
      (state, action: PayloadAction<string>) => {
        const userId = action.payload;
        const currentTime = new Date();
        
        state.items = state.items.map(item =>
          item.userId === userId && !item.readAt
            ? { ...item, readAt: currentTime }
            : item
        );
        
        state.unreadCount = 0;
        state.lastUpdated = currentTime;
      }
    )

    // Handle receiving real-time notification
    .addCase(
      NotificationsActionTypes.RECEIVE_REAL_TIME_NOTIFICATION,
      (state, action: PayloadAction<Notification>) => {
        const newNotification = action.payload;
        
        // Check for duplicates
        const isDuplicate = state.items.some(item => item.id === newNotification.id);
        
        if (!isDuplicate) {
          state.items = [newNotification, ...state.items];
          state.total += 1;
          state.unreadCount += 1;
          state.lastUpdated = new Date();
        }
      }
    )

    // Handle clearing all notifications
    .addCase(NotificationsActionTypes.CLEAR_NOTIFICATIONS, (state) => {
      state.items = [];
      state.total = 0;
      state.unreadCount = 0;
      state.currentPage = 1;
      state.lastUpdated = new Date();
    });
});

export default notificationsReducer;