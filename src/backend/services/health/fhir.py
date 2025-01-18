"""
FHIR (Fast Healthcare Interoperability Resources) service module for PHRSAT.
Handles FHIR data conversion, validation, and integration with enhanced security and compliance.

Version: 1.0.0
"""

from datetime import datetime
import json
from typing import Dict, List, Optional, Tuple, Union

# fhirclient v4.0.0 - FHIR client library
import fhirclient.models.observation as fhir_observation
import fhirclient.models.documentreference as fhir_document
import fhirclient.models.patient as fhir_patient
from fhirclient import client

from api.health.models import HealthMetric, HealthRecord
from core.config import settings

# Global constants
FHIR_VERSION = "R4"
SUPPORTED_RESOURCES = ["Observation", "DiagnosticReport", "DocumentReference", "Immunization"]

class FHIRConverter:
    """
    Handles conversion between PHRSAT data models and FHIR resources with enhanced validation
    and error handling capabilities.
    """

    def __init__(self, fhir_config: Dict, custom_mappings: Optional[Dict] = None):
        """Initialize FHIR converter with configuration and validation setup."""
        self.fhir_config = fhir_config or {}
        self.resource_mappings = custom_mappings or {}
        self.validation_schemas = {}
        self.conversion_stats = {
            "total_conversions": 0,
            "successful_conversions": 0,
            "failed_conversions": 0,
            "last_conversion": None
        }
        self.error_handlers = {}

        # Initialize FHIR client settings
        self.smart = client.FHIRClient(settings={
            'app_id': fhir_config.get('app_id', 'phrsat'),
            'api_base': fhir_config.get('api_base', 'https://api.example.com/fhir'),
            'version': FHIR_VERSION
        })

        # Load validation schemas for supported resources
        for resource_type in SUPPORTED_RESOURCES:
            self.validation_schemas[resource_type] = self._load_validation_schema(resource_type)

    def metric_to_fhir(self, metric: HealthMetric, validate_output: Optional[bool] = True) -> Dict:
        """Convert HealthMetric to FHIR Observation with enhanced validation."""
        try:
            # Validate metric type
            if not metric.validate_metric_type(metric.metric_type):
                raise ValueError(f"Invalid metric type: {metric.metric_type}")

            # Create FHIR Observation
            observation = fhir_observation.Observation()
            
            # Set required fields
            observation.status = "final"
            observation.code = {
                "coding": [{
                    "system": metric.coding_system,
                    "code": metric.coding_code,
                    "display": metric.metric_type
                }]
            }
            
            # Set value with proper unit
            observation.valueQuantity = {
                "value": metric.value,
                "unit": metric.unit,
                "system": "http://unitsofmeasure.org",
                "code": metric.unit
            }
            
            # Set timing and subject
            observation.effectiveDateTime = metric.recorded_at.isoformat()
            observation.subject = {"reference": f"Patient/{metric.user_id}"}
            
            # Add device information if available
            if metric.source:
                observation.device = {"display": metric.source}
            
            # Add metadata
            observation.meta = {
                "versionId": "1",
                "lastUpdated": datetime.utcnow().isoformat(),
                "source": "PHRSAT"
            }

            # Validate output if requested
            if validate_output:
                validation_result, errors = self.validate_fhir(
                    observation.as_json(),
                    "Observation",
                    True
                )
                if not validation_result:
                    raise ValueError(f"FHIR validation failed: {errors}")

            # Update conversion statistics
            self.conversion_stats["total_conversions"] += 1
            self.conversion_stats["successful_conversions"] += 1
            self.conversion_stats["last_conversion"] = datetime.utcnow().isoformat()

            return observation.as_json()

        except Exception as e:
            self.conversion_stats["failed_conversions"] += 1
            raise RuntimeError(f"FHIR conversion failed: {str(e)}") from e

    def bulk_convert_metrics(self, metrics: List[HealthMetric], 
                           parallel_processing: Optional[bool] = False) -> List[Dict]:
        """Efficiently convert multiple health metrics to FHIR format."""
        results = []
        errors = []

        for metric in metrics:
            try:
                fhir_resource = self.metric_to_fhir(metric, validate_output=True)
                results.append(fhir_resource)
            except Exception as e:
                errors.append({
                    "metric_id": str(metric.id),
                    "error": str(e)
                })

        if errors:
            raise RuntimeError(f"Bulk conversion partially failed: {json.dumps(errors)}")

        return results

    def validate_fhir(self, fhir_resource: Dict, resource_type: Optional[str] = None,
                     strict_mode: Optional[bool] = False) -> Tuple[bool, List[str]]:
        """Enhanced FHIR resource validation with detailed error reporting."""
        errors = []

        try:
            # Determine resource type if not provided
            if not resource_type:
                resource_type = fhir_resource.get("resourceType")
                if not resource_type:
                    raise ValueError("Resource type not specified")

            # Check if resource type is supported
            if resource_type not in SUPPORTED_RESOURCES:
                raise ValueError(f"Unsupported resource type: {resource_type}")

            # Load appropriate validation schema
            schema = self.validation_schemas.get(resource_type)
            if not schema:
                raise ValueError(f"Validation schema not found for {resource_type}")

            # Validate required fields
            required_fields = schema.get("required_fields", [])
            for field in required_fields:
                if field not in fhir_resource:
                    errors.append(f"Missing required field: {field}")

            # Validate field types and formats
            for field, value in fhir_resource.items():
                field_schema = schema.get("fields", {}).get(field)
                if field_schema:
                    if not self._validate_field(value, field_schema):
                        errors.append(f"Invalid value for field: {field}")

            # Additional validation in strict mode
            if strict_mode:
                # Validate business rules
                if not self._validate_business_rules(fhir_resource, resource_type):
                    errors.append("Business rule validation failed")

                # Validate terminology bindings
                if not self._validate_terminology(fhir_resource, resource_type):
                    errors.append("Terminology validation failed")

            return len(errors) == 0, errors

        except Exception as e:
            return False, [f"Validation error: {str(e)}"]

    def _load_validation_schema(self, resource_type: str) -> Dict:
        """Load and parse FHIR validation schema for a resource type."""
        # Implementation would load actual FHIR schemas
        # This is a simplified version
        return {
            "required_fields": ["resourceType", "status", "code"],
            "fields": {
                "resourceType": {"type": "string", "allowed": SUPPORTED_RESOURCES},
                "status": {"type": "string", "allowed": ["preliminary", "final", "amended", "corrected"]},
                "code": {"type": "object", "required": ["coding"]},
                "valueQuantity": {"type": "object", "required": ["value", "unit"]}
            }
        }

    def _validate_field(self, value: Any, schema: Dict) -> bool:
        """Validate a field value against its schema."""
        try:
            if schema.get("type") == "string" and isinstance(value, str):
                if "allowed" in schema and value not in schema["allowed"]:
                    return False
            elif schema.get("type") == "object" and isinstance(value, dict):
                if "required" in schema:
                    return all(req in value for req in schema["required"])
            return True
        except Exception:
            return False

    def _validate_business_rules(self, resource: Dict, resource_type: str) -> bool:
        """Validate business rules for FHIR resources."""
        try:
            if resource_type == "Observation":
                # Validate observation rules
                if "valueQuantity" in resource:
                    value = resource["valueQuantity"].get("value")
                    if not isinstance(value, (int, float)):
                        return False
            return True
        except Exception:
            return False

    def _validate_terminology(self, resource: Dict, resource_type: str) -> bool:
        """Validate terminology bindings in FHIR resources."""
        try:
            if "code" in resource and "coding" in resource["code"]:
                for coding in resource["code"]["coding"]:
                    if not all(key in coding for key in ["system", "code"]):
                        return False
            return True
        except Exception:
            return False

def create_fhir_converter(custom_config: Optional[Dict] = None,
                         force_new: Optional[bool] = False) -> FHIRConverter:
    """Enhanced factory function to create and configure FHIRConverter instance."""
    base_config = {
        "app_id": "phrsat",
        "api_base": "https://api.example.com/fhir",
        "version": FHIR_VERSION,
        "timeout": 30,
        "verify_ssl": True
    }

    if custom_config:
        base_config.update(custom_config)

    return FHIRConverter(base_config)