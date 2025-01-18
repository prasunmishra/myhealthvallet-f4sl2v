import React, { useCallback, useEffect, useRef, memo } from 'react'; // ^18.0.0
import { createPortal } from 'react-dom'; // ^18.0.0
import styled from '@emotion/styled'; // ^11.0.0
import FocusTrap from 'focus-trap-react'; // ^9.0.0
import { Theme } from '../../styles/theme';
import { fadeIn, fadeOut, slideIn, slideOut, ANIMATION_DURATIONS, ANIMATION_EASINGS } from '../../styles/animations';
import Button from './Button';

// Modal Props Interface
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: 'small' | 'medium' | 'large';
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  initialFocusRef?: React.RefObject<HTMLElement>;
  finalFocusRef?: React.RefObject<HTMLElement>;
  animationDuration?: number;
  disableAnimation?: boolean;
  preventScroll?: boolean;
  rtl?: boolean;
}

// Styled Components
const ModalOverlay = styled.div<{ isOpen: boolean; duration: number }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${({ theme }: { theme: Theme }) => `${theme.colors.text[900]}99`};
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: ${({ theme }) => theme.zIndex.modal};
  animation: ${({ isOpen }) => isOpen ? fadeIn : fadeOut} ${({ duration }) => duration}ms ${ANIMATION_EASINGS.EASE_OUT};
  will-change: opacity;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const ModalContainer = styled.div<{ size: string; isOpen: boolean; duration: number; rtl?: boolean }>`
  position: relative;
  background-color: ${({ theme }) => theme.colors.surface[100]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.lg}px;
  box-shadow: ${({ theme }) => theme.shadows.xl};
  max-width: ${({ size }) => 
    size === 'small' ? '400px' : 
    size === 'large' ? '800px' : 
    '600px'
  };
  width: calc(100% - ${({ theme }) => theme.spacing.LARGE * 2}px);
  max-height: calc(100vh - ${({ theme }) => theme.spacing.XLARGE * 2}px);
  margin: ${({ theme }) => theme.spacing.LARGE}px;
  display: flex;
  flex-direction: column;
  animation: ${({ isOpen }) => isOpen ? slideIn : slideOut} ${({ duration }) => duration}ms ${ANIMATION_EASINGS.EASE_OUT};
  will-change: transform, opacity;
  direction: ${({ rtl }) => rtl ? 'rtl' : 'ltr'};

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }

  &:focus {
    outline: none;
  }

  &:focus-visible {
    outline: 3px solid ${({ theme }) => theme.colors.primary[300]};
    outline-offset: 2px;
  }
`;

const ModalHeader = styled.header`
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface[300]};
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const ModalTitle = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.typography.fontFamilies.primary};
  font-size: ${({ theme }) => theme.typography.fontSizes.h4};
  font-weight: ${({ theme }) => theme.typography.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.text[900]};
`;

const ModalContent = styled.div`
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  overflow-y: auto;
  flex: 1;
  min-height: 100px;
`;

const ModalFooter = styled.footer`
  padding: ${({ theme }) => theme.spacing.LARGE}px;
  border-top: 1px solid ${({ theme }) => theme.colors.surface[300]};
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.MEDIUM}px;
`;

// Custom hook for modal effects
const useModalEffect = (
  isOpen: boolean,
  onClose: () => void,
  closeOnEscape: boolean,
  preventScroll: boolean,
  initialFocusRef?: React.RefObject<HTMLElement>,
  finalFocusRef?: React.RefObject<HTMLElement>
) => {
  useEffect(() => {
    if (isOpen && preventScroll) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = '';
      if (!isOpen && finalFocusRef?.current) {
        finalFocusRef.current.focus();
      }
    };
  }, [isOpen, preventScroll, finalFocusRef]);

  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, closeOnEscape]);
};

// Modal Component
export const Modal = memo<ModalProps>(({
  isOpen,
  onClose,
  title,
  size = 'medium',
  children,
  footer,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  ariaLabel,
  ariaDescribedBy,
  initialFocusRef,
  finalFocusRef,
  animationDuration = ANIMATION_DURATIONS.NORMAL,
  disableAnimation = false,
  preventScroll = true,
  rtl = false,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const duration = disableAnimation ? 0 : animationDuration;

  useModalEffect(isOpen, onClose, closeOnEscape, preventScroll, initialFocusRef, finalFocusRef);

  const handleBackdropClick = useCallback((event: React.MouseEvent) => {
    if (closeOnBackdropClick && event.target === event.currentTarget) {
      onClose();
    }
  }, [closeOnBackdropClick, onClose]);

  if (!isOpen) return null;

  const modalContent = (
    <ModalOverlay 
      isOpen={isOpen} 
      duration={duration}
      onClick={handleBackdropClick}
      aria-hidden="true"
    >
      <FocusTrap
        focusTrapOptions={{
          initialFocus: initialFocusRef?.current || undefined,
          fallbackFocus: modalRef.current || undefined,
          escapeDeactivates: closeOnEscape,
          allowOutsideClick: true,
        }}
      >
        <ModalContainer
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel || title}
          aria-describedby={ariaDescribedBy}
          size={size}
          isOpen={isOpen}
          duration={duration}
          rtl={rtl}
          tabIndex={-1}
        >
          <ModalHeader>
            <ModalTitle>{title}</ModalTitle>
            <Button
              variant="text"
              size="small"
              onClick={onClose}
              ariaLabel="Close modal"
            >
              ✕
            </Button>
          </ModalHeader>
          <ModalContent id={ariaDescribedBy}>
            {children}
          </ModalContent>
          {footer && <ModalFooter>{footer}</ModalFooter>}
        </ModalContainer>
      </FocusTrap>
    </ModalOverlay>
  );

  return createPortal(modalContent, document.body);
});

Modal.displayName = 'Modal';

export default Modal;