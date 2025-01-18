import React, { useCallback, useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { validateDocument } from '../../utils/validation.utils';
import { DOCUMENT_VALIDATION } from '../../constants/validation.constants';
import { theme } from '../../styles/theme';

// Props interface with HIPAA compliance and accessibility support
interface FileUploadProps {
  onFileSelect: (file: File, progressCallback: (progress: number) => void) => Promise<void>;
  onError: (error: FileUploadError) => void;
  acceptedTypes?: string[];
  maxSize?: number;
  disabled?: boolean;
  multiple?: boolean;
  ariaLabel?: string;
  validateHIPAA?: boolean;
  chunkSize?: number;
  allowRetry?: boolean;
  showPreview?: boolean;
}

// Custom error interface for detailed error handling
interface FileUploadError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Styled components with accessibility and HIPAA compliance
const UploadContainer = styled.div<{ isDragging: boolean; isError: boolean; disabled: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: ${theme.spacing.MEDIUM}px;
  border: 2px dashed ${({ isDragging, isError, theme }) => 
    isError ? theme.colors.error[500] :
    isDragging ? theme.colors.primary[500] :
    theme.colors.surface[400]};
  border-radius: ${theme.shape.borderRadius.md}px;
  background-color: ${({ isDragging, disabled, theme }) =>
    disabled ? theme.colors.surface[200] :
    isDragging ? theme.colors.primary[100] :
    theme.colors.surface[100]};
  transition: all ${theme.transitions.duration.short}ms ${theme.transitions.easing.easeInOut};
  cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
  opacity: ${({ disabled }) => disabled ? 0.6 : 1};
  
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.primary[500]};
    outline-offset: 2px;
  }
`;

const HiddenInput = styled.input`
  display: none;
`;

const ProgressIndicator = styled.div<{ progress: number }>`
  width: 100%;
  height: 4px;
  background-color: ${({ theme }) => theme.colors.surface[300]};
  border-radius: ${({ theme }) => theme.shape.borderRadius.full};
  margin-top: ${theme.spacing.SMALL}px;
  overflow: hidden;

  &::after {
    content: '';
    display: block;
    height: 100%;
    width: ${({ progress }) => progress}%;
    background-color: ${({ theme }) => theme.colors.primary[500]};
    transition: width 0.3s ease-in-out;
  }
`;

const ErrorMessage = styled.div`
  color: ${({ theme }) => theme.colors.error[500]};
  margin-top: ${theme.spacing.SMALL}px;
  font-size: ${({ theme }) => theme.typography.fontSizes.small};
`;

const PreviewContainer = styled.div`
  margin-top: ${theme.spacing.SMALL}px;
  max-width: 200px;
  max-height: 200px;
  overflow: hidden;
  border-radius: ${({ theme }) => theme.shape.borderRadius.sm}px;
`;

const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelect,
  onError,
  acceptedTypes = DOCUMENT_VALIDATION.allowedFileTypes,
  maxSize = DOCUMENT_VALIDATION.maxFileSize,
  disabled = false,
  multiple = false,
  ariaLabel = 'File upload dropzone',
  validateHIPAA = true,
  chunkSize = 1024 * 1024, // 1MB chunks
  allowRetry = true,
  showPreview = true,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<FileUploadError | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (filePreview) {
        URL.revokeObjectURL(filePreview);
      }
    };
  }, [filePreview]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const validateFile = useCallback((file: File): FileUploadError | null => {
    if (validateHIPAA) {
      const validationResult = validateDocument(file);
      if (!validationResult.isValid) {
        return {
          code: 'HIPAA_VALIDATION_ERROR',
          message: validationResult.errors[0] || 'HIPAA validation failed',
          details: { hipaaCompliant: false }
        };
      }
    }

    if (!acceptedTypes.includes(file.type)) {
      return {
        code: 'INVALID_TYPE',
        message: `File type ${file.type} is not supported. Allowed types: ${acceptedTypes.join(', ')}`,
      };
    }

    if (file.size > maxSize) {
      return {
        code: 'FILE_TOO_LARGE',
        message: `File size exceeds ${maxSize / 1024 / 1024}MB limit`,
      };
    }

    return null;
  }, [acceptedTypes, maxSize, validateHIPAA]);

  const handleFile = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      onError(validationError);
      return;
    }

    setError(null);
    setIsUploading(true);
    setUploadProgress(0);

    if (showPreview && file.type.startsWith('image/')) {
      const previewUrl = URL.createObjectURL(file);
      setFilePreview(previewUrl);
    }

    try {
      await onFileSelect(file, (progress: number) => {
        setUploadProgress(progress);
      });
    } catch (error) {
      const uploadError: FileUploadError = {
        code: 'UPLOAD_ERROR',
        message: error instanceof Error ? error.message : 'Upload failed',
      };
      setError(uploadError);
      onError(uploadError);
    } finally {
      setIsUploading(false);
    }
  }, [onFileSelect, onError, validateFile, showPreview]);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(event.dataTransfer.files);
    if (!multiple && files.length > 1) {
      const error: FileUploadError = {
        code: 'MULTIPLE_FILES',
        message: 'Only single file upload is allowed',
      };
      setError(error);
      onError(error);
      return;
    }

    files.forEach(handleFile);
  }, [disabled, multiple, handleFile, onError]);

  const handleClick = useCallback(() => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [disabled]);

  const handleFileInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    files.forEach(handleFile);
    // Reset input value to allow selecting the same file again
    event.target.value = '';
  }, [handleFile]);

  return (
    <UploadContainer
      ref={dropzoneRef}
      isDragging={isDragging}
      isError={!!error}
      disabled={disabled}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      aria-disabled={disabled}
      aria-invalid={!!error}
      aria-busy={isUploading}
      data-testid="file-upload-dropzone"
    >
      <HiddenInput
        ref={fileInputRef}
        type="file"
        accept={acceptedTypes.join(',')}
        multiple={multiple}
        disabled={disabled}
        onChange={handleFileInputChange}
        aria-hidden="true"
      />
      
      {isUploading ? (
        <div aria-live="polite">
          Uploading... {Math.round(uploadProgress)}%
          <ProgressIndicator progress={uploadProgress} />
        </div>
      ) : (
        <div>
          <p>Drag and drop files here or click to select</p>
          <p>Accepted formats: {acceptedTypes.join(', ')}</p>
          <p>Maximum size: {maxSize / 1024 / 1024}MB</p>
        </div>
      )}

      {error && (
        <ErrorMessage role="alert">
          {error.message}
          {allowRetry && (
            <button onClick={() => setError(null)} aria-label="Retry upload">
              Retry
            </button>
          )}
        </ErrorMessage>
      )}

      {showPreview && filePreview && (
        <PreviewContainer>
          <img src={filePreview} alt="File preview" />
        </PreviewContainer>
      )}
    </UploadContainer>
  );
};

export default FileUpload;