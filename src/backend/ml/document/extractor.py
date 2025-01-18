"""
Advanced document information extraction module for medical document processing.
Implements HIPAA-compliant text analysis, medical entity recognition, and validation
with comprehensive error handling and monitoring.

Version: 1.0.0
"""

import logging
import re
from typing import Dict, List, Optional, Tuple, Union
from pathlib import Path

import numpy as np  # v1.23+
import pandas as pd  # v2.0+
import spacy  # v3.6+
from PIL import Image

from ml.document.ocr import OCREngine
from ml.document.preprocessor import DocumentPreprocessor
from ml.utils.data import clean_data

# Configure logging
logger = logging.getLogger(__name__)

# Global constants
SUPPORTED_DOCUMENT_TYPES = ["lab_report", "prescription", "medical_record", "radiology_report"]
REQUIRED_FIELDS = {
    "lab_report": ["patient_id", "test_date", "test_type", "results"],
    "prescription": ["patient_id", "medication", "dosage", "prescriber"],
    "medical_record": ["patient_id", "date", "provider", "notes"],
    "radiology_report": ["patient_id", "study_date", "modality", "findings"]
}
MIN_CONFIDENCE_THRESHOLD = 0.90
MAX_FIELD_LENGTH = 1000

class DocumentExtractor:
    """HIPAA-compliant document information extractor with medical entity recognition."""

    def __init__(self, config: Dict = None):
        """Initialize document extractor with HIPAA-compliant configuration."""
        self.config = config or {}
        
        # Initialize OCR engine with GPU acceleration
        self.ocr_engine = OCREngine(
            config=self.config.get('ocr_config'),
            use_gpu=True
        )
        
        # Initialize document preprocessor
        self.preprocessor = DocumentPreprocessor(
            config=self.config.get('preprocessor_config'),
            use_gpu=True
        )
        
        # Load medical NLP model
        try:
            self.nlp_model = spacy.load("en_core_sci_md")  # Medical-specific model
        except OSError:
            logger.warning("Medical model not found, downloading...")
            spacy.cli.download("en_core_sci_md")
            self.nlp_model = spacy.load("en_core_sci_md")
        
        # Load extraction patterns and medical terminology
        self._load_extraction_patterns()
        self._load_medical_terminology()
        
        # Configure validation rules
        self.validation_rules = {
            "min_confidence": MIN_CONFIDENCE_THRESHOLD,
            "max_length": MAX_FIELD_LENGTH,
            "required_fields": REQUIRED_FIELDS
        }
        
        logger.info("DocumentExtractor initialized successfully")

    def _load_extraction_patterns(self):
        """Load document-type specific extraction patterns."""
        self.extraction_patterns = {
            "lab_report": {
                "test_type": r"Test(?:s)?\s*:\s*([^\n]+)",
                "results": r"Result(?:s)?\s*:\s*([^\n]+)",
                "reference_range": r"Reference Range\s*:\s*([^\n]+)"
            },
            "prescription": {
                "medication": r"Medication\s*:\s*([^\n]+)",
                "dosage": r"Dosage\s*:\s*([^\n]+)",
                "frequency": r"Frequency\s*:\s*([^\n]+)"
            }
        }

    def _load_medical_terminology(self):
        """Load medical terminology and abbreviations."""
        self.medical_terminology = {
            "medications": set(),  # Would load from medical terminology service
            "conditions": set(),
            "procedures": set(),
            "lab_tests": set()
        }

    def extract_document_info(self, 
                            document: Union[str, bytes, Image.Image],
                            document_type: str) -> Dict:
        """Extract and validate structured information from medical documents."""
        try:
            # Validate document type
            if document_type not in SUPPORTED_DOCUMENT_TYPES:
                raise ValueError(f"Unsupported document type: {document_type}")
            
            # Process document through OCR
            ocr_result = self.ocr_engine.process_document(
                document=document,
                document_type=document_type,
                detect_phi=True
            )
            
            # Extract medical entities
            entities = self.extract_medical_entities(ocr_result['text'])
            
            # Extract structured information based on document type
            extracted_info = self._extract_structured_info(
                ocr_result['text'],
                document_type
            )
            
            # Combine extracted information
            result = {
                "document_type": document_type,
                "extracted_text": ocr_result['text'],
                "structured_info": extracted_info,
                "medical_entities": entities,
                "confidence_scores": {
                    "ocr_confidence": ocr_result['confidence'],
                    "extraction_confidence": self._calculate_extraction_confidence(extracted_info),
                    "entity_confidence": self._calculate_entity_confidence(entities)
                },
                "metadata": {
                    "phi_protected": ocr_result['phi_protected'],
                    "processing_timestamp": pd.Timestamp.now(tz='UTC').isoformat()
                }
            }
            
            # Validate extracted information
            is_valid, validation_message, validation_details = validate_extracted_info(
                result['structured_info'],
                document_type
            )
            
            if not is_valid:
                logger.warning(f"Validation failed: {validation_message}")
                result['validation_status'] = {
                    "is_valid": False,
                    "message": validation_message,
                    "details": validation_details
                }
            else:
                result['validation_status'] = {
                    "is_valid": True,
                    "message": "Validation successful"
                }
            
            return result
            
        except Exception as e:
            logger.error(f"Document extraction failed: {str(e)}")
            raise

    def extract_medical_entities(self, text: str) -> Dict:
        """Extract and categorize medical entities with validation."""
        try:
            # Preprocess text
            cleaned_text = clean_data(text, {'remove_noise': True})
            
            # Process text with medical NLP model
            doc = self.nlp_model(cleaned_text)
            
            # Extract entities by category
            entities = {
                "medications": [],
                "conditions": [],
                "procedures": [],
                "lab_tests": [],
                "measurements": [],
                "dates": []
            }
            
            for ent in doc.ents:
                confidence = self._calculate_entity_confidence({ent.text: ent.label_})
                entity_info = {
                    "text": ent.text,
                    "label": ent.label_,
                    "confidence": confidence,
                    "start": ent.start_char,
                    "end": ent.end_char
                }
                
                # Categorize entity
                if ent.label_ in ["MEDICATION", "DRUG"]:
                    entities["medications"].append(entity_info)
                elif ent.label_ in ["CONDITION", "DISEASE"]:
                    entities["conditions"].append(entity_info)
                elif ent.label_ in ["PROCEDURE"]:
                    entities["procedures"].append(entity_info)
                elif ent.label_ in ["TEST"]:
                    entities["lab_tests"].append(entity_info)
                elif ent.label_ in ["MEASUREMENT"]:
                    entities["measurements"].append(entity_info)
                elif ent.label_ in ["DATE"]:
                    entities["dates"].append(entity_info)
            
            return entities
            
        except Exception as e:
            logger.error(f"Medical entity extraction failed: {str(e)}")
            raise

    def _extract_structured_info(self, text: str, document_type: str) -> Dict:
        """Extract structured information based on document type patterns."""
        structured_info = {}
        patterns = self.extraction_patterns.get(document_type, {})
        
        for field, pattern in patterns.items():
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                structured_info[field] = matches[0].strip()
        
        return structured_info

    def _calculate_extraction_confidence(self, extracted_info: Dict) -> float:
        """Calculate confidence score for extracted information."""
        if not extracted_info:
            return 0.0
        
        field_scores = []
        for field, value in extracted_info.items():
            # Calculate field-specific confidence
            if isinstance(value, str) and value.strip():
                # Check against medical terminology
                if field in ["medication", "test_type"] and value in self.medical_terminology[field+"s"]:
                    field_scores.append(1.0)
                else:
                    field_scores.append(0.8)
            else:
                field_scores.append(0.0)
        
        return np.mean(field_scores) if field_scores else 0.0

    def _calculate_entity_confidence(self, entities: Dict) -> float:
        """Calculate confidence score for extracted entities."""
        if not entities:
            return 0.0
        
        confidence_scores = []
        for category, items in entities.items():
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, dict) and "confidence" in item:
                        confidence_scores.append(item["confidence"])
        
        return np.mean(confidence_scores) if confidence_scores else 0.0

def validate_extracted_info(extracted_info: Dict, document_type: str) -> Tuple[bool, str, Dict]:
    """Comprehensive validation of extracted information with HIPAA compliance."""
    try:
        validation_details = {
            "missing_fields": [],
            "invalid_fields": [],
            "warnings": []
        }
        
        # Check required fields
        required_fields = REQUIRED_FIELDS.get(document_type, [])
        for field in required_fields:
            if field not in extracted_info or not extracted_info[field]:
                validation_details["missing_fields"].append(field)
        
        # Validate field lengths
        for field, value in extracted_info.items():
            if isinstance(value, str) and len(value) > MAX_FIELD_LENGTH:
                validation_details["invalid_fields"].append(
                    f"{field}: Exceeds maximum length"
                )
        
        # Check for potential PHI leakage
        phi_patterns = {
            "ssn": r"\d{3}-\d{2}-\d{4}",
            "phone": r"\d{3}[-.]?\d{3}[-.]?\d{4}",
            "email": r"[^@]+@[^@]+\.[^@]+"
        }
        
        for field, value in extracted_info.items():
            if isinstance(value, str):
                for phi_type, pattern in phi_patterns.items():
                    if re.search(pattern, value):
                        validation_details["warnings"].append(
                            f"Potential {phi_type} found in {field}"
                        )
        
        # Determine validation result
        is_valid = (
            len(validation_details["missing_fields"]) == 0 and
            len(validation_details["invalid_fields"]) == 0
        )
        
        message = "Validation successful" if is_valid else "Validation failed"
        
        return is_valid, message, validation_details
        
    except Exception as e:
        logger.error(f"Validation failed: {str(e)}")
        raise