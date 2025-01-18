import React, { useState, useCallback, useEffect } from 'react';
import styled from '@emotion/styled';
import { Container, Typography, Paper, CircularProgress, Snackbar } from '@mui/material';
import { ErrorBoundary } from 'react-error-boundary';
import useWebSocket from 'react-use-websocket';

import Layout from '../../components/layout/Layout';
import NotificationSettings from '../../components/settings/NotificationSettings';
import { useNotifications } from '../../hooks/useNotifications';
import useAuth from '../../hooks/useAuth';
import { API_CONFIG } from '../../config/api.config';
import { WEBSOCKET_ROUTES } from '../../constants/api.constants';
import { NotificationPreferences } from '../../types/notifications.types';

// Styled components with WCAG 2.1 AAA compliance
const StyledContainer = styled(Container)`
  padding-top: ${({ theme }) => theme.spacing.LARGE}px;
  padding-bottom: ${({ theme }) => theme.spacing.LARGE}px;
  min-height: 100vh;
  position: relative;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const StyledPaper = styled(Paper)`
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  margin-top: ${({ theme }) => theme.spacing.MEDIUM}px;
  position: relative;
  border-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  box-shadow: ${({ theme }) => theme.shadows.md};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(255, 255, 255, 0.8);
  z-index: ${({ theme }) => theme.zIndex.overlay};
`;

const NotificationsScreen: React.FC = () => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user, isAuthenticated } = useAuth();
  const { refreshNotifications } = useNotifications();

  // WebSocket setup for real-time updates
  const wsUrl = API_CONFIG.buildUrl(WEBSOCKET_ROUTES.NOTIFICATIONS);
  const { sendMessage, lastMessage, readyState } = useWebSocket(wsUrl, {
    shouldReconnect: () => true,
    reconnectAttempts: 5,
    reconnectInterval: 3000,
    onOpen: () => console.log('WebSocket connected'),
    onError: (error) => {
      console.error('WebSocket error:', error);
      setError('Connection error. Some updates may be delayed.');
    }
  });

  // Handle real-time notification updates
  useEffect(() => {
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage.data);
        if (data.type === 'PREFERENCES_UPDATED') {
          refreshNotifications();
        }
      } catch (err) {
        console.error('Error processing WebSocket message:', err);
      }
    }
  }, [lastMessage, refreshNotifications]);

  // Handle preference updates
  const handleSettingsUpdate = useCallback(async (updatedPreferences: NotificationPreferences) => {
    setIsUpdating(true);
    setError(null);

    try {
      // Validate preferences before sending
      if (!updatedPreferences) {
        throw new Error('Invalid preferences data');
      }

      // Send update via WebSocket for real-time sync
      sendMessage(JSON.stringify({
        type: 'UPDATE_PREFERENCES',
        payload: updatedPreferences,
        userId: user?.id,
        timestamp: new Date().toISOString()
      }));

      // Refresh notifications to ensure sync
      await refreshNotifications();

    } catch (err) {
      console.error('Error updating preferences:', err);
      setError('Failed to update notification preferences. Please try again.');
    } finally {
      setIsUpdating(false);
    }
  }, [user, sendMessage, refreshNotifications]);

  // Error boundary fallback
  const ErrorFallback = ({ error }: { error: Error }) => (
    <StyledPaper>
      <Typography variant="h6" color="error" gutterBottom>
        Error Loading Notification Settings
      </Typography>
      <Typography>{error.message}</Typography>
    </StyledPaper>
  );

  return (
    <Layout>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <StyledContainer maxWidth="lg">
          <Typography 
            variant="h4" 
            component="h1" 
            gutterBottom
            aria-label="Notification Settings"
          >
            Notification Settings
          </Typography>

          <StyledPaper>
            {isUpdating && (
              <LoadingOverlay>
                <CircularProgress 
                  aria-label="Updating settings"
                  size={40}
                />
              </LoadingOverlay>
            )}

            <NotificationSettings
              onUpdate={handleSettingsUpdate}
              isDisabled={!isAuthenticated || isUpdating}
            />
          </StyledPaper>

          <Snackbar
            open={!!error}
            autoHideDuration={6000}
            onClose={() => setError(null)}
            message={error}
            aria-live="polite"
          />
        </StyledContainer>
      </ErrorBoundary>
    </Layout>
  );
};

export default NotificationsScreen;