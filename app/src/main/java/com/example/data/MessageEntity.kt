package com.example.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "chat_messages")
data class MessageEntity(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val sessionId: String = "default_session",
    val isUser: Boolean,
    val text: String,
    val timestamp: Long = System.currentTimeMillis(),
    val coherenceScore: Float = 0.0f,
    val truthScore: Float = 0.0f,
    val imageBase64: String? = null
)
