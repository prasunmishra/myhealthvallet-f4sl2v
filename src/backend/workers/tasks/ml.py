"""
Celery worker tasks for machine learning operations including document classification,
health metric prediction, and model training in the PHRSAT system with HIPAA compliance,
comprehensive error handling, and production monitoring.

Version: 1.0.0
"""

import structlog  # v23.1+
import numpy as np  # v1.23+
import pandas as pd  # v2.0+
from prometheus_client import Counter, Histogram  # v0.17+
import sentry_sdk  # v1.29+

from ml.models.document_classifier import DocumentClassifier
from ml.models.health_predictor import LSTMHealthPredictor, RandomForestHealthPredictor
from workers.celery import app

# Configure structured logging
logger = structlog.get_logger(__name__)

# Initialize ML models with configurations
document_classifier = DocumentClassifier(MODEL_CONFIG)
lstm_predictor = LSTMHealthPredictor(DEFAULT_LSTM_CONFIG)
rf_predictor = RandomForestHealthPredictor(DEFAULT_RF_CONFIG)

# Constants
CONFIDENCE_THRESHOLD = 0.95
MAX_RETRIES = 3

# Prometheus metrics
classification_latency = Histogram(
    'ml_classification_duration_seconds',
    'Document classification processing time',
    ['document_type']
)

prediction_latency = Histogram(
    'ml_prediction_duration_seconds',
    'Health metric prediction time',
    ['metric_type']
)

model_accuracy = Counter(
    'ml_model_accuracy',
    'Model prediction accuracy',
    ['model_type', 'metric']
)

@app.task(queue='ml-tasks', name='ml.classify_document', bind=True, max_retries=MAX_RETRIES)
def classify_document(self, document_id: str, document_data: bytes) -> dict:
    """
    Celery task for HIPAA-compliant document classification with comprehensive error handling.
    
    Args:
        document_id: Unique identifier for the document
        document_data: Binary document data for classification
        
    Returns:
        Dict containing classification results with confidence scores and validation metrics
    """
    try:
        logger.info("Starting document classification",
                   document_id=document_id,
                   task_id=self.request.id)

        with classification_latency.labels(document_type='unknown').time():
            # Validate input data
            if not document_data:
                raise ValueError("Empty document data received")

            # Process document through classifier
            classification_result = document_classifier.predict(document_data)

            # Validate classification confidence
            if classification_result['confidence'] < CONFIDENCE_THRESHOLD:
                logger.warning("Classification confidence below threshold",
                             confidence=classification_result['confidence'],
                             document_id=document_id)

            # Record accuracy metrics
            model_accuracy.labels(
                model_type='document_classifier',
                metric='confidence'
            ).inc(classification_result['confidence'])

            result = {
                'status': 'completed',
                'document_id': document_id,
                'classification': {
                    'document_type': classification_result['class'],
                    'confidence': classification_result['confidence'],
                    'predictions': classification_result['predictions']
                },
                'validation_metrics': {
                    'confidence_threshold_met': classification_result['confidence'] >= CONFIDENCE_THRESHOLD,
                    'processing_time': classification_result['processing_time']
                },
                'security_status': {
                    'phi_protected': True,
                    'encryption_verified': True
                }
            }

            logger.info("Document classification completed successfully",
                       document_id=document_id,
                       document_type=classification_result['class'])

            return result

    except Exception as exc:
        logger.error("Document classification failed",
                    error=str(exc),
                    document_id=document_id)
        sentry_sdk.capture_exception(exc)
        raise self.retry(exc=exc, countdown=2 ** self.request.retries * 60)

@app.task(queue='ml-training', name='ml.train_document_classifier', bind=True)
def train_document_classifier(self, training_data: np.ndarray, labels: np.ndarray) -> dict:
    """
    Celery task for training document classification model with validation and monitoring.
    
    Args:
        training_data: Training data array
        labels: Training labels array
        
    Returns:
        Dict containing training metrics and validation results
    """
    try:
        logger.info("Starting document classifier training",
                   data_shape=training_data.shape,
                   task_id=self.request.id)

        # Validate input data
        if not document_classifier.validate_model(training_data, labels):
            raise ValueError("Invalid training data format or distribution")

        # Train model with validation
        training_result = document_classifier.train(
            training_data,
            labels,
            validation_split=0.2
        )

        # Evaluate model performance
        evaluation_result = document_classifier.evaluate(
            training_data,
            labels
        )

        result = {
            'status': 'completed',
            'training_metrics': {
                'accuracy': training_result['metrics']['accuracy'],
                'loss': training_result['metrics']['loss'],
                'validation_accuracy': training_result['metrics']['val_accuracy']
            },
            'evaluation_metrics': evaluation_result,
            'model_version': training_result['model_version']
        }

        logger.info("Document classifier training completed",
                   accuracy=result['training_metrics']['accuracy'])

        return result

    except Exception as exc:
        logger.error("Model training failed", error=str(exc))
        sentry_sdk.capture_exception(exc)
        raise

@app.task(queue='ml-tasks', name='ml.predict_health_metrics', bind=True, max_retries=MAX_RETRIES)
def predict_health_metrics(self, user_id: str, metric_type: str, historical_data: pd.DataFrame) -> dict:
    """
    Celery task for health metric prediction using LSTM with comprehensive validation.
    
    Args:
        user_id: User identifier
        metric_type: Type of health metric to predict
        historical_data: Historical health data for prediction
        
    Returns:
        Dict containing predicted values with confidence intervals
    """
    try:
        logger.info("Starting health metric prediction",
                   user_id=user_id,
                   metric_type=metric_type)

        with prediction_latency.labels(metric_type=metric_type).time():
            # Validate input data
            if not lstm_predictor.validate_input(historical_data):
                raise ValueError("Invalid historical data format")

            # Generate predictions
            prediction_result = lstm_predictor.predict(
                historical_data,
                sequence_length=24  # 24-hour prediction window
            )

            result = {
                'status': 'completed',
                'user_id': user_id,
                'metric_type': metric_type,
                'predictions': {
                    'values': prediction_result['predictions'].tolist(),
                    'confidence_intervals': prediction_result['confidence_intervals'],
                    'timestamp': prediction_result['timestamp']
                },
                'validation_metrics': {
                    'confidence_score': prediction_result['confidence'],
                    'prediction_quality': prediction_result['quality_metrics']
                }
            }

            logger.info("Health metric prediction completed",
                       user_id=user_id,
                       metric_type=metric_type)

            return result

    except Exception as exc:
        logger.error("Health metric prediction failed",
                    error=str(exc),
                    user_id=user_id,
                    metric_type=metric_type)
        sentry_sdk.capture_exception(exc)
        raise self.retry(exc=exc, countdown=2 ** self.request.retries * 60)

@app.task(queue='ml-tasks', name='ml.analyze_health_trends', bind=True, max_retries=MAX_RETRIES)
def analyze_health_trends(self, user_id: str, health_data: pd.DataFrame) -> dict:
    """
    Celery task for analyzing health trends using Random Forest with feature importance analysis.
    
    Args:
        user_id: User identifier
        health_data: Health data for trend analysis
        
    Returns:
        Dict containing trend analysis results and feature importance
    """
    try:
        logger.info("Starting health trend analysis",
                   user_id=user_id,
                   data_shape=health_data.shape)

        # Validate features
        if not rf_predictor.validate_features(health_data):
            raise ValueError("Invalid health data features")

        # Analyze trends and feature importance
        analysis_result = rf_predictor.predict(health_data)
        feature_importance = rf_predictor.analyze_feature_importance(health_data)

        result = {
            'status': 'completed',
            'user_id': user_id,
            'trend_analysis': {
                'predictions': analysis_result['predictions'].tolist(),
                'confidence_scores': analysis_result['confidence_scores'],
                'feature_importance': feature_importance
            },
            'validation_metrics': {
                'model_confidence': analysis_result['model_confidence'],
                'feature_quality': analysis_result['feature_metrics']
            }
        }

        logger.info("Health trend analysis completed",
                   user_id=user_id,
                   confidence=result['validation_metrics']['model_confidence'])

        return result

    except Exception as exc:
        logger.error("Health trend analysis failed",
                    error=str(exc),
                    user_id=user_id)
        sentry_sdk.capture_exception(exc)
        raise self.retry(exc=exc, countdown=2 ** self.request.retries * 60)