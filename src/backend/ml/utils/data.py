"""
Core data preprocessing and preparation utilities for machine learning models.
Provides base functionality for health metrics and document data processing
with enhanced error handling, type safety, and performance optimizations.

Version: 1.0.0
"""

import logging
from typing import Dict, List, Optional, Tuple, Union
import numpy as np  # numpy v1.23+
import pandas as pd  # pandas v2.0+
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler  # scikit-learn v1.2+

from core.logging import setup_logging
from core.config import Settings

# Configure logging
logger = setup_logging()
settings = Settings.get_settings()

# Global constants
SUPPORTED_METRIC_TYPES = ["heart_rate", "blood_pressure", "steps", "weight", "sleep", "activity"]
DEFAULT_SEQUENCE_LENGTH = 24
OUTLIER_THRESHOLD = 3.0
DEFAULT_MISSING_STRATEGY = "forward_fill"
DATA_QUALITY_THRESHOLDS = {
    "missing_ratio": 0.1,
    "outlier_ratio": 0.05,
    "correlation_threshold": 0.95
}

class DataPreprocessor:
    """Base class for data preprocessing operations with enhanced error handling and type safety."""
    
    def __init__(self, config: Optional[Dict] = None) -> None:
        """Initialize data preprocessor with configuration and setup monitoring."""
        self.scalers: Dict[str, Union[StandardScaler, MinMaxScaler, RobustScaler]] = {}
        self.transformers: Dict[str, callable] = {}
        self.config = config or {}
        self.data_quality_metrics: Dict[str, float] = {}
        
        # Initialize logging
        self.logger = logging.getLogger(__name__)
        
        # Setup metric-specific scalers
        self._initialize_scalers()

    def _initialize_scalers(self) -> None:
        """Initialize scalers for different metric types with validation."""
        try:
            for metric_type in SUPPORTED_METRIC_TYPES:
                if metric_type in ["heart_rate", "steps"]:
                    self.scalers[metric_type] = RobustScaler()
                elif metric_type == "blood_pressure":
                    self.scalers[metric_type] = MinMaxScaler()
                else:
                    self.scalers[metric_type] = StandardScaler()
        except Exception as e:
            self.logger.error(f"Failed to initialize scalers: {str(e)}")
            raise RuntimeError("Scaler initialization failed")

    def normalize_health_metrics(self, data: np.ndarray, metric_type: str) -> np.ndarray:
        """Normalize health metric values with enhanced validation."""
        try:
            # Input validation
            if not isinstance(data, np.ndarray):
                raise TypeError("Input data must be a numpy array")
            if metric_type not in SUPPORTED_METRIC_TYPES:
                raise ValueError(f"Unsupported metric type: {metric_type}")
            
            # Handle missing values
            if np.isnan(data).any():
                self.logger.warning(f"Missing values detected in {metric_type} data")
                data = np.nan_to_num(data, nan=np.nanmean(data))
            
            # Apply scaling
            scaler = self.scalers[metric_type]
            if len(data.shape) == 1:
                data = data.reshape(-1, 1)
            
            normalized_data = scaler.fit_transform(data)
            
            # Quality check
            self.data_quality_metrics[f"{metric_type}_range"] = np.ptp(normalized_data)
            
            return normalized_data
            
        except Exception as e:
            self.logger.error(f"Normalization failed for {metric_type}: {str(e)}")
            raise

    def prepare_time_series(self, df: pd.DataFrame, sequence_length: int = DEFAULT_SEQUENCE_LENGTH,
                          target_column: str = None) -> Tuple[np.ndarray, np.ndarray]:
        """Prepare time series data with sequence validation."""
        try:
            # Validate inputs
            if not isinstance(df, pd.DataFrame):
                raise TypeError("Input must be a pandas DataFrame")
            if sequence_length < 1:
                raise ValueError("Sequence length must be positive")
            
            # Sort by timestamp
            if 'timestamp' in df.columns:
                df = df.sort_values('timestamp')
            
            # Handle missing values
            missing_ratio = df.isnull().sum().mean() / len(df)
            self.data_quality_metrics['missing_ratio'] = missing_ratio
            
            if missing_ratio > DATA_QUALITY_THRESHOLDS['missing_ratio']:
                self.logger.warning(f"High missing value ratio: {missing_ratio:.2f}")
            
            df = df.fillna(method=DEFAULT_MISSING_STRATEGY)
            
            # Create sequences
            sequences = []
            targets = []
            
            for i in range(len(df) - sequence_length):
                seq = df.iloc[i:(i + sequence_length)].values
                if target_column:
                    target = df[target_column].iloc[i + sequence_length]
                    targets.append(target)
                sequences.append(seq)
            
            X = np.array(sequences)
            y = np.array(targets) if targets else np.array([])
            
            return X, y
            
        except Exception as e:
            self.logger.error(f"Time series preparation failed: {str(e)}")
            raise

def clean_data(df: pd.DataFrame, cleaning_params: Dict) -> pd.DataFrame:
    """Clean input data with comprehensive validation."""
    try:
        # Validate input
        if not isinstance(df, pd.DataFrame):
            raise TypeError("Input must be a pandas DataFrame")
        
        # Remove duplicates
        initial_rows = len(df)
        df = df.drop_duplicates()
        duplicate_ratio = (initial_rows - len(df)) / initial_rows
        
        # Handle missing values
        strategy = cleaning_params.get('missing_strategy', DEFAULT_MISSING_STRATEGY)
        df = df.fillna(method=strategy)
        
        # Remove outliers
        if cleaning_params.get('remove_outliers', True):
            for column in df.select_dtypes(include=[np.number]).columns:
                z_scores = np.abs((df[column] - df[column].mean()) / df[column].std())
                df = df[z_scores < OUTLIER_THRESHOLD]
        
        # Validate data quality
        quality_metrics = {
            'duplicate_ratio': duplicate_ratio,
            'missing_ratio': df.isnull().sum().mean() / len(df),
            'row_count': len(df)
        }
        
        logger.info(f"Data cleaning completed: {quality_metrics}")
        return df
        
    except Exception as e:
        logger.error(f"Data cleaning failed: {str(e)}")
        raise

def create_feature_matrix(df: pd.DataFrame, feature_columns: List[str]) -> np.ndarray:
    """Create optimized feature matrix for model training."""
    try:
        # Validate inputs
        if not all(col in df.columns for col in feature_columns):
            missing_cols = set(feature_columns) - set(df.columns)
            raise ValueError(f"Missing columns: {missing_cols}")
        
        # Select features
        feature_df = df[feature_columns].copy()
        
        # Handle categorical variables
        categorical_columns = feature_df.select_dtypes(include=['object']).columns
        for col in categorical_columns:
            feature_df[col] = pd.Categorical(feature_df[col]).codes
        
        # Convert to numpy array
        feature_matrix = feature_df.values
        
        # Check for multicollinearity
        if len(feature_columns) > 1:
            correlation_matrix = np.corrcoef(feature_matrix.T)
            high_correlation = np.abs(correlation_matrix) > DATA_QUALITY_THRESHOLDS['correlation_threshold']
            if high_correlation.any():
                logger.warning("High correlation detected between features")
        
        return feature_matrix
        
    except Exception as e:
        logger.error(f"Feature matrix creation failed: {str(e)}")
        raise

# Export components
__all__ = [
    'DataPreprocessor',
    'clean_data',
    'create_feature_matrix'
]