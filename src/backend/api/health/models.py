"""
Health data models module for Personal Health Record Store and Analysis Tool (PHRSAT).
Implements FHIR R4 compliant MongoDB document models for health metrics, records,
and platform synchronization with enhanced security and validation.

Version: 1.0.0
"""

from datetime import datetime, timezone
import json
from typing import Dict, List, Optional, Union

from mongoengine import fields  # mongoengine v0.24+
from fhir.resources import construct_fhir_element  # fhir.resources v6.0+
from fhir.resources.observation import Observation
from fhir.resources.documentreference import DocumentReference
from cryptography.fernet import Fernet  # cryptography v3.4+

from core.db.base import BaseDocument
from core.constants import HealthDataFormat, HealthMetricType, DocumentStatus

# Global constants for FHIR compliance
ALLOWED_METRIC_TYPES = [
    "heart_rate", "blood_pressure", "blood_glucose", "weight", 
    "height", "steps", "sleep", "oxygen_saturation"
]

ALLOWED_RECORD_TYPES = [
    "lab_report", "prescription", "imaging", "clinical_notes", "vaccination"
]

SUPPORTED_PLATFORMS = ["apple_health", "google_fit", "fitbit"]
FHIR_VERSION = "R4"
RETRY_STRATEGY = {"max_attempts": 5, "base_delay": 30, "max_delay": 3600}

class HealthMetric(BaseDocument):
    """FHIR R4 compliant health metric document model with encryption support."""
    
    # Core fields
    user_id = fields.StringField(required=True)
    metric_type = fields.StringField(required=True, choices=ALLOWED_METRIC_TYPES)
    value = fields.FloatField(required=True)
    unit = fields.StringField(required=True)
    recorded_at = fields.DateTimeField(required=True)
    source = fields.StringField()
    raw_data = fields.DictField()
    tags = fields.ListField(fields.StringField())
    
    # FHIR-specific fields
    metadata = fields.DictField(default=dict)
    fhir_mapping = fields.DictField(required=True)
    coding_system = fields.StringField(required=True)
    coding_code = fields.StringField(required=True)
    value_quantity = fields.DictField(required=True)

    meta = {
        'collection': 'health_metrics',
        'indexes': [
            'user_id',
            'metric_type',
            ('user_id', 'metric_type'),
            ('user_id', 'recorded_at'),
            {'fields': ['recorded_at'], 'expireAfterSeconds': 7776000}  # 90 days
        ],
        'ordering': ['-recorded_at']
    }

    def __init__(self, **kwargs):
        """Initialize FHIR-compliant health metric document."""
        super().__init__(**kwargs)
        
        # Set default values
        if not self.recorded_at:
            self.recorded_at = datetime.now(timezone.utc)
            
        # Initialize FHIR mapping
        self.fhir_mapping = {
            "resourceType": "Observation",
            "status": "final",
            "category": [{
                "coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                    "code": "vital-signs"
                }]
            }]
        }
        
        # Initialize value quantity structure
        self.value_quantity = {
            "value": self.value,
            "unit": self.unit,
            "system": "http://unitsofmeasure.org"
        }

        # Configure encryption
        self.encrypted_fields.extend(['value', 'raw_data'])

    def validate_metric_type(self, metric_type: str) -> bool:
        """Validate metric type against allowed types and FHIR compliance."""
        if metric_type not in ALLOWED_METRIC_TYPES:
            return False
            
        try:
            # Validate FHIR coding
            coding = {
                "system": self.coding_system,
                "code": self.coding_code,
                "display": metric_type
            }
            construct_fhir_element('Coding', coding)
            return True
        except Exception as e:
            return False

    def to_fhir(self) -> Dict:
        """Convert metric to FHIR Observation resource."""
        observation = Observation(
            status="final",
            code={
                "coding": [{
                    "system": self.coding_system,
                    "code": self.coding_code,
                    "display": self.metric_type
                }]
            },
            valueQuantity=self.value_quantity,
            effectiveDateTime=self.recorded_at.isoformat(),
            subject={"reference": f"Patient/{self.user_id}"},
            device={"display": self.source} if self.source else None
        )
        
        return observation.dict()

class HealthRecord(BaseDocument):
    """FHIR R4 compliant health record document model with versioning."""
    
    # Core fields
    user_id = fields.StringField(required=True)
    record_type = fields.StringField(required=True, choices=ALLOWED_RECORD_TYPES)
    title = fields.StringField(required=True)
    description = fields.StringField()
    storage_url = fields.StringField(required=True)
    tags = fields.ListField(fields.StringField())
    record_date = fields.DateTimeField(required=True)
    
    # FHIR and security fields
    metadata = fields.DictField(default=dict)
    fhir_document_reference = fields.DictField(required=True)
    signature = fields.DictField()
    version = fields.IntField(default=1)
    previous_versions = fields.ListField(fields.DictField())

    meta = {
        'collection': 'health_records',
        'indexes': [
            'user_id',
            'record_type',
            ('user_id', 'record_type'),
            ('user_id', 'record_date'),
            'storage_url'
        ]
    }

    def __init__(self, **kwargs):
        """Initialize FHIR-compliant health record document."""
        super().__init__(**kwargs)
        
        # Set default values
        if not self.record_date:
            self.record_date = datetime.now(timezone.utc)
            
        # Initialize FHIR document reference
        self.fhir_document_reference = {
            "resourceType": "DocumentReference",
            "status": "current",
            "docStatus": "final",
            "type": {
                "coding": [{
                    "system": "http://loinc.org",
                    "code": "34133-9",
                    "display": "Summary of episode note"
                }]
            }
        }

        # Configure encryption
        self.encrypted_fields.extend(['description', 'storage_url'])

    def validate_record_type(self, record_type: str) -> bool:
        """Validate record type against allowed types and FHIR compliance."""
        if record_type not in ALLOWED_RECORD_TYPES:
            return False
            
        try:
            # Validate FHIR document type
            doc_ref = {
                "resourceType": "DocumentReference",
                "type": {
                    "coding": [{
                        "system": "http://loinc.org",
                        "code": "34133-9",
                        "display": record_type
                    }]
                }
            }
            construct_fhir_element('DocumentReference', doc_ref)
            return True
        except Exception as e:
            return False

    def to_fhir(self) -> Dict:
        """Convert record to FHIR DocumentReference resource."""
        doc_reference = DocumentReference(
            status="current",
            docStatus="final",
            type={
                "coding": [{
                    "system": "http://loinc.org",
                    "code": "34133-9",
                    "display": self.record_type
                }]
            },
            subject={"reference": f"Patient/{self.user_id}"},
            date=self.record_date.isoformat(),
            content=[{
                "attachment": {
                    "url": self.storage_url,
                    "title": self.title
                }
            }]
        )
        
        return doc_reference.dict()

class HealthPlatformSync(BaseDocument):
    """Health platform synchronization status model with enhanced error handling."""
    
    # Core fields
    user_id = fields.StringField(required=True)
    platform = fields.StringField(required=True, choices=SUPPORTED_PLATFORMS)
    status = fields.StringField(default=DocumentStatus.PENDING.value)
    last_sync_at = fields.DateTimeField()
    sync_attempts = fields.IntField(default=0)
    
    # Sync metadata and error tracking
    sync_metadata = fields.DictField(default=dict)
    error_details = fields.DictField(default=dict)
    retry_strategy = fields.DictField(default=RETRY_STRATEGY)
    partial_sync_status = fields.DictField(default=dict)
    sync_history = fields.ListField(fields.DictField())

    meta = {
        'collection': 'health_platform_syncs',
        'indexes': [
            'user_id',
            'platform',
            ('user_id', 'platform'),
            'last_sync_at'
        ]
    }

    def __init__(self, **kwargs):
        """Initialize health platform sync document with retry mechanism."""
        super().__init__(**kwargs)
        
        # Initialize sync metadata
        self.sync_metadata.setdefault('version', '1.0.0')
        self.sync_metadata.setdefault('sync_type', 'full')
        
        # Initialize retry strategy
        self.retry_strategy = RETRY_STRATEGY.copy()
        
        # Initialize sync history
        if not self.sync_history:
            self.sync_history = []

    def update_sync_status(self, status: str, metadata: Dict = None, 
                         error_info: Dict = None) -> bool:
        """Update synchronization status with enhanced error tracking."""
        try:
            current_time = datetime.now(timezone.utc)
            
            # Update status and metadata
            self.status = status
            self.last_sync_at = current_time
            
            if metadata:
                self.sync_metadata.update(metadata)
            
            # Handle errors and retry strategy
            if error_info:
                self.error_details = error_info
                self.sync_attempts += 1
                
                if self.sync_attempts >= self.retry_strategy['max_attempts']:
                    self.status = DocumentStatus.FAILED.value
            
            # Update sync history
            self.sync_history.append({
                'status': status,
                'timestamp': current_time.isoformat(),
                'metadata': metadata,
                'error_info': error_info
            })
            
            self.save()
            return True
            
        except Exception as e:
            return False