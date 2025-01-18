"""
Specialized preprocessor for health data that handles various health metrics, time series data,
and prepares data for machine learning models. Implements comprehensive data cleaning,
normalization, feature extraction, and validation specific to health data types.

Version: 1.0.0
"""

import logging
from typing import Dict, List, Optional, Tuple, Union
import numpy as np  # numpy v1.23+
import pandas as pd  # pandas v2.0+
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler  # scikit-learn v1.2+

from ml.utils.data import DataPreprocessor
from ml.utils.metrics import ModelEvaluator
from core.logging import setup_logging
from core.constants import HealthMetricType

# Global constants for health data preprocessing
SUPPORTED_METRICS = ["heart_rate", "blood_pressure", "steps", "weight", "sleep", "activity"]
DEFAULT_SEQUENCE_LENGTH = 24
MISSING_VALUE_THRESHOLD = 0.2
OUTLIER_ZSCORE_THRESHOLD = 3.0
CACHE_SIZE_LIMIT = 1000
VALIDATION_CONFIDENCE_THRESHOLD = 0.95
MAX_SEQUENCE_GAP = 6

class HealthDataPreprocessor(DataPreprocessor):
    """Enhanced preprocessor for health data with comprehensive validation and scaling capabilities."""
    
    def __init__(self, config: Optional[Dict] = None,
                 validation_params: Optional[Dict] = None,
                 scaling_params: Optional[Dict] = None,
                 cache_config: Optional[Dict] = None) -> None:
        """Initialize enhanced health data preprocessor with comprehensive configurations."""
        super().__init__(config)
        
        # Initialize specialized components
        self.metric_scalers = {}
        self.feature_extractors = {}
        self.validation_thresholds = validation_params or {
            "missing_ratio": MISSING_VALUE_THRESHOLD,
            "outlier_threshold": OUTLIER_ZSCORE_THRESHOLD,
            "confidence_threshold": VALIDATION_CONFIDENCE_THRESHOLD
        }
        
        # Setup metric-specific scalers
        self._initialize_metric_scalers(scaling_params or {})
        
        # Initialize preprocessing cache
        self.preprocessing_cache = {}
        self.cache_config = cache_config or {"max_size": CACHE_SIZE_LIMIT}
        
        # Setup quality metrics tracking
        self.quality_metrics = {}
        
        # Initialize error handlers
        self.error_handlers = {
            "missing_data": self._handle_missing_data,
            "outliers": self._handle_outliers,
            "invalid_sequence": self._handle_invalid_sequence
        }
        
        # Setup logging
        self.logger = setup_logging()

    def _initialize_metric_scalers(self, scaling_params: Dict) -> None:
        """Initialize specialized scalers for different health metric types."""
        try:
            for metric in SUPPORTED_METRICS:
                if metric == "blood_pressure":
                    # Specialized handling for multi-component metrics
                    self.metric_scalers[metric] = {
                        "systolic": RobustScaler(**scaling_params.get("blood_pressure", {})),
                        "diastolic": RobustScaler(**scaling_params.get("blood_pressure", {}))
                    }
                elif metric in ["heart_rate", "steps"]:
                    # Use robust scaling for metrics with potential outliers
                    self.metric_scalers[metric] = RobustScaler(**scaling_params.get(metric, {}))
                else:
                    # Standard scaling for other metrics
                    self.metric_scalers[metric] = StandardScaler(**scaling_params.get(metric, {}))
        except Exception as e:
            self.logger.error(f"Failed to initialize metric scalers: {str(e)}")
            raise RuntimeError("Metric scaler initialization failed")

    def preprocess_health_metrics(self, health_data: pd.DataFrame,
                                metric_type: str,
                                preprocessing_params: Optional[Dict] = None) -> Tuple[pd.DataFrame, Dict]:
        """Enhanced preprocessing of raw health metrics with validation and error handling."""
        try:
            # Input validation
            if not isinstance(health_data, pd.DataFrame):
                raise TypeError("Input must be a pandas DataFrame")
            if metric_type not in SUPPORTED_METRICS:
                raise ValueError(f"Unsupported metric type: {metric_type}")
            
            # Initialize quality metrics
            quality_metrics = {"metric_type": metric_type}
            
            # Check cache for existing transformations
            cache_key = f"{metric_type}_{hash(str(health_data.values.tobytes()))}"
            if cache_key in self.preprocessing_cache:
                return self.preprocessing_cache[cache_key]
            
            # Handle missing values
            processed_data = self._handle_missing_data(health_data, preprocessing_params)
            quality_metrics["missing_ratio"] = processed_data.isnull().sum().mean()
            
            # Handle outliers
            processed_data = self._handle_outliers(processed_data, metric_type)
            
            # Apply metric-specific normalization
            if metric_type == "blood_pressure":
                processed_data["systolic"] = self.metric_scalers[metric_type]["systolic"].fit_transform(
                    processed_data["systolic"].values.reshape(-1, 1)
                )
                processed_data["diastolic"] = self.metric_scalers[metric_type]["diastolic"].fit_transform(
                    processed_data["diastolic"].values.reshape(-1, 1)
                )
            else:
                numeric_columns = processed_data.select_dtypes(include=[np.number]).columns
                processed_data[numeric_columns] = self.metric_scalers[metric_type].fit_transform(
                    processed_data[numeric_columns]
                )
            
            # Update cache
            if len(self.preprocessing_cache) >= self.cache_config["max_size"]:
                self.preprocessing_cache.pop(next(iter(self.preprocessing_cache)))
            self.preprocessing_cache[cache_key] = (processed_data, quality_metrics)
            
            return processed_data, quality_metrics
            
        except Exception as e:
            self.logger.error(f"Preprocessing failed for {metric_type}: {str(e)}")
            raise

    def extract_health_features(self, health_data: pd.DataFrame,
                              metric_type: str,
                              feature_params: Optional[Dict] = None) -> Tuple[np.ndarray, Dict]:
        """Advanced feature extraction with statistical analysis and validation."""
        try:
            features = []
            feature_metadata = {}
            
            # Basic statistical features
            numeric_data = health_data.select_dtypes(include=[np.number])
            features.extend([
                numeric_data.mean(),
                numeric_data.std(),
                numeric_data.skew(),
                numeric_data.kurtosis(),
                numeric_data.quantile([0.25, 0.5, 0.75]).T.values.flatten()
            ])
            
            # Temporal features if timestamp available
            if "timestamp" in health_data.columns:
                health_data["hour"] = pd.to_datetime(health_data["timestamp"]).dt.hour
                health_data["day_of_week"] = pd.to_datetime(health_data["timestamp"]).dt.dayofweek
                
                # Calculate time-based statistics
                temporal_features = self._extract_temporal_features(health_data, metric_type)
                features.extend(temporal_features)
                feature_metadata["temporal_features"] = True
            
            # Metric-specific features
            if metric_type == "heart_rate":
                hrv_features = self._calculate_hrv_features(health_data)
                features.extend(hrv_features)
                feature_metadata["hrv_features"] = True
            elif metric_type == "blood_pressure":
                bp_features = self._calculate_bp_features(health_data)
                features.extend(bp_features)
                feature_metadata["bp_features"] = True
            
            feature_array = np.concatenate([f.reshape(-1) for f in features])
            return feature_array, feature_metadata
            
        except Exception as e:
            self.logger.error(f"Feature extraction failed: {str(e)}")
            raise

    def prepare_sequences(self, health_data: pd.DataFrame,
                         sequence_length: int = DEFAULT_SEQUENCE_LENGTH,
                         sequence_params: Optional[Dict] = None) -> Tuple[np.ndarray, np.ndarray, Dict]:
        """Enhanced sequence preparation with gap handling and validation."""
        try:
            if not isinstance(health_data, pd.DataFrame):
                raise TypeError("Input must be a pandas DataFrame")
            
            sequence_params = sequence_params or {}
            metadata = {}
            
            # Sort by timestamp
            if "timestamp" in health_data.columns:
                health_data = health_data.sort_values("timestamp")
            
            # Handle sequence gaps
            gap_threshold = sequence_params.get("max_gap", MAX_SEQUENCE_GAP)
            health_data = self._handle_sequence_gaps(health_data, gap_threshold)
            
            # Create sequences
            sequences = []
            targets = []
            
            for i in range(len(health_data) - sequence_length):
                seq = health_data.iloc[i:(i + sequence_length)]
                
                # Validate sequence continuity
                if self._validate_sequence(seq, sequence_params):
                    sequences.append(seq.values)
                    if "target" in health_data.columns:
                        targets.append(health_data.iloc[i + sequence_length]["target"])
            
            # Convert to numpy arrays
            X = np.array(sequences)
            y = np.array(targets) if targets else np.array([])
            
            metadata.update({
                "sequence_count": len(sequences),
                "sequence_length": sequence_length,
                "feature_dim": X.shape[-1] if len(X) > 0 else 0
            })
            
            return X, y, metadata
            
        except Exception as e:
            self.logger.error(f"Sequence preparation failed: {str(e)}")
            raise

    def _handle_missing_data(self, data: pd.DataFrame,
                           params: Optional[Dict] = None) -> pd.DataFrame:
        """Handle missing values with advanced imputation strategies."""
        params = params or {}
        strategy = params.get("missing_strategy", "interpolate")
        
        if strategy == "interpolate":
            return data.interpolate(method="time" if "timestamp" in data.columns else "linear")
        elif strategy == "forward_fill":
            return data.fillna(method="ffill").fillna(method="bfill")
        else:
            return data.fillna(data.mean())

    def _handle_outliers(self, data: pd.DataFrame,
                        metric_type: str) -> pd.DataFrame:
        """Handle outliers using metric-specific strategies."""
        threshold = self.validation_thresholds["outlier_threshold"]
        
        for column in data.select_dtypes(include=[np.number]).columns:
            z_scores = np.abs((data[column] - data[column].mean()) / data[column].std())
            data.loc[z_scores > threshold, column] = np.nan
        
        return self._handle_missing_data(data)

    def _validate_sequence(self, sequence: pd.DataFrame,
                         params: Dict) -> bool:
        """Validate sequence quality and continuity."""
        if sequence.isnull().sum().sum() / sequence.size > self.validation_thresholds["missing_ratio"]:
            return False
        
        if "timestamp" in sequence.columns:
            time_diffs = sequence["timestamp"].diff().dropna()
            if (time_diffs > pd.Timedelta(params.get("max_gap", MAX_SEQUENCE_GAP), unit="H")).any():
                return False
        
        return True

def validate_health_data(health_data: pd.DataFrame,
                        metric_type: str,
                        validation_config: Optional[Dict] = None) -> Tuple[bool, Dict, str]:
    """Comprehensive health data validation with detailed reporting."""
    try:
        validation_config = validation_config or {}
        validation_results = {
            "metric_type": metric_type,
            "row_count": len(health_data),
            "validation_timestamp": pd.Timestamp.now()
        }
        
        # Validate required columns
        required_columns = validation_config.get("required_columns", ["timestamp", "value"])
        missing_columns = set(required_columns) - set(health_data.columns)
        if missing_columns:
            return False, validation_results, f"Missing required columns: {missing_columns}"
        
        # Validate data types
        if "timestamp" in health_data.columns:
            if not pd.api.types.is_datetime64_any_dtype(health_data["timestamp"]):
                return False, validation_results, "Invalid timestamp format"
        
        # Validate value ranges
        numeric_columns = health_data.select_dtypes(include=[np.number]).columns
        for column in numeric_columns:
            stats = health_data[column].describe()
            validation_results[f"{column}_stats"] = {
                "mean": stats["mean"],
                "std": stats["std"],
                "min": stats["min"],
                "max": stats["max"]
            }
            
            # Check for unrealistic values
            if metric_type in HealthMetricType.__members__:
                metric_enum = HealthMetricType[metric_type.upper()]
                if not _check_value_ranges(health_data[column], metric_enum):
                    return False, validation_results, f"Invalid values detected in {column}"
        
        # Validate temporal consistency
        if "timestamp" in health_data.columns:
            if not health_data["timestamp"].is_monotonic_increasing:
                return False, validation_results, "Timestamps are not monotonically increasing"
        
        validation_results["validation_passed"] = True
        return True, validation_results, "Validation successful"
        
    except Exception as e:
        logging.error(f"Health data validation failed: {str(e)}")
        return False, {}, str(e)

def _check_value_ranges(values: pd.Series, metric_type: HealthMetricType) -> bool:
    """Check if values are within realistic ranges for the given metric type."""
    ranges = {
        HealthMetricType.HEART_RATE: (30, 220),
        HealthMetricType.BLOOD_PRESSURE: (60, 200),
        HealthMetricType.WEIGHT: (20, 300),
        HealthMetricType.STEPS: (0, 100000),
        HealthMetricType.SLEEP: (0, 24),
        HealthMetricType.ACTIVITY: (0, 100)
    }
    
    if metric_type in ranges:
        min_val, max_val = ranges[metric_type]
        return values.between(min_val, max_val).all()
    return True