import React, { useEffect, useCallback, useRef } from 'react';
import styled from '@emotion/styled';
import { motion, AnimatePresence } from 'framer-motion';
import { Theme } from '../../styles/theme';
import { NotificationType, NotificationPriority, NotificationContent } from '../../types/notifications.types';
import { Icon } from './Icon';

// Animation variants for notification entrance/exit
const notificationVariants = {
  initial: { opacity: 0, y: -20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: 100 }
};

interface NotificationProps {
  type: NotificationType;
  priority: NotificationPriority;
  content: NotificationContent;
  onClose: (id: string) => void;
  autoClose?: boolean;
  duration?: number;
  className?: string;
  role?: string;
  ariaLive?: 'polite' | 'assertive';
}

const NotificationContainer = styled(motion.div)<{
  priority: NotificationPriority;
  theme: Theme;
}>`
  display: flex;
  align-items: center;
  padding: ${({ theme }) => theme.spacing[3]}px;
  border-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  margin-bottom: ${({ theme }) => theme.spacing[2]}px;
  box-shadow: ${({ theme }) => theme.shadows.md};
  background-color: ${({ theme, priority }) => {
    switch (priority) {
      case NotificationPriority.URGENT:
        return theme.colors.error[100];
      case NotificationPriority.HIGH:
        return theme.colors.warning[100];
      case NotificationPriority.MEDIUM:
        return theme.colors.info[100];
      default:
        return theme.colors.surface[100];
    }
  }};
  border-left: 4px solid ${({ theme, priority }) => {
    switch (priority) {
      case NotificationPriority.URGENT:
        return theme.colors.error[500];
      case NotificationPriority.HIGH:
        return theme.colors.warning[500];
      case NotificationPriority.MEDIUM:
        return theme.colors.info[500];
      default:
        return theme.colors.primary[500];
    }
  }};
  position: relative;
  min-width: 320px;
  max-width: 600px;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    width: 100%;
  }
`;

const ContentWrapper = styled.div`
  flex: 1;
  margin: 0 ${({ theme }) => theme.spacing[2]}px;
`;

const Title = styled.h6`
  margin: 0;
  color: ${({ theme }) => theme.colors.text[900]};
  font-family: ${({ theme }) => theme.typography.fontFamilies.primary};
  font-size: ${({ theme }) => theme.typography.fontSizes.base};
  font-weight: ${({ theme }) => theme.typography.fontWeights.semibold};
  line-height: ${({ theme }) => theme.typography.lineHeights.tight};
`;

const Message = styled.p`
  margin: ${({ theme }) => theme.spacing[1]}px 0 0;
  color: ${({ theme }) => theme.colors.text[700]};
  font-family: ${({ theme }) => theme.typography.fontFamilies.primary};
  font-size: ${({ theme }) => theme.typography.fontSizes.small};
  line-height: ${({ theme }) => theme.typography.lineHeights.base};
`;

const CloseButton = styled.button`
  position: absolute;
  top: ${({ theme }) => theme.spacing[2]}px;
  right: ${({ theme }) => theme.spacing[2]}px;
  padding: ${({ theme }) => theme.spacing[1]}px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.colors.text[500]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.sm}px;

  &:hover {
    color: ${({ theme }) => theme.colors.text[700]};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const getNotificationIcon = (type: NotificationType): string => {
  switch (type) {
    case NotificationType.HEALTH_ALERT:
      return 'medical-alert';
    case NotificationType.APPOINTMENT_REMINDER:
      return 'calendar-alert';
    case NotificationType.DOCUMENT_PROCESSED:
      return 'file-check';
    case NotificationType.DATA_SYNC:
      return 'sync';
    case NotificationType.SYSTEM_UPDATE:
      return 'system-update';
    case NotificationType.ANALYSIS_COMPLETE:
      return 'chart-line';
    case NotificationType.SECURITY_ALERT:
      return 'shield-alert';
    default:
      return 'information';
  }
};

export const Notification: React.FC<NotificationProps> = ({
  type,
  priority,
  content,
  onClose,
  autoClose = true,
  duration = 5000,
  className,
  role = 'alert',
  ariaLive = 'polite'
}) => {
  const timerRef = useRef<number>();

  const handleClose = useCallback(() => {
    if (content.id) {
      onClose(content.id);
    }
  }, [content.id, onClose]);

  useEffect(() => {
    if (autoClose && priority !== NotificationPriority.URGENT) {
      timerRef.current = window.setTimeout(handleClose, duration);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [autoClose, duration, handleClose, priority]);

  return (
    <AnimatePresence>
      <NotificationContainer
        priority={priority}
        className={className}
        role={role}
        aria-live={ariaLive}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={notificationVariants}
        transition={{ duration: 0.2 }}
      >
        <Icon
          name={getNotificationIcon(type)}
          size="medium"
          color={priority === NotificationPriority.URGENT ? 'error.500' : 'primary.500'}
          aria-hidden="true"
        />
        <ContentWrapper>
          <Title>{content.title}</Title>
          <Message>{content.message}</Message>
        </ContentWrapper>
        <CloseButton
          onClick={handleClose}
          aria-label="Close notification"
          title="Close notification"
        >
          <Icon name="close" size="small" aria-hidden="true" />
        </CloseButton>
      </NotificationContainer>
    </AnimatePresence>
  );
};

export type { NotificationProps };