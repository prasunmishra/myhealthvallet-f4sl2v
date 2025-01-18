/**
 * @fileoverview NotificationSettings Component
 * @version 1.0.0
 * 
 * Enterprise-grade notification settings management component with:
 * - Real-time preference updates
 * - Offline support with sync queue
 * - Enhanced accessibility
 * - Security features
 * - Comprehensive error handling
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Switch, FormControlLabel } from '@mui/material';
import { NotificationType } from '../../types/notifications.types';
import { useNotifications } from '../../hooks/useNotifications';
import NotificationService from '../../services/notifications.service';

interface NotificationPreferences {
  healthAlerts: boolean;
  appointmentReminders: boolean;
  documentProcessing: boolean;
  dataSync: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
  };
  priorities: {
    [key: string]: 'high' | 'medium' | 'low';
  };
  categories: NotificationType[];
}

const notificationService = new NotificationService();

export const NotificationSettings: React.FC = () => {
  // State management
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    healthAlerts: true,
    appointmentReminders: true,
    documentProcessing: true,
    dataSync: true,
    emailNotifications: true,
    pushNotifications: true,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00'
    },
    priorities: {
      [NotificationType.HEALTH_ALERT]: 'high',
      [NotificationType.APPOINTMENT_REMINDER]: 'medium',
      [NotificationType.DOCUMENT_PROCESSED]: 'low',
      [NotificationType.DATA_SYNC]: 'low'
    },
    categories: [
      NotificationType.HEALTH_ALERT,
      NotificationType.APPOINTMENT_REMINDER,
      NotificationType.DOCUMENT_PROCESSED,
      NotificationType.DATA_SYNC
    ]
  });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offlineQueue, setOfflineQueue] = useState<Array<{ type: string; payload: any }>>([]);

  // Custom hook for notifications
  const { notifications, refreshNotifications, syncStatus } = useNotifications();

  /**
   * Load saved preferences with offline support
   */
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        // First try to load from local storage for offline support
        const cachedPreferences = localStorage.getItem('notification_preferences');
        if (cachedPreferences) {
          setPreferences(JSON.parse(cachedPreferences));
        }

        // Then fetch from server if online
        if (navigator.onLine) {
          const serverPreferences = await notificationService.getPreferences();
          setPreferences(serverPreferences);
          localStorage.setItem('notification_preferences', JSON.stringify(serverPreferences));
        }
      } catch (err) {
        setError('Failed to load notification preferences');
        console.error('Error loading preferences:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadPreferences();
  }, []);

  /**
   * Handle preference changes with optimistic updates and offline queue
   */
  const handlePreferenceChange = useCallback(async (
    key: keyof NotificationPreferences,
    value: boolean,
    metadata?: Record<string, unknown>
  ) => {
    try {
      // Optimistic update
      setPreferences(prev => ({
        ...prev,
        [key]: value
      }));

      // Store in local storage
      const updatedPreferences = {
        ...preferences,
        [key]: value
      };
      localStorage.setItem('notification_preferences', JSON.stringify(updatedPreferences));

      if (!navigator.onLine) {
        // Queue update for when we're back online
        setOfflineQueue(prev => [...prev, {
          type: 'UPDATE_PREFERENCE',
          payload: { key, value, metadata }
        }]);
        return;
      }

      // Update server
      await notificationService.updatePreferences({
        [key]: value,
        ...metadata
      });

      // Update WebSocket subscription if needed
      if (key === 'pushNotifications' && value) {
        await notificationService.subscribeToNotifications();
      } else if (key === 'pushNotifications' && !value) {
        await notificationService.unsubscribeFromNotifications();
      }

      // Refresh notifications to ensure sync
      await refreshNotifications();

    } catch (err) {
      // Revert optimistic update on error
      setPreferences(prev => ({
        ...prev,
        [key]: !value
      }));
      setError('Failed to update preference');
      console.error('Error updating preference:', err);
    }
  }, [preferences, refreshNotifications]);

  /**
   * Process offline queue when coming back online
   */
  useEffect(() => {
    const handleOnline = async () => {
      if (offlineQueue.length === 0) return;

      try {
        setIsLoading(true);
        for (const item of offlineQueue) {
          if (item.type === 'UPDATE_PREFERENCE') {
            await notificationService.updatePreferences(item.payload);
          }
        }
        setOfflineQueue([]);
        await refreshNotifications();
      } catch (err) {
        setError('Failed to sync offline changes');
        console.error('Error processing offline queue:', err);
      } finally {
        setIsLoading(false);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [offlineQueue, refreshNotifications]);

  /**
   * Cleanup WebSocket connection on unmount
   */
  useEffect(() => {
    return () => {
      notificationService.unsubscribeFromNotifications();
    };
  }, []);

  if (isLoading) {
    return <div role="status" aria-label="Loading notification preferences">Loading...</div>;
  }

  if (error) {
    return (
      <div role="alert" aria-live="polite">
        Error: {error}
        <button onClick={() => setError(null)}>Dismiss</button>
      </div>
    );
  }

  return (
    <div role="region" aria-label="Notification Settings">
      <h2>Notification Preferences</h2>
      
      {/* Notification Types */}
      <section aria-labelledby="notification-types-heading">
        <h3 id="notification-types-heading">Notification Types</h3>
        <FormControlLabel
          control={
            <Switch
              checked={preferences.healthAlerts}
              onChange={(e) => handlePreferenceChange('healthAlerts', e.target.checked)}
              inputProps={{ 'aria-label': 'Health Alerts' }}
            />
          }
          label="Health Alerts"
        />
        <FormControlLabel
          control={
            <Switch
              checked={preferences.appointmentReminders}
              onChange={(e) => handlePreferenceChange('appointmentReminders', e.target.checked)}
              inputProps={{ 'aria-label': 'Appointment Reminders' }}
            />
          }
          label="Appointment Reminders"
        />
        <FormControlLabel
          control={
            <Switch
              checked={preferences.documentProcessing}
              onChange={(e) => handlePreferenceChange('documentProcessing', e.target.checked)}
              inputProps={{ 'aria-label': 'Document Processing' }}
            />
          }
          label="Document Processing"
        />
        <FormControlLabel
          control={
            <Switch
              checked={preferences.dataSync}
              onChange={(e) => handlePreferenceChange('dataSync', e.target.checked)}
              inputProps={{ 'aria-label': 'Data Sync' }}
            />
          }
          label="Data Sync"
        />
      </section>

      {/* Delivery Methods */}
      <section aria-labelledby="delivery-methods-heading">
        <h3 id="delivery-methods-heading">Delivery Methods</h3>
        <FormControlLabel
          control={
            <Switch
              checked={preferences.emailNotifications}
              onChange={(e) => handlePreferenceChange('emailNotifications', e.target.checked)}
              inputProps={{ 'aria-label': 'Email Notifications' }}
            />
          }
          label="Email Notifications"
        />
        <FormControlLabel
          control={
            <Switch
              checked={preferences.pushNotifications}
              onChange={(e) => handlePreferenceChange('pushNotifications', e.target.checked)}
              inputProps={{ 'aria-label': 'Push Notifications' }}
            />
          }
          label="Push Notifications"
        />
      </section>

      {/* Sync Status */}
      {!navigator.onLine && (
        <div role="status" aria-live="polite" className="offline-notice">
          You're offline. Changes will be saved when you're back online.
          Pending changes: {offlineQueue.length}
        </div>
      )}
      
      {syncStatus && (
        <div role="status" aria-live="polite" className="sync-status">
          Sync Status: {syncStatus}
        </div>
      )}
    </div>
  );
};

export default NotificationSettings;