package com.pennywise.smslistener

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class DatabaseHelper(context: Context) : SQLiteOpenHelper(context, DATABASE_NAME, null, DATABASE_VERSION) {

    companion object {
        private const val DATABASE_NAME = "pennywise_tracker.db"
        private const val DATABASE_VERSION = 1
        const val TABLE_SMS = "sms_logs"
        const val COLUMN_ID = "id"
        const val COLUMN_SENDER = "sender"
        const val COLUMN_BODY = "body"
        const val COLUMN_AMOUNT = "amount"
        const val COLUMN_SYNCED = "is_synced"
        const val COLUMN_TIMESTAMP = "timestamp"
    }

    override fun onCreate(db: SQLiteDatabase) {
        val createTable = ("CREATE TABLE " + TABLE_SMS + " ("
                + COLUMN_ID + " INTEGER PRIMARY KEY AUTOINCREMENT, "
                + COLUMN_SENDER + " TEXT, "
                + COLUMN_BODY + " TEXT, "
                + COLUMN_AMOUNT + " REAL, "
                + COLUMN_SYNCED + " INTEGER DEFAULT 0, "
                + COLUMN_TIMESTAMP + " INTEGER)")
        db.execSQL(createTable)
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_SMS")
        onCreate(db)
    }

    fun insertSms(sender: String, body: String, amount: Double?): Long {
        val db = this.writableDatabase
        val values = ContentValues().apply {
            put(COLUMN_SENDER, sender)
            put(COLUMN_BODY, body)
            put(COLUMN_AMOUNT, amount ?: 0.0)
            put(COLUMN_SYNCED, 0)
            put(COLUMN_TIMESTAMP, System.currentTimeMillis())
        }
        return db.insert(TABLE_SMS, null, values)
    }
}
