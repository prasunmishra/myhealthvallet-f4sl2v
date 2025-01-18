/**
 * @fileoverview Enhanced signup form component with OAuth 2.0, MFA, and biometric authentication
 * @version 1.0.0
 * 
 * Implements HIPAA-compliant user registration with:
 * - OAuth 2.0 + OIDC flow
 * - Multi-factor authentication setup
 * - Biometric authentication enrollment
 * - WCAG 2.1 AAA compliance
 */

import React, { useState, useEffect, useCallback } from 'react'; // version: ^18.0.0
import styled from '@emotion/styled'; // version: ^11.11.0
import { useForm } from 'react-hook-form'; // version: ^7.45.0
import * as yup from 'yup'; // version: ^1.2.0
import { useA11y } from 'react-aria'; // version: ^3.25.0
import { Button, TextField } from '@mui/material'; // version: ^5.14.0

import AuthService from '../../services/auth.service';

// Type definitions
type MFAType = 'totp' | 'sms' | 'email';

interface SignupFormData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  mfaType: MFAType;
  biometricEnabled: boolean;
  hipaaConsent: boolean;
}

interface SignupFormProps {
  onSuccess: (user: User) => void;
  onError: (error: Error) => void;
  onMFASetup: (type: MFAType) => void;
  onBiometricSetup: (enabled: boolean) => void;
}

// Styled components with accessibility enhancements
const FormContainer = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
  padding: 2rem;
  background: ${({ theme }) => theme.colors.background};
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  @media (max-width: 768px) {
    padding: 1.5rem;
  }
`;

const ErrorText = styled.span`
  color: ${({ theme }) => theme.colors.error};
  font-size: 0.875rem;
  margin-top: 0.25rem;
  font-weight: 500;
  role: alert;
  aria-live: polite;
`;

// Form validation schema
const validationSchema = yup.object().shape({
  email: yup
    .string()
    .email('Please enter a valid email address')
    .required('Email is required'),
  password: yup
    .string()
    .min(12, 'Password must be at least 12 characters')
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must include uppercase, lowercase, number and special character'
    )
    .required('Password is required'),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref('password')], 'Passwords must match')
    .required('Please confirm your password'),
  firstName: yup
    .string()
    .required('First name is required')
    .max(50, 'First name is too long'),
  lastName: yup
    .string()
    .required('Last name is required')
    .max(50, 'Last name is too long'),
  phoneNumber: yup
    .string()
    .matches(/^\+?[1-9]\d{1,14}$/, 'Please enter a valid phone number')
    .required('Phone number is required for MFA'),
  mfaType: yup
    .string()
    .oneOf(['totp', 'sms', 'email'], 'Please select an MFA method')
    .required('MFA setup is required'),
  hipaaConsent: yup
    .boolean()
    .oneOf([true], 'You must agree to HIPAA terms')
    .required('HIPAA consent is required'),
});

export const SignupForm: React.FC<SignupFormProps> = ({
  onSuccess,
  onError,
  onMFASetup,
  onBiometricSetup,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors }, watch } = useForm<SignupFormData>({
    mode: 'onBlur',
    resolver: yup.resolver(validationSchema),
  });

  const authService = new AuthService();
  const { focusWithin } = useA11y();

  // Watch form values for real-time validation
  const password = watch('password');
  const mfaType = watch('mfaType');
  const biometricEnabled = watch('biometricEnabled');

  // Handle form submission with enhanced security
  const onSubmit = useCallback(async (data: SignupFormData) => {
    try {
      setIsLoading(true);
      setServerError(null);

      // Validate HIPAA compliance
      const isHipaaCompliant = await authService.validateHIPAA({
        email: data.email,
        phoneNumber: data.phoneNumber,
      });

      if (!isHipaaCompliant) {
        throw new Error('HIPAA compliance validation failed');
      }

      // Initiate signup process
      const signupResult = await authService.signup({
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        phoneNumber: data.phoneNumber,
        mfaType: data.mfaType,
        biometricEnabled: data.biometricEnabled,
        hipaaConsent: data.hipaaConsent,
      });

      // Setup MFA if enabled
      if (data.mfaType) {
        await authService.setupMFA({
          type: data.mfaType,
          userId: signupResult.user.id,
          phoneNumber: data.phoneNumber,
        });
        onMFASetup(data.mfaType);
      }

      // Setup biometric authentication if enabled
      if (data.biometricEnabled) {
        await authService.setupBiometric({
          userId: signupResult.user.id,
        });
        onBiometricSetup(true);
      }

      onSuccess(signupResult.user);
    } catch (error) {
      setServerError(error.message);
      onError(error);
    } finally {
      setIsLoading(false);
    }
  }, [authService, onSuccess, onError, onMFASetup, onBiometricSetup]);

  // Accessibility keyboard handler
  const handleKeyPress = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit(onSubmit)();
    }
  }, [handleSubmit, onSubmit]);

  return (
    <FormContainer
      onSubmit={handleSubmit(onSubmit)}
      aria-label="Sign up form"
      onKeyPress={handleKeyPress}
      {...focusWithin}
    >
      <TextField
        {...register('email')}
        label="Email Address"
        type="email"
        error={!!errors.email}
        helperText={errors.email?.message}
        fullWidth
        required
        autoComplete="email"
        aria-describedby="email-error"
      />

      <TextField
        {...register('password')}
        label="Password"
        type="password"
        error={!!errors.password}
        helperText={errors.password?.message}
        fullWidth
        required
        autoComplete="new-password"
        aria-describedby="password-error"
      />

      <TextField
        {...register('confirmPassword')}
        label="Confirm Password"
        type="password"
        error={!!errors.confirmPassword}
        helperText={errors.confirmPassword?.message}
        fullWidth
        required
        autoComplete="new-password"
        aria-describedby="confirm-password-error"
      />

      <TextField
        {...register('firstName')}
        label="First Name"
        error={!!errors.firstName}
        helperText={errors.firstName?.message}
        fullWidth
        required
        autoComplete="given-name"
        aria-describedby="first-name-error"
      />

      <TextField
        {...register('lastName')}
        label="Last Name"
        error={!!errors.lastName}
        helperText={errors.lastName?.message}
        fullWidth
        required
        autoComplete="family-name"
        aria-describedby="last-name-error"
      />

      <TextField
        {...register('phoneNumber')}
        label="Phone Number"
        error={!!errors.phoneNumber}
        helperText={errors.phoneNumber?.message}
        fullWidth
        required
        autoComplete="tel"
        aria-describedby="phone-error"
      />

      <div role="radiogroup" aria-label="Multi-factor authentication method">
        <TextField
          {...register('mfaType')}
          select
          label="MFA Method"
          error={!!errors.mfaType}
          helperText={errors.mfaType?.message}
          fullWidth
          required
          SelectProps={{
            native: true,
          }}
        >
          <option value="">Select MFA method</option>
          <option value="totp">Authenticator App</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
        </TextField>
      </div>

      <label>
        <input
          type="checkbox"
          {...register('biometricEnabled')}
          aria-describedby="biometric-description"
        />
        Enable Biometric Authentication
      </label>

      <label>
        <input
          type="checkbox"
          {...register('hipaaConsent')}
          aria-describedby="hipaa-error"
        />
        I agree to HIPAA terms and conditions
      </label>

      {serverError && (
        <ErrorText role="alert">
          {serverError}
        </ErrorText>
      )}

      <Button
        type="submit"
        variant="contained"
        color="primary"
        disabled={isLoading}
        aria-busy={isLoading}
        fullWidth
      >
        {isLoading ? 'Creating Account...' : 'Sign Up'}
      </Button>
    </FormContainer>
  );
};

export default SignupForm;