import React, { useCallback, useEffect, useRef, useState } from 'react'; // ^18.0.0
import styled from '@emotion/styled'; // ^11.11.0
import useResizeObserver from '@react-hook/resize-observer'; // ^1.2.6
import { useTheme } from '../../hooks/useTheme';
import { Theme } from '../../styles/theme';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';
import { createTransition, ANIMATION_DURATIONS, ANIMATION_EASINGS } from '../../styles/animations';

// Styled components with theme integration
const TabsContainer = styled.div<{ orientation: 'horizontal' | 'vertical' }>`
  display: flex;
  flex-direction: ${props => props.orientation === 'vertical' ? 'row' : 'column'};
  width: 100%;
  position: relative;
`;

const TabList = styled.div<{
  orientation: 'horizontal' | 'vertical';
  variant: 'default' | 'contained' | 'outlined' | 'pill';
  disabled: boolean;
}>`
  display: flex;
  flex-direction: ${props => props.orientation === 'vertical' ? 'column' : 'row'};
  ${props => props.orientation === 'vertical' ? 'min-width: 200px;' : ''}
  border-bottom: ${props => props.variant === 'default' ? 
    `2px solid ${props.theme.colors.surface[300]}` : 'none'};
  opacity: ${props => props.disabled ? 0.5 : 1};
  pointer-events: ${props => props.disabled ? 'none' : 'auto'};
  ${props => createTransition(['opacity', 'border-color'])}
`;

const TabButton = styled.button<{
  isActive: boolean;
  variant: 'default' | 'contained' | 'outlined' | 'pill';
  size: 'small' | 'medium' | 'large';
  orientation: 'horizontal' | 'vertical';
}>`
  display: flex;
  align-items: center;
  gap: ${props => props.theme.spacing.SMALL}px;
  padding: ${props => {
    const size = {
      small: props.theme.spacing.SMALL,
      medium: props.theme.spacing.MEDIUM,
      large: props.theme.spacing.LARGE
    }[props.size];
    return props.orientation === 'vertical' ? 
      `${size}px ${size * 1.5}px` : 
      `${size}px ${size * 2}px`;
  }};
  border: none;
  background: none;
  cursor: pointer;
  font-family: ${props => props.theme.typography.fontFamilies.primary};
  font-size: ${props => props.theme.typography.fontSizes.base};
  color: ${props => props.isActive ? 
    props.theme.colors.primary[500] : 
    props.theme.colors.text[500]};
  position: relative;
  transition: all ${ANIMATION_DURATIONS.NORMAL}ms ${ANIMATION_EASINGS.EASE_OUT};

  ${props => {
    switch (props.variant) {
      case 'contained':
        return `
          background-color: ${props.isActive ? 
            props.theme.colors.primary[500] : 
            props.theme.colors.surface[200]};
          color: ${props.isActive ? 
            props.theme.colors.surface[100] : 
            props.theme.colors.text[500]};
          border-radius: ${props.theme.shape.borderRadius.md}px;
        `;
      case 'outlined':
        return `
          border: 2px solid ${props.isActive ? 
            props.theme.colors.primary[500] : 
            props.theme.colors.surface[300]};
          border-radius: ${props.theme.shape.borderRadius.md}px;
        `;
      case 'pill':
        return `
          border-radius: ${props.theme.shape.borderRadius.full};
          background-color: ${props.isActive ? 
            props.theme.colors.primary[500] : 
            'transparent'};
          color: ${props.isActive ? 
            props.theme.colors.surface[100] : 
            props.theme.colors.text[500]};
        `;
      default:
        return `
          &::after {
            content: '';
            position: absolute;
            bottom: -2px;
            left: 0;
            width: 100%;
            height: 2px;
            background-color: ${props.isActive ? 
              props.theme.colors.primary[500] : 
              'transparent'};
            transition: background-color ${ANIMATION_DURATIONS.NORMAL}ms ${ANIMATION_EASINGS.EASE_OUT};
          }
        `;
    }
  }}

  &:hover {
    background-color: ${props => props.variant === 'default' ? 
      props.theme.colors.surface[200] : 
      props.isActive ? 
        props.theme.colors.primary[600] : 
        props.theme.colors.surface[300]};
  }

  &:focus-visible {
    outline: 2px solid ${props => props.theme.colors.primary[500]};
    outline-offset: 2px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const TabPanel = styled.div<{ isActive: boolean }>`
  display: ${props => props.isActive ? 'block' : 'none'};
  padding: ${props => props.theme.spacing.MEDIUM}px;
`;

const TabBadge = styled.span`
  background-color: ${props => props.theme.colors.primary[500]};
  color: ${props => props.theme.colors.surface[100]};
  padding: 2px 8px;
  border-radius: ${props => props.theme.shape.borderRadius.full};
  font-size: ${props => props.theme.typography.fontSizes.small};
`;

// Interfaces
export interface TabsProps {
  children: React.ReactNode;
  activeTab?: number;
  defaultActiveTab?: number;
  onChange?: (index: number) => void;
  orientation?: 'horizontal' | 'vertical';
  variant?: 'default' | 'contained' | 'outlined' | 'pill';
  size?: 'small' | 'medium' | 'large';
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  errorFallback?: React.ReactNode;
  onError?: (error: Error) => void;
  rtl?: boolean;
  animate?: boolean;
}

export interface TabProps {
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  tooltipContent?: string;
  badge?: string | number;
  customStyle?: React.CSSProperties;
  onFocus?: (event: React.FocusEvent) => void;
  onBlur?: (event: React.FocusEvent) => void;
}

// Custom hook for tab management
const useTabs = (props: TabsProps) => {
  const {
    activeTab,
    defaultActiveTab = 0,
    onChange,
    rtl = false
  } = props;

  const [selectedTab, setSelectedTab] = useState(activeTab ?? defaultActiveTab);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleTabChange = useCallback((index: number) => {
    if (activeTab === undefined) {
      setSelectedTab(index);
    }
    onChange?.(index);
  }, [activeTab, onChange]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent, index: number) => {
    const tabCount = tabRefs.current.length;
    let nextIndex = index;

    switch (event.key) {
      case 'ArrowLeft':
        nextIndex = rtl ? 
          (index + 1) % tabCount : 
          (index - 1 + tabCount) % tabCount;
        break;
      case 'ArrowRight':
        nextIndex = rtl ? 
          (index - 1 + tabCount) % tabCount : 
          (index + 1) % tabCount;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = tabCount - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    tabRefs.current[nextIndex]?.focus();
    handleTabChange(nextIndex);
  }, [handleTabChange, rtl]);

  return {
    selectedTab,
    handleTabChange,
    handleKeyDown,
    tabRefs
  };
};

// Main component
export const Tabs: React.FC<TabsProps> & { Tab: React.FC<TabProps> } = ({
  children,
  orientation = 'horizontal',
  variant = 'default',
  size = 'medium',
  className,
  disabled = false,
  loading = false,
  errorFallback,
  onError,
  rtl = false,
  animate = true,
  ...props
}) => {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    selectedTab,
    handleTabChange,
    handleKeyDown,
    tabRefs
  } = useTabs(props);

  // Responsive handling
  useResizeObserver(containerRef, (entry) => {
    if (entry.contentRect.width < theme.breakpoints.MOBILE) {
      // Handle mobile layout adjustments
    }
  });

  const tabs = React.Children.toArray(children).filter(
    (child): child is React.ReactElement => React.isValidElement(child)
  );

  return (
    <ErrorBoundary
      fallback={errorFallback ?? <div>Error loading tabs</div>}
      onError={onError}
    >
      <TabsContainer
        ref={containerRef}
        orientation={orientation}
        className={className}
        dir={rtl ? 'rtl' : 'ltr'}
      >
        <TabList
          role="tablist"
          aria-orientation={orientation}
          orientation={orientation}
          variant={variant}
          disabled={disabled || loading}
        >
          {tabs.map((tab, index) => (
            <TabButton
              key={index}
              role="tab"
              aria-selected={selectedTab === index}
              aria-controls={`tab-panel-${index}`}
              id={`tab-${index}`}
              tabIndex={selectedTab === index ? 0 : -1}
              ref={el => tabRefs.current[index] = el}
              onClick={() => !tab.props.disabled && handleTabChange(index)}
              onKeyDown={e => handleKeyDown(e, index)}
              isActive={selectedTab === index}
              variant={variant}
              size={size}
              orientation={orientation}
              disabled={tab.props.disabled}
              title={tab.props.tooltipContent}
              style={tab.props.customStyle}
              onFocus={tab.props.onFocus}
              onBlur={tab.props.onBlur}
            >
              {tab.props.icon}
              {tab.props.label}
              {tab.props.badge && (
                <TabBadge>{tab.props.badge}</TabBadge>
              )}
            </TabButton>
          ))}
        </TabList>

        {tabs.map((tab, index) => (
          <TabPanel
            key={index}
            role="tabpanel"
            id={`tab-panel-${index}`}
            aria-labelledby={`tab-${index}`}
            hidden={selectedTab !== index}
            isActive={selectedTab === index}
          >
            {tab.props.children}
          </TabPanel>
        ))}
      </TabsContainer>
    </ErrorBoundary>
  );
};

// Tab subcomponent
Tabs.Tab = ({ children }) => children;

// Display name for debugging
Tabs.displayName = 'Tabs';
Tabs.Tab.displayName = 'Tab';

export default Tabs;