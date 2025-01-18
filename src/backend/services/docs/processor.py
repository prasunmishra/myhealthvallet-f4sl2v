"""
High-level service module for orchestrating document processing operations with HIPAA compliance,
PHI protection, and GPU acceleration.

Version: 1.0.0
"""

import logging
from typing import Dict, List, Optional, Tuple, Union
from PIL import Image
import numpy as np
from retry import retry
import phi_detector

from ml.document.ocr import OCREngine, process_document, enhance_text_quality, detect_medical_terms
from ml.document.classifier import DocumentClassificationPipeline, validate_classification
from ml.document.preprocessor import DocumentPreprocessor, validate_image_quality
from services.docs.storage import DocumentStorageService
from core.logging import setup_logging

# Configure logging
logger = setup_logging()

# Global constants
MIN_DOCUMENT_SIZE_BYTES = 1024
MAX_DOCUMENT_SIZE_BYTES = 10485760
SUPPORTED_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf", "image/tiff"]
MIN_OCR_CONFIDENCE = 0.85
MIN_CLASSIFICATION_CONFIDENCE = 0.90
MAX_PROCESSING_RETRIES = 3
PHI_DETECTION_THRESHOLD = 0.95
GPU_MEMORY_LIMIT = 4096

def audit_log(func):
    """Decorator for HIPAA-compliant audit logging."""
    def wrapper(*args, **kwargs):
        try:
            logger.info(f"Starting {func.__name__} with HIPAA compliance")
            result = func(*args, **kwargs)
            logger.info(f"Completed {func.__name__} successfully")
            return result
        except Exception as e:
            logger.error(f"Error in {func.__name__}: {str(e)}")
            raise
    return wrapper

@audit_log
def validate_document_input(document: Union[str, bytes, Image.Image], 
                          validation_options: Dict) -> Tuple[bool, str, Dict]:
    """Validate input document format, quality, and security requirements."""
    try:
        metrics = {}
        
        # Check document size
        doc_size = len(document) if isinstance(document, bytes) else 0
        if doc_size < MIN_DOCUMENT_SIZE_BYTES or doc_size > MAX_DOCUMENT_SIZE_BYTES:
            return False, "Document size outside acceptable range", metrics
            
        # Convert to PIL Image for validation if needed
        if isinstance(document, (str, bytes)):
            document = Image.open(document)
            
        # Validate image quality
        quality_check, quality_metrics, message = validate_image_quality(
            document,
            validation_options.get('quality_thresholds', {})
        )
        metrics.update(quality_metrics)
        
        if not quality_check:
            return False, message, metrics
            
        return True, "Document validation successful", metrics
        
    except Exception as e:
        logger.error(f"Document validation failed: {str(e)}")
        raise

class DocumentProcessor:
    """Main service class that orchestrates document processing operations with HIPAA compliance."""
    
    def __init__(self, config: Dict, gpu_config: Dict, security_config: Dict):
        """Initialize document processing components with security and GPU configuration."""
        try:
            # Initialize HIPAA-compliant logger
            self.logger = setup_logging()
            
            # Initialize processing components
            self.ocr_engine = OCREngine(
                config=config.get('ocr_config'),
                model_path=config.get('model_path'),
                use_gpu=gpu_config.get('use_gpu', True)
            )
            
            self.classifier = DocumentClassificationPipeline(
                config=config.get('classifier_config'),
                security_config=security_config
            )
            
            self.preprocessor = DocumentPreprocessor(
                config=config.get('preprocessor_config'),
                use_gpu=gpu_config.get('use_gpu', True)
            )
            
            self.storage_service = DocumentStorageService(
                config=config.get('storage_config'),
                security_config=security_config
            )
            
            # Initialize processing metrics
            self.processing_metrics = {
                'total_processed': 0,
                'successful_processing': 0,
                'failed_processing': 0,
                'average_processing_time': 0
            }
            
            # Store configurations
            self.gpu_config = gpu_config
            self.security_config = security_config
            
            logger.info("DocumentProcessor initialized successfully")
            
        except Exception as e:
            logger.error(f"DocumentProcessor initialization failed: {str(e)}")
            raise

    @audit_log
    @retry(max_attempts=MAX_PROCESSING_RETRIES)
    async def process_document(self, 
                             document: Union[str, bytes, Image.Image],
                             user_id: str,
                             processing_options: Dict) -> Dict:
        """Process document through the secure pipeline with PHI protection."""
        try:
            # Validate input document
            is_valid, message, validation_metrics = validate_document_input(
                document,
                processing_options
            )
            if not is_valid:
                raise ValueError(f"Document validation failed: {message}")
                
            # Preprocess document
            processed_image, preprocess_metrics = self.preprocessor.preprocess_image(
                document,
                preprocessing_params={'phi_protection': True}
            )
            
            # Perform OCR with GPU acceleration
            ocr_result = self.ocr_engine.process_document(
                processed_image,
                detect_phi=True
            )
            
            # Enhance text quality
            enhanced_text = self.ocr_engine.enhance_text_quality(
                ocr_result['text'],
                processing_options.get('document_type')
            )
            
            # Detect and protect PHI
            phi_result = phi_detector.detect_and_protect(
                enhanced_text,
                threshold=PHI_DETECTION_THRESHOLD
            )
            
            # Classify document
            classification_result = await self.classifier.classify_document(
                processed_image,
                {'user_id': user_id}
            )
            
            # Store processed document
            storage_result = await self.storage_service.upload_document(
                document_data=processed_image,
                user_id=user_id,
                document_type=classification_result['classification']['document_type'],
                metadata={
                    'ocr_confidence': ocr_result['confidence'],
                    'classification_confidence': classification_result['classification']['confidence'],
                    'phi_protected': phi_result['phi_protected']
                }
            )
            
            # Prepare processing results
            result = {
                'document_info': {
                    'user_id': user_id,
                    'document_type': classification_result['classification']['document_type'],
                    'storage_url': storage_result[1]
                },
                'processing_results': {
                    'ocr_text': phi_result['protected_text'],
                    'classification': classification_result['classification'],
                    'confidence_scores': {
                        'ocr': ocr_result['confidence'],
                        'classification': classification_result['classification']['confidence']
                    }
                },
                'security_status': {
                    'phi_protected': phi_result['phi_protected'],
                    'encryption_verified': storage_result[0],
                    'processing_timestamp': np.datetime64('now')
                },
                'metrics': {
                    **validation_metrics,
                    **preprocess_metrics,
                    'processing_time': np.datetime64('now')
                }
            }
            
            # Update processing metrics
            self._update_processing_metrics(True)
            
            return result
            
        except Exception as e:
            self._update_processing_metrics(False)
            logger.error(f"Document processing failed: {str(e)}")
            raise

    @audit_log
    def validate_processing_results(self, 
                                  processing_results: Dict,
                                  confidence_threshold: float) -> Tuple[bool, str, Dict]:
        """Validate document processing results with enhanced security checks."""
        try:
            validation_metrics = {}
            
            # Validate OCR confidence
            ocr_confidence = processing_results['processing_results']['confidence_scores']['ocr']
            if ocr_confidence < MIN_OCR_CONFIDENCE:
                return False, "OCR confidence below threshold", validation_metrics
                
            # Validate classification confidence
            class_confidence = processing_results['processing_results']['confidence_scores']['classification']
            if class_confidence < confidence_threshold:
                return False, "Classification confidence below threshold", validation_metrics
                
            # Verify PHI protection
            if not processing_results['security_status']['phi_protected']:
                return False, "PHI protection not verified", validation_metrics
                
            # Verify encryption
            if not processing_results['security_status']['encryption_verified']:
                return False, "Document encryption not verified", validation_metrics
                
            validation_metrics = {
                'ocr_confidence': ocr_confidence,
                'classification_confidence': class_confidence,
                'validation_timestamp': np.datetime64('now')
            }
            
            return True, "Validation successful", validation_metrics
            
        except Exception as e:
            logger.error(f"Result validation failed: {str(e)}")
            raise

    def get_processing_metrics(self, metric_type: str, filters: Dict) -> Dict:
        """Get detailed document processing performance metrics."""
        try:
            metrics = {
                'processing_stats': {
                    'total_processed': self.processing_metrics['total_processed'],
                    'success_rate': (self.processing_metrics['successful_processing'] / 
                                   max(self.processing_metrics['total_processed'], 1)),
                    'average_processing_time': self.processing_metrics['average_processing_time']
                },
                'quality_metrics': {
                    'ocr_accuracy': self.ocr_engine.get_accuracy_metrics(),
                    'classification_accuracy': self.classifier.get_accuracy_metrics()
                },
                'security_metrics': {
                    'phi_detection_rate': self.processing_metrics.get('phi_detection_rate', 0),
                    'encryption_success_rate': self.processing_metrics.get('encryption_success_rate', 0)
                }
            }
            
            return metrics
            
        except Exception as e:
            logger.error(f"Error retrieving processing metrics: {str(e)}")
            raise

    def _update_processing_metrics(self, success: bool):
        """Update internal processing metrics."""
        self.processing_metrics['total_processed'] += 1
        if success:
            self.processing_metrics['successful_processing'] += 1
        else:
            self.processing_metrics['failed_processing'] += 1