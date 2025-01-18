"""
Main entry point for the HIPAA-compliant document processing module.
Provides unified interface for medical document classification, OCR processing,
and information extraction with enhanced security and PHI protection.

Version: 1.0.0
"""

import logging
from typing import Dict, List, Optional, Union
from PIL import Image

from ml.document.classifier import DocumentClassificationPipeline
from ml.document.preprocessor import DocumentPreprocessor
from ml.document.ocr import OCREngine
from ml.document.extractor import DocumentExtractor

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
SUPPORTED_DOCUMENT_TYPES = [
    "lab_report", "prescription", "radiology", "clinical_notes",
    "insurance", "vaccination", "medical_history", "referral",
    "discharge_summary", "pathology_report"
]

MIN_CONFIDENCE_THRESHOLD = 0.95
VERSION = "1.0.0"
PHI_DETECTION_THRESHOLD = 0.98
MAX_GPU_MEMORY_USAGE = 0.75
AUDIT_LOG_RETENTION_DAYS = 365

class DocumentProcessor:
    """
    Unified interface for HIPAA-compliant document processing operations.
    Integrates classification, OCR, and information extraction with enhanced security.
    """

    def __init__(self, config: Optional[Dict] = None):
        """
        Initialize document processor with comprehensive configuration.

        Args:
            config: Configuration dictionary for processor components
        """
        self.config = config or {}
        
        # Initialize core components with security configuration
        self.classifier = DocumentClassificationPipeline(
            config=self.config.get('classifier_config'),
            security_config=self.config.get('security_config')
        )
        
        self.preprocessor = DocumentPreprocessor(
            config=self.config.get('preprocessor_config'),
            use_gpu=True,
            quality_thresholds=self.config.get('quality_thresholds')
        )
        
        self.ocr_engine = OCREngine(
            config=self.config.get('ocr_config'),
            use_gpu=True
        )
        
        self.extractor = DocumentExtractor(
            config=self.config.get('extractor_config')
        )
        
        logger.info("Document processor initialized with HIPAA compliance")

    def process_document(
        self,
        document: Union[str, bytes, Image.Image],
        security_context: Dict
    ) -> Dict:
        """
        Process medical document through comprehensive HIPAA-compliant pipeline.

        Args:
            document: Input document (file path, bytes, or PIL Image)
            security_context: Security context for the operation

        Returns:
            Dict containing processing results with security metadata
        """
        try:
            # Preprocess document
            preprocessed_doc, preprocess_metrics = self.preprocessor.preprocess_image(
                document,
                preprocessing_params={'phi_protection': True}
            )

            # Classify document
            classification_result = self.classifier.classify_document(
                preprocessed_doc,
                security_context=security_context
            )

            # Perform OCR with PHI detection
            ocr_result = self.ocr_engine.process_document(
                preprocessed_doc,
                document_type=classification_result['classification']['document_type'],
                detect_phi=True
            )

            # Extract document information
            extraction_result = self.extractor.extract_document_info(
                document=preprocessed_doc,
                document_type=classification_result['classification']['document_type']
            )

            # Combine results with security metadata
            result = {
                'classification': classification_result['classification'],
                'ocr_result': {
                    'text': ocr_result['text'],
                    'confidence': ocr_result['confidence'],
                    'phi_protected': ocr_result['phi_protected']
                },
                'extracted_info': extraction_result['structured_info'],
                'medical_entities': extraction_result['medical_entities'],
                'quality_metrics': {
                    **preprocess_metrics,
                    **classification_result.get('quality_metrics', {}),
                    **ocr_result.get('quality_metrics', {})
                },
                'security_metadata': {
                    'phi_protected': all([
                        classification_result['security_metadata']['phi_protected'],
                        ocr_result['phi_protected'],
                        extraction_result['metadata']['phi_protected']
                    ]),
                    'confidence_verified': all([
                        classification_result['classification']['confidence'] >= MIN_CONFIDENCE_THRESHOLD,
                        ocr_result['confidence'] >= MIN_CONFIDENCE_THRESHOLD,
                        extraction_result['confidence_scores']['extraction_confidence'] >= MIN_CONFIDENCE_THRESHOLD
                    ]),
                    'processing_timestamp': extraction_result['metadata']['processing_timestamp']
                }
            }

            logger.info("Document processing completed successfully")
            return result

        except Exception as e:
            logger.error(f"Document processing failed: {str(e)}")
            raise

    def validate_document_quality(
        self,
        document: Union[str, bytes, Image.Image]
    ) -> Dict:
        """
        Validate document quality against defined thresholds.

        Args:
            document: Input document to validate

        Returns:
            Dict containing quality validation results
        """
        try:
            # Perform quality validation
            quality_check, metrics, message = self.preprocessor.validate_image_quality(
                document,
                self.preprocessor.quality_thresholds
            )

            return {
                'is_valid': quality_check,
                'message': message,
                'metrics': metrics
            }

        except Exception as e:
            logger.error(f"Document quality validation failed: {str(e)}")
            raise

# Export components
__all__ = [
    'DocumentProcessor',
    'DocumentClassificationPipeline',
    'DocumentPreprocessor',
    'OCREngine',
    'DocumentExtractor',
    'SUPPORTED_DOCUMENT_TYPES',
    'MIN_CONFIDENCE_THRESHOLD',
    'VERSION'
]