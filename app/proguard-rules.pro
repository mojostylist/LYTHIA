# ProGuard and R8 Rules for LYTHIA
# ==============================================================================
# General Android & Kotlin Rules
# ==============================================================================

# Preserve line numbers and source file names for stack trace debugging
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Preserve annotations, signatures, and reflection attributes
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,Exceptions

# Preserve AndroidX @Keep annotations
-keep @androidx.annotation.Keep class * { *; }
-keepclasseswithmembers class * {
    @androidx.annotation.Keep <fields>;
}
-keepclasseswithmembers class * {
    @androidx.annotation.Keep <methods>;
}

# Preserve standard Kotlin Enum methods
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Preserve Parcelable implementations
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Preserve View constructors for layout inflation
-keepclasseswithmembers class * extends android.view.View {
    public <init>(android.content.Context);
    public <init>(android.content.Context, android.util.AttributeSet);
    public <init>(android.content.Context, android.util.AttributeSet, int);
}

# ==============================================================================
# Jetpack Compose Rules
# ==============================================================================

-keep class androidx.compose.** { *; }
-keep interface androidx.compose.** { *; }
-dontwarn androidx.compose.**

# Prevent Compose runtime / platform reflection issues
-keep class androidx.compose.ui.platform.** { *; }
-keepclassmembers class * {
    @androidx.compose.runtime.Composable *;
}

# ==============================================================================
# Gemini SDK & Firebase AI Rules
# ==============================================================================

# Google Generative AI Client SDK
-keep class com.google.ai.client.generativeai.** { *; }
-keep interface com.google.ai.client.generativeai.** { *; }
-dontwarn com.google.ai.client.generativeai.**

# Firebase AI / Firebase Vertex AI SDK
-keep class com.google.firebase.ai.** { *; }
-keep interface com.google.firebase.ai.** { *; }
-dontwarn com.google.firebase.ai.**

# Google Generative AI Core APIs
-keep class com.google.generativeai.** { *; }
-keep interface com.google.generativeai.** { *; }
-dontwarn com.google.generativeai.**

# Preserve Gemini API Request / Response Data Classes
-keepclassmembers class com.google.ai.client.generativeai.type.** { *; }
-keepclassmembers class com.google.firebase.ai.type.** { *; }

# ==============================================================================
# Networking, HTTP & Serialization Rules (OkHttp, Retrofit, Moshi, Gson)
# ==============================================================================

# OkHttp
-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-dontwarn okhttp3.**

# Retrofit
-keep class retrofit2.** { *; }
-keep interface retrofit2.** { *; }
-dontwarn retrofit2.**

# Moshi JSON Converter & Generated Adapters
-keep class com.squareup.moshi.** { *; }
-keep interface com.squareup.moshi.** { *; }
-keep class com.squareup.moshi.kotlin.reflect.** { *; }
-keep class kotlin.reflect.** { *; }
-keep interface kotlin.reflect.** { *; }
-keepclassmembers class * {
    @com.squareup.moshi.Json *;
    @com.squareup.moshi.JsonClass *;
}
-dontwarn com.squareup.moshi.**
-dontwarn kotlin.reflect.**

# ==============================================================================
# Kotlin Coroutines Rules
# ==============================================================================

-keep class kotlinx.coroutines.** { *; }
-keep interface kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# ==============================================================================
# Room Database Rules
# ==============================================================================

-keep class androidx.room.** { *; }
-keep interface androidx.room.** { *; }
-dontwarn androidx.room.**

-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class * { *; }
-keep @androidx.room.Dao interface * { *; }

# ==============================================================================
# Application Specific Models, Entities & API Classes
# ==============================================================================

# Preserve all app level classes, entities, state models and data transfers
-keep class com.example.** { *; }
-keepclassmembers class com.example.** { *; }
