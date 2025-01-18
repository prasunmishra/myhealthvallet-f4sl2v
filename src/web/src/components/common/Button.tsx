import React from 'react'; // ^18.0.0
import styled from '@emotion/styled'; // ^11.0.0
import { Theme } from '../../styles/theme';
import { SPACING } from '../../styles/dimensions';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outlined' | 'text';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  type?: 'button' | 'submit' | 'reset';
  ariaLabel?: string;
  className?: string;
  form?: string;
  name?: string;
  value?: string;
  tabIndex?: number;
  ref?: React.Ref<HTMLButtonElement>;
  onMouseDown?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onTouchStart?: (event: React.TouchEvent<HTMLButtonElement>) => void;
}

const StyledButton = styled.button<ButtonProps>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  box-sizing: border-box;
  outline: 0;
  border: 0;
  margin: 0;
  cursor: pointer;
  user-select: none;
  vertical-align: middle;
  text-decoration: none;
  font-family: ${({ theme }: { theme: Theme }) => theme.typography.fontFamilies.primary};
  font-weight: ${({ theme }) => theme.typography.fontWeights.medium};
  font-size: ${({ size, theme }) => 
    size === 'small' ? theme.typography.fontSizes.small :
    size === 'large' ? theme.typography.fontSizes.h4 :
    theme.typography.fontSizes.base
  };
  line-height: ${({ theme }) => theme.typography.lineHeights.base};
  min-width: ${({ size }) => 
    size === 'small' ? '64px' :
    size === 'large' ? '96px' :
    '80px'
  };
  padding: ${({ size }) => 
    size === 'small' ? `${SPACING.BASE}px ${SPACING.MEDIUM}px` :
    size === 'large' ? `${SPACING.MEDIUM}px ${SPACING.LARGE}px` :
    `${SPACING.MEDIUM}px ${SPACING.LARGE}px`
  };
  border-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  transition: all ${({ theme }) => theme.transitions.duration.short}ms ${({ theme }) => theme.transitions.easing.easeInOut};
  width: ${({ fullWidth }) => fullWidth ? '100%' : 'auto'};

  ${({ variant, theme }) => {
    switch (variant) {
      case 'secondary':
        return `
          background-color: ${theme.colors.secondary[500]};
          color: ${theme.colors.text[100]};
          &:hover {
            background-color: ${theme.colors.secondary[600]};
          }
          &:active {
            background-color: ${theme.colors.secondary[700]};
          }
        `;
      case 'outlined':
        return `
          background-color: transparent;
          border: 2px solid ${theme.colors.primary[500]};
          color: ${theme.colors.primary[500]};
          &:hover {
            background-color: ${theme.colors.primary[100]};
          }
          &:active {
            background-color: ${theme.colors.primary[200]};
          }
        `;
      case 'text':
        return `
          background-color: transparent;
          color: ${theme.colors.primary[500]};
          &:hover {
            background-color: ${theme.colors.primary[100]};
          }
          &:active {
            background-color: ${theme.colors.primary[200]};
          }
        `;
      default: // primary
        return `
          background-color: ${theme.colors.primary[500]};
          color: ${theme.colors.text[100]};
          &:hover {
            background-color: ${theme.colors.primary[600]};
          }
          &:active {
            background-color: ${theme.colors.primary[700]};
          }
        `;
    }
  }}

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
    pointer-events: none;
  }

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary[300]};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  @media (forced-colors: active) {
    border: 1px solid ButtonText;
  }
`;

const ButtonContent = styled.span<{ loading?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${SPACING.BASE}px;
  opacity: ${({ loading }) => loading ? 0 : 1};
  transition: opacity 0.2s ease;

  [dir="rtl"] & {
    flex-direction: row-reverse;
  }
`;

const LoadingSpinner = styled.span`
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
`;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'medium',
  fullWidth = false,
  disabled = false,
  loading = false,
  startIcon,
  endIcon,
  onClick,
  children,
  type = 'button',
  ariaLabel,
  className,
  form,
  name,
  value,
  tabIndex,
  onMouseDown,
  onTouchStart,
  ...props
}, ref) => {
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (loading || disabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <StyledButton
      ref={ref}
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      disabled={disabled || loading}
      onClick={handleClick}
      type={type}
      aria-label={ariaLabel}
      aria-disabled={disabled || loading}
      aria-busy={loading}
      className={className}
      form={form}
      name={name}
      value={value}
      tabIndex={tabIndex}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      {...props}
    >
      {loading && (
        <LoadingSpinner aria-hidden="true">
          {/* Add your loading spinner component here */}
          Loading...
        </LoadingSpinner>
      )}
      <ButtonContent loading={loading}>
        {startIcon}
        {children}
        {endIcon}
      </ButtonContent>
    </StyledButton>
  );
});

Button.displayName = 'Button';

export default Button;