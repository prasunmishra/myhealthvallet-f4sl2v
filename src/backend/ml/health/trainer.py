"""
Machine Learning Model Trainer for Health Data Analysis.
Implements GPU-optimized training pipelines for LSTM and Random Forest models
with automated hyperparameter tuning and comprehensive monitoring.

Version: 1.0.0
"""

import numpy as np  # numpy v1.23+
import pandas as pd  # pandas v2.0+
import tensorflow as tf  # tensorflow v2.13+
from sklearn.model_selection import train_test_split  # scikit-learn v1.2+
import optuna  # optuna v3.0+
from prometheus_client import Counter, Gauge, Histogram  # prometheus_client v0.17+
import mlflow  # mlflow v2.0+
from typing import Dict, Optional, Tuple, Union

from ml.health.preprocessor import HealthDataPreprocessor
from ml.utils.metrics import ModelEvaluator

# Global constants for model training
DEFAULT_LSTM_CONFIG = {
    "batch_size": 32,
    "epochs": 100,
    "early_stopping_patience": 10,
    "validation_split": 0.2,
    "gpu_memory_limit": 0.8
}

DEFAULT_RF_CONFIG = {
    "n_trials": 50,
    "cv_folds": 5,
    "scoring": "neg_mean_squared_error",
    "n_jobs": -1
}

HYPERPARAMETER_SEARCH_SPACE = {
    "lstm": {
        "units": [32, 256],
        "layers": [1, 5],
        "dropout": [0.1, 0.5],
        "learning_rate": [1e-4, 1e-2]
    },
    "rf": {
        "n_estimators": [50, 500],
        "max_depth": [5, 30],
        "min_samples_split": [2, 20]
    }
}

MONITORING_CONFIG = {
    "metrics_port": 9090,
    "log_level": "INFO",
    "enable_tracing": True
}

class ModelTrainer:
    """Enhanced base class for training health prediction models with GPU optimization and monitoring."""
    
    def __init__(self, training_config: Dict, enable_gpu: bool = True):
        """Initialize model trainer with enhanced configuration and monitoring."""
        self.training_config = training_config
        self.preprocessor = HealthDataPreprocessor()
        self.evaluator = ModelEvaluator(enable_gpu=enable_gpu)
        
        # Configure GPU settings
        if enable_gpu:
            gpus = tf.config.list_physical_devices('GPU')
            if gpus:
                try:
                    for gpu in gpus:
                        tf.config.experimental.set_memory_growth(gpu, True)
                    tf.config.experimental.set_virtual_device_configuration(
                        gpus[0],
                        [tf.config.experimental.VirtualDeviceConfiguration(
                            memory_limit=training_config.get("gpu_memory_limit", DEFAULT_LSTM_CONFIG["gpu_memory_limit"])
                        )]
                    )
                except RuntimeError as e:
                    print(f"GPU configuration error: {e}")
        
        # Initialize monitoring metrics
        self.metrics = {
            "training_duration": Histogram('model_training_duration_seconds', 'Training duration'),
            "loss_value": Gauge('model_training_loss', 'Training loss value'),
            "accuracy": Gauge('model_accuracy', 'Model accuracy'),
            "training_iterations": Counter('model_training_iterations', 'Training iterations')
        }
        
        # Initialize MLflow tracking
        mlflow.set_tracking_uri(training_config.get("mlflow_tracking_uri", "http://localhost:5000"))
        mlflow.set_experiment(training_config.get("experiment_name", "health_predictions"))

    def prepare_training_data(self, raw_data: pd.DataFrame, metric_type: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """Prepare and validate training dataset with enhanced error handling."""
        try:
            # Validate input data
            if not isinstance(raw_data, pd.DataFrame):
                raise TypeError("Input must be a pandas DataFrame")
            
            # Preprocess health metrics
            processed_data, quality_metrics = self.preprocessor.preprocess_health_metrics(
                raw_data,
                metric_type,
                preprocessing_params=self.training_config.get("preprocessing_params")
            )
            
            # Log data quality metrics
            mlflow.log_metrics(quality_metrics)
            
            # Split features and target
            X = processed_data.drop(columns=['target']).values
            y = processed_data['target'].values
            
            # Perform train-test split
            X_train, X_val, y_train, y_val = train_test_split(
                X, y,
                test_size=self.training_config.get("validation_split", DEFAULT_LSTM_CONFIG["validation_split"]),
                random_state=42,
                shuffle=True
            )
            
            return X_train, X_val, y_train, y_val
            
        except Exception as e:
            self.logger.error(f"Data preparation failed: {str(e)}")
            raise

class LSTMTrainer(ModelTrainer):
    """GPU-optimized LSTM model trainer for health predictions."""
    
    def train(self, raw_data: pd.DataFrame, metric_type: str) -> Tuple[tf.keras.Model, Dict]:
        """Train LSTM model with hyperparameter optimization and monitoring."""
        try:
            with mlflow.start_run():
                # Log training parameters
                mlflow.log_params(self.training_config)
                
                # Prepare data
                X_train, X_val, y_train, y_val = self.prepare_training_data(raw_data, metric_type)
                
                # Define hyperparameter optimization
                def objective(trial):
                    # Define model architecture
                    model = tf.keras.Sequential()
                    n_layers = trial.suggest_int('n_layers', 
                                               HYPERPARAMETER_SEARCH_SPACE["lstm"]["layers"][0],
                                               HYPERPARAMETER_SEARCH_SPACE["lstm"]["layers"][1])
                    
                    for i in range(n_layers):
                        units = trial.suggest_int(f'units_l{i}',
                                                HYPERPARAMETER_SEARCH_SPACE["lstm"]["units"][0],
                                                HYPERPARAMETER_SEARCH_SPACE["lstm"]["units"][1])
                        dropout = trial.suggest_float(f'dropout_l{i}',
                                                    HYPERPARAMETER_SEARCH_SPACE["lstm"]["dropout"][0],
                                                    HYPERPARAMETER_SEARCH_SPACE["lstm"]["dropout"][1])
                        
                        if i == 0:
                            model.add(tf.keras.layers.LSTM(units, input_shape=(X_train.shape[1:]), return_sequences=i < n_layers-1))
                        else:
                            model.add(tf.keras.layers.LSTM(units, return_sequences=i < n_layers-1))
                        model.add(tf.keras.layers.Dropout(dropout))
                    
                    model.add(tf.keras.layers.Dense(1))
                    
                    # Compile model
                    lr = trial.suggest_float('learning_rate',
                                           HYPERPARAMETER_SEARCH_SPACE["lstm"]["learning_rate"][0],
                                           HYPERPARAMETER_SEARCH_SPACE["lstm"]["learning_rate"][1],
                                           log=True)
                    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=lr),
                                loss='mse',
                                metrics=['mae'])
                    
                    # Train model
                    history = model.fit(
                        X_train, y_train,
                        batch_size=self.training_config.get("batch_size", DEFAULT_LSTM_CONFIG["batch_size"]),
                        epochs=self.training_config.get("epochs", DEFAULT_LSTM_CONFIG["epochs"]),
                        validation_data=(X_val, y_val),
                        callbacks=[
                            tf.keras.callbacks.EarlyStopping(
                                patience=self.training_config.get("early_stopping_patience",
                                                               DEFAULT_LSTM_CONFIG["early_stopping_patience"]),
                                restore_best_weights=True
                            )
                        ],
                        verbose=0
                    )
                    
                    return history.history['val_loss'][-1]
                
                # Perform hyperparameter optimization
                study = optuna.create_study(direction='minimize')
                study.optimize(objective, n_trials=self.training_config.get("n_trials", DEFAULT_RF_CONFIG["n_trials"]))
                
                # Train final model with best parameters
                best_params = study.best_params
                final_model = self._train_final_model(X_train, y_train, X_val, y_val, best_params)
                
                # Calculate and log metrics
                train_metrics = self.evaluator.calculate_regression_metrics(y_train, final_model.predict(X_train))
                val_metrics = self.evaluator.calculate_regression_metrics(y_val, final_model.predict(X_val))
                
                mlflow.log_metrics({f"train_{k}": v for k, v in train_metrics.items()})
                mlflow.log_metrics({f"val_{k}": v for k, v in val_metrics.items()})
                
                # Save model artifacts
                mlflow.tensorflow.log_model(final_model, "model")
                
                return final_model, {"train_metrics": train_metrics, "val_metrics": val_metrics}
                
        except Exception as e:
            self.logger.error(f"LSTM training failed: {str(e)}")
            raise

class RandomForestTrainer(ModelTrainer):
    """Enhanced Random Forest model trainer for health predictions."""
    
    def train(self, raw_data: pd.DataFrame, metric_type: str) -> Tuple[object, Dict]:
        """Train Random Forest model with hyperparameter optimization and monitoring."""
        try:
            with mlflow.start_run():
                # Log training parameters
                mlflow.log_params(self.training_config)
                
                # Prepare data
                X_train, X_val, y_train, y_val = self.prepare_training_data(raw_data, metric_type)
                
                # Define hyperparameter optimization
                def objective(trial):
                    params = {
                        "n_estimators": trial.suggest_int("n_estimators",
                                                        HYPERPARAMETER_SEARCH_SPACE["rf"]["n_estimators"][0],
                                                        HYPERPARAMETER_SEARCH_SPACE["rf"]["n_estimators"][1]),
                        "max_depth": trial.suggest_int("max_depth",
                                                     HYPERPARAMETER_SEARCH_SPACE["rf"]["max_depth"][0],
                                                     HYPERPARAMETER_SEARCH_SPACE["rf"]["max_depth"][1]),
                        "min_samples_split": trial.suggest_int("min_samples_split",
                                                             HYPERPARAMETER_SEARCH_SPACE["rf"]["min_samples_split"][0],
                                                             HYPERPARAMETER_SEARCH_SPACE["rf"]["min_samples_split"][1])
                    }
                    
                    model = RandomForestRegressor(**params)
                    scores = cross_val_score(
                        model, X_train, y_train,
                        cv=self.training_config.get("cv_folds", DEFAULT_RF_CONFIG["cv_folds"]),
                        scoring=self.training_config.get("scoring", DEFAULT_RF_CONFIG["scoring"]),
                        n_jobs=self.training_config.get("n_jobs", DEFAULT_RF_CONFIG["n_jobs"])
                    )
                    
                    return scores.mean()
                
                # Perform hyperparameter optimization
                study = optuna.create_study(direction='maximize')
                study.optimize(objective, n_trials=self.training_config.get("n_trials", DEFAULT_RF_CONFIG["n_trials"]))
                
                # Train final model with best parameters
                final_model = RandomForestRegressor(**study.best_params)
                final_model.fit(X_train, y_train)
                
                # Calculate and log metrics
                train_metrics = self.evaluator.calculate_regression_metrics(y_train, final_model.predict(X_train))
                val_metrics = self.evaluator.calculate_regression_metrics(y_val, final_model.predict(X_val))
                
                mlflow.log_metrics({f"train_{k}": v for k, v in train_metrics.items()})
                mlflow.log_metrics({f"val_{k}": v for k, v in val_metrics.items()})
                
                # Save model artifacts
                mlflow.sklearn.log_model(final_model, "model")
                
                return final_model, {"train_metrics": train_metrics, "val_metrics": val_metrics}
                
        except Exception as e:
            self.logger.error(f"Random Forest training failed: {str(e)}")
            raise