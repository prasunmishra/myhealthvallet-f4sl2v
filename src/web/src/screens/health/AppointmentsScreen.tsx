import React, { useCallback, useEffect, useState } from 'react';
import styled from '@emotion/styled';
import { format } from 'date-fns';
import { AppointmentCard, AppointmentStatus } from '../../components/health/AppointmentCard';
import { Button } from '../../components/common/Button';
import { useHealth } from '../../hooks/useHealth';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';

// FHIR-compliant appointment interface
interface FHIRAppointment {
  id: string;
  resourceType: 'Appointment';
  status: AppointmentStatus;
  start: string;
  end: string;
  participant: Array<{
    actor: {
      reference: string;
      display: string;
    };
    status: 'accepted' | 'declined' | 'tentative' | 'needs-action';
  }>;
}

// Styled components with responsive design
const ScreenContainer = styled.div`
  padding: ${({ theme }) => theme.spacing.MEDIUM}px;
  max-width: 1200px;
  margin: 0 auto;

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    padding: ${({ theme }) => theme.spacing.SMALL}px;
  }
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.LARGE}px;

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    flex-direction: column;
    gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  }
`;

const Title = styled.h1`
  font-size: ${({ theme }) => theme.typography.fontSizes.h2};
  font-weight: ${({ theme }) => theme.typography.fontWeights.bold};
  margin: 0;
  color: ${({ theme }) => theme.colors.text[900]};
`;

const AppointmentGrid = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    grid-template-columns: 1fr;
  }
`;

const FilterSection = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.SMALL}px;
  margin-bottom: ${({ theme }) => theme.spacing.MEDIUM}px;
  flex-wrap: wrap;

  @media (max-width: ${({ theme }) => theme.breakpoints.MOBILE}px) {
    flex-direction: column;
  }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.XLARGE}px;
  color: ${({ theme }) => theme.colors.text[500]};
`;

const AppointmentsScreen: React.FC = () => {
  const [appointments, setAppointments] = useState<FHIRAppointment[]>([]);
  const [filter, setFilter] = useState<AppointmentStatus | 'all'>('all');
  
  const { 
    fetchAppointments, 
    validateFHIR,
    useWebSocket 
  } = useHealth();

  // Initialize WebSocket connection for real-time updates
  useWebSocket('/ws/appointments', {
    onMessage: (message) => {
      const appointment = JSON.parse(message.data);
      if (validateFHIR(appointment)) {
        setAppointments(prev => 
          prev.map(a => a.id === appointment.id ? appointment : a)
        );
      }
    }
  });

  // Fetch appointments with FHIR validation
  useEffect(() => {
    const loadAppointments = async () => {
      try {
        const response = await fetchAppointments();
        const validatedAppointments = await Promise.all(
          response.map(async (appointment) => {
            const isValid = await validateFHIR(appointment);
            return isValid ? appointment : null;
          })
        );
        setAppointments(validatedAppointments.filter(Boolean) as FHIRAppointment[]);
      } catch (error) {
        console.error('Error fetching appointments:', error);
      }
    };

    loadAppointments();
  }, [fetchAppointments, validateFHIR]);

  // Filter appointments
  const filteredAppointments = useCallback(() => {
    return filter === 'all'
      ? appointments
      : appointments.filter(apt => apt.status === filter);
  }, [appointments, filter]);

  // Appointment action handlers with optimistic updates
  const handleEdit = useCallback(async (id: string) => {
    // Implementation would go here
    console.log('Edit appointment:', id);
  }, []);

  const handleCancel = useCallback(async (id: string) => {
    const updatedAppointment = appointments.find(a => a.id === id);
    if (updatedAppointment) {
      // Optimistic update
      setAppointments(prev =>
        prev.map(a => a.id === id ? { ...a, status: AppointmentStatus.CANCELLED } : a)
      );
      
      try {
        // Actual API call would go here
        await validateFHIR(updatedAppointment);
      } catch (error) {
        // Revert optimistic update on error
        setAppointments(prev =>
          prev.map(a => a.id === id ? { ...a, status: updatedAppointment.status } : a)
        );
      }
    }
  }, [appointments, validateFHIR]);

  const handleReschedule = useCallback(async (id: string) => {
    // Implementation would go here
    console.log('Reschedule appointment:', id);
  }, []);

  return (
    <ErrorBoundary>
      <ScreenContainer>
        <Header>
          <Title>Appointments</Title>
          <Button
            variant="primary"
            onClick={() => {/* Implementation for new appointment */}}
            startIcon="calendar-plus"
          >
            New Appointment
          </Button>
        </Header>

        <FilterSection>
          <Button
            variant={filter === 'all' ? 'primary' : 'outlined'}
            onClick={() => setFilter('all')}
          >
            All
          </Button>
          <Button
            variant={filter === AppointmentStatus.SCHEDULED ? 'primary' : 'outlined'}
            onClick={() => setFilter(AppointmentStatus.SCHEDULED)}
          >
            Scheduled
          </Button>
          <Button
            variant={filter === AppointmentStatus.COMPLETED ? 'primary' : 'outlined'}
            onClick={() => setFilter(AppointmentStatus.COMPLETED)}
          >
            Completed
          </Button>
          <Button
            variant={filter === AppointmentStatus.CANCELLED ? 'primary' : 'outlined'}
            onClick={() => setFilter(AppointmentStatus.CANCELLED)}
          >
            Cancelled
          </Button>
        </FilterSection>

        <AppointmentGrid>
          {filteredAppointments().length > 0 ? (
            filteredAppointments().map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                id={appointment.id}
                title={appointment.participant[0]?.actor.display || 'Unnamed Appointment'}
                datetime={new Date(appointment.start)}
                location="Medical Center"
                provider={appointment.participant[1]?.actor.display || 'Unknown Provider'}
                status={appointment.status}
                onEdit={handleEdit}
                onCancel={handleCancel}
                onReschedule={handleReschedule}
              />
            ))
          ) : (
            <EmptyState>
              <h3>No appointments found</h3>
              <p>Schedule a new appointment to get started</p>
            </EmptyState>
          )}
        </AppointmentGrid>
      </ScreenContainer>
    </ErrorBoundary>
  );
};

export default AppointmentsScreen;