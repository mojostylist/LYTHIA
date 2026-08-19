package com.example.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [MessageEntity::class, MetricsEntity::class], version = 2, exportSchema = false)
abstract class LithiaDatabase : RoomDatabase() {
    abstract fun lithiaDao(): LithiaDao

    companion object {
        @Volatile
        private var INSTANCE: LithiaDatabase? = null

        fun getDatabase(context: Context): LithiaDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = try {
                    Room.databaseBuilder(
                        context.applicationContext,
                        LithiaDatabase::class.java,
                        "lithia_database"
                    )
                    .fallbackToDestructiveMigration()
                    .fallbackToDestructiveMigrationOnDowngrade()
                    .build()
                } catch (e: Throwable) {
                    Room.databaseBuilder(
                        context.applicationContext,
                        LithiaDatabase::class.java,
                        "lithia_database_fallback"
                    )
                    .fallbackToDestructiveMigration()
                    .fallbackToDestructiveMigrationOnDowngrade()
                    .build()
                }
                INSTANCE = instance
                instance
            }
        }
    }
}
