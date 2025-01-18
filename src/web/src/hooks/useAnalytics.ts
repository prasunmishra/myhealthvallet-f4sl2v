/**
 * @fileoverview Custom React hook for managing health analytics state and operations
 * @version 1.0.0
 * 
 * Provides comprehensive functionality for:
 * - Real-time health metric data management
 * - ML-powered trend analysis
 * - Advanced caching and performance optimization
 * - WebSocket-based live updates
 */

import { useState, useEffect, useCallback, useRef } from 'react'; // version: ^18.0.0
import { debounce } from 'lodash'; // version: ^4.17.21

import { AnalyticsService } from '../services/analytics.service';
import {
  MetricDataPoint,
  AnalyticsState,
  TrendAnalysis,
  ChartConfiguration,
  AnalyticsTimeRange,
  ValidationStatus
} from '../types/analytics.types';
import { METRIC_TYPES, TIME_RANGES, ANALYSIS_THRESHOLDS, DEFAULT_TIME_RANGE } from '../constants/analytics.constants';

interface AnalyticsOptions {
  enableRealTimeUpdates?: boolean;
  cacheTimeout?: number;
  retryAttempts?: number;
  confidenceThreshold?: number;
  autoRefreshInterval?: number;
}

interface AnalyticsActions {
  fetchMetricData: (metricType: METRIC_TYPES, timeRange: AnalyticsTimeRange) => Promise<void>;
  analyzeTrends: (metrics: MetricDataPoint[]) => Promise<TrendAnalysis>;
  updateTimeRange: (timeRange: AnalyticsTimeRange) => void;
  toggleMetric: (metricType: METRIC_TYPES) => void;
  updateChartConfig: (config: Partial<ChartConfiguration>) => void;
  exportData: (format: 'csv' | 'json' | 'pdf') => Promise<Blob>;
  clearCache: () => void;
}

interface AnalyticsUtils {
  isLoading: boolean;
  hasError: boolean;
  getFilteredMetrics: (filters?: Record<string, any>) => MetricDataPoint[];
  calculateMetricStats: (metricType: METRIC_TYPES) => { min: number; max: number; avg: number };
}

const DEFAULT_OPTIONS: AnalyticsOptions = {
  enableRealTimeUpdates: true,
  cacheTimeout: 5 * 60 * 1000, // 5 minutes
  retryAttempts: 3,
  confidenceThreshold: ANALYSIS_THRESHOLDS.TREND_CONFIDENCE_THRESHOLD,
  autoRefreshInterval: 30000 // 30 seconds
};

export function useAnalytics(
  initialMetricType?: METRIC_TYPES,
  initialTimeRange?: AnalyticsTimeRange,
  options: AnalyticsOptions = {}
) {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const analyticsService = useRef(new AnalyticsService());
  const wsSubscriptions = useRef<Array<() => void>>([]);

  // Initialize state
  const [state, setState] = useState<AnalyticsState>({
    loading: false,
    error: null,
    timeRange: initialTimeRange || {
      type: DEFAULT_TIME_RANGE,
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      endDate: new Date()
    },
    metrics: [],
    selectedMetrics: new Set(initialMetricType ? [initialMetricType] : []),
    trends: [],
    chartConfig: {
      type: 'line',
      selectedMetrics: [],
      showLegend: true,
      enableZoom: true,
      yAxisScale: 'linear',
      aggregationType: 'none'
    },
    lastUpdated: new Date(),
    refreshInterval: mergedOptions.autoRefreshInterval
  });

  // Cache management
  const cache = useRef<Map<string, { data: MetricDataPoint[]; timestamp: number }>>(new Map());

  // Debounced fetch function
  const debouncedFetch = useCallback(
    debounce(async (metricType: METRIC_TYPES, timeRange: AnalyticsTimeRange) => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        const data = await analyticsService.current.getMetricData(metricType, timeRange);
        setState(prev => ({
          ...prev,
          loading: false,
          metrics: [...prev.metrics, ...data].filter(
            (metric, index, self) =>
              index === self.findIndex(m => m.timestamp.getTime() === metric.timestamp.getTime())
          ),
          lastUpdated: new Date()
        }));
      } catch (error) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to fetch metric data'
        }));
      }
    }, 300),
    []
  );

  // Initialize WebSocket subscriptions
  useEffect(() => {
    if (mergedOptions.enableRealTimeUpdates) {
      state.selectedMetrics.forEach(metricType => {
        const subscription = analyticsService.current.subscribeToMetricUpdates(metricType)
          .subscribe({
            next: (newMetric: MetricDataPoint) => {
              setState(prev => ({
                ...prev,
                metrics: [...prev.metrics, newMetric]
                  .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
              }));
            },
            error: (error) => {
              console.error('WebSocket error:', error);
            }
          });

        wsSubscriptions.current.push(() => subscription.unsubscribe());
      });
    }

    return () => {
      wsSubscriptions.current.forEach(unsubscribe => unsubscribe());
      wsSubscriptions.current = [];
    };
  }, [state.selectedMetrics, mergedOptions.enableRealTimeUpdates]);

  // Actions
  const actions: AnalyticsActions = {
    fetchMetricData: async (metricType: METRIC_TYPES, timeRange: AnalyticsTimeRange) => {
      const cacheKey = `${metricType}_${timeRange.startDate.getTime()}_${timeRange.endDate.getTime()}`;
      const cachedData = cache.current.get(cacheKey);

      if (cachedData && Date.now() - cachedData.timestamp < mergedOptions.cacheTimeout!) {
        setState(prev => ({
          ...prev,
          metrics: cachedData.data,
          lastUpdated: new Date(cachedData.timestamp)
        }));
        return;
      }

      await debouncedFetch(metricType, timeRange);
    },

    analyzeTrends: async (metrics: MetricDataPoint[]) => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        const analysis = await analyticsService.current.analyzeTrends(metrics);
        setState(prev => ({
          ...prev,
          loading: false,
          trends: [...prev.trends, analysis]
        }));
        return analysis;
      } catch (error) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to analyze trends'
        }));
        throw error;
      }
    },

    updateTimeRange: (timeRange: AnalyticsTimeRange) => {
      setState(prev => ({ ...prev, timeRange }));
      state.selectedMetrics.forEach(metricType => {
        actions.fetchMetricData(metricType, timeRange);
      });
    },

    toggleMetric: (metricType: METRIC_TYPES) => {
      setState(prev => {
        const newSelectedMetrics = new Set(prev.selectedMetrics);
        if (newSelectedMetrics.has(metricType)) {
          newSelectedMetrics.delete(metricType);
        } else {
          newSelectedMetrics.add(metricType);
        }
        return { ...prev, selectedMetrics: newSelectedMetrics };
      });
    },

    updateChartConfig: (config: Partial<ChartConfiguration>) => {
      setState(prev => ({
        ...prev,
        chartConfig: { ...prev.chartConfig, ...config }
      }));
    },

    exportData: async (format: 'csv' | 'json' | 'pdf') => {
      try {
        setState(prev => ({ ...prev, loading: true, error: null }));
        const blob = await analyticsService.current.exportAnalytics(
          Array.from(state.selectedMetrics),
          state.timeRange,
          format
        );
        setState(prev => ({ ...prev, loading: false }));
        return blob;
      } catch (error) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Failed to export data'
        }));
        throw error;
      }
    },

    clearCache: () => {
      cache.current.clear();
      setState(prev => ({ ...prev, metrics: [], lastUpdated: new Date() }));
    }
  };

  // Utility functions
  const utils: AnalyticsUtils = {
    isLoading: state.loading,
    hasError: !!state.error,

    getFilteredMetrics: (filters?: Record<string, any>) => {
      let filteredMetrics = state.metrics;

      if (filters) {
        if (filters.validationStatus) {
          filteredMetrics = filteredMetrics.filter(
            metric => metric.validationStatus === filters.validationStatus
          );
        }
        if (filters.confidenceThreshold) {
          filteredMetrics = filteredMetrics.filter(
            metric => metric.dataQuality.accuracy >= filters.confidenceThreshold
          );
        }
      }

      return filteredMetrics;
    },

    calculateMetricStats: (metricType: METRIC_TYPES) => {
      const metrics = state.metrics.filter(m => m.metricType === metricType);
      const values = metrics.map(m => m.value);
      return {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b, 0) / values.length
      };
    }
  };

  return { state, actions, utils };
}