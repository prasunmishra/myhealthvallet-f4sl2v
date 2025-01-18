import React from 'react'; // ^18.0.0
import styled from '@emotion/styled'; // ^11.11.0
import { Theme } from '../../styles/theme';
import { useTheme } from '../../hooks/useTheme';

// Input component props interface
interface InputProps {
  id: string;
  name: string;
  value?: string;
  placeholder?: string;
  type?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'search' | 'url';
  size?: 'small' | 'medium' | 'large';
  status?: 'default' | 'error' | 'success' | 'warning';
  errorMessage?: string;
  disabled?: boolean;
  required?: boolean;
  readOnly?: boolean;
  autoComplete?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  maxLength?: number;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
}

// Styled components
const InputWrapper = styled.div`
  position: relative;
  width: 100%;
  margin-bottom: ${props => props.theme.spacing.small}px;
`;

const StyledInput = styled.input<{
  size?: InputProps['size'];
  status?: InputProps['status'];
  disabled?: boolean;
  readOnly?: boolean;
  theme: Theme;
}>`
  width: 100%;
  font-family: ${props => props.theme.typography.fontFamilies.primary};
  font-size: ${props => {
    switch (props.size) {
      case 'small': return props.theme.typography.fontSizes.small;
      case 'large': return props.theme.typography.fontSizes.h4;
      default: return props.theme.typography.fontSizes.base;
    }
  }};
  padding: ${props => {
    switch (props.size) {
      case 'small': return `${props.theme.spacing.BASE * 1}px`;
      case 'large': return `${props.theme.spacing.BASE * 2}px`;
      default: return `${props.theme.spacing.BASE * 1.5}px`;
    }
  }};
  border-radius: ${props => props.theme.shape.borderRadius.md}px;
  border: 2px solid ${props => {
    switch (props.status) {
      case 'error': return props.theme.colors.error[500];
      case 'success': return props.theme.colors.success[500];
      case 'warning': return props.theme.colors.warning[500];
      default: return props.theme.colors.surface[300];
    }
  }};
  background-color: ${props => props.disabled ? props.theme.colors.surface[200] : 'transparent'};
  color: ${props => props.theme.colors.text[500]};
  transition: all ${props => props.theme.transitions.duration.short}ms ${props => props.theme.transitions.easing.easeInOut};
  outline: none;

  &:focus {
    box-shadow: 0 0 0 3px ${props => {
      switch (props.status) {
        case 'error': return `${props.theme.colors.error[200]}80`;
        case 'success': return `${props.theme.colors.success[200]}80`;
        case 'warning': return `${props.theme.colors.warning[200]}80`;
        default: return `${props.theme.colors.primary[200]}80`;
      }
    }};
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  &:read-only {
    background-color: ${props => props.theme.colors.surface[100]};
    cursor: default;
  }

  &::placeholder {
    color: ${props => props.theme.colors.text[300]};
  }
`;

const ErrorMessage = styled.span`
  display: block;
  color: ${props => props.theme.colors.error[500]};
  font-size: ${props => props.theme.typography.fontSizes.small};
  margin-top: ${props => props.theme.spacing.BASE / 2}px;
  animation: fadeIn 0.2s ease-in;

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

export const Input: React.FC<InputProps> = ({
  id,
  name,
  value = '',
  placeholder = '',
  type = 'text',
  size = 'medium',
  status = 'default',
  errorMessage,
  disabled = false,
  required = false,
  readOnly = false,
  autoComplete = true,
  ariaLabel,
  ariaDescribedBy,
  maxLength,
  onChange,
  onBlur,
  onFocus,
}) => {
  const { theme } = useTheme();
  const errorId = `${id}-error`;
  const hasError = status === 'error' && errorMessage;

  return (
    <InputWrapper>
      <StyledInput
        id={id}
        name={name}
        type={type}
        value={value}
        placeholder={placeholder}
        size={size}
        status={status}
        disabled={disabled}
        required={required}
        readOnly={readOnly}
        autoComplete={autoComplete ? 'on' : 'off'}
        maxLength={maxLength}
        aria-label={ariaLabel}
        aria-invalid={status === 'error'}
        aria-required={required}
        aria-describedby={hasError ? errorId : ariaDescribedBy}
        onChange={onChange}
        onBlur={onBlur}
        onFocus={onFocus}
        theme={theme}
      />
      {hasError && (
        <ErrorMessage id={errorId} role="alert" theme={theme}>
          {errorMessage}
        </ErrorMessage>
      )}
    </InputWrapper>
  );
};

export type { InputProps };