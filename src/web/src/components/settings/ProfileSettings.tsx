import React, { useState, useCallback, useEffect } from 'react';
import styled from '@emotion/styled';
import * as yup from 'yup';
import { Input, InputProps } from '../common/Input';
import { Button } from '../common/Button';
import { useTheme } from '../../hooks/useTheme';
import { ApiError } from '../../types/api.types';
import { User } from '../../types/auth.types';

// Interfaces
interface ProfileFormData {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  preferredLanguage: string;
  timeZone: string;
}

interface ProfileSettingsProps {
  onUpdateSuccess: () => void;
  onUpdateError: (error: ApiError) => void;
  className?: string;
  disabled?: boolean;
}

interface ValidationState {
  field: string;
  isValid: boolean;
  error?: string;
  touched: boolean;
}

// Styled components
const ProfileContainer = styled.div`
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  }
`;

const FormGroup = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.MEDIUM}px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.SMALL}px;
`;

const ErrorMessage = styled.div`
  color: ${({ theme }) => theme.colors.error[500]};
  font-size: ${({ theme }) => theme.typography.fontSizes.small};
  margin-top: ${({ theme }) => theme.spacing.BASE}px;
`;

// Validation schema
const profileValidationSchema = yup.object().shape({
  firstName: yup
    .string()
    .required('First name is required')
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must not exceed 50 characters')
    .matches(/^[a-zA-Z\s-']+$/, 'First name can only contain letters, spaces, hyphens, and apostrophes'),
  lastName: yup
    .string()
    .required('Last name is required')
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must not exceed 50 characters')
    .matches(/^[a-zA-Z\s-']+$/, 'Last name can only contain letters, spaces, hyphens, and apostrophes'),
  email: yup
    .string()
    .required('Email is required')
    .email('Invalid email format')
    .max(255, 'Email must not exceed 255 characters'),
  phoneNumber: yup
    .string()
    .matches(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
    .required('Phone number is required'),
  preferredLanguage: yup
    .string()
    .required('Preferred language is required')
    .matches(/^[a-z]{2}-[A-Z]{2}$/, 'Invalid language format'),
  timeZone: yup
    .string()
    .required('Time zone is required')
});

// Custom hook for form management
const useProfileForm = (
  initialData: ProfileFormData,
  onSubmit: (data: ProfileFormData) => Promise<void>
) => {
  const [formData, setFormData] = useState<ProfileFormData>(initialData);
  const [validation, setValidation] = useState<ValidationState[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const validateField = useCallback(async (field: keyof ProfileFormData, value: string) => {
    try {
      await yup.reach(profileValidationSchema, field).validate(value);
      return { field, isValid: true, touched: true };
    } catch (error) {
      return {
        field,
        isValid: false,
        error: (error as yup.ValidationError).message,
        touched: true
      };
    }
  }, []);

  const handleChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setIsDirty(true);

    const validationResult = await validateField(name as keyof ProfileFormData, value);
    setValidation(prev => [
      ...prev.filter(v => v.field !== name),
      validationResult
    ]);
  }, [validateField]);

  const handleSubmit = useCallback(async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await profileValidationSchema.validate(formData, { abortEarly: false });
      await onSubmit(formData);
      setIsDirty(false);
    } catch (error) {
      if (error instanceof yup.ValidationError) {
        const validationErrors = error.inner.map(err => ({
          field: err.path!,
          isValid: false,
          error: err.message,
          touched: true
        }));
        setValidation(validationErrors);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, onSubmit]);

  return {
    formData,
    validation,
    isSubmitting,
    isDirty,
    handleChange,
    handleSubmit
  };
};

// Main component
export const ProfileSettings: React.FC<ProfileSettingsProps> = ({
  onUpdateSuccess,
  onUpdateError,
  className,
  disabled = false
}) => {
  const { theme } = useTheme();
  const [securityAuditLog, setSecurityAuditLog] = useState<string[]>([]);

  const handleProfileUpdate = async (data: ProfileFormData) => {
    try {
      // Encrypt sensitive data before transmission
      const encryptedData = await window.crypto.subtle.encrypt(
        { name: "AES-GCM" },
        await window.crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(process.env.REACT_APP_ENCRYPTION_KEY),
          { name: "AES-GCM" },
          false,
          ["encrypt"]
        ),
        new TextEncoder().encode(JSON.stringify(data))
      );

      // Log security audit
      const auditEntry = {
        action: 'PROFILE_UPDATE',
        timestamp: new Date().toISOString(),
        success: true
      };
      setSecurityAuditLog(prev => [...prev, JSON.stringify(auditEntry)]);

      onUpdateSuccess();
    } catch (error) {
      const auditEntry = {
        action: 'PROFILE_UPDATE',
        timestamp: new Date().toISOString(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      setSecurityAuditLog(prev => [...prev, JSON.stringify(auditEntry)]);

      onUpdateError(error as ApiError);
    }
  };

  const {
    formData,
    validation,
    isSubmitting,
    isDirty,
    handleChange,
    handleSubmit
  } = useProfileForm({
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    preferredLanguage: 'en-US',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
  }, handleProfileUpdate);

  const getFieldValidation = (fieldName: string) => 
    validation.find(v => v.field === fieldName);

  return (
    <ProfileContainer theme={theme} className={className}>
      <form onSubmit={handleSubmit}>
        <FormGroup theme={theme}>
          <Input
            id="firstName"
            name="firstName"
            value={formData.firstName}
            onChange={handleChange}
            placeholder="First Name"
            disabled={disabled || isSubmitting}
            required
            status={getFieldValidation('firstName')?.isValid === false ? 'error' : 'default'}
            errorMessage={getFieldValidation('firstName')?.error}
            aria-label="First Name"
          />
        </FormGroup>

        <FormGroup theme={theme}>
          <Input
            id="lastName"
            name="lastName"
            value={formData.lastName}
            onChange={handleChange}
            placeholder="Last Name"
            disabled={disabled || isSubmitting}
            required
            status={getFieldValidation('lastName')?.isValid === false ? 'error' : 'default'}
            errorMessage={getFieldValidation('lastName')?.error}
            aria-label="Last Name"
          />
        </FormGroup>

        <FormGroup theme={theme}>
          <Input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="Email"
            disabled={disabled || isSubmitting}
            required
            status={getFieldValidation('email')?.isValid === false ? 'error' : 'default'}
            errorMessage={getFieldValidation('email')?.error}
            aria-label="Email"
          />
        </FormGroup>

        <FormGroup theme={theme}>
          <Input
            id="phoneNumber"
            name="phoneNumber"
            type="tel"
            value={formData.phoneNumber}
            onChange={handleChange}
            placeholder="Phone Number"
            disabled={disabled || isSubmitting}
            required
            status={getFieldValidation('phoneNumber')?.isValid === false ? 'error' : 'default'}
            errorMessage={getFieldValidation('phoneNumber')?.error}
            aria-label="Phone Number"
          />
        </FormGroup>

        <Button
          type="submit"
          disabled={!isDirty || disabled || isSubmitting || validation.some(v => !v.isValid)}
          loading={isSubmitting}
          fullWidth
          variant="primary"
          size="large"
          aria-label="Save Profile Changes"
        >
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </Button>
      </form>
    </ProfileContainer>
  );
};

export type { ProfileSettingsProps };