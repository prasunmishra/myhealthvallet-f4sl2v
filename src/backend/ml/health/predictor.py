"""
Health Prediction Module for PHRSAT.
Implements LSTM and Random Forest models for health metric predictions with enhanced security,
monitoring, and comprehensive error handling.

Version: 1.0.0
"""

import numpy as np  # numpy v1.23+
import pandas as pd  # pandas v2.0+
import tensorflow as tf  # tensorflow v2.13+
from sklearn.ensemble import RandomForestRegressor  # scikit-learn v1.2+
from prometheus_client import Counter, Histogram, Gauge  # prometheus_client v0.17+
from cryptography.fernet import Fernet  # cryptography v41.0+
from functools import wraps
from typing import Dict, List, Optional, Tuple, Union

from ml.health.preprocessor import HealthDataPreprocessor
from ml.utils.metrics import ModelEvaluator
from core.logging import setup_logging
from core.constants import HealthMetricType

# Model configuration defaults
LSTM_DEFAULT_CONFIG = {
    "units": [64, 32],
    "dropout": 0.2,
    "learning_rate": 0.001,
    "gpu_memory_limit": 0.8
}

RF_DEFAULT_CONFIG = {
    "n_estimators": 100,
    "max_depth": 10,
    "min_samples_split": 5
}

SUPPORTED_METRICS = ["heart_rate", "blood_pressure", "steps", "weight", "sleep", "activity"]
DEFAULT_PREDICTION_HORIZON = 7

# Monitoring metrics
prediction_requests = Counter('health_prediction_requests_total', 'Total prediction requests', ['model_type', 'metric_type'])
prediction_latency = Histogram('health_prediction_latency_seconds', 'Prediction latency', ['model_type'])
model_accuracy = Gauge('health_model_accuracy', 'Model prediction accuracy', ['model_type', 'metric_type'])

def monitor_performance(func):
    """Decorator for monitoring model performance and logging."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        with prediction_latency.labels(args[0].__class__.__name__).time():
            try:
                result = func(*args, **kwargs)
                prediction_requests.labels(
                    args[0].__class__.__name__,
                    kwargs.get('metric_type', 'unknown')
                ).inc()
                return result
            except Exception as e:
                logger = setup_logging()
                logger.error(f"Prediction error in {func.__name__}: {str(e)}")
                raise
    return wrapper

class LSTMHealthPredictor:
    """LSTM-based model for time series health metric predictions with enhanced security and monitoring."""
    
    def __init__(self, model_config: Optional[Dict] = None):
        """Initialize LSTM predictor with model configuration."""
        self.config = {**LSTM_DEFAULT_CONFIG, **(model_config or {})}
        self.preprocessor = HealthDataPreprocessor()
        self.evaluator = ModelEvaluator()
        self.model = None
        self.logger = setup_logging()
        
        # Configure GPU memory
        gpus = tf.config.experimental.list_physical_devices('GPU')
        if gpus:
            try:
                tf.config.experimental.set_memory_growth(gpus[0], True)
                tf.config.experimental.set_virtual_device_configuration(
                    gpus[0],
                    [tf.config.experimental.VirtualDeviceConfiguration(
                        memory_limit=self.config['gpu_memory_limit']
                    )]
                )
            except RuntimeError as e:
                self.logger.warning(f"GPU configuration failed: {str(e)}")

    def _build_model(self, input_shape: Tuple[int, int, int]) -> None:
        """Build LSTM model architecture."""
        model = tf.keras.Sequential()
        
        # Add LSTM layers with dropout
        for i, units in enumerate(self.config['units']):
            return_sequences = i < len(self.config['units']) - 1
            if i == 0:
                model.add(tf.keras.layers.LSTM(
                    units, return_sequences=return_sequences,
                    input_shape=input_shape
                ))
            else:
                model.add(tf.keras.layers.LSTM(units, return_sequences=return_sequences))
            model.add(tf.keras.layers.Dropout(self.config['dropout']))
        
        # Add output layer
        model.add(tf.keras.layers.Dense(1))
        
        # Compile model
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=self.config['learning_rate']),
            loss='mse',
            metrics=['mae']
        )
        
        self.model = model

    @monitor_performance
    def train(self, training_data: pd.DataFrame, metric_type: str,
             epochs: int = 100, validation_split: float = 0.2) -> Dict:
        """Train LSTM model on health time series data."""
        try:
            if metric_type not in SUPPORTED_METRICS:
                raise ValueError(f"Unsupported metric type: {metric_type}")
            
            # Preprocess training data
            processed_data, preprocessing_metrics = self.preprocessor.preprocess_health_metrics(
                training_data, metric_type
            )
            
            # Prepare sequences
            X, y, sequence_metadata = self.preprocessor.prepare_sequences(
                processed_data,
                sequence_length=self.config.get('sequence_length', 24)
            )
            
            if self.model is None:
                self._build_model(input_shape=(X.shape[1], X.shape[2]))
            
            # Train model with callbacks
            callbacks = [
                tf.keras.callbacks.EarlyStopping(
                    monitor='val_loss',
                    patience=5,
                    restore_best_weights=True
                ),
                tf.keras.callbacks.ModelCheckpoint(
                    f'models/lstm_{metric_type}.h5',
                    monitor='val_loss',
                    save_best_only=True
                )
            ]
            
            history = self.model.fit(
                X, y,
                epochs=epochs,
                validation_split=validation_split,
                callbacks=callbacks,
                verbose=1
            )
            
            # Calculate and log metrics
            train_metrics = self.evaluator.calculate_time_series_metrics(
                y[:-int(len(y)*validation_split)],
                self.model.predict(X[:-int(len(X)*validation_split)])
            )
            
            model_accuracy.labels(
                'lstm', metric_type
            ).set(train_metrics['directional_accuracy'])
            
            return {
                'history': history.history,
                'metrics': train_metrics,
                'preprocessing_metrics': preprocessing_metrics,
                'sequence_metadata': sequence_metadata
            }
            
        except Exception as e:
            self.logger.error(f"LSTM training failed: {str(e)}")
            raise

    @monitor_performance
    def predict(self, input_data: pd.DataFrame, metric_type: str,
               prediction_horizon: int = DEFAULT_PREDICTION_HORIZON) -> Dict:
        """Generate predictions for future health metrics."""
        try:
            if self.model is None:
                raise RuntimeError("Model not trained. Call train() first.")
            
            # Preprocess input data
            processed_data, _ = self.preprocessor.preprocess_health_metrics(
                input_data, metric_type
            )
            
            # Generate sequences
            X, _, sequence_metadata = self.preprocessor.prepare_sequences(
                processed_data,
                sequence_length=self.config.get('sequence_length', 24)
            )
            
            # Generate predictions
            predictions = self.model.predict(X)
            
            # Calculate prediction intervals
            lower_bound, upper_bound, error_estimates = self.evaluator.calculate_prediction_intervals(
                predictions,
                confidence_level=0.95
            )
            
            return {
                'predictions': predictions.tolist(),
                'confidence_intervals': {
                    'lower': lower_bound.tolist(),
                    'upper': upper_bound.tolist()
                },
                'error_estimates': error_estimates,
                'sequence_metadata': sequence_metadata
            }
            
        except Exception as e:
            self.logger.error(f"LSTM prediction failed: {str(e)}")
            raise

class RandomForestHealthPredictor:
    """Random Forest model for feature-based health predictions."""
    
    def __init__(self, model_config: Optional[Dict] = None):
        """Initialize Random Forest predictor with model configuration."""
        self.config = {**RF_DEFAULT_CONFIG, **(model_config or {})}
        self.preprocessor = HealthDataPreprocessor()
        self.evaluator = ModelEvaluator()
        self.model = None
        self.logger = setup_logging()

    @monitor_performance
    def train(self, training_data: pd.DataFrame, metric_type: str) -> Dict:
        """Train Random Forest model on health data."""
        try:
            if metric_type not in SUPPORTED_METRICS:
                raise ValueError(f"Unsupported metric type: {metric_type}")
            
            # Preprocess and extract features
            processed_data, preprocessing_metrics = self.preprocessor.preprocess_health_metrics(
                training_data, metric_type
            )
            
            features, feature_metadata = self.preprocessor.extract_health_features(
                processed_data, metric_type
            )
            
            # Initialize and train model
            self.model = RandomForestRegressor(**self.config)
            self.model.fit(features, processed_data.target.values)
            
            # Calculate training metrics
            predictions = self.model.predict(features)
            train_metrics = self.evaluator.calculate_regression_metrics(
                processed_data.target.values,
                predictions
            )
            
            model_accuracy.labels(
                'random_forest', metric_type
            ).set(train_metrics['r2'])
            
            return {
                'metrics': train_metrics,
                'preprocessing_metrics': preprocessing_metrics,
                'feature_metadata': feature_metadata,
                'feature_importance': self.get_feature_importance()
            }
            
        except Exception as e:
            self.logger.error(f"Random Forest training failed: {str(e)}")
            raise

    @monitor_performance
    def predict(self, input_data: pd.DataFrame, metric_type: str) -> Dict:
        """Generate predictions using Random Forest model."""
        try:
            if self.model is None:
                raise RuntimeError("Model not trained. Call train() first.")
            
            # Preprocess and extract features
            processed_data, _ = self.preprocessor.preprocess_health_metrics(
                input_data, metric_type
            )
            
            features, feature_metadata = self.preprocessor.extract_health_features(
                processed_data, metric_type
            )
            
            # Generate predictions
            predictions = self.model.predict(features)
            
            # Calculate prediction intervals using bootstrapping
            lower_bound, upper_bound, error_estimates = self.evaluator.calculate_prediction_intervals(
                predictions,
                confidence_level=0.95
            )
            
            return {
                'predictions': predictions.tolist(),
                'confidence_intervals': {
                    'lower': lower_bound.tolist(),
                    'upper': upper_bound.tolist()
                },
                'error_estimates': error_estimates,
                'feature_metadata': feature_metadata
            }
            
        except Exception as e:
            self.logger.error(f"Random Forest prediction failed: {str(e)}")
            raise

    def get_feature_importance(self) -> Dict[str, float]:
        """Get feature importance scores from the Random Forest model."""
        if self.model is None:
            raise RuntimeError("Model not trained. Call train() first.")
        
        return {
            f"feature_{i}": importance
            for i, importance in enumerate(self.model.feature_importances_)
        }