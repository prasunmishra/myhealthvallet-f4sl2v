# Version Information for Dependencies:
# - React Native: 0.72.0
# - Kotlin: 1.8.0
# - AndroidX Security: 1.1.0-alpha06
# - AndroidX Biometric: 1.2.0-alpha05
# - Google Play Services Fitness: 21.1.0

# Keep required attributes for proper functionality and debugging
-keepattributes *Annotation*, Signature, Exception, InnerClasses, EnclosingMethod
-keepattributes SourceFile, LineNumberTable, RuntimeVisibleAnnotations, RuntimeVisibleParameterAnnotations

# React Native specific rules
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.uimanager.** { *; }
-keep class com.facebook.react.views.** { *; }
-keepclassmembers class * extends com.facebook.react.bridge.ReactContextBaseJavaModule {
    @com.facebook.react.bridge.ReactMethod *;
}

# Kotlin specific rules
-keep class kotlin.** { *; }
-keep class kotlin.Metadata { *; }
-keep class kotlinx.serialization.** { *; }
-keepclassmembers class * {
    @kotlinx.serialization.Serializable <methods>;
}
-keepclassmembers class * extends kotlin.Enum { *; }

# PHRSAT Application specific rules
-keep class com.phrsat.healthbridge.bridge.** { *; }
-keep class com.phrsat.healthbridge.models.** { *; }
-keep class com.phrsat.healthbridge.googlefit.** { *; }
-keep class com.phrsat.healthbridge.security.** { *; }
-keep class com.phrsat.healthbridge.encryption.** { *; }
-keep class com.phrsat.healthbridge.biometric.** { *; }

# Security related rules
-keep class androidx.security.crypto.** { *; }
-keep class androidx.biometric.** { *; }
-keep class javax.crypto.** { *; }
-keep class java.security.** { *; }
-keepclassmembers class * extends javax.crypto.SecretKey { *; }
-keepclassmembers class * extends java.security.KeyStore { *; }

# Room database rules
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-keep class * extends androidx.room.Dao
-keepclassmembers class * {
    @androidx.room.Query *;
}

# HIPAA compliance specific rules
-keep class com.phrsat.healthbridge.phi.** { *; }
-keep class com.phrsat.healthbridge.audit.** { *; }
-keep class com.phrsat.healthbridge.consent.** { *; }
-keepclassmembers class * {
    @com.phrsat.healthbridge.annotations.PHI *;
}

# Optimization rules
-optimizations !code/simplification/arithmetic,!code/simplification/cast,!field/*,!class/merging/*
-optimizationpasses 5
-allowaccessmodification
-dontpreverify
-dontusemixedcaseclassnames
-verbose

# Debugging support
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
-printmapping mapping.txt
-printseeds seeds.txt
-printusage unused.txt

# Google Fit SDK rules
-keep class com.google.android.gms.fitness.** { *; }
-keep class com.google.android.gms.auth.** { *; }

# Prevent stripping of native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep custom application classes
-keep public class com.phrsat.healthbridge.MainApplication
-keep public class com.phrsat.healthbridge.MainActivity

# Preserve JavaScript interface methods
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Parcelable classes
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Keep Serializable classes
-keepnames class * implements java.io.Serializable
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Preserve all View constructors
-keepclasseswithmembers class * extends android.view.View {
    public <init>(android.content.Context);
    public <init>(android.content.Context, android.util.AttributeSet);
    public <init>(android.content.Context, android.util.AttributeSet, int);
}

# Keep event handler methods
-keepclassmembers class * {
    void *(**On*Event);
    void *(**On*Click);
}