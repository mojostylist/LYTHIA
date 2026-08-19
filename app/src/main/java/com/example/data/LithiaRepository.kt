package com.example.data

import kotlinx.coroutines.flow.Flow

class LithiaRepository(private val lithiaDao: LithiaDao) {
    val allMessages: Flow<List<MessageEntity>> = lithiaDao.getAllMessages()
    val allMetrics: Flow<List<MetricsEntity>> = lithiaDao.getAllMetrics()

    suspend fun insertMessage(message: MessageEntity): Long {
        return lithiaDao.insertMessage(message)
    }

    suspend fun clearChatHistory() {
        lithiaDao.clearChatHistory()
    }

    suspend fun deleteMessageById(id: Int) {
        lithiaDao.deleteMessageById(id)
    }

    suspend fun deleteSessionMessages(sessionId: String) {
        lithiaDao.deleteSessionMessages(sessionId)
    }

    suspend fun insertMetrics(metrics: MetricsEntity): Long {
        return lithiaDao.insertMetrics(metrics)
    }

    suspend fun clearMetricsHistory() {
        lithiaDao.clearMetricsHistory()
    }
}
