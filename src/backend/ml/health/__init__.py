"""
Health Machine Learning Module for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides core functionality for health data analysis, trend detection, and predictive analytics
with HIPAA compliance and comprehensive security features.

Version: 1.0.0
"""

# External imports
import numpy as np  # numpy v1.24.0
import tensorflow as tf  # tensorflow v2.13.0
from sklearn.ensemble import RandomForestRegressor  # scikit-learn v1.3.0

# Internal imports
from ml.health.analyzer import HealthAnalyzer
from ml.health.predictor import LSTMHealthPredictor, RandomForestHealthPredictor
from ml.health.preprocessor import HealthDataPreprocessor

# Global constants for health analysis configuration
SUPPORTED_METRICS = [
    "heart_rate", "blood_pressure", "steps", "weight", 
    "sleep", "activity", "oxygen_saturation", "respiratory_rate"
]

DEFAULT_PREDICTION_HORIZON = 7

METRIC_WEIGHTS = {
    "heart_rate": 0.3,
    "blood_pressure": 0.3,
    "activity": 0.2,
    "sleep": 0.2
}

VALIDATION_THRESHOLDS = {
    "accuracy": 0.95,
    "precision": 0.90,
    "recall": 0.90,
    "f1": 0.90
}

SECURITY_CONFIG = {
    "encryption_level": "AES-256-GCM",
    "audit_logging": True,
    "data_retention_days": 730
}

MODEL_MONITORING_CONFIG = {
    "drift_threshold": 0.1,
    "retraining_frequency_days": 30
}

class HealthAnalyzer:
    """
    Core health analysis class providing comprehensive health data analysis capabilities
    with enhanced security features and HIPAA compliance.
    """
    
    def __init__(self, config=None):
        """
        Initialize health analyzer with configuration and models.
        
        Args:
            config (dict, optional): Configuration parameters for analysis
        """
        self.config = config or {}
        self.preprocessor = HealthDataPreprocessor()
        self.lstm_predictor = LSTMHealthPredictor()
        self.rf_predictor = RandomForestHealthPredictor()
        
        # Initialize analyzers with security configuration
        self.analyzer = HealthAnalyzer(
            config={**self.config, **SECURITY_CONFIG}
        )

    def analyze_trends(self, health_data, metric_type):
        """
        Analyze health metric trends with comprehensive validation.
        
        Args:
            health_data (pd.DataFrame): Health metric data
            metric_type (str): Type of health metric to analyze
            
        Returns:
            dict: Analysis results with trends and insights
        """
        if metric_type not in SUPPORTED_METRICS:
            raise ValueError(f"Unsupported metric type: {metric_type}")
            
        return self.analyzer.analyze_trends(health_data, metric_type)

    def detect_anomalies(self, health_data, metric_type):
        """
        Detect anomalies in health metrics with enhanced validation.
        
        Args:
            health_data (pd.DataFrame): Health metric data
            metric_type (str): Type of health metric to analyze
            
        Returns:
            dict: Detected anomalies with confidence scores
        """
        if metric_type not in SUPPORTED_METRICS:
            raise ValueError(f"Unsupported metric type: {metric_type}")
            
        return self.analyzer.detect_anomalies(health_data, metric_type)

    def generate_insights(self, health_data, metric_type):
        """
        Generate actionable health insights with confidence scores.
        
        Args:
            health_data (pd.DataFrame): Health metric data
            metric_type (str): Type of health metric to analyze
            
        Returns:
            dict: Generated insights with recommendations
        """
        if metric_type not in SUPPORTED_METRICS:
            raise ValueError(f"Unsupported metric type: {metric_type}")
            
        return self.analyzer.generate_insights(health_data, metric_type)

    def predict_metrics(self, health_data, metric_type, prediction_horizon=DEFAULT_PREDICTION_HORIZON):
        """
        Predict future health metrics using ensemble approach.
        
        Args:
            health_data (pd.DataFrame): Historical health data
            metric_type (str): Type of health metric to predict
            prediction_horizon (int): Number of future points to predict
            
        Returns:
            dict: Predictions with confidence intervals
        """
        if metric_type not in SUPPORTED_METRICS:
            raise ValueError(f"Unsupported metric type: {metric_type}")
            
        # Get predictions from both models
        lstm_predictions = self.lstm_predictor.predict(
            health_data, 
            metric_type, 
            prediction_horizon
        )
        
        rf_predictions = self.rf_predictor.predict(
            health_data,
            metric_type
        )
        
        # Combine predictions with weighted ensemble
        ensemble_predictions = {
            'predictions': np.average([
                lstm_predictions['predictions'],
                rf_predictions['predictions']
            ], weights=[0.6, 0.4], axis=0),
            'confidence_intervals': {
                'lower': np.minimum(
                    lstm_predictions['confidence_intervals']['lower'],
                    rf_predictions['confidence_intervals']['lower']
                ),
                'upper': np.maximum(
                    lstm_predictions['confidence_intervals']['upper'],
                    rf_predictions['confidence_intervals']['upper']
                )
            },
            'model_metadata': {
                'lstm_metrics': lstm_predictions.get('error_estimates', {}),
                'rf_metrics': rf_predictions.get('error_estimates', {})
            }
        }
        
        return ensemble_predictions

# Export public components
__all__ = [
    'HealthAnalyzer',
    'SUPPORTED_METRICS',
    'DEFAULT_PREDICTION_HORIZON',
    'METRIC_WEIGHTS',
    'VALIDATION_THRESHOLDS'
]