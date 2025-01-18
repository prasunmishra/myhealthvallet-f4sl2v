import React, { memo, useCallback, useState } from 'react';
import styled from '@emotion/styled';
import { format } from 'date-fns';
import Card from '../common/Card';
import Button from '../common/Button';
import { useTheme } from '../../hooks/useTheme';

// Enum for appointment status
export enum AppointmentStatus {
  SCHEDULED = 'scheduled',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  RESCHEDULED = 'rescheduled',
  PENDING = 'pending',
  NO_SHOW = 'no_show'
}

// Props interface with comprehensive type safety
export interface AppointmentCardProps {
  id: string;
  title: string;
  datetime: Date;
  location: string;
  provider: string;
  status: AppointmentStatus;
  onEdit: (id: string) => Promise<void>;
  onCancel: (id: string) => Promise<void>;
  onReschedule: (id: string) => Promise<void>;
  className?: string;
  testId?: string;
}

// Enhanced styled wrapper for the appointment card
const StyledAppointmentCard = styled(Card)`
  margin-bottom: ${({ theme }) => theme.spacing.MEDIUM}px;
  transition: all 0.2s ease-in-out;
  position: relative;
  overflow: hidden;

  &:hover {
    transform: translateY(-2px);
    box-shadow: ${({ theme }) => theme.shadows.md};
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    margin-bottom: ${({ theme }) => theme.spacing.SMALL}px;
  }
`;

// Header section with improved spacing and alignment
const AppointmentHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.SMALL}px;

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    flex-direction: column;
    align-items: flex-start;
    gap: ${({ theme }) => theme.spacing.BASE}px;
  }
`;

// Status indicator with dynamic styling
const StatusIndicator = styled.span<{ status: AppointmentStatus }>`
  padding: ${({ theme }) => `${theme.spacing.BASE / 2}px ${theme.spacing.SMALL}px`};
  border-radius: ${({ theme }) => theme.shape.borderRadius.sm}px;
  font-size: ${({ theme }) => theme.typography.fontSizes.small};
  font-weight: ${({ theme }) => theme.typography.fontWeights.medium};
  
  ${({ status, theme }) => {
    const colors = getStatusColor(status, theme);
    return `
      background-color: ${colors.background};
      color: ${colors.text};
    `;
  }}
`;

// Content section with enhanced readability
const AppointmentContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.SMALL}px;
  color: ${({ theme }) => theme.colors.text[500]};

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    gap: ${({ theme }) => theme.spacing.BASE}px;
  }
`;

// Action buttons container with responsive layout
const AppointmentActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.SMALL}px;
  margin-top: ${({ theme }) => theme.spacing.MEDIUM}px;

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    flex-direction: column;
    gap: ${({ theme }) => theme.spacing.BASE}px;
  }

  & > button {
    flex: 1;
  }
`;

// Helper function for status-based styling
const getStatusColor = (status: AppointmentStatus, theme: any) => {
  const statusColors = {
    [AppointmentStatus.SCHEDULED]: {
      background: theme.colors.info[100],
      text: theme.colors.info[700]
    },
    [AppointmentStatus.CONFIRMED]: {
      background: theme.colors.success[100],
      text: theme.colors.success[700]
    },
    [AppointmentStatus.CANCELLED]: {
      background: theme.colors.error[100],
      text: theme.colors.error[700]
    },
    [AppointmentStatus.COMPLETED]: {
      background: theme.colors.success[100],
      text: theme.colors.success[700]
    },
    [AppointmentStatus.RESCHEDULED]: {
      background: theme.colors.warning[100],
      text: theme.colors.warning[700]
    },
    [AppointmentStatus.PENDING]: {
      background: theme.colors.warning[100],
      text: theme.colors.warning[700]
    },
    [AppointmentStatus.NO_SHOW]: {
      background: theme.colors.error[100],
      text: theme.colors.error[700]
    }
  };

  return statusColors[status];
};

// Enhanced appointment card component
export const AppointmentCard = memo(({
  id,
  title,
  datetime,
  location,
  provider,
  status,
  onEdit,
  onCancel,
  onReschedule,
  className,
  testId = 'appointment-card'
}: AppointmentCardProps) => {
  const { theme } = useTheme();
  const [isLoading, setIsLoading] = useState({
    edit: false,
    cancel: false,
    reschedule: false
  });

  // Action handlers with loading states
  const handleEdit = useCallback(async () => {
    try {
      setIsLoading(prev => ({ ...prev, edit: true }));
      await onEdit(id);
    } finally {
      setIsLoading(prev => ({ ...prev, edit: false }));
    }
  }, [id, onEdit]);

  const handleCancel = useCallback(async () => {
    try {
      setIsLoading(prev => ({ ...prev, cancel: true }));
      await onCancel(id);
    } finally {
      setIsLoading(prev => ({ ...prev, cancel: false }));
    }
  }, [id, onCancel]);

  const handleReschedule = useCallback(async () => {
    try {
      setIsLoading(prev => ({ ...prev, reschedule: true }));
      await onReschedule(id);
    } finally {
      setIsLoading(prev => ({ ...prev, reschedule: false }));
    }
  }, [id, onReschedule]);

  return (
    <StyledAppointmentCard
      elevation={1}
      className={className}
      data-testid={testId}
      role="article"
      aria-labelledby={`appointment-title-${id}`}
    >
      <AppointmentHeader>
        <h3
          id={`appointment-title-${id}`}
          style={{
            margin: 0,
            fontSize: theme.typography.fontSizes.h4,
            fontWeight: theme.typography.fontWeights.medium
          }}
        >
          {title}
        </h3>
        <StatusIndicator status={status} role="status">
          {status.charAt(0).toUpperCase() + status.slice(1)}
        </StatusIndicator>
      </AppointmentHeader>

      <AppointmentContent>
        <div>
          <strong>Date & Time: </strong>
          <time dateTime={datetime.toISOString()}>
            {format(datetime, 'PPP p')}
          </time>
        </div>
        <div>
          <strong>Location: </strong>
          <address style={{ display: 'inline' }}>{location}</address>
        </div>
        <div>
          <strong>Provider: </strong>
          {provider}
        </div>
      </AppointmentContent>

      <AppointmentActions>
        <Button
          variant="outlined"
          onClick={handleEdit}
          loading={isLoading.edit}
          disabled={status === AppointmentStatus.CANCELLED || status === AppointmentStatus.COMPLETED}
          aria-label={`Edit appointment: ${title}`}
        >
          Edit
        </Button>
        <Button
          variant="outlined"
          onClick={handleReschedule}
          loading={isLoading.reschedule}
          disabled={status === AppointmentStatus.CANCELLED || status === AppointmentStatus.COMPLETED}
          aria-label={`Reschedule appointment: ${title}`}
        >
          Reschedule
        </Button>
        <Button
          variant="text"
          onClick={handleCancel}
          loading={isLoading.cancel}
          disabled={status === AppointmentStatus.CANCELLED || status === AppointmentStatus.COMPLETED}
          aria-label={`Cancel appointment: ${title}`}
        >
          Cancel
        </Button>
      </AppointmentActions>
    </StyledAppointmentCard>
  );
});

AppointmentCard.displayName = 'AppointmentCard';

export default AppointmentCard;