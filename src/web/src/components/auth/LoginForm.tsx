import React, { useState, useEffect } from 'react';
import styled from '@emotion/styled';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../common/Button';
import { Input } from '../common/Input';

// Styled components with WCAG AAA compliance
const FormContainer = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${props => props.theme.spacing.MEDIUM}px;
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
  padding: ${props => props.theme.spacing.LARGE}px;
  background-color: ${props => props.theme.colors.surface[100]};
  border-radius: ${props => props.theme.shape.borderRadius.md}px;
  box-shadow: ${props => props.theme.shadows.md};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const ErrorMessage = styled.div`
  color: ${props => props.theme.colors.error[500]};
  font-size: ${props => props.theme.typography.fontSizes.small};
  margin-top: ${props => props.theme.spacing.BASE}px;
  font-weight: ${props => props.theme.typography.fontWeights.medium};
  role: alert;
  aria-live: polite;
`;

const FormTitle = styled.h1`
  font-size: ${props => props.theme.typography.fontSizes.h3};
  color: ${props => props.theme.colors.text[500]};
  margin-bottom: ${props => props.theme.spacing.MEDIUM}px;
  text-align: center;
`;

// Interfaces
export interface LoginFormProps {
  onSuccess?: () => void;
  onMFARequired?: () => void;
  onError?: (error: string) => void;
}

interface LoginFormValues {
  email: string;
  password: string;
  mfaCode?: string;
}

// HIPAA-compliant validation schema
const validationSchema = Yup.object().shape({
  email: Yup.string()
    .email('Please enter a valid email address')
    .required('Email is required')
    .matches(
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      'Invalid email format'
    ),
  password: Yup.string()
    .required('Password is required')
    .min(12, 'Password must be at least 12 characters')
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
  mfaCode: Yup.string()
    .when('requiresMFA', {
      is: true,
      then: Yup.string()
        .required('MFA code is required')
        .matches(/^\d{6}$/, 'MFA code must be 6 digits')
    })
});

export const LoginForm: React.FC<LoginFormProps> = ({
  onSuccess,
  onMFARequired,
  onError
}) => {
  const { login, loading, error, initiateMFA, verifyMFA } = useAuth();
  const [requiresMFA, setRequiresMFA] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);

  // Initialize form with Formik
  const formik = useFormik<LoginFormValues>({
    initialValues: {
      email: '',
      password: '',
      mfaCode: ''
    },
    validationSchema,
    validateOnChange: true,
    validateOnBlur: true,
    onSubmit: async (values) => {
      try {
        if (attemptCount >= 5) {
          onError?.('Too many login attempts. Please try again later.');
          return;
        }

        if (requiresMFA) {
          const mfaSuccess = await verifyMFA(values.mfaCode!);
          if (mfaSuccess) {
            onSuccess?.();
          } else {
            formik.setFieldError('mfaCode', 'Invalid MFA code');
          }
        } else {
          const result = await login(values.email, values.password);
          if (result?.requiresMFA) {
            setRequiresMFA(true);
            onMFARequired?.();
          } else {
            onSuccess?.();
          }
        }
      } catch (err) {
        setAttemptCount(prev => prev + 1);
        onError?.(err instanceof Error ? err.message : 'Login failed');
      }
    }
  });

  // Reset form on unmount
  useEffect(() => {
    return () => {
      formik.resetForm();
      setRequiresMFA(false);
      setAttemptCount(0);
    };
  }, []);

  return (
    <FormContainer
      onSubmit={formik.handleSubmit}
      aria-label="Login form"
      role="form"
      noValidate
    >
      <FormTitle>Sign In</FormTitle>

      <Input
        id="email"
        name="email"
        type="email"
        value={formik.values.email}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        status={formik.touched.email && formik.errors.email ? 'error' : 'default'}
        errorMessage={formik.touched.email ? formik.errors.email : undefined}
        placeholder="Enter your email"
        disabled={loading || requiresMFA}
        required
        autoComplete={true}
        ariaLabel="Email address"
      />

      <Input
        id="password"
        name="password"
        type="password"
        value={formik.values.password}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        status={formik.touched.password && formik.errors.password ? 'error' : 'default'}
        errorMessage={formik.touched.password ? formik.errors.password : undefined}
        placeholder="Enter your password"
        disabled={loading || requiresMFA}
        required
        autoComplete={true}
        ariaLabel="Password"
      />

      {requiresMFA && (
        <Input
          id="mfaCode"
          name="mfaCode"
          type="text"
          value={formik.values.mfaCode}
          onChange={formik.handleChange}
          onBlur={formik.handleBlur}
          status={formik.touched.mfaCode && formik.errors.mfaCode ? 'error' : 'default'}
          errorMessage={formik.touched.mfaCode ? formik.errors.mfaCode : undefined}
          placeholder="Enter 6-digit MFA code"
          disabled={loading}
          required
          autoComplete={false}
          ariaLabel="MFA verification code"
          maxLength={6}
        />
      )}

      {error && (
        <ErrorMessage role="alert">
          {error}
        </ErrorMessage>
      )}

      <Button
        type="submit"
        disabled={loading || !formik.isValid || !formik.dirty}
        loading={loading}
        fullWidth
        size="large"
        ariaLabel={requiresMFA ? 'Verify MFA code' : 'Sign in'}
      >
        {requiresMFA ? 'Verify MFA Code' : 'Sign In'}
      </Button>
    </FormContainer>
  );
};

export default LoginForm;