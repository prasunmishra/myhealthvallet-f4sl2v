"""
Health Data Analysis Module for Personal Health Record Store and Analysis Tool (PHRSAT).
Provides advanced health data analysis capabilities with HIPAA compliance and robust error handling.

Version: 1.0.0
"""

import numpy as np  # numpy v1.23+
import pandas as pd  # pandas v2.0+
import scipy.stats as stats  # scipy v1.9+
import logging
from typing import Dict, List, Optional, Tuple, Union
from functools import wraps

from hipaa_security_validator import SecurityValidator  # hipaa_security_validator v2.1+
from performance_monitoring import PerformanceMonitor  # performance_monitoring v1.0+

from ml.health.preprocessor import HealthDataPreprocessor
from core.logging import setup_logging

# Global constants for health analysis
SUPPORTED_METRICS = ["heart_rate", "blood_pressure", "steps", "weight", "sleep", "activity", "glucose", "oxygen_saturation"]
ANOMALY_THRESHOLD = 2.5
TREND_SIGNIFICANCE_LEVEL = 0.05
DEFAULT_PREDICTION_HORIZON = 7
METRIC_WEIGHTS = {
    "heart_rate": 0.25,
    "blood_pressure": 0.25,
    "activity": 0.2,
    "sleep": 0.15,
    "glucose": 0.15
}
MINIMUM_DATA_QUALITY_SCORE = 0.95
SECURITY_LEVEL = "HIPAA_COMPLIANT"
PERFORMANCE_THRESHOLD_MS = 500

def performance_tracked(func):
    """Decorator for performance monitoring of analysis functions."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        with PerformanceMonitor() as monitor:
            result = func(*args, **kwargs)
            if monitor.execution_time > PERFORMANCE_THRESHOLD_MS:
                logging.warning(f"Performance threshold exceeded in {func.__name__}: {monitor.execution_time}ms")
        return result
    return wrapper

def hipaa_compliant(func):
    """Decorator for ensuring HIPAA compliance in data handling."""
    @wraps(func)
    def wrapper(*args, **kwargs):
        SecurityValidator.validate_operation(SECURITY_LEVEL)
        return func(*args, **kwargs)
    return wrapper

class HealthAnalyzer:
    """Core class for analyzing health data and generating insights with enhanced security and performance features."""

    def __init__(self, config: Dict, logger: Optional[logging.Logger] = None):
        """Initialize health analyzer with security and monitoring capabilities."""
        self.config = config
        self.logger = logger or setup_logging()
        self.preprocessor = HealthDataPreprocessor()
        self.security_validator = SecurityValidator(security_level=SECURITY_LEVEL)
        self.performance_monitor = PerformanceMonitor()
        
        # Initialize analysis configuration
        self.analysis_config = {
            "confidence_level": 0.95,
            "min_data_points": 24,
            "trend_window": 7,
            "seasonality_period": 24
        }
        self.analysis_config.update(config.get("analysis_params", {}))

    @performance_tracked
    @hipaa_compliant
    def analyze_trends(self, health_data: pd.DataFrame, metric_type: str,
                      analysis_params: Optional[Dict] = None) -> Dict:
        """
        Analyze health metric trends with enhanced validation and monitoring.
        
        Args:
            health_data: DataFrame containing health metrics
            metric_type: Type of health metric to analyze
            analysis_params: Optional parameters for analysis customization
            
        Returns:
            Dictionary containing trend analysis results with confidence scores
        """
        try:
            # Validate inputs
            if metric_type not in SUPPORTED_METRICS:
                raise ValueError(f"Unsupported metric type: {metric_type}")
            
            # Preprocess data
            processed_data, quality_metrics = self.preprocessor.preprocess_health_metrics(
                health_data, metric_type
            )
            
            if quality_metrics.get("quality_score", 0) < MINIMUM_DATA_QUALITY_SCORE:
                self.logger.warning(f"Data quality below threshold for {metric_type}")
            
            # Extract features for analysis
            features, feature_metadata = self.preprocessor.extract_health_features(
                processed_data, metric_type
            )
            
            # Calculate statistical trends
            trend_results = self._calculate_trends(processed_data, metric_type)
            
            # Detect anomalies
            anomalies = self._detect_anomalies(processed_data, metric_type)
            
            # Generate insights
            insights = self._generate_insights(trend_results, anomalies, metric_type)
            
            # Calculate confidence intervals
            confidence_intervals = self._calculate_confidence_intervals(
                processed_data, trend_results
            )
            
            analysis_results = {
                "metric_type": metric_type,
                "trend_analysis": trend_results,
                "anomalies": anomalies,
                "insights": insights,
                "confidence_intervals": confidence_intervals,
                "quality_metrics": quality_metrics,
                "analysis_timestamp": pd.Timestamp.now()
            }
            
            self.logger.info(f"Completed trend analysis for {metric_type}")
            return analysis_results
            
        except Exception as e:
            self.logger.error(f"Error in trend analysis for {metric_type}: {str(e)}")
            raise

    def _calculate_trends(self, data: pd.DataFrame, metric_type: str) -> Dict:
        """Calculate statistical trends with significance testing."""
        trends = {}
        
        # Calculate basic statistics
        trends["mean"] = float(data[metric_type].mean())
        trends["std"] = float(data[metric_type].std())
        
        # Calculate trend line
        x = np.arange(len(data))
        slope, intercept, r_value, p_value, std_err = stats.linregress(x, data[metric_type])
        
        trends["trend"] = {
            "slope": float(slope),
            "intercept": float(intercept),
            "r_squared": float(r_value ** 2),
            "p_value": float(p_value),
            "significant": p_value < TREND_SIGNIFICANCE_LEVEL
        }
        
        # Calculate moving averages
        trends["moving_averages"] = {
            "daily": data[metric_type].rolling(window=24).mean().tolist(),
            "weekly": data[metric_type].rolling(window=168).mean().tolist()
        }
        
        return trends

    def _detect_anomalies(self, data: pd.DataFrame, metric_type: str) -> List[Dict]:
        """Detect anomalies using statistical methods."""
        anomalies = []
        values = data[metric_type].values
        mean = np.mean(values)
        std = np.std(values)
        
        for idx, value in enumerate(values):
            z_score = abs((value - mean) / std)
            if z_score > ANOMALY_THRESHOLD:
                anomalies.append({
                    "index": idx,
                    "timestamp": data.index[idx].isoformat() if isinstance(data.index, pd.DatetimeIndex) else str(idx),
                    "value": float(value),
                    "z_score": float(z_score),
                    "severity": "high" if z_score > 2 * ANOMALY_THRESHOLD else "medium"
                })
        
        return anomalies

    def _generate_insights(self, trends: Dict, anomalies: List[Dict], metric_type: str) -> List[Dict]:
        """Generate actionable insights from analysis results."""
        insights = []
        
        # Trend-based insights
        if trends["trend"]["significant"]:
            direction = "increasing" if trends["trend"]["slope"] > 0 else "decreasing"
            insights.append({
                "type": "trend",
                "description": f"Significant {direction} trend detected in {metric_type}",
                "confidence": float(1 - trends["trend"]["p_value"]),
                "severity": "high" if abs(trends["trend"]["slope"]) > 0.1 else "medium"
            })
        
        # Anomaly-based insights
        if anomalies:
            insights.append({
                "type": "anomaly",
                "description": f"Detected {len(anomalies)} anomalies in {metric_type}",
                "count": len(anomalies),
                "severity": "high" if any(a["severity"] == "high" for a in anomalies) else "medium"
            })
        
        return insights

    def _calculate_confidence_intervals(self, data: pd.DataFrame, trends: Dict) -> Dict:
        """Calculate confidence intervals for trend predictions."""
        confidence_level = self.analysis_config["confidence_level"]
        n = len(data)
        
        # Calculate standard error
        std_error = trends["std"] / np.sqrt(n)
        
        # Calculate t-value for confidence level
        t_value = stats.t.ppf((1 + confidence_level) / 2, n - 1)
        
        # Calculate margins
        margin = t_value * std_error
        
        return {
            "lower_bound": float(trends["mean"] - margin),
            "upper_bound": float(trends["mean"] + margin),
            "confidence_level": confidence_level
        }