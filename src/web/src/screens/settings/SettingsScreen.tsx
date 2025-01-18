import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styled from '@emotion/styled';
import { useWebSocket } from 'react-use-websocket';
import Layout from '../../components/layout/Layout';
import NotificationSettings from '../../components/settings/NotificationSettings';
import PrivacySettings from '../../components/settings/PrivacySettings';
import ProfileSettings from '../../components/settings/ProfileSettings';
import Tabs from '../../components/common/Tabs';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { useAuth } from '../../hooks/useAuth';
import { API_CONFIG } from '../../config/api.config';

// Enum for settings tab identifiers
enum SettingsTab {
  PROFILE = 'profile',
  NOTIFICATIONS = 'notifications',
  PRIVACY = 'privacy',
  SECURITY = 'security',
  AUDIT_LOG = 'audit_log'
}

// Styled components
const SettingsContainer = styled.div`
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  min-height: 600px;

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  }
`;

const TabContent = styled.div`
  margin-top: ${({ theme }) => theme.spacing.LARGE}px;
  padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  background-color: ${({ theme }) => theme.colors.surface[100]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const SettingsScreen: React.FC = () => {
  const { user, isAuthenticated, securityContext, auditLog } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>(SettingsTab.PROFILE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WebSocket connection for real-time settings updates
  const { sendMessage, lastMessage } = useWebSocket(API_CONFIG.WEBSOCKET_ROUTES.SETTINGS, {
    shouldReconnect: () => isAuthenticated,
    reconnectAttempts: 5,
    reconnectInterval: 3000,
  });

  // Memoized security validation function
  const validateSecurity = useCallback(async (tab: SettingsTab) => {
    if (!isAuthenticated || !user) {
      throw new Error('Authentication required');
    }

    // Additional security checks for sensitive tabs
    if ([SettingsTab.PRIVACY, SettingsTab.SECURITY, SettingsTab.AUDIT_LOG].includes(tab)) {
      if (!securityContext?.mfaVerified) {
        throw new Error('MFA verification required');
      }
    }

    return true;
  }, [isAuthenticated, user, securityContext]);

  // Handle tab changes with security validation
  const handleTabChange = useCallback(async (newTab: SettingsTab) => {
    try {
      setIsLoading(true);
      await validateSecurity(newTab);

      // Log tab change in audit trail
      auditLog?.log({
        event: 'SETTINGS_TAB_CHANGE',
        userId: user?.id,
        details: { from: activeTab, to: newTab },
        timestamp: new Date()
      });

      setActiveTab(newTab);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, user, auditLog, validateSecurity]);

  // Handle settings updates with WebSocket sync
  const handleSettingsUpdate = useCallback(async (updateData: any) => {
    try {
      setIsLoading(true);

      // Send update via WebSocket
      sendMessage(JSON.stringify({
        type: 'SETTINGS_UPDATE',
        data: updateData,
        userId: user?.id,
        timestamp: new Date()
      }));

      // Log update in audit trail
      auditLog?.log({
        event: 'SETTINGS_UPDATE',
        userId: user?.id,
        details: updateData,
        timestamp: new Date()
      });

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    } finally {
      setIsLoading(false);
    }
  }, [user, auditLog, sendMessage]);

  // Process WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage.data);
        if (data.type === 'SETTINGS_UPDATE_RESPONSE') {
          // Handle response
        }
      } catch (err) {
        console.error('Failed to process WebSocket message:', err);
      }
    }
  }, [lastMessage]);

  // Render settings content based on active tab
  const renderTabContent = useMemo(() => {
    switch (activeTab) {
      case SettingsTab.PROFILE:
        return (
          <ProfileSettings
            onUpdateSuccess={() => handleSettingsUpdate({ type: 'PROFILE_UPDATE' })}
            onUpdateError={(error) => setError(error.message)}
          />
        );
      case SettingsTab.NOTIFICATIONS:
        return (
          <NotificationSettings />
        );
      case SettingsTab.PRIVACY:
        return (
          <PrivacySettings
            onSecurityViolation={(violation) => setError(violation)}
            auditLogger={auditLog?.log}
          />
        );
      default:
        return null;
    }
  }, [activeTab, handleSettingsUpdate, auditLog]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <Layout>
      <ErrorBoundary>
        <SettingsContainer>
          <Tabs
            activeTab={activeTab}
            onChange={(tab) => handleTabChange(tab as SettingsTab)}
            variant="contained"
            disabled={isLoading}
          >
            <Tabs.Tab label="Profile" icon="user" />
            <Tabs.Tab label="Notifications" icon="bell" />
            <Tabs.Tab 
              label="Privacy & Security" 
              icon="shield"
              tooltipContent="Manage privacy and security settings"
            />
          </Tabs>

          <TabContent role="tabpanel" aria-labelledby="settings-tab">
            {error && (
              <div role="alert" style={{ color: 'red', marginBottom: '1rem' }}>
                {error}
              </div>
            )}
            {renderTabContent}
          </TabContent>
        </SettingsContainer>
      </ErrorBoundary>
    </Layout>
  );
};

export default SettingsScreen;