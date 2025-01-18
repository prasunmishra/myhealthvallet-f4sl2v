/**
 * @fileoverview Analytics Service Implementation for PHRSAT
 * @version 1.0.0
 * 
 * Provides comprehensive health analytics functionality including:
 * - Real-time metric data retrieval and caching
 * - Trend analysis with ML-powered insights
 * - WebSocket-based live updates
 * - Enhanced error handling and data validation
 */

import axios from 'axios'; // version: ^1.4.0
import { ApiService } from './api.service';
import { 
  MetricDataPoint, 
  AnalyticsTimeRange, 
  TrendAnalysis,
  ChartConfiguration,
  ValidationStatus
} from '../types/analytics.types';
import { METRIC_TYPES, TIME_RANGES, ANALYSIS_THRESHOLDS } from '../constants/analytics.constants';
import { Injectable } from '@angular/core'; // version: ^16.0.0
import { BehaviorSubject, Observable, Subject, throwError } from 'rxjs'; // version: ^7.8.0
import { catchError, map, retry, shareReplay, tap } from 'rxjs/operators'; // version: ^7.8.0

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private readonly baseUrl: string = '/api/v1/analytics';
  private readonly metricCache: Map<string, { data: MetricDataPoint[], timestamp: number }> = new Map();
  private readonly metricUpdates$ = new Subject<MetricDataPoint>();
  private readonly cacheExpirationMs = 5 * 60 * 1000; // 5 minutes
  private readonly wsConnection: WebSocket | null = null;
  private readonly retryConfig = { attempts: 3, delay: 1000 };

  constructor(
    private apiService: ApiService
  ) {
    this.initializeWebSocket();
  }

  /**
   * Retrieves metric data with caching and validation
   */
  public async getMetricData(
    metricType: METRIC_TYPES,
    timeRange: AnalyticsTimeRange
  ): Promise<MetricDataPoint[]> {
    const cacheKey = this.generateCacheKey(metricType, timeRange);
    const cachedData = this.getCachedData(cacheKey);

    if (cachedData) {
      return cachedData;
    }

    try {
      const response = await this.apiService.get<MetricDataPoint[]>(
        `${this.baseUrl}/metrics`,
        {
          params: {
            metricType,
            startDate: timeRange.startDate.toISOString(),
            endDate: timeRange.endDate.toISOString()
          }
        }
      );

      const validatedData = this.validateMetricData(response.data);
      this.updateCache(cacheKey, validatedData);
      return validatedData;
    } catch (error) {
      throw this.handleError('Error fetching metric data', error);
    }
  }

  /**
   * Analyzes health trends with ML insights
   */
  public async analyzeTrends(
    metricData: MetricDataPoint[]
  ): Promise<TrendAnalysis> {
    if (!this.hasMinimumDataPoints(metricData)) {
      throw new Error(`Minimum ${ANALYSIS_THRESHOLDS.MINIMUM_DATA_POINTS} data points required for analysis`);
    }

    try {
      const response = await this.apiService.post<TrendAnalysis>(
        `${this.baseUrl}/trends/analyze`,
        { metricData }
      );

      return this.validateTrendAnalysis(response.data);
    } catch (error) {
      throw this.handleError('Error analyzing trends', error);
    }
  }

  /**
   * Subscribes to real-time metric updates
   */
  public subscribeToMetricUpdates(metricType: METRIC_TYPES): Observable<MetricDataPoint> {
    return new Observable<MetricDataPoint>(observer => {
      const wsUrl = this.getWebSocketUrl(metricType);
      const ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const metricUpdate = JSON.parse(event.data) as MetricDataPoint;
          const validatedUpdate = this.validateMetricData([metricUpdate])[0];
          observer.next(validatedUpdate);
          this.metricUpdates$.next(validatedUpdate);
          this.updateCacheWithNewMetric(validatedUpdate);
        } catch (error) {
          observer.error(this.handleError('Error processing metric update', error));
        }
      };

      ws.onerror = (error) => observer.error(this.handleError('WebSocket error', error));
      ws.onclose = () => this.handleWebSocketClose(ws, observer);

      return () => {
        ws.close();
      };
    }).pipe(
      retry(this.retryConfig.attempts),
      shareReplay(1)
    );
  }

  /**
   * Exports analytics data in specified format
   */
  public async exportAnalytics(
    metrics: METRIC_TYPES[],
    timeRange: AnalyticsTimeRange,
    format: 'csv' | 'json' | 'pdf'
  ): Promise<Blob> {
    try {
      const response = await this.apiService.get(
        `${this.baseUrl}/export`,
        {
          params: { metrics, timeRange, format },
          responseType: 'blob'
        }
      );

      return new Blob([response.data], { 
        type: this.getExportMimeType(format) 
      });
    } catch (error) {
      throw this.handleError('Error exporting analytics data', error);
    }
  }

  /**
   * Validates metric data against defined rules
   */
  public validateMetricData(data: MetricDataPoint[]): MetricDataPoint[] {
    return data.filter(metric => {
      const isValid = 
        metric.timestamp instanceof Date &&
        !isNaN(metric.value) &&
        metric.dataQuality.accuracy >= ANALYSIS_THRESHOLDS.TREND_CONFIDENCE_THRESHOLD &&
        metric.validationStatus !== ValidationStatus.INVALID;

      if (!isValid) {
        console.warn('Invalid metric data point:', metric);
      }

      return isValid;
    }).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Generates insights from analyzed trends
   */
  public async getInsights(
    trendAnalysis: TrendAnalysis
  ): Promise<string[]> {
    try {
      const response = await this.apiService.post<string[]>(
        `${this.baseUrl}/insights`,
        { trendAnalysis }
      );

      return response.data;
    } catch (error) {
      throw this.handleError('Error generating insights', error);
    }
  }

  private generateCacheKey(metricType: METRIC_TYPES, timeRange: AnalyticsTimeRange): string {
    return `${metricType}_${timeRange.startDate.getTime()}_${timeRange.endDate.getTime()}`;
  }

  private getCachedData(cacheKey: string): MetricDataPoint[] | null {
    const cached = this.metricCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheExpirationMs) {
      return cached.data;
    }
    return null;
  }

  private updateCache(cacheKey: string, data: MetricDataPoint[]): void {
    this.metricCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
  }

  private updateCacheWithNewMetric(metric: MetricDataPoint): void {
    this.metricCache.forEach((cached, key) => {
      const [metricType, startTime, endTime] = key.split('_');
      if (
        metric.metricType === metricType &&
        metric.timestamp.getTime() >= Number(startTime) &&
        metric.timestamp.getTime() <= Number(endTime)
      ) {
        cached.data.push(metric);
        cached.data.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      }
    });
  }

  private hasMinimumDataPoints(data: MetricDataPoint[]): boolean {
    return data.length >= ANALYSIS_THRESHOLDS.MINIMUM_DATA_POINTS;
  }

  private validateTrendAnalysis(analysis: TrendAnalysis): TrendAnalysis {
    if (
      analysis.confidence < ANALYSIS_THRESHOLDS.TREND_CONFIDENCE_THRESHOLD ||
      !analysis.modelMetadata.modelId ||
      !analysis.insights.length
    ) {
      throw new Error('Invalid trend analysis results');
    }
    return analysis;
  }

  private initializeWebSocket(): void {
    if (!this.wsConnection) {
      const wsUrl = this.getWebSocketUrl('all');
      this.wsConnection = new WebSocket(wsUrl);
      this.setupWebSocketHandlers(this.wsConnection);
    }
  }

  private setupWebSocketHandlers(ws: WebSocket): void {
    ws.onopen = () => console.log('WebSocket connection established');
    ws.onerror = (error) => console.error('WebSocket error:', error);
    ws.onclose = () => setTimeout(() => this.initializeWebSocket(), this.retryConfig.delay);
  }

  private handleWebSocketClose(ws: WebSocket, observer: any): void {
    observer.complete();
    setTimeout(() => {
      if (ws.readyState === WebSocket.CLOSED) {
        this.initializeWebSocket();
      }
    }, this.retryConfig.delay);
  }

  private getWebSocketUrl(metricType: string): string {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${window.location.host}/ws/analytics/${metricType}`;
  }

  private getExportMimeType(format: string): string {
    const mimeTypes = {
      csv: 'text/csv',
      json: 'application/json',
      pdf: 'application/pdf'
    };
    return mimeTypes[format] || 'application/octet-stream';
  }

  private handleError(message: string, error: any): Error {
    console.error(message, error);
    return new Error(`${message}: ${error.message || 'Unknown error'}`);
  }
}