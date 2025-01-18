//
// HealthKitConstants.swift
// PHRSATHealthBridge
//
// Created by PHRSAT
// Copyright © 2023 PHRSAT. All rights reserved.
//

import HealthKit // v14.0+
import Foundation // v14.0+

/// Represents the supported health metrics for HealthKit integration
/// - Note: All metrics conform to HIPAA guidelines and FHIR standards
public enum HealthKitMetricIdentifier: CaseIterable, Hashable {
    /// Heart rate in beats per minute
    case heartRate
    
    /// Systolic blood pressure in mmHg
    case bloodPressureSystolic
    
    /// Diastolic blood pressure in mmHg
    case bloodPressureDiastolic
    
    /// Blood glucose level in mg/dL
    case bloodGlucose
    
    /// Step count in number of steps
    case stepCount
    
    /// Active energy burned in kilocalories
    case activeEnergyBurned
    
    /// Body mass in kilograms
    case bodyMass
    
    /// Body temperature in degrees Celsius
    case bodyTemperature
    
    /// Blood oxygen saturation percentage
    case oxygenSaturation
    
    /// Respiratory rate in breaths per minute
    case respiratoryRate
}

/// Centralized configuration for HealthKit integration
/// Implements HIPAA-compliant data handling and standardized health metric representations
public struct HealthKitConstants {
    
    /// Set of HealthKit types requiring read permission
    /// - Important: Verify permissions against HIPAA compliance
    public static let readPermissions: Set<HKObjectType> = Set([
        HKObjectType.quantityType(forIdentifier: .heartRate)!,
        HKObjectType.quantityType(forIdentifier: .bloodPressureSystolic)!,
        HKObjectType.quantityType(forIdentifier: .bloodPressureDiastolic)!,
        HKObjectType.quantityType(forIdentifier: .bloodGlucose)!,
        HKObjectType.quantityType(forIdentifier: .stepCount)!,
        HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!,
        HKObjectType.quantityType(forIdentifier: .bodyMass)!,
        HKObjectType.quantityType(forIdentifier: .bodyTemperature)!,
        HKObjectType.quantityType(forIdentifier: .oxygenSaturation)!,
        HKObjectType.quantityType(forIdentifier: .respiratoryRate)!
    ])
    
    /// Set of HealthKit types requiring write permission
    /// - Important: Limited to essential metrics for security
    public static let writePermissions: Set<HKObjectType> = Set([
        HKObjectType.quantityType(forIdentifier: .bloodGlucose)!,
        HKObjectType.quantityType(forIdentifier: .bodyMass)!,
        HKObjectType.quantityType(forIdentifier: .bodyTemperature)!
    ])
    
    /// Standardized units for health metrics following international standards
    public static let defaultUnits: [HKQuantityTypeIdentifier: HKUnit] = [
        .heartRate: HKUnit.count().unitDivided(by: .minute()),
        .bloodPressureSystolic: HKUnit.millimeterOfMercury(),
        .bloodPressureDiastolic: HKUnit.millimeterOfMercury(),
        .bloodGlucose: HKUnit.gramUnit(with: .milli).unitDivided(by: .literUnit(with: .deci)),
        .stepCount: HKUnit.count(),
        .activeEnergyBurned: HKUnit.kilocalorie(),
        .bodyMass: HKUnit.gramUnit(with: .kilo),
        .bodyTemperature: HKUnit.degreeCelsius(),
        .oxygenSaturation: HKUnit.percent(),
        .respiratoryRate: HKUnit.count().unitDivided(by: .minute())
    ]
    
    /// Health metrics supporting background updates for real-time monitoring
    public static let backgroundDeliveryTypes: Set<HKQuantityType> = Set([
        HKObjectType.quantityType(forIdentifier: .heartRate)!,
        HKObjectType.quantityType(forIdentifier: .bloodGlucose)!,
        HKObjectType.quantityType(forIdentifier: .oxygenSaturation)!
    ])
}