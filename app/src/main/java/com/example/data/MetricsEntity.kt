package com.example.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "coherence_metrics")
data class MetricsEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val timestamp: Long = System.currentTimeMillis(),
    val resonanceScore: Float,
    val coherenceLevel: String, // e.g. "Low", "Harmonic", "Resonant", "Super-Coherent"
    val truthAlignment: Float,
    val tokensUsed: Int
)
