package com.example.api

import android.util.Log
import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import retrofit2.http.Body
import retrofit2.http.POST
import retrofit2.http.Query
import java.util.concurrent.TimeUnit

@JsonClass(generateAdapter = true)
data class GenerateContentRequest(
    @Json(name = "contents") val contents: List<Content>? = null,
    @Json(name = "generationConfig") val generationConfig: GenerationConfig? = null,
    @Json(name = "systemInstruction") val systemInstruction: Content? = null,
    @Json(name = "safetySettings") val safetySettings: List<SafetySetting>? = null
)

@JsonClass(generateAdapter = true)
data class Content(
    @Json(name = "parts") val parts: List<Part>? = null,
    @Json(name = "role") val role: String? = null
)

@JsonClass(generateAdapter = true)
data class Part(
    @Json(name = "text") val text: String? = null,
    @Json(name = "inlineData") val inlineData: InlineData? = null
)

@JsonClass(generateAdapter = true)
data class InlineData(
    @Json(name = "mimeType") val mimeType: String? = "image/jpeg",
    @Json(name = "data") val data: String? = null
)

@JsonClass(generateAdapter = true)
data class ImageConfig(
    @Json(name = "aspectRatio") val aspectRatio: String? = null,
    @Json(name = "imageSize") val imageSize: String? = null
)

@JsonClass(generateAdapter = true)
data class GenerationConfig(
    @Json(name = "temperature") val temperature: Float? = null,
    @Json(name = "topP") val topP: Float? = null,
    @Json(name = "topK") val topK: Int? = null,
    @Json(name = "maxOutputTokens") val maxOutputTokens: Int? = null,
    @Json(name = "imageConfig") val imageConfig: ImageConfig? = null,
    @Json(name = "responseModalities") val responseModalities: List<String>? = null
)

@JsonClass(generateAdapter = true)
data class SafetySetting(
    @Json(name = "category") val category: String? = null,
    @Json(name = "threshold") val threshold: String? = null
)

@JsonClass(generateAdapter = true)
data class GenerateContentResponse(
    @Json(name = "candidates") val candidates: List<Candidate>? = null,
    @Json(name = "promptFeedback") val promptFeedback: PromptFeedback? = null,
    @Json(name = "usageMetadata") val usageMetadata: UsageMetadata? = null
)

@JsonClass(generateAdapter = true)
data class Candidate(
    @Json(name = "content") val content: Content? = null,
    @Json(name = "finishReason") val finishReason: String? = null,
    @Json(name = "index") val index: Int? = null,
    @Json(name = "safetyRatings") val safetyRatings: List<SafetyRating>? = null
)

@JsonClass(generateAdapter = true)
data class PromptFeedback(
    @Json(name = "blockReason") val blockReason: String? = null,
    @Json(name = "safetyRatings") val safetyRatings: List<SafetyRating>? = null
)

@JsonClass(generateAdapter = true)
data class SafetyRating(
    @Json(name = "category") val category: String? = null,
    @Json(name = "probability") val probability: String? = null
)

@JsonClass(generateAdapter = true)
data class UsageMetadata(
    @Json(name = "promptTokenCount") val promptTokenCount: Int? = null,
    @Json(name = "candidatesTokenCount") val candidatesTokenCount: Int? = null,
    @Json(name = "totalTokenCount") val totalTokenCount: Int? = null
)

@JsonClass(generateAdapter = true)
data class ImagenInstance(
    @Json(name = "prompt") val prompt: String? = null
)

@JsonClass(generateAdapter = true)
data class ImagenParameters(
    @Json(name = "sampleCount") val sampleCount: Int? = 1,
    @Json(name = "aspectRatio") val aspectRatio: String? = "1:1",
    @Json(name = "outputMimeType") val outputMimeType: String? = "image/jpeg"
)

@JsonClass(generateAdapter = true)
data class ImagenRequest(
    @Json(name = "instances") val instances: List<ImagenInstance>? = null,
    @Json(name = "parameters") val parameters: ImagenParameters? = null
)

@JsonClass(generateAdapter = true)
data class ImagenPrediction(
    @Json(name = "bytesBase64Encoded") val bytesBase64Encoded: String? = null,
    @Json(name = "mimeType") val mimeType: String? = null
)

@JsonClass(generateAdapter = true)
data class ImagenResponse(
    @Json(name = "predictions") val predictions: List<ImagenPrediction>? = null
)

interface GeminiApiService {
    @POST("v1beta/models/{model}:predict")
    suspend fun predictImagen(
        @retrofit2.http.Path("model") model: String,
        @Query("key") apiKey: String,
        @Body request: ImagenRequest
    ): ImagenResponse

    @POST("v1beta/models/{model}:generateContent")
    suspend fun generateContentWithModel(
        @retrofit2.http.Path("model") model: String,
        @Query("key") apiKey: String,
        @Body request: GenerateContentRequest
    ): GenerateContentResponse

    @POST("v1beta/models/gemini-2.0-flash:generateContent")
    suspend fun generateContent(
        @Query("key") apiKey: String,
        @Body request: GenerateContentRequest
    ): GenerateContentResponse
}

object RetrofitClient {
    private const val BASE_URL = "https://generativelanguage.googleapis.com/"

    private val moshi by lazy {
        try {
            Moshi.Builder()
                .addLast(KotlinJsonAdapterFactory())
                .build()
        } catch (e: Throwable) {
            Log.e("RetrofitClient", "Failed to build Moshi: ${e.message}", e)
            Moshi.Builder().build()
        }
    }

    private val okHttpClient by lazy {
        try {
            OkHttpClient.Builder()
                .connectTimeout(60, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .writeTimeout(60, TimeUnit.SECONDS)
                .build()
        } catch (e: Throwable) {
            Log.e("RetrofitClient", "Failed to build OkHttpClient: ${e.message}", e)
            OkHttpClient()
        }
    }

    val service: GeminiApiService? by lazy {
        try {
            val retrofit = Retrofit.Builder()
                .baseUrl(BASE_URL)
                .client(okHttpClient)
                .addConverterFactory(MoshiConverterFactory.create(moshi).asLenient())
                .build()
            retrofit.create(GeminiApiService::class.java)
        } catch (e: Throwable) {
            Log.e("RetrofitClient", "Failed to create GeminiApiService: ${e.message}", e)
            null
        }
    }
}
