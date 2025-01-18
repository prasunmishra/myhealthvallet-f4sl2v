"""
Machine Learning Model Metrics Utility Module for PHRSAT.
Provides comprehensive evaluation metrics for health predictions and document classification tasks.

Version: 1.0.0
"""

import numpy as np  # numpy v1.23+
from sklearn.metrics import (  # scikit-learn v1.2+
    mean_squared_error, mean_absolute_error, r2_score,
    accuracy_score, precision_recall_fscore_support,
    roc_auc_score, confusion_matrix
)
import tensorflow as tf  # tensorflow v2.13+
from typing import Dict, Tuple, Optional, Union, List

from core.logging import setup_logging

# Default configuration for metrics calculation
DEFAULT_METRICS_CONFIG = {
    "regression": ["mse", "rmse", "mae", "r2", "adjusted_r2"],
    "classification": ["accuracy", "precision", "recall", "f1", "roc_auc"],
    "time_series": ["mape", "smape", "directional_accuracy", "forecast_bias"]
}

CONFIDENCE_THRESHOLD = 0.85
DEFAULT_CONFIDENCE_LEVEL = 0.95
ERROR_ESTIMATION_PARAMS = {
    "bootstrap_iterations": 1000,
    "error_alpha": 0.05,
    "robust_scaling": True
}

class ModelEvaluator:
    """Enhanced model evaluator with comprehensive metrics support for health predictions."""
    
    def __init__(self, metrics_config: Optional[Dict] = None, enable_gpu: bool = True) -> None:
        """
        Initialize model evaluator with configuration and logging setup.
        
        Args:
            metrics_config: Custom metrics configuration dictionary
            enable_gpu: Flag to enable GPU acceleration for metrics calculation
        """
        self.metrics_config = metrics_config or DEFAULT_METRICS_CONFIG
        self.thresholds = {
            "classification": CONFIDENCE_THRESHOLD,
            "regression": DEFAULT_CONFIDENCE_LEVEL
        }
        
        # Setup logging
        self.logger = setup_logging()
        
        # Configure TensorFlow metrics
        if enable_gpu:
            self.tf_metrics = {
                "accuracy": tf.keras.metrics.Accuracy(),
                "precision": tf.keras.metrics.Precision(),
                "recall": tf.keras.metrics.Recall(),
                "auc": tf.keras.metrics.AUC()
            }
        
    def calculate_regression_metrics(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        confidence_level: float = DEFAULT_CONFIDENCE_LEVEL
    ) -> Dict:
        """
        Calculate comprehensive metrics for regression models.
        
        Args:
            y_true: Ground truth values
            y_pred: Predicted values
            confidence_level: Confidence level for prediction intervals
            
        Returns:
            Dictionary containing regression metrics
        """
        try:
            # Input validation
            if len(y_true) != len(y_pred):
                raise ValueError("Input arrays must have the same length")
                
            metrics = {}
            
            # Basic regression metrics
            metrics["mse"] = mean_squared_error(y_true, y_pred)
            metrics["rmse"] = np.sqrt(metrics["mse"])
            metrics["mae"] = mean_absolute_error(y_true, y_pred)
            metrics["r2"] = r2_score(y_true, y_pred)
            
            # Advanced metrics
            n = len(y_true)
            p = 1  # number of predictors
            metrics["adjusted_r2"] = 1 - (1 - metrics["r2"]) * (n - 1) / (n - p - 1)
            metrics["explained_variance"] = np.var(y_pred) / np.var(y_true)
            
            # Calculate prediction intervals
            residuals = y_true - y_pred
            std_error = np.std(residuals)
            z_score = abs(np.percentile(residuals, (1 - confidence_level) * 100))
            metrics["prediction_interval"] = {
                "lower": y_pred - z_score * std_error,
                "upper": y_pred + z_score * std_error,
                "confidence_level": confidence_level
            }
            
            self.logger.info(f"Regression metrics calculated successfully: {metrics}")
            return metrics
            
        except Exception as e:
            self.logger.error(f"Error calculating regression metrics: {str(e)}")
            raise
            
    def calculate_classification_metrics(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        y_prob: Optional[np.ndarray] = None
    ) -> Dict:
        """
        Calculate enhanced metrics for classification models.
        
        Args:
            y_true: Ground truth labels
            y_pred: Predicted labels
            y_prob: Prediction probabilities
            
        Returns:
            Dictionary containing classification metrics
        """
        try:
            metrics = {}
            
            # Basic classification metrics
            metrics["accuracy"] = accuracy_score(y_true, y_pred)
            
            # Precision, recall, and F1 score
            precision, recall, f1, support = precision_recall_fscore_support(
                y_true, y_pred, average='weighted'
            )
            metrics.update({
                "precision": precision,
                "recall": recall,
                "f1": f1,
                "support": support
            })
            
            # Confusion matrix
            metrics["confusion_matrix"] = confusion_matrix(y_true, y_pred).tolist()
            
            # ROC AUC if probabilities are provided
            if y_prob is not None:
                metrics["roc_auc"] = roc_auc_score(y_true, y_prob, multi_class='ovr')
                
            # Calculate confidence scores
            if y_prob is not None:
                confidence_scores = calculate_confidence_score(y_prob)
                metrics["confidence_scores"] = {
                    "mean": np.mean(confidence_scores),
                    "std": np.std(confidence_scores),
                    "threshold_met": np.mean(confidence_scores >= CONFIDENCE_THRESHOLD)
                }
                
            self.logger.info(f"Classification metrics calculated successfully: {metrics}")
            return metrics
            
        except Exception as e:
            self.logger.error(f"Error calculating classification metrics: {str(e)}")
            raise
            
    def calculate_time_series_metrics(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        seasonality_params: Optional[Dict] = None
    ) -> Dict:
        """
        Calculate specialized metrics for time series predictions.
        
        Args:
            y_true: Ground truth values
            y_pred: Predicted values
            seasonality_params: Parameters for seasonality analysis
            
        Returns:
            Dictionary containing time series metrics
        """
        try:
            metrics = {}
            
            # MAPE calculation with zero handling
            epsilon = 1e-10
            mape = np.mean(np.abs((y_true - y_pred) / (y_true + epsilon))) * 100
            metrics["mape"] = mape
            
            # Symmetric MAPE
            smape = np.mean(2 * np.abs(y_pred - y_true) / (np.abs(y_true) + np.abs(y_pred) + epsilon)) * 100
            metrics["smape"] = smape
            
            # Directional accuracy
            direction_true = np.diff(y_true) > 0
            direction_pred = np.diff(y_pred) > 0
            metrics["directional_accuracy"] = np.mean(direction_true == direction_pred)
            
            # Forecast bias
            metrics["forecast_bias"] = np.mean(y_pred - y_true)
            
            # Seasonality analysis if parameters provided
            if seasonality_params:
                period = seasonality_params.get("period", 24)  # default daily seasonality
                seasonal_error = np.zeros(period)
                for i in range(period):
                    indices = np.arange(i, len(y_true), period)
                    if len(indices) > 0:
                        seasonal_error[i] = np.mean(y_true[indices] - y_pred[indices])
                metrics["seasonal_error"] = seasonal_error.tolist()
                
            self.logger.info(f"Time series metrics calculated successfully: {metrics}")
            return metrics
            
        except Exception as e:
            self.logger.error(f"Error calculating time series metrics: {str(e)}")
            raise

def calculate_confidence_score(
    probabilities: np.ndarray,
    temperature: float = 1.0
) -> Tuple[np.ndarray, float]:
    """
    Calculate enhanced confidence score with uncertainty estimation.
    
    Args:
        probabilities: Model prediction probabilities
        temperature: Temperature scaling parameter
        
    Returns:
        Tuple of (confidence_scores, uncertainty_estimate)
    """
    # Apply temperature scaling
    scaled_probs = probabilities ** (1 / temperature)
    scaled_probs /= np.sum(scaled_probs, axis=1, keepdims=True)
    
    # Calculate entropy-based uncertainty
    entropy = -np.sum(scaled_probs * np.log(scaled_probs + 1e-10), axis=1)
    max_entropy = -np.log(1/scaled_probs.shape[1])
    uncertainty = entropy / max_entropy
    
    # Calculate confidence scores
    confidence_scores = np.max(scaled_probs, axis=1)
    
    return confidence_scores, uncertainty

def calculate_prediction_intervals(
    predictions: np.ndarray,
    confidence_level: float = DEFAULT_CONFIDENCE_LEVEL,
    error_params: Optional[Dict] = None
) -> Tuple[np.ndarray, np.ndarray, Dict]:
    """
    Calculate robust prediction intervals with error estimation.
    
    Args:
        predictions: Model predictions
        confidence_level: Confidence level for intervals
        error_params: Parameters for error estimation
        
    Returns:
        Tuple of (lower_bounds, upper_bounds, error_estimates)
    """
    params = error_params or ERROR_ESTIMATION_PARAMS
    
    # Calculate standard error
    std_error = np.std(predictions, axis=0) if predictions.ndim > 1 else np.std(predictions)
    
    # Calculate z-score for confidence level
    z_score = abs(np.percentile(np.random.standard_normal(params["bootstrap_iterations"]),
                              (1 - confidence_level) * 100))
    
    # Calculate bounds
    mean_pred = np.mean(predictions, axis=0) if predictions.ndim > 1 else predictions
    margin = z_score * std_error
    
    lower_bound = mean_pred - margin
    upper_bound = mean_pred + margin
    
    error_estimates = {
        "std_error": std_error,
        "margin": margin,
        "confidence_level": confidence_level
    }
    
    return lower_bound, upper_bound, error_estimates