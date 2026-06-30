package com.pennywise.smslistener

import android.content.Context
import android.database.Cursor
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class SyncWorker(appContext: Context, workerParams: WorkerParameters) :
    CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val context = applicationContext
        val prefs = context.getSharedPreferences("pennywise_prefs", Context.MODE_PRIVATE)
        val supabaseUrl = prefs.getString("supabase_url", "") ?: ""
        val supabaseKey = prefs.getString("supabase_key", "") ?: ""

        if (supabaseUrl.isEmpty() || supabaseKey.isEmpty()) {
            return Result.failure()
        }

        val dbHelper = DatabaseHelper(context)
        val db = dbHelper.writableDatabase

        val cursor: Cursor = db.rawQuery(
            "SELECT * FROM ${DatabaseHelper.TABLE_SMS} WHERE ${DatabaseHelper.COLUMN_SYNCED} = 0",
            null
        )

        // Setup OkHttp with 15s timeout
        val client = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
            
        val mediaType = "application/json; charset=utf-8".toMediaType()
        var hasFailures = false

        if (cursor.moveToFirst()) {
            do {
                val id = cursor.getInt(cursor.getColumnIndexOrThrow(DatabaseHelper.COLUMN_ID))
                val sender = cursor.getString(cursor.getColumnIndexOrThrow(DatabaseHelper.COLUMN_SENDER))
                val body = cursor.getString(cursor.getColumnIndexOrThrow(DatabaseHelper.COLUMN_BODY))
                val amount = cursor.getDouble(cursor.getColumnIndexOrThrow(DatabaseHelper.COLUMN_AMOUNT))

                // Build Supabase payload matching pennywise_sms_logs schema
                val jsonPayload = JSONObject().apply {
                    put("sender", sender)
                    put("body", body)
                    put("parsed_amount", if (amount > 0.0) amount else null)
                    put("status", "unmatched") // Triggers handle matching on database level
                }

                val requestBody = jsonPayload.toString().toRequestBody(mediaType)
                
                // Formulate Supabase PostgREST API path: /rest/v1/pennywise_sms_logs
                val cleanUrl = if (supabaseUrl.endsWith("/")) supabaseUrl else "$supabaseUrl/"
                val request = Request.Builder()
                    .url("${cleanUrl}rest/v1/pennywise_sms_logs")
                    .post(requestBody)
                    .addHeader("apikey", supabaseKey)
                    .addHeader("Authorization", "Bearer $supabaseKey")
                    .addHeader("Content-Type", "application/json")
                    .addHeader("Prefer", "return=representation")
                    .build()

                try {
                    val response = client.newCall(request).execute()
                    if (response.isSuccessful || response.code == 201) {
                        // Mark as synced locally
                        db.execSQL("UPDATE ${DatabaseHelper.TABLE_SMS} SET ${DatabaseHelper.COLUMN_SYNCED} = 1 WHERE ${DatabaseHelper.COLUMN_ID} = $id")
                    } else {
                        hasFailures = true
                    }
                    response.close()
                } catch (e: Exception) {
                    hasFailures = true
                }
            } while (cursor.moveToNext())
        }
        cursor.close()

        return if (hasFailures) {
            Result.retry()
        } else {
            Result.success()
        }
    }
}
