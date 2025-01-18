import React, { useState, useCallback, useEffect, memo } from 'react';
import styled from '@emotion/styled';
import { css } from '@emotion/react';
import sanitizeHtml from 'sanitize-html'; // ^2.11.0
import { auditLog } from '@hipaa/audit-log'; // ^2.0.0
import { detectPHI } from '@hipaa/phi-detection'; // ^1.0.0
import Dropdown, { DropdownProps } from '../common/Dropdown';
import { DocumentMetadata } from '../../types/documents.types';
import { useTheme } from '../../hooks/useTheme';

// Constants
const MAX_TAG_LENGTH = 50;
const MIN_TAG_LENGTH = 2;
const MAX_TAGS_DEFAULT = 10;
const RESTRICTED_CHARACTERS = /[<>{}[\]\\\/]/g;

// Interfaces
interface TagSelectorProps {
  selectedTags: string[];
  onTagsChange: (tags: string[], metadata: TagMetadata) => void;
  suggestedTags?: string[];
  allowCustomTags?: boolean;
  isDisabled?: boolean;
  error?: string;
  maxTags?: number;
  requireAudit?: boolean;
  ariaLabel?: string;
  locale?: string;
  validationRules?: TagValidationRules;
}

interface TagOption {
  value: string;
  label: string;
  isCustom?: boolean;
  metadata?: TagMetadata;
  containsPHI?: boolean;
  category?: string;
}

interface TagMetadata {
  createdBy: string;
  createdAt: Date;
  lastModifiedBy?: string;
  lastModifiedAt?: Date;
  auditTrail?: string[];
}

interface TagValidationRules {
  allowedCategories?: string[];
  restrictedPrefixes?: string[];
  requireCategory?: boolean;
  customValidation?: (tag: string) => boolean;
}

// Styled Components with WCAG 2.1 AAA compliance
const TagSelectorContainer = styled.div<{ isDisabled?: boolean }>`
  position: relative;
  width: 100%;
  opacity: ${({ isDisabled }) => (isDisabled ? 0.5 : 1)};
  pointer-events: ${({ isDisabled }) => (isDisabled ? 'none' : 'auto')};
`;

const TagList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.BASE}px;
  list-style: none;
  padding: 0;
  margin: ${({ theme }) => theme.spacing.BASE}px 0;
`;

const TagItem = styled.li<{ containsPHI?: boolean }>`
  display: flex;
  align-items: center;
  padding: ${({ theme }) => theme.spacing.BASE / 2}px ${({ theme }) => theme.spacing.BASE}px;
  background: ${({ theme, containsPHI }) => 
    containsPHI ? theme.colors.warning[100] : theme.colors.primary[100]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.sm}px;
  font-size: ${({ theme }) => theme.typography.fontSizes.small};
  color: ${({ theme }) => theme.colors.text[700]};

  &:focus-within {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const CustomTagInput = styled.input`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.BASE}px;
  border: 1px solid ${({ theme }) => theme.colors.surface[300]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.sm}px;
  font-family: inherit;
  font-size: ${({ theme }) => theme.typography.fontSizes.base};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary[500]};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primary[200]};
  }
`;

// Main Component
const TagSelector: React.FC<TagSelectorProps> = memo(({
  selectedTags,
  onTagsChange,
  suggestedTags = [],
  allowCustomTags = true,
  isDisabled = false,
  error,
  maxTags = MAX_TAGS_DEFAULT,
  requireAudit = true,
  ariaLabel = 'Tag selector',
  locale = 'en-US',
  validationRules = {}
}) => {
  const { theme } = useTheme();
  const [customTagInput, setCustomTagInput] = useState('');
  const [options, setOptions] = useState<TagOption[]>([]);

  // Initialize options with suggested tags
  useEffect(() => {
    const initialOptions: TagOption[] = suggestedTags.map(tag => ({
      value: tag,
      label: tag,
      isCustom: false,
      containsPHI: false
    }));
    setOptions(initialOptions);
  }, [suggestedTags]);

  // Validate tag content
  const validateTag = useCallback((tag: string): boolean => {
    if (!tag || tag.length < MIN_TAG_LENGTH || tag.length > MAX_TAG_LENGTH) return false;
    if (tag.match(RESTRICTED_CHARACTERS)) return false;
    if (validationRules.restrictedPrefixes?.some(prefix => tag.startsWith(prefix))) return false;
    if (validationRules.customValidation && !validationRules.customValidation(tag)) return false;
    return true;
  }, [validationRules]);

  // Handle tag change with HIPAA compliance checks
  const handleTagChange = useCallback(async (newTags: string[]) => {
    if (newTags.length > maxTags) return;

    const metadata: TagMetadata = {
      createdBy: 'current-user', // Replace with actual user ID
      createdAt: new Date(),
      auditTrail: ['Tag selection modified']
    };

    // Check for PHI in new tags
    const phiCheckPromises = newTags.map(async tag => {
      const containsPHI = await detectPHI(tag);
      return { tag, containsPHI };
    });

    const phiResults = await Promise.all(phiCheckPromises);
    const hasPHI = phiResults.some(result => result.containsPHI);

    if (hasPHI) {
      auditLog({
        event: 'PHI_DETECTED_IN_TAG',
        data: { tags: newTags },
        severity: 'WARNING'
      });
    }

    // Sanitize tags
    const sanitizedTags = newTags.map(tag => 
      sanitizeHtml(tag, {
        allowedTags: [],
        allowedAttributes: {}
      })
    );

    if (requireAudit) {
      auditLog({
        event: 'TAGS_MODIFIED',
        data: { 
          previousTags: selectedTags,
          newTags: sanitizedTags
        }
      });
    }

    onTagsChange(sanitizedTags, metadata);
  }, [maxTags, selectedTags, onTagsChange, requireAudit]);

  // Handle custom tag creation
  const handleCustomTagCreate = useCallback((tagName: string): TagOption | null => {
    const sanitizedTag = sanitizeHtml(tagName.trim(), {
      allowedTags: [],
      allowedAttributes: {}
    });

    if (!validateTag(sanitizedTag)) return null;

    const newTag: TagOption = {
      value: sanitizedTag,
      label: sanitizedTag,
      isCustom: true,
      metadata: {
        createdBy: 'current-user', // Replace with actual user ID
        createdAt: new Date()
      }
    };

    auditLog({
      event: 'CUSTOM_TAG_CREATED',
      data: { tag: sanitizedTag }
    });

    return newTag;
  }, [validateTag]);

  // Dropdown props configuration
  const dropdownProps: DropdownProps = {
    options: options.map(opt => ({
      value: opt.value,
      label: opt.label,
      isDisabled: selectedTags.length >= maxTags
    })),
    value: selectedTags,
    onChange: handleTagChange,
    isMulti: true,
    isSearchable: true,
    isDisabled,
    error,
    placeholder: 'Select or create tags...',
    renderOption: (option) => (
      <div css={css`
        display: flex;
        align-items: center;
        gap: ${theme.spacing.BASE}px;
      `}>
        <span>{option.label}</span>
        {option.isCustom && (
          <span css={css`
            font-size: ${theme.typography.fontSizes.small};
            color: ${theme.colors.text[400]};
          `}>
            (Custom)
          </span>
        )}
      </div>
    )
  };

  return (
    <TagSelectorContainer
      isDisabled={isDisabled}
      role="region"
      aria-label={ariaLabel}
    >
      <Dropdown {...dropdownProps} />
      
      {allowCustomTags && (
        <CustomTagInput
          type="text"
          value={customTagInput}
          onChange={(e) => setCustomTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && customTagInput) {
              const newTag = handleCustomTagCreate(customTagInput);
              if (newTag) {
                setOptions([...options, newTag]);
                setCustomTagInput('');
              }
            }
          }}
          placeholder="Type and press Enter to create custom tag"
          aria-label="Create custom tag"
          disabled={isDisabled || selectedTags.length >= maxTags}
        />
      )}

      <TagList role="list" aria-label="Selected tags">
        {selectedTags.map((tag) => (
          <TagItem
            key={tag}
            role="listitem"
            containsPHI={options.find(opt => opt.value === tag)?.containsPHI}
          >
            {tag}
          </TagItem>
        ))}
      </TagList>
    </TagSelectorContainer>
  );
});

TagSelector.displayName = 'TagSelector';

export default TagSelector;
export type { TagSelectorProps, TagOption, TagMetadata };