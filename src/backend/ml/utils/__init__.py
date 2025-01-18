"""
Machine Learning Utilities Initialization Module for PHRSAT.
Provides centralized access to data preprocessing, metrics calculation, and visualization tools
for health data analysis and document processing with HIPAA compliance.

Version: 1.0.0
"""

from typing import Dict, List, Optional, Union, Tuple
import numpy as np

# Import internal components with version tracking
from ml.utils.data import DataPreprocessor, clean_data, create_feature_matrix  # v1.0.0
from ml.utils.metrics import (  # v1.0.0
    ModelEvaluator,
    calculate_confidence_score,
    calculate_prediction_intervals
)
from ml.utils.visualization import (  # v1.0.0
    HealthMetricsVisualizer,
    create_prediction_plot,
    COLOR_PALETTE,
    ACCESSIBILITY_CONFIG
)

# Global version and configuration
VERSION = "1.0.0"
SUPPORTED_METRIC_TYPES = [
    "heart_rate",
    "blood_pressure",
    "steps",
    "weight",
    "sleep",
    "activity"
]
DEFAULT_CONFIDENCE_LEVEL = 0.95

class MLUtilsManager:
    """
    Centralized manager for machine learning utilities with enhanced security and performance.
    Provides unified access to preprocessing, evaluation, and visualization capabilities.
    """
    
    def __init__(
        self,
        config: Optional[Dict] = None,
        enable_gpu: bool = True,
        security_context: Optional[Dict] = None
    ) -> None:
        """
        Initialize ML utilities manager with comprehensive configuration.

        Args:
            config: Custom configuration dictionary
            enable_gpu: Flag to enable GPU acceleration
            security_context: Security and HIPAA compliance settings
        """
        self.config = config or {}
        self.security_context = security_context or {}
        
        # Initialize core components
        self.preprocessor = DataPreprocessor(config=config)
        self.evaluator = ModelEvaluator(enable_gpu=enable_gpu)
        self.visualizer = HealthMetricsVisualizer(
            plot_config=config.get('visualization'),
            accessibility_config=ACCESSIBILITY_CONFIG
        )

    def preprocess_health_data(
        self,
        data: Union[np.ndarray, List],
        metric_type: str,
        sequence_length: Optional[int] = None
    ) -> Tuple[np.ndarray, Dict]:
        """
        Preprocess health data with HIPAA compliance checks.

        Args:
            data: Raw health metric data
            metric_type: Type of health metric
            sequence_length: Length for time series sequences

        Returns:
            Tuple of (processed_data, processing_metadata)
        """
        if metric_type not in SUPPORTED_METRIC_TYPES:
            raise ValueError(f"Unsupported metric type: {metric_type}")
            
        processed_data = self.preprocessor.normalize_health_metrics(
            np.array(data),
            metric_type
        )
        
        if sequence_length:
            processed_data, _ = self.preprocessor.prepare_time_series(
                processed_data,
                sequence_length
            )
            
        return processed_data, {"metric_type": metric_type, "version": VERSION}

    def evaluate_predictions(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        task_type: str,
        **kwargs
    ) -> Dict:
        """
        Evaluate model predictions with comprehensive metrics.

        Args:
            y_true: Ground truth values
            y_pred: Predicted values
            task_type: Type of prediction task
            **kwargs: Additional evaluation parameters

        Returns:
            Dictionary containing evaluation metrics
        """
        if task_type == "regression":
            metrics = self.evaluator.calculate_regression_metrics(
                y_true,
                y_pred,
                confidence_level=kwargs.get('confidence_level', DEFAULT_CONFIDENCE_LEVEL)
            )
        elif task_type == "classification":
            metrics = self.evaluator.calculate_classification_metrics(
                y_true,
                y_pred,
                y_prob=kwargs.get('y_prob')
            )
        elif task_type == "time_series":
            metrics = self.evaluator.calculate_time_series_metrics(
                y_true,
                y_pred,
                seasonality_params=kwargs.get('seasonality_params')
            )
        else:
            raise ValueError(f"Unsupported task type: {task_type}")
            
        return metrics

    def visualize_results(
        self,
        data: Dict,
        plot_type: str,
        **kwargs
    ) -> Union[np.ndarray, Dict]:
        """
        Generate secure visualizations for analysis results.

        Args:
            data: Data to visualize
            plot_type: Type of visualization
            **kwargs: Additional visualization parameters

        Returns:
            Visualization output (figure or data)
        """
        if plot_type == "health_trends":
            return self.visualizer.plot_health_trends(
                data['health_data'],
                data['metric_type'],
                plot_options=kwargs.get('plot_options')
            )
        elif plot_type == "predictions":
            return create_prediction_plot(
                data['y_true'],
                data['y_pred'],
                plot_config=kwargs.get('plot_config'),
                accessibility_config=kwargs.get('accessibility_config')
            )
        else:
            raise ValueError(f"Unsupported plot type: {plot_type}")

# Export public components
__all__ = [
    'MLUtilsManager',
    'DataPreprocessor',
    'ModelEvaluator',
    'HealthMetricsVisualizer',
    'clean_data',
    'create_feature_matrix',
    'calculate_confidence_score',
    'calculate_prediction_intervals',
    'create_prediction_plot',
    'VERSION',
    'SUPPORTED_METRIC_TYPES',
    'DEFAULT_CONFIDENCE_LEVEL',
    'COLOR_PALETTE',
    'ACCESSIBILITY_CONFIG'
]