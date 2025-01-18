import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import styled from '@emotion/styled';
import { css } from '@emotion/react';
import { useTheme } from '../../hooks/useTheme';
import { SPACING, BREAKPOINTS } from '../../styles/dimensions';

// Interfaces
interface DropdownOption {
  value: string;
  label: string;
  icon?: string;
  isDisabled?: boolean;
  description?: string;
  group?: string;
  metadata?: Record<string, unknown>;
}

interface DropdownProps {
  options: Array<DropdownOption>;
  value: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  isMulti?: boolean;
  isSearchable?: boolean;
  isDisabled?: boolean;
  error?: string;
  className?: string;
  isLoading?: boolean;
  maxHeight?: number;
  renderOption?: (option: DropdownOption) => React.ReactNode;
  onSearchChange?: (searchValue: string) => void;
  virtualized?: boolean;
}

// Styled Components
const DropdownContainer = styled.div<{ isDisabled?: boolean; hasError?: boolean }>`
  position: relative;
  width: 100%;
  font-family: ${({ theme }) => theme.typography.fontFamilies.primary};
  opacity: ${({ isDisabled }) => (isDisabled ? 0.5 : 1)};
  pointer-events: ${({ isDisabled }) => (isDisabled ? 'none' : 'auto')};

  @media (min-width: ${BREAKPOINTS.MOBILE}px) {
    min-width: 200px;
  }
`;

const DropdownTrigger = styled.button<{ isOpen: boolean; hasError?: boolean }>`
  width: 100%;
  min-height: 40px;
  padding: ${SPACING.BASE}px;
  background: ${({ theme }) => theme.colors.surface[100]};
  border: 1px solid ${({ theme, hasError }) => 
    hasError ? theme.colors.error[500] : theme.colors.surface[300]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all ${({ theme }) => theme.transitions.duration.short}ms ${({ theme }) => theme.transitions.easing.easeInOut};
  
  &:hover:not(:disabled) {
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primary[200]};
  }
`;

const OptionsList = styled.ul<{ maxHeight?: number }>`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: ${SPACING.BASE}px;
  max-height: ${({ maxHeight }) => maxHeight || 300}px;
  overflow-y: auto;
  background: ${({ theme }) => theme.colors.surface[100]};
  border: 1px solid ${({ theme }) => theme.colors.surface[300]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.md}px;
  box-shadow: ${({ theme }) => theme.shadows.md};
  z-index: ${({ theme }) => theme.zIndex.dropdown};
`;

const OptionItem = styled.li<{ isSelected?: boolean; isDisabled?: boolean }>`
  padding: ${SPACING.BASE}px;
  cursor: ${({ isDisabled }) => (isDisabled ? 'not-allowed' : 'pointer')};
  background: ${({ theme, isSelected }) => 
    isSelected ? theme.colors.primary[100] : 'transparent'};
  color: ${({ theme, isDisabled }) => 
    isDisabled ? theme.colors.text[300] : theme.colors.text[500]};
  
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.colors.primary[50]};
  }
`;

const SearchInput = styled.input`
  width: 100%;
  padding: ${SPACING.BASE}px;
  border: none;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surface[300]};
  background: transparent;
  font-family: inherit;
  
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
  }
`;

const LoadingSpinner = styled.div`
  width: 20px;
  height: 20px;
  border: 2px solid ${({ theme }) => theme.colors.surface[300]};
  border-top-color: ${({ theme }) => theme.colors.primary[500]};
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

// Main Component
const Dropdown: React.FC<DropdownProps> = memo(({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  isMulti = false,
  isSearchable = false,
  isDisabled = false,
  error,
  className,
  isLoading = false,
  maxHeight,
  renderOption,
  onSearchChange,
  virtualized = false
}) => {
  const { theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filteredOptions = useCallback(() => {
    if (!searchValue) return options;
    return options.filter(option => 
      option.label.toLowerCase().includes(searchValue.toLowerCase()));
  }, [options, searchValue]);

  const handleKeyboardNavigation = useCallback((event: KeyboardEvent) => {
    if (!isOpen) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex(prev => 
          prev < filteredOptions().length - 1 ? prev + 1 : 0);
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex(prev => 
          prev > 0 ? prev - 1 : filteredOptions().length - 1);
        break;
      case 'Enter':
        event.preventDefault();
        if (focusedIndex >= 0) {
          const selectedOption = filteredOptions()[focusedIndex];
          if (!selectedOption.isDisabled) {
            handleSelect(selectedOption);
          }
        }
        break;
      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        break;
    }
  }, [isOpen, focusedIndex, filteredOptions]);

  const handleSelect = useCallback((option: DropdownOption) => {
    if (isMulti) {
      const values = Array.isArray(value) ? value : [];
      const newValue = values.includes(option.value)
        ? values.filter(v => v !== option.value)
        : [...values, option.value];
      onChange(newValue);
    } else {
      onChange(option.value);
      setIsOpen(false);
    }
  }, [value, onChange, isMulti]);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchValue(newValue);
    onSearchChange?.(newValue);
  }, [onSearchChange]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyboardNavigation);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyboardNavigation);
    };
  }, [handleKeyboardNavigation]);

  const renderSelectedValue = () => {
    if (isMulti && Array.isArray(value)) {
      const selectedOptions = options.filter(opt => value.includes(opt.value));
      return selectedOptions.length 
        ? selectedOptions.map(opt => opt.label).join(', ')
        : placeholder;
    }
    
    const selectedOption = options.find(opt => opt.value === value);
    return selectedOption ? selectedOption.label : placeholder;
  };

  return (
    <DropdownContainer
      ref={containerRef}
      className={className}
      isDisabled={isDisabled}
      hasError={!!error}
    >
      <DropdownTrigger
        type="button"
        onClick={() => !isDisabled && setIsOpen(!isOpen)}
        isOpen={isOpen}
        hasError={!!error}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-disabled={isDisabled}
      >
        <span>{renderSelectedValue()}</span>
        {isLoading ? (
          <LoadingSpinner aria-label="Loading" />
        ) : (
          <span aria-hidden="true">▼</span>
        )}
      </DropdownTrigger>

      {isOpen && (
        <OptionsList
          ref={listRef}
          maxHeight={maxHeight}
          role="listbox"
          aria-multiselectable={isMulti}
        >
          {isSearchable && (
            <SearchInput
              type="text"
              value={searchValue}
              onChange={handleSearchChange}
              placeholder="Search..."
              aria-label="Search options"
              autoFocus
            />
          )}
          
          {filteredOptions().map((option, index) => (
            <OptionItem
              key={option.value}
              onClick={() => !option.isDisabled && handleSelect(option)}
              isSelected={Array.isArray(value) 
                ? value.includes(option.value)
                : value === option.value}
              isDisabled={option.isDisabled}
              role="option"
              aria-selected={Array.isArray(value)
                ? value.includes(option.value)
                : value === option.value}
              aria-disabled={option.isDisabled}
            >
              {renderOption ? renderOption(option) : (
                <>
                  {option.icon && <span className="icon">{option.icon}</span>}
                  <span>{option.label}</span>
                  {option.description && (
                    <span className="description">{option.description}</span>
                  )}
                </>
              )}
            </OptionItem>
          ))}
        </OptionsList>
      )}
      
      {error && (
        <span role="alert" css={css`
          color: ${theme.colors.error[500]};
          font-size: ${theme.typography.fontSizes.small};
          margin-top: ${SPACING.BASE}px;
        `}>
          {error}
        </span>
      )}
    </DropdownContainer>
  );
});

Dropdown.displayName = 'Dropdown';

export default Dropdown;
export type { DropdownProps, DropdownOption };