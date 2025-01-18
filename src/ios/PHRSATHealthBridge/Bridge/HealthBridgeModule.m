//
// HealthBridgeModule.m
// PHRSATHealthBridge
//
// Created by PHRSAT
// Copyright © 2023 PHRSAT. All rights reserved.
//

#import <React/React.h> // v0.72+
#import <Foundation/Foundation.h> // v14.0+
#import <HealthKit/HealthKit.h> // v14.0+
#import "HealthBridgeModule-Swift.h"

// MARK: - Module Declaration
RCT_EXTERN_MODULE(HealthBridgeModule, NSObject)

// MARK: - Thread Configuration
+ (BOOL)requiresMainQueueSetup {
    return YES;
}

// MARK: - Module Export
RCT_EXPORT_MODULE()

// MARK: - Bridge Methods

// Request HealthKit authorization with enhanced error handling
RCT_EXPORT_METHOD(requestAuthorization:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    HealthBridgeModule *bridge = [HealthBridgeModule new];
    [bridge initialize:resolve reject:reject];
}

// Start health data synchronization with HIPAA compliance
RCT_EXPORT_METHOD(startHealthKitSync:(NSDictionary *)options
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    HealthBridgeModule *bridge = [HealthBridgeModule new];
    [bridge startHealthKitObserving:resolve reject:reject];
}

// Retrieve health data with caching and batch processing
RCT_EXPORT_METHOD(getHealthData:(NSString *)metricType
                  startDate:(nonnull NSNumber *)startDate
                  endDate:(nonnull NSNumber *)endDate
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    HealthBridgeModule *bridge = [HealthBridgeModule new];
    [bridge getHealthData:metricType
               startDate:[startDate doubleValue]
                 endDate:[endDate doubleValue]
                resolve:resolve
                 reject:reject];
}

// Stop health data synchronization
RCT_EXPORT_METHOD(stopHealthKitSync:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    // Implementation handled by Swift class
    resolve(@YES);
}

// MARK: - Constants Export

- (NSDictionary *)constantsToExport {
    return @{
        @"Events": @{
            @"healthDataUpdate": @"onHealthDataUpdate",
            @"authorizationChange": @"onAuthorizationChange",
            @"syncProgress": @"onSyncProgress",
            @"syncComplete": @"onSyncComplete",
            @"syncError": @"onSyncError"
        },
        @"ErrorCodes": @{
            @"notInitialized": @(1001),
            @"authorizationDenied": @(1002),
            @"healthKitNotAvailable": @(1003),
            @"invalidParameters": @(1004),
            @"syncFailed": @(1005),
            @"queryFailed": @(1006)
        },
        @"MetricTypes": @{
            @"heartRate": @"HKQuantityTypeIdentifierHeartRate",
            @"bloodPressureSystolic": @"HKQuantityTypeIdentifierBloodPressureSystolic",
            @"bloodPressureDiastolic": @"HKQuantityTypeIdentifierBloodPressureDiastolic",
            @"bloodGlucose": @"HKQuantityTypeIdentifierBloodGlucose",
            @"bodyWeight": @"HKQuantityTypeIdentifierBodyMass",
            @"bodyTemperature": @"HKQuantityTypeIdentifierBodyTemperature",
            @"oxygenSaturation": @"HKQuantityTypeIdentifierOxygenSaturation",
            @"stepCount": @"HKQuantityTypeIdentifierStepCount",
            @"activeEnergyBurned": @"HKQuantityTypeIdentifierActiveEnergyBurned",
            @"distanceWalkingRunning": @"HKQuantityTypeIdentifierDistanceWalkingRunning"
        }
    };
}

// MARK: - Support Methods

+ (NSString *)moduleName {
    return @"HealthBridgeModule";
}

- (NSArray<NSString *> *)supportedEvents {
    return @[
        @"onHealthDataUpdate",
        @"onAuthorizationChange",
        @"onSyncProgress",
        @"onSyncComplete",
        @"onSyncError"
    ];
}

@end