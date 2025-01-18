import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ChartData } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useA11y } from '@react-aria/focus';

import { MetricDataPoint, ChartConfiguration } from '../../types/analytics.types';
import { healthMetricsChartConfig } from '../../config/chart.config';
import { useHealth } from '../../hooks/useHealth';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface HealthMetricsChartProps {
  config: ChartConfiguration;
  timeRange: {
    startDate: Date;
    endDate: Date;
  };
  onTimeRangeChange: (range: { startDate: Date; endDate: Date }) => void;
}

export const HealthMetricsChart: React.FC<HealthMetricsChartProps> = ({
  config,
  timeRange,
  onTimeRangeChange
}) => {
  // Refs for chart and focus management
  const chartRef = useRef<ChartJS>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { focusProps } = useA11y({ label: 'Health Metrics Chart' });

  // State management
  const [chartData, setChartData] = useState<ChartData<'line'>>({ datasets: [] });
  const { metrics, loading } = useHealth();

  /**
   * Formats metric data points for chart consumption with accessibility enhancements
   */
  const formatChartData = useCallback((metrics: MetricDataPoint[]): ChartData<'line'> => {
    const datasets = config.selectedMetrics.map(metricType => {
      const metricData = metrics.filter(m => m.metricType === metricType);
      const color = healthMetricsChartConfig.options.plugins?.datasets?.[metricType]?.borderColor || '#2196F3';

      return {
        label: metricType,
        data: metricData.map(m => ({
          x: m.timestamp,
          y: m.value,
          metadata: {
            unit: m.unit,
            quality: m.dataQuality
          }
        })),
        borderColor: color,
        backgroundColor: color,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        borderWidth: 2,
        fill: false,
        // Accessibility attributes
        segment: {
          borderColor: ctx => getSegmentColor(ctx, metricType),
        },
        parsing: {
          xAxisKey: 'x',
          yAxisKey: 'y'
        }
      };
    });

    return {
      datasets
    };
  }, [config.selectedMetrics]);

  /**
   * Handles keyboard navigation through chart data points
   */
  const handleKeyboardNavigation = useCallback((event: KeyboardEvent) => {
    if (!chartRef.current) return;

    const chart = chartRef.current;
    const activeElements = chart.getActiveElements();
    const currentIndex = activeElements[0]?.index || 0;

    switch (event.key) {
      case 'ArrowRight':
        chart.setActiveElements([{ datasetIndex: 0, index: currentIndex + 1 }]);
        break;
      case 'ArrowLeft':
        chart.setActiveElements([{ datasetIndex: 0, index: Math.max(0, currentIndex - 1) }]);
        break;
      case 'Enter':
        if (activeElements.length) {
          announceDataPoint(activeElements[0]);
        }
        break;
    }
    chart.update();
  }, []);

  /**
   * Announces data point details to screen readers
   */
  const announceDataPoint = (element: { datasetIndex: number; index: number }) => {
    if (!chartRef.current) return;

    const chart = chartRef.current;
    const dataset = chart.data.datasets[element.datasetIndex];
    const dataPoint = dataset.data[element.index];
    const announcement = `${dataset.label}: ${dataPoint.y} ${dataPoint.metadata.unit} at ${new Date(dataPoint.x).toLocaleString()}`;
    
    const liveRegion = document.getElementById('chart-live-region');
    if (liveRegion) {
      liveRegion.textContent = announcement;
    }
  };

  /**
   * Gets segment color based on data quality
   */
  const getSegmentColor = (ctx: any, metricType: string) => {
    if (!ctx.p0.parsed || !ctx.p1.parsed) return;
    
    const dataQuality = ctx.p0.raw.metadata.quality.accuracy;
    const baseColor = healthMetricsChartConfig.options.plugins?.datasets?.[metricType]?.borderColor;
    
    return dataQuality < 0.8 ? `${baseColor}80` : baseColor;
  };

  // Initialize chart data when metrics change
  useEffect(() => {
    if (!loading && metrics.length) {
      const filteredMetrics = metrics.filter(metric => 
        metric.timestamp >= timeRange.startDate &&
        metric.timestamp <= timeRange.endDate
      );
      setChartData(formatChartData(filteredMetrics));
    }
  }, [metrics, loading, timeRange, formatChartData]);

  // Set up keyboard navigation
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyboardNavigation);
      return () => container.removeEventListener('keydown', handleKeyboardNavigation);
    }
  }, [handleKeyboardNavigation]);

  if (loading) {
    return <div aria-busy="true">Loading health metrics chart...</div>;
  }

  return (
    <div 
      ref={containerRef}
      {...focusProps}
      tabIndex={0}
      role="figure"
      aria-label="Interactive health metrics chart"
    >
      <div id="chart-live-region" className="sr-only" aria-live="polite" />
      <Line
        ref={chartRef}
        data={chartData}
        options={{
          ...healthMetricsChartConfig.options,
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            ...healthMetricsChartConfig.options.plugins,
            tooltip: {
              ...healthMetricsChartConfig.options.plugins?.tooltip,
              callbacks: {
                label: (context) => {
                  const dataPoint = context.raw as any;
                  return `${context.dataset.label}: ${dataPoint.y} ${dataPoint.metadata.unit}`;
                }
              }
            }
          },
          scales: {
            x: {
              type: 'time',
              time: {
                unit: 'day',
                displayFormats: {
                  day: 'MMM d'
                }
              },
              title: {
                display: true,
                text: 'Date'
              }
            },
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Value'
              }
            }
          }
        }}
      />
    </div>
  );
};

export default HealthMetricsChart;