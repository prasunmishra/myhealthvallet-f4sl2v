import React, { useEffect, useRef, useCallback } from 'react';
import styled from '@emotion/styled';
import { Theme } from '../../styles/theme';
import { fadeIn, fadeOut, ANIMATION_DURATIONS, ANIMATION_EASINGS } from '../../styles/animations';
import { Icon } from './Icon';

// Toast types and positions
type ToastType = 'success' | 'error' | 'warning' | 'info';
type ToastPosition = 'top' | 'bottom' | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

// Props interface for the Toast component
interface ToastProps {
  message: string;
  type: ToastType;
  duration?: number;
  onClose: () => void;
  position?: ToastPosition;
  autoClose?: boolean;
  closeOnClick?: boolean;
  pauseOnHover?: boolean;
}

// Styled components
const ToastContainer = styled.div<{
  type: ToastType;
  position: ToastPosition;
  isClosing: boolean;
}>`
  position: fixed;
  display: flex;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  border-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  box-shadow: ${({ theme }) => theme.shadows.md};
  background-color: ${({ theme, type }) => getToastColors(theme, type).background};
  color: ${({ theme, type }) => getToastColors(theme, type).text};
  font-family: ${({ theme }) => theme.typography.fontFamilies.primary};
  font-size: ${({ theme }) => theme.typography.fontSizes.base};
  line-height: ${({ theme }) => theme.typography.lineHeights.base};
  min-width: 300px;
  max-width: 600px;
  z-index: ${({ theme }) => theme.zIndex.modal};
  pointer-events: auto;
  animation: ${({ isClosing }) => isClosing ? fadeOut : fadeIn} 
    ${ANIMATION_DURATIONS.NORMAL}ms ${ANIMATION_EASINGS.EASE_OUT};
  
  ${({ position }) => getPositionStyles(position)}

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const IconWrapper = styled.div`
  margin-right: ${({ theme }) => theme.spacing.SMALL}px;
  flex-shrink: 0;
`;

const MessageText = styled.p`
  margin: 0;
  flex-grow: 1;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  padding: ${({ theme }) => theme.spacing.SMALL}px;
  margin-left: ${({ theme }) => theme.spacing.SMALL}px;
  cursor: pointer;
  color: inherit;
  opacity: 0.7;
  transition: opacity ${ANIMATION_DURATIONS.FAST}ms ${ANIMATION_EASINGS.EASE_OUT};

  &:hover {
    opacity: 1;
  }

  &:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }
`;

// Helper functions
const getToastColors = (theme: Theme, type: ToastType) => {
  const colors = {
    success: {
      background: theme.colors.success[100],
      text: theme.colors.success[800]
    },
    error: {
      background: theme.colors.error[100],
      text: theme.colors.error[800]
    },
    warning: {
      background: theme.colors.warning[100],
      text: theme.colors.warning[800]
    },
    info: {
      background: theme.colors.info[100],
      text: theme.colors.info[800]
    }
  };
  return colors[type];
};

const getToastIcon = (type: ToastType): string => {
  const icons = {
    success: 'check-circle',
    error: 'error',
    warning: 'warning',
    info: 'info'
  };
  return icons[type];
};

const getPositionStyles = (position: ToastPosition): string => {
  const positions = {
    top: 'top: 24px; left: 50%; transform: translateX(-50%);',
    bottom: 'bottom: 24px; left: 50%; transform: translateX(-50%);',
    'top-right': 'top: 24px; right: 24px;',
    'top-left': 'top: 24px; left: 24px;',
    'bottom-right': 'bottom: 24px; right: 24px;',
    'bottom-left': 'bottom: 24px; left: 24px;'
  };
  return positions[position];
};

export const Toast: React.FC<ToastProps> = ({
  message,
  type,
  duration = 5000,
  onClose,
  position = 'top-right',
  autoClose = true,
  closeOnClick = true,
  pauseOnHover = true
}) => {
  const [isClosing, setIsClosing] = React.useState(false);
  const timerRef = useRef<NodeJS.Timeout>();
  const pausedRef = useRef(false);

  const startTimer = useCallback(() => {
    if (autoClose && duration > 0) {
      timerRef.current = setTimeout(() => {
        setIsClosing(true);
        setTimeout(onClose, ANIMATION_DURATIONS.NORMAL);
      }, duration);
    }
  }, [autoClose, duration, onClose]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (pauseOnHover) {
      pausedRef.current = true;
      clearTimer();
    }
  }, [pauseOnHover, clearTimer]);

  const handleMouseLeave = useCallback(() => {
    if (pauseOnHover && pausedRef.current) {
      pausedRef.current = false;
      startTimer();
    }
  }, [pauseOnHover, startTimer]);

  const handleClick = useCallback(() => {
    if (closeOnClick) {
      setIsClosing(true);
      setTimeout(onClose, ANIMATION_DURATIONS.NORMAL);
    }
  }, [closeOnClick, onClose]);

  useEffect(() => {
    startTimer();
    return clearTimer;
  }, [startTimer, clearTimer]);

  return (
    <ToastContainer
      type={type}
      position={position}
      isClosing={isClosing}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="alert"
      aria-live="polite"
      data-testid="toast"
    >
      <IconWrapper>
        <Icon
          name={getToastIcon(type)}
          size="medium"
          color="currentColor"
          role="presentation"
        />
      </IconWrapper>
      <MessageText>{message}</MessageText>
      <CloseButton
        onClick={(e) => {
          e.stopPropagation();
          setIsClosing(true);
          setTimeout(onClose, ANIMATION_DURATIONS.NORMAL);
        }}
        aria-label="Close notification"
      >
        <Icon
          name="close"
          size="small"
          color="currentColor"
          role="presentation"
        />
      </CloseButton>
    </ToastContainer>
  );
};

export type { ToastProps, ToastType, ToastPosition };