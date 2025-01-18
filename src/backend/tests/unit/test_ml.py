"""
Unit tests for machine learning models including document classification and health prediction components.
Implements comprehensive testing with security validation, HIPAA compliance verification, and model accuracy testing.

Version: 1.0.0
"""

import pytest  # pytest v7.4+
import numpy as np  # numpy v1.23+
import pandas as pd  # pandas v2.0+
from datetime import datetime, timedelta

from ml.models.document_classifier import DocumentClassifier
from ml.models.health_predictor import LSTMHealthPredictor, RandomForestHealthPredictor

# Test configuration constants
TEST_MODEL_CONFIG = {
    "input_shape": [224, 224, 3],
    "num_classes": 6,
    "learning_rate": 0.001,
    "security_level": "hipaa_compliant"
}

TEST_DOCUMENT_CATEGORIES = [
    "lab_report", "prescription", "radiology", 
    "clinical_notes", "genetic_test", "medical_history"
]

TEST_SEQUENCE_LENGTH = 24
ACCURACY_THRESHOLD = 0.95
SECURITY_CONFIG = {
    "encryption_type": "AES-256-GCM",
    "audit_logging": True,
    "hipaa_validation": True
}

def setup_module():
    """Set up secure test module configuration."""
    np.random.seed(42)  # Ensure reproducibility
    
    # Configure secure test environment
    global security_config
    security_config = SECURITY_CONFIG.copy()
    security_config.update({
        "phi_detection": True,
        "audit_level": "detailed"
    })

def teardown_module():
    """Secure cleanup of test module resources."""
    # Clear sensitive test data
    global security_config
    security_config = None

class TestDocumentClassifier:
    """Enhanced test suite for document classification model with security and compliance validation."""

    def setup_method(self):
        """Set up secure test environment for document classifier."""
        self.classifier = DocumentClassifier(
            model_config=TEST_MODEL_CONFIG,
            security_config=security_config
        )
        
        # Prepare test data with PHI protection
        self.test_data = {
            "images": np.random.rand(10, 224, 224, 3),
            "labels": np.random.randint(0, len(TEST_DOCUMENT_CATEGORIES), 10)
        }
        
        # Initialize compliance metrics
        self.compliance_metrics = {
            "phi_protected": True,
            "encryption_verified": True,
            "audit_enabled": True
        }

    def test_model_initialization(self):
        """Test secure model initialization and configuration."""
        # Verify secure model architecture
        assert self.classifier.model is not None
        assert self.classifier.model.count_params() > 0
        
        # Validate security configuration
        assert self.classifier.security_config["encryption_type"] == "AES-256-GCM"
        assert self.classifier.security_config["hipaa_validation"] is True
        
        # Verify HIPAA compliance settings
        assert hasattr(self.classifier, "validate_hipaa_compliance")
        assert self.classifier.security_manager is not None

    def test_document_classification(self):
        """Test document classification with enhanced security validation."""
        # Prepare test batch
        X_test = self.test_data["images"][:5]
        y_test = self.test_data["labels"][:5]
        
        # Train model with security validation
        train_result = self.classifier.train(
            X_train=self.test_data["images"][5:],
            y_train=self.test_data["labels"][5:],
            X_val=X_test,
            y_val=y_test
        )
        
        # Verify training metrics
        assert "metrics" in train_result
        assert "security_audit" in train_result
        assert train_result["security_audit"]["phi_protected"] is True
        
        # Test prediction with security checks
        test_image = X_test[0:1]
        prediction = self.classifier.predict(test_image)
        
        # Validate prediction structure and security
        assert "class" in prediction
        assert "confidence" in prediction
        assert "security_metadata" in prediction
        assert prediction["security_metadata"]["phi_protected"] is True
        
        # Verify prediction confidence
        assert prediction["confidence"] > 0.0
        assert "confidence_verified" in prediction["security_metadata"]
        
        # Evaluate model performance
        eval_result = self.classifier.evaluate(X_test, y_test)
        
        # Verify accuracy meets threshold
        assert eval_result["metrics"]["accuracy"] >= ACCURACY_THRESHOLD
        assert eval_result["security_audit"]["phi_protected"] is True

class TestHealthPredictor:
    """Enhanced test suite for health prediction models with medical accuracy validation."""

    def setup_method(self):
        """Set up test environment for health predictors with medical validation."""
        # Initialize predictors
        self.lstm_predictor = LSTMHealthPredictor(
            model_config={"sequence_length": TEST_SEQUENCE_LENGTH},
            architecture_config={"layers": [64, 32]}
        )
        
        self.rf_predictor = RandomForestHealthPredictor(
            model_config={"n_estimators": 100},
            feature_config={"feature_selection": True}
        )
        
        # Generate test time series data
        timestamps = pd.date_range(
            start=datetime.now() - timedelta(days=30),
            end=datetime.now(),
            freq='H'
        )
        
        self.test_data = pd.DataFrame({
            "timestamp": timestamps,
            "heart_rate": np.random.normal(75, 10, len(timestamps)),
            "steps": np.random.poisson(1000, len(timestamps))
        })
        
        # Initialize medical validation metrics
        self.medical_validation_metrics = {
            "terminology_validated": True,
            "value_ranges_verified": True
        }

    def test_lstm_prediction(self):
        """Test LSTM time-series prediction with medical validation."""
        # Prepare sequences
        X, y = self.lstm_predictor.preprocessor.prepare_sequences(
            self.test_data,
            sequence_length=TEST_SEQUENCE_LENGTH
        )[0:2]
        
        # Build and train LSTM model
        self.lstm_predictor.build_model(
            input_dim=X.shape[-1],
            output_dim=1,
            architecture_config={"dropout": 0.2}
        )
        
        # Train model with validation
        train_result = self.lstm_predictor.train(
            self.test_data,
            target_metric="heart_rate",
            training_config={"epochs": 10}
        )
        
        # Verify training metrics
        assert "history" in train_result
        assert "metrics" in train_result
        
        # Generate predictions
        prediction_result = self.lstm_predictor.predict(
            self.test_data.iloc[-TEST_SEQUENCE_LENGTH:],
            prediction_config={"steps_ahead": 24}
        )
        
        # Validate predictions
        assert "predictions" in prediction_result
        assert "confidence_intervals" in prediction_result
        assert prediction_result["medical_validation"]["terminology_validated"]

    def test_random_forest_prediction(self):
        """Test Random Forest prediction with statistical validation."""
        # Prepare features
        X = self.rf_predictor.preprocessor.extract_health_features(
            self.test_data,
            metric_type="heart_rate"
        )[0]
        y = self.test_data["heart_rate"].values
        
        # Train model with validation
        train_result = self.rf_predictor.train(
            self.test_data,
            target_metric="heart_rate",
            training_config={"cv_folds": 5}
        )
        
        # Verify feature importance
        importance_analysis = self.rf_predictor.analyze_feature_importance({
            "bootstrap_iterations": 1000
        })
        
        assert "importance_scores" in importance_analysis
        assert "confidence_intervals" in importance_analysis
        
        # Generate predictions with intervals
        prediction_result = self.rf_predictor.predict(
            self.test_data,
            prediction_config={"return_intervals": True}
        )
        
        # Validate prediction intervals
        assert "predictions" in prediction_result
        assert "prediction_intervals" in prediction_result
        assert prediction_result["statistical_validation"]["intervals_validated"]