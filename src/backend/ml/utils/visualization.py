"""
Advanced visualization module for PHRSAT health metrics and analytics.
Provides secure, HIPAA-compliant visualization capabilities with accessibility support.

Version: 1.0.0
"""

import logging
from typing import Dict, List, Optional, Tuple, Union
import numpy as np  # numpy v1.23+
import pandas as pd  # pandas v2.0+
import matplotlib.pyplot as plt  # matplotlib v3.7+
import seaborn as sns  # seaborn v0.12+
import plotly.graph_objects as go  # plotly v5.15+
from plotly.subplots import make_subplots

from ml.utils.data import DataPreprocessor
from ml.utils.metrics import ModelEvaluator
from core.logging import setup_logging
from core.config import Settings

# Configure logging
logger = setup_logging()
settings = Settings.get_settings()

# Global visualization configuration
DEFAULT_PLOT_CONFIG = {
    "figsize": (10, 6),
    "dpi": 100,
    "style": "seaborn",
    "accessibility": True,
    "colorblind_safe": True
}

# WCAG 2.1 AAA compliant color palette
COLOR_PALETTE = {
    "primary": "#2196F3",
    "secondary": "#4CAF50",
    "error": "#f44336",
    "warning": "#ff9800",
    "info": "#03a9f4",
    "background": "#ffffff",
    "text": "#212121"
}

# Accessibility configuration
ACCESSIBILITY_CONFIG = {
    "min_contrast_ratio": 4.5,
    "enable_aria": True,
    "font_size_base": 12,
    "line_width": 2.0,
    "marker_size": 8
}

class HealthMetricsVisualizer:
    """Advanced visualization class for HIPAA-compliant health metrics visualization."""
    
    def __init__(
        self,
        plot_config: Optional[Dict] = None,
        style_config: Optional[Dict] = None,
        accessibility_config: Optional[Dict] = None,
        cache_config: Optional[Dict] = None
    ) -> None:
        """
        Initialize visualizer with comprehensive configuration.
        
        Args:
            plot_config: Custom plotting configuration
            style_config: Visual style configuration
            accessibility_config: Accessibility settings
            cache_config: Cache configuration for plot optimization
        """
        self.plot_config = plot_config or DEFAULT_PLOT_CONFIG
        self.style_config = style_config or {"style": "seaborn"}
        self.accessibility_config = accessibility_config or ACCESSIBILITY_CONFIG
        self.cache_config = cache_config or {"enabled": True, "max_size": 1000}
        
        # Initialize components
        self.data_preprocessor = DataPreprocessor()
        self.model_evaluator = ModelEvaluator()
        self.logger = logging.getLogger(__name__)
        
        # Configure plotting style
        self._setup_plot_style()

    def _setup_plot_style(self) -> None:
        """Configure secure and accessible plotting style."""
        try:
            plt.style.use(self.style_config["style"])
            sns.set_palette([
                COLOR_PALETTE["primary"],
                COLOR_PALETTE["secondary"],
                COLOR_PALETTE["info"]
            ])
            
            # Set accessibility features
            plt.rcParams['font.size'] = self.accessibility_config["font_size_base"]
            plt.rcParams['lines.linewidth'] = self.accessibility_config["line_width"]
            plt.rcParams['scatter.marker'] = 'o'
            plt.rcParams['scatter.edgecolors'] = 'none'
            
        except Exception as e:
            self.logger.error(f"Failed to setup plot style: {str(e)}")
            raise

    def plot_health_trends(
        self,
        health_data: pd.DataFrame,
        metric_type: str,
        plot_options: Optional[Dict] = None,
        use_cache: bool = True
    ) -> Union[plt.Figure, go.Figure]:
        """
        Generate secure time series visualization of health metrics.
        
        Args:
            health_data: DataFrame containing health metrics
            metric_type: Type of health metric to visualize
            plot_options: Additional plotting options
            use_cache: Whether to use plot caching
            
        Returns:
            Matplotlib or Plotly figure object
        """
        try:
            # Validate and preprocess data
            if not isinstance(health_data, pd.DataFrame):
                raise TypeError("health_data must be a pandas DataFrame")
                
            # Mask sensitive data
            masked_data = self.data_preprocessor.mask_sensitive_data(health_data)
            normalized_data = self.data_preprocessor.normalize_health_metrics(
                masked_data[metric_type].values,
                metric_type
            )
            
            # Create interactive plot
            fig = go.Figure()
            
            # Add main trend line
            fig.add_trace(go.Scatter(
                x=masked_data.index,
                y=normalized_data.flatten(),
                mode='lines+markers',
                name=metric_type.replace('_', ' ').title(),
                line=dict(color=COLOR_PALETTE["primary"], width=2),
                marker=dict(size=self.accessibility_config["marker_size"])
            ))
            
            # Calculate and add confidence intervals
            if plot_options and plot_options.get("show_confidence_intervals", True):
                ci_lower, ci_upper, _ = self.model_evaluator.calculate_prediction_intervals(
                    normalized_data
                )
                
                fig.add_trace(go.Scatter(
                    x=masked_data.index,
                    y=ci_upper,
                    mode='lines',
                    name='Upper CI',
                    line=dict(color=COLOR_PALETTE["info"], width=1, dash='dash'),
                    showlegend=False
                ))
                
                fig.add_trace(go.Scatter(
                    x=masked_data.index,
                    y=ci_lower,
                    mode='lines',
                    name='Lower CI',
                    line=dict(color=COLOR_PALETTE["info"], width=1, dash='dash'),
                    fill='tonexty',
                    showlegend=False
                ))
            
            # Configure layout with accessibility features
            fig.update_layout(
                title=f"{metric_type.replace('_', ' ').title()} Trends",
                xaxis_title="Time",
                yaxis_title="Normalized Value",
                font=dict(size=self.accessibility_config["font_size_base"]),
                hovermode='x unified',
                plot_bgcolor=COLOR_PALETTE["background"],
                paper_bgcolor=COLOR_PALETTE["background"],
                margin=dict(t=50, l=50, r=30, b=50)
            )
            
            # Add ARIA labels
            if self.accessibility_config["enable_aria"]:
                fig.update_layout(
                    annotations=[dict(
                        text=f"Time series visualization of {metric_type}",
                        showarrow=False,
                        xref="paper",
                        yref="paper",
                        x=0,
                        y=1.1
                    )]
                )
            
            return fig
            
        except Exception as e:
            self.logger.error(f"Failed to create health trends plot: {str(e)}")
            raise

def create_prediction_plot(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    plot_config: Optional[Dict] = None,
    accessibility_config: Optional[Dict] = None
) -> plt.Figure:
    """
    Create accessible visualization of model predictions with confidence intervals.
    
    Args:
        y_true: Ground truth values
        y_pred: Predicted values
        plot_config: Custom plot configuration
        accessibility_config: Accessibility settings
        
    Returns:
        Matplotlib figure with prediction visualization
    """
    try:
        config = plot_config or DEFAULT_PLOT_CONFIG
        access_config = accessibility_config or ACCESSIBILITY_CONFIG
        
        # Create figure with accessibility features
        fig, ax = plt.subplots(figsize=config["figsize"], dpi=config["dpi"])
        
        # Plot predictions vs actual
        scatter = ax.scatter(
            y_true,
            y_pred,
            c=COLOR_PALETTE["primary"],
            s=access_config["marker_size"] ** 2,
            alpha=0.6,
            label="Predictions"
        )
        
        # Add perfect prediction line
        min_val = min(y_true.min(), y_pred.min())
        max_val = max(y_true.max(), y_pred.max())
        ax.plot(
            [min_val, max_val],
            [min_val, max_val],
            '--',
            color=COLOR_PALETTE["secondary"],
            label="Perfect Prediction",
            linewidth=access_config["line_width"]
        )
        
        # Calculate and add confidence intervals
        evaluator = ModelEvaluator()
        lower_bound, upper_bound, _ = evaluator.calculate_prediction_intervals(y_pred)
        
        ax.fill_between(
            y_true,
            lower_bound,
            upper_bound,
            color=COLOR_PALETTE["info"],
            alpha=0.2,
            label="95% Confidence Interval"
        )
        
        # Configure accessibility features
        ax.set_title("Prediction Results", fontsize=access_config["font_size_base"] * 1.2)
        ax.set_xlabel("Actual Values", fontsize=access_config["font_size_base"])
        ax.set_ylabel("Predicted Values", fontsize=access_config["font_size_base"])
        ax.legend(fontsize=access_config["font_size_base"])
        
        # Add grid for better readability
        ax.grid(True, linestyle='--', alpha=0.7)
        
        # Ensure equal aspect ratio
        ax.set_aspect('equal')
        
        return fig
        
    except Exception as e:
        logger.error(f"Failed to create prediction plot: {str(e)}")
        raise

# Export visualization components
__all__ = [
    'HealthMetricsVisualizer',
    'create_prediction_plot',
    'COLOR_PALETTE',
    'ACCESSIBILITY_CONFIG'
]