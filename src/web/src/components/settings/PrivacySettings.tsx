import React, { useState, useCallback, useEffect } from 'react';
import styled from '@emotion/styled'; // ^11.0.0
import { debounce } from 'lodash'; // ^4.17.21
import Button from '../common/Button';
import { useAuth } from '../../hooks/useAuth';

// Styled components
const SettingsContainer = styled.div`
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  background: ${({ theme }) => theme.colors.surface[200]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const SettingSection = styled.section`
  margin-bottom: ${({ theme }) => theme.spacing.LARGE}px;
  padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface[300]};

  &:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }
`;

const SettingTitle = styled.h3`
  color: ${({ theme }) => theme.colors.text[500]};
  font-size: ${({ theme }) => theme.typography.fontSizes.h4};
  font-weight: ${({ theme }) => theme.typography.fontWeights.medium};
  margin-bottom: ${({ theme }) => theme.spacing.SMALL}px;
`;

const SettingDescription = styled.p`
  color: ${({ theme }) => theme.colors.text[300]};
  font-size: ${({ theme }) => theme.typography.fontSizes.base};
  margin-bottom: ${({ theme }) => theme.spacing.MEDIUM}px;
`;

const ToggleContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.SMALL}px;
`;

const RetentionSelect = styled.select`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.SMALL}px;
  border: 1px solid ${({ theme }) => theme.colors.surface[400]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.sm}px;
  background: ${({ theme }) => theme.colors.surface[100]};
  color: ${({ theme }) => theme.colors.text[500]};
  font-size: ${({ theme }) => theme.typography.fontSizes.base};
`;

// Interfaces
interface PrivacySettingsProps {
  className?: string;
  onSecurityViolation?: (violation: string) => void;
  auditLogger?: (event: string, data: any) => void;
}

interface PrivacyPreferences {
  dataSharing: boolean;
  mfaEnabled: boolean;
  biometricEnabled: boolean;
  dataRetentionPeriod: number;
  marketingConsent: boolean;
  securityAuditEnabled: boolean;
  lastSecurityUpdate: Date;
}

const PrivacySettings: React.FC<PrivacySettingsProps> = ({
  className,
  onSecurityViolation,
  auditLogger
}) => {
  const { user, isAuthenticated, securityContext, auditLog } = useAuth();
  const [preferences, setPreferences] = useState<PrivacyPreferences>({
    dataSharing: false,
    mfaEnabled: false,
    biometricEnabled: false,
    dataRetentionPeriod: 24,
    marketingConsent: false,
    securityAuditEnabled: true,
    lastSecurityUpdate: new Date()
  });
  const [loading, setLoading] = useState({
    isLoading: false,
    error: null as string | null,
    lastAttempt: null as Date | null
  });

  // Load initial preferences
  useEffect(() => {
    const loadPreferences = async () => {
      if (!isAuthenticated || !user) return;

      try {
        setLoading(prev => ({ ...prev, isLoading: true }));
        const response = await fetch('/api/v1/privacy/preferences', {
          headers: {
            'Authorization': `Bearer ${securityContext.token}`,
            'X-Security-Context': JSON.stringify(securityContext)
          }
        });

        if (!response.ok) throw new Error('Failed to load privacy preferences');

        const data = await response.json();
        setPreferences(data);
        auditLog?.log({
          event: 'PRIVACY_PREFERENCES_LOADED',
          userId: user.id,
          timestamp: new Date()
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        setLoading(prev => ({ ...prev, error: message }));
        onSecurityViolation?.(message);
      } finally {
        setLoading(prev => ({ ...prev, isLoading: false, lastAttempt: new Date() }));
      }
    };

    loadPreferences();
  }, [isAuthenticated, user, securityContext, auditLog]);

  // HIPAA-compliant preference update handler
  const updatePreference = useCallback(debounce(async (
    key: keyof PrivacyPreferences,
    value: boolean | number
  ) => {
    if (!isAuthenticated || !user) return;

    try {
      setLoading(prev => ({ ...prev, isLoading: true }));
      
      const response = await fetch('/api/v1/privacy/preferences', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${securityContext.token}`,
          'X-Security-Context': JSON.stringify(securityContext)
        },
        body: JSON.stringify({
          [key]: value,
          lastSecurityUpdate: new Date()
        })
      });

      if (!response.ok) throw new Error(`Failed to update ${key}`);

      setPreferences(prev => ({
        ...prev,
        [key]: value,
        lastSecurityUpdate: new Date()
      }));

      auditLog?.log({
        event: 'PRIVACY_PREFERENCE_UPDATED',
        userId: user.id,
        preference: key,
        newValue: value,
        timestamp: new Date()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setLoading(prev => ({ ...prev, error: message }));
      onSecurityViolation?.(message);
    } finally {
      setLoading(prev => ({ ...prev, isLoading: false, lastAttempt: new Date() }));
    }
  }, 500), [isAuthenticated, user, securityContext, auditLog]);

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <SettingsContainer className={className}>
      <SettingSection>
        <SettingTitle>Data Sharing Preferences</SettingTitle>
        <SettingDescription>
          Control how your health information is shared with healthcare providers and third-party services.
        </SettingDescription>
        <ToggleContainer>
          <label htmlFor="dataSharing">Enable Data Sharing</label>
          <input
            type="checkbox"
            id="dataSharing"
            checked={preferences.dataSharing}
            onChange={e => updatePreference('dataSharing', e.target.checked)}
            disabled={loading.isLoading}
          />
        </ToggleContainer>
      </SettingSection>

      <SettingSection>
        <SettingTitle>Security Authentication</SettingTitle>
        <SettingDescription>
          Enhanced security settings for accessing your health information.
        </SettingDescription>
        <ToggleContainer>
          <label htmlFor="mfaEnabled">Multi-Factor Authentication</label>
          <input
            type="checkbox"
            id="mfaEnabled"
            checked={preferences.mfaEnabled}
            onChange={e => updatePreference('mfaEnabled', e.target.checked)}
            disabled={loading.isLoading}
          />
        </ToggleContainer>
        <ToggleContainer>
          <label htmlFor="biometricEnabled">Biometric Authentication</label>
          <input
            type="checkbox"
            id="biometricEnabled"
            checked={preferences.biometricEnabled}
            onChange={e => updatePreference('biometricEnabled', e.target.checked)}
            disabled={loading.isLoading}
          />
        </ToggleContainer>
      </SettingSection>

      <SettingSection>
        <SettingTitle>Data Retention</SettingTitle>
        <SettingDescription>
          Specify how long your health records are retained in the system.
        </SettingDescription>
        <RetentionSelect
          value={preferences.dataRetentionPeriod}
          onChange={e => updatePreference('dataRetentionPeriod', parseInt(e.target.value))}
          disabled={loading.isLoading}
        >
          <option value={12}>12 Months</option>
          <option value={24}>24 Months</option>
          <option value={36}>36 Months</option>
          <option value={60}>60 Months</option>
        </RetentionSelect>
      </SettingSection>

      <SettingSection>
        <SettingTitle>Marketing Preferences</SettingTitle>
        <SettingDescription>
          Control your communication preferences for non-essential services.
        </SettingDescription>
        <ToggleContainer>
          <label htmlFor="marketingConsent">Marketing Communications</label>
          <input
            type="checkbox"
            id="marketingConsent"
            checked={preferences.marketingConsent}
            onChange={e => updatePreference('marketingConsent', e.target.checked)}
            disabled={loading.isLoading}
          />
        </ToggleContainer>
      </SettingSection>

      <SettingSection>
        <SettingTitle>Security Audit</SettingTitle>
        <SettingDescription>
          Enable detailed security logging for your account activities.
        </SettingDescription>
        <ToggleContainer>
          <label htmlFor="securityAuditEnabled">Security Audit Logging</label>
          <input
            type="checkbox"
            id="securityAuditEnabled"
            checked={preferences.securityAuditEnabled}
            onChange={e => updatePreference('securityAuditEnabled', e.target.checked)}
            disabled={loading.isLoading}
          />
        </ToggleContainer>
      </SettingSection>

      {loading.error && (
        <Button 
          variant="outlined"
          onClick={() => setLoading(prev => ({ ...prev, error: null }))}
          startIcon="⚠️"
        >
          {loading.error}
        </Button>
      )}
    </SettingsContainer>
  );
};

export default PrivacySettings;