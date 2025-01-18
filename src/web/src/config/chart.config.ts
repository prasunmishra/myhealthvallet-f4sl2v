/**
 * Chart.js configuration for health metrics visualization
 * Provides theme-aware, accessible, and interactive chart configurations
 * @version 1.0.0
 */

import { ChartConfiguration, ChartOptions } from 'chart.js'; // version: 4.3.0
import { METRIC_TYPES } from '../types/analytics.types';
import { Theme } from '../styles/theme';

// Global chart configuration constants
const DEFAULT_CHART_FONT_FAMILY = "'Roboto', 'SF Pro', sans-serif";
const DEFAULT_CHART_FONT_SIZE = 14;
const DEFAULT_CHART_ANIMATION_DURATION = 750;
const DEFAULT_CHART_DECIMATION_THRESHOLD = 1000;

// Health metric-specific colors
const CHART_COLORS = {
  heartRate: '#FF6384',
  bloodPressure: '#36A2EB',
  bloodGlucose: '#4CAF50',
  steps: '#FFA726',
  sleep: '#9C27B0',
  weight: '#607D8B'
} as const;

// Accessibility configuration
const CHART_ACCESSIBILITY_CONFIG = {
  describedBy: 'chart-description',
  labelledBy: 'chart-title',
  keyboardNavigation: true,
  screenReaderDescription: true
} as const;

/**
 * Generates theme-aware default chart options with accessibility features
 * @param theme - Current application theme
 * @returns ChartOptions configuration
 */
export const getDefaultChartOptions = (theme: Theme): ChartOptions => {
  return {
    responsive: true,
    maintainAspectRatio: false,
    
    // Animation configuration
    animation: {
      duration: DEFAULT_CHART_ANIMATION_DURATION,
      easing: theme.transitions.easing.easeInOut
    },
    
    // Interaction configuration
    interaction: {
      mode: 'index',
      intersect: false,
      includeInvisible: false
    },
    
    // Hover configuration
    hover: {
      mode: 'nearest',
      intersect: true,
      animationDuration: 150
    },
    
    // Plugin configuration
    plugins: {
      legend: {
        position: 'top',
        align: 'start',
        labels: {
          font: {
            family: theme.typography.fontFamilies.primary,
            size: DEFAULT_CHART_FONT_SIZE,
            weight: theme.typography.fontWeights.medium
          },
          color: theme.colors.text[500],
          padding: theme.spacing.BASE
        }
      },
      tooltip: {
        enabled: true,
        mode: 'index',
        backgroundColor: theme.colors.surface[200],
        titleColor: theme.colors.text[500],
        bodyColor: theme.colors.text[400],
        borderColor: theme.colors.surface[300],
        borderWidth: 1,
        padding: theme.spacing.BASE,
        cornerRadius: theme.shape.borderRadius.sm,
        titleFont: {
          family: theme.typography.fontFamilies.primary,
          weight: theme.typography.fontWeights.semibold
        },
        bodyFont: {
          family: theme.typography.fontFamilies.primary,
          weight: theme.typography.fontWeights.regular
        }
      },
      decimation: {
        enabled: true,
        algorithm: 'min-max',
        threshold: DEFAULT_CHART_DECIMATION_THRESHOLD
      }
    },
    
    // Scale configuration
    scales: {
      x: {
        grid: {
          color: theme.colors.surface[300],
          drawBorder: false
        },
        ticks: {
          color: theme.colors.text[400],
          font: {
            family: theme.typography.fontFamilies.primary,
            size: DEFAULT_CHART_FONT_SIZE
          }
        }
      },
      y: {
        grid: {
          color: theme.colors.surface[300],
          drawBorder: false
        },
        ticks: {
          color: theme.colors.text[400],
          font: {
            family: theme.typography.fontFamilies.primary,
            size: DEFAULT_CHART_FONT_SIZE
          }
        },
        beginAtZero: true
      }
    }
  };
};

/**
 * Default chart configuration for health metrics visualization
 */
export const healthMetricsChartConfig: ChartConfiguration = {
  type: 'line',
  options: {
    ...getDefaultChartOptions(defaultTheme),
    parsing: {
      xAxisKey: 'timestamp',
      yAxisKey: 'value'
    },
    elements: {
      line: {
        tension: 0.4,
        borderWidth: 2,
        fill: false
      },
      point: {
        radius: 3,
        hitRadius: 8,
        hoverRadius: 6
      }
    }
  }
};

/**
 * Enhanced chart configuration for trend analysis
 */
export const trendChartConfig: ChartConfiguration = {
  type: 'line',
  options: {
    ...getDefaultChartOptions(defaultTheme),
    elements: {
      line: {
        tension: 0.1,
        borderWidth: 2,
        fill: true,
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return null;
          
          const gradient = ctx.createLinearGradient(
            0,
            chartArea.bottom,
            0,
            chartArea.top
          );
          gradient.addColorStop(0, 'rgba(33, 150, 243, 0.1)');
          gradient.addColorStop(1, 'rgba(33, 150, 243, 0.4)');
          return gradient;
        }
      }
    },
    scales: {
      y: {
        stacked: false,
        ticks: {
          callback: (value) => {
            return typeof value === 'number' ? value.toFixed(1) : value;
          }
        }
      }
    },
    plugins: {
      annotation: {
        annotations: {
          line1: {
            type: 'line',
            yMin: 0,
            yMax: 0,
            borderColor: 'rgba(0, 0, 0, 0.1)',
            borderWidth: 1,
            borderDash: [6, 6]
          }
        }
      }
    }
  }
};