import HealthKit // Latest
import Foundation // Latest
import Combine // Latest
import os.log // Latest

/// Errors that can occur during query operations
public enum QueryError: Error {
    case healthKitNotAvailable
    case queryFailed(String)
    case timeout(String)
    case invalidParameters(String)
    case resourceConstraints(String)
    case backgroundTaskExpired
}

/// Configuration options for query execution
public struct QueryConfiguration {
    let maxCacheSize: Int
    let queryTimeout: TimeInterval
    let batchSize: Int
    let retryAttempts: Int
    let retryDelay: TimeInterval
    
    public init(maxCacheSize: Int = 50,
               queryTimeout: TimeInterval = 30.0,
               batchSize: Int = 100,
               retryAttempts: Int = 3,
               retryDelay: TimeInterval = 2.0) {
        self.maxCacheSize = maxCacheSize
        self.queryTimeout = queryTimeout
        self.batchSize = batchSize
        self.retryAttempts = retryAttempts
        self.retryDelay = retryDelay
    }
}

/// Performance metrics for query monitoring
private struct QueryPerformanceMetrics {
    var executionTime: TimeInterval
    var sampleCount: Int
    var retryCount: Int
    var cacheHits: Int
    var cacheMisses: Int
}

/// Manages execution of HealthKit queries with caching, retry logic, and resource optimization
public class HealthKitQueryManager {
    // MARK: - Properties
    
    private let healthStore: HKHealthStore
    private let queryQueue: DispatchQueue
    private let queryCache: NSCache<NSString, HKQuery>
    private var queryTimeouts: [UUID: TimeInterval]
    private var metrics: QueryPerformanceMetrics
    
    private let logger = Logger(subsystem: "com.phrsat.healthbridge", category: "HealthKitQueryManager")
    
    // MARK: - Initialization
    
    public init(store: HKHealthStore, config: QueryConfiguration = QueryConfiguration()) {
        self.healthStore = store
        self.queryQueue = DispatchQueue(label: "com.phrsat.healthbridge.queryQueue",
                                      qos: .userInitiated)
        
        self.queryCache = NSCache<NSString, HKQuery>()
        self.queryCache.countLimit = config.maxCacheSize
        
        self.queryTimeouts = [:]
        self.metrics = QueryPerformanceMetrics(executionTime: 0,
                                             sampleCount: 0,
                                             retryCount: 0,
                                             cacheHits: 0,
                                             cacheMisses: 0)
    }
    
    // MARK: - Query Execution
    
    /// Executes a quantity sample query with retry logic and caching
    @discardableResult
    public func executeQuantityQuery(type: HealthMetricType,
                                   startDate: Date,
                                   endDate: Date,
                                   options: HKQueryOptions = [],
                                   completion: @escaping (Result<[HealthMetric], QueryError>) -> Void) -> HKQuery {
        
        let queryId = UUID()
        let cacheKey = "\(type.identifier)_\(startDate.timeIntervalSince1970)_\(endDate.timeIntervalSince1970)" as NSString
        
        // Check cache
        if let cachedQuery = queryCache.object(forKey: cacheKey) as? HKSampleQuery {
            metrics.cacheHits += 1
            logger.debug("Cache hit for query: \(cacheKey)")
            return cachedQuery
        }
        
        metrics.cacheMisses += 1
        
        // Validate quantity type
        guard case .success(let quantityType) = type.quantityType() else {
            completion(.failure(.invalidParameters("Invalid quantity type")))
            return HKSampleQuery(sampleType: HKSampleType.quantityType(forIdentifier: .heartRate)!,
                               predicate: nil,
                               limit: 0,
                               sortDescriptors: nil) { _, _, _ in }
        }
        
        // Create predicate
        let predicate = HKQuery.predicateForSamples(withStart: startDate,
                                                   end: endDate,
                                                   options: options)
        
        // Configure sort descriptors
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierStartDate,
                                            ascending: false)
        
        let startTime = Date()
        var retryCount = 0
        
        // Create query
        let query = HKSampleQuery(sampleType: quantityType,
                                predicate: predicate,
                                limit: HKObjectQueryNoLimit,
                                sortDescriptors: [sortDescriptor]) { [weak self] (query, samples, error) in
            guard let self = self else { return }
            
            let executionTime = Date().timeIntervalSince(startTime)
            self.metrics.executionTime += executionTime
            
            // Handle timeout
            if let timeout = self.queryTimeouts[queryId], executionTime > timeout {
                self.logger.error("Query timeout after \(executionTime) seconds")
                completion(.failure(.timeout("Query execution exceeded timeout")))
                return
            }
            
            // Handle errors with retry logic
            if let error = error {
                retryCount += 1
                self.metrics.retryCount += 1
                
                if retryCount < QueryConfiguration().retryAttempts {
                    self.logger.warning("Query failed, attempting retry \(retryCount)")
                    self.queryQueue.asyncAfter(deadline: .now() + QueryConfiguration().retryDelay) {
                        self.healthStore.execute(query)
                    }
                    return
                }
                
                self.logger.error("Query failed after \(retryCount) retries: \(error.localizedDescription)")
                completion(.failure(.queryFailed(error.localizedDescription)))
                return
            }
            
            // Process results
            guard let samples = samples as? [HKQuantitySample] else {
                completion(.failure(.queryFailed("Invalid sample type")))
                return
            }
            
            self.metrics.sampleCount += samples.count
            
            // Convert samples to HealthMetric objects
            let metrics = samples.compactMap { sample -> HealthMetric? in
                if case .success(let metric) = HealthMetric.fromHKQuantitySample(sample) {
                    return metric
                }
                return nil
            }
            
            // Cache successful query
            self.queryCache.setObject(query, forKey: cacheKey)
            
            self.logger.debug("Query completed successfully with \(metrics.count) samples")
            completion(.success(metrics))
        }
        
        // Set query timeout
        queryTimeouts[queryId] = QueryConfiguration().queryTimeout
        
        // Execute query
        queryQueue.async {
            self.healthStore.execute(query)
        }
        
        return query
    }
    
    /// Executes a statistics query with performance optimization
    @discardableResult
    public func executeStatisticsQuery(type: HealthMetricType,
                                     startDate: Date,
                                     endDate: Date,
                                     options: HKStatisticsOptions,
                                     completion: @escaping (Result<HKStatistics, QueryError>) -> Void) -> HKQuery {
        
        guard case .success(let quantityType) = type.quantityType() else {
            completion(.failure(.invalidParameters("Invalid quantity type")))
            return HKStatisticsQuery(quantityType: HKQuantityType.quantityType(forIdentifier: .heartRate)!,
                                   quantitySamplePredicate: nil,
                                   options: options) { _, _, _ in }
        }
        
        let predicate = HKQuery.predicateForSamples(withStart: startDate,
                                                   end: endDate,
                                                   options: .strictStartDate)
        
        let query = HKStatisticsQuery(quantityType: quantityType,
                                    quantitySamplePredicate: predicate,
                                    options: options) { [weak self] (query, statistics, error) in
            guard let self = self else { return }
            
            if let error = error {
                self.logger.error("Statistics query failed: \(error.localizedDescription)")
                completion(.failure(.queryFailed(error.localizedDescription)))
                return
            }
            
            guard let statistics = statistics else {
                completion(.failure(.queryFailed("No statistics available")))
                return
            }
            
            completion(.success(statistics))
        }
        
        queryQueue.async {
            self.healthStore.execute(query)
        }
        
        return query
    }
    
    /// Executes an anchored object query with background processing support
    @discardableResult
    public func executeAnchoredObjectQuery(type: HealthMetricType,
                                         anchor: HKQueryAnchor?,
                                         taskId: UIBackgroundTaskIdentifier? = nil,
                                         completion: @escaping (Result<(samples: [HealthMetric], anchor: HKQueryAnchor?), QueryError>) -> Void) -> HKQuery {
        
        guard case .success(let quantityType) = type.quantityType() else {
            completion(.failure(.invalidParameters("Invalid quantity type")))
            return HKAnchoredObjectQuery(type: HKSampleType.quantityType(forIdentifier: .heartRate)!,
                                       predicate: nil,
                                       anchor: nil,
                                       limit: 0) { _, _, _, _, _ in }
        }
        
        let query = HKAnchoredObjectQuery(type: quantityType,
                                        predicate: nil,
                                        anchor: anchor,
                                        limit: HKObjectQueryNoLimit) { [weak self] (query, samples, deletedObjects, newAnchor, error) in
            guard let self = self else { return }
            
            if let error = error {
                self.logger.error("Anchored query failed: \(error.localizedDescription)")
                completion(.failure(.queryFailed(error.localizedDescription)))
                return
            }
            
            guard let samples = samples as? [HKQuantitySample] else {
                completion(.failure(.queryFailed("Invalid sample type")))
                return
            }
            
            // Process samples in batches
            let metrics = samples.compactMap { sample -> HealthMetric? in
                if case .success(let metric) = HealthMetric.fromHKQuantitySample(sample) {
                    return metric
                }
                return nil
            }
            
            completion(.success((samples: metrics, anchor: newAnchor)))
            
            // End background task if provided
            if let taskId = taskId {
                UIApplication.shared.endBackgroundTask(taskId)
            }
        }
        
        queryQueue.async {
            self.healthStore.execute(query)
        }
        
        return query
    }
}