package com.pennywise.smslistener

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.database.Cursor
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private lateinit var etSupabaseUrl: EditText
    private lateinit var etSupabaseKey: EditText
    private lateinit var etAllowedSenders: EditText
    private lateinit var etKeywords: EditText
    private lateinit var btnSave: Button
    private lateinit var btnTriggerSync: Button
    private lateinit var tvStats: TextView
    private lateinit var tvConsoleLogs: TextView

    private lateinit var dbHelper: DatabaseHelper

    companion object {
        private const val PERMISSION_REQUEST_CODE = 200
    }

    override fun onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        dbHelper = DatabaseHelper(this)

        // Initialize UI Elements
        etSupabaseUrl = findViewById(R.id.et_supabase_url)
        etSupabaseKey = findViewById(R.id.et_supabase_key)
        etAllowedSenders = findViewById(R.id.et_allowed_senders)
        etKeywords = findViewById(R.id.et_keywords)
        btnSave = findViewById(R.id.btn_save)
        btnTriggerSync = findViewById(R.id.btn_trigger_sync)
        tvStats = findViewById(R.id.tv_stats)
        tvConsoleLogs = findViewById(R.id.tv_console_logs)

        // Load Configurations
        loadPreferences()

        // Request Permissions
        checkAndRequestPermissions()

        // Click Listeners
        btnSave.setOnClickListener {
            savePreferences()
        }

        btnTriggerSync.setOnClickListener {
            triggerManualSync()
        }

        // Load Database Logs and Stats
        refreshLogsAndStats()
    }

    override fun onResume() {
        super.onResume()
        refreshLogsAndStats()
    }

    private fun loadPreferences() {
        val prefs = getSharedPreferences("pennywise_prefs", Context.MODE_PRIVATE)
        etSupabaseUrl.setText(prefs.getString("supabase_url", ""))
        etSupabaseKey.setText(prefs.getString("supabase_key", ""))
        etAllowedSenders.setText(prefs.getString("allowed_senders", "SBI,HDFC,ICICI,AXIS,PAYTM,PHONEPE"))
        etKeywords.setText(prefs.getString("keywords", "credited,received,deposited"))
    }

    private fun savePreferences() {
        val prefs = getSharedPreferences("pennywise_prefs", Context.MODE_PRIVATE)
        val editor = prefs.edit()

        val url = etSupabaseUrl.text.toString().trim()
        val key = etSupabaseKey.text.toString().trim()
        val senders = etAllowedSenders.text.toString().trim()
        val keywords = etKeywords.text.toString().trim()

        editor.putString("supabase_url", url)
        editor.putString("supabase_key", key)
        editor.putString("allowed_senders", senders)
        editor.putString("keywords", keywords)
        editor.apply()

        Toast.makeText(this, "Configurations Saved!", Toast.LENGTH_SHORT).show()
        refreshLogsAndStats()
    }

    private fun checkAndRequestPermissions() {
        val receiveSms = ContextCompat.checkSelfPermission(this, Manifest.permission.RECEIVE_SMS)
        val readSms = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS)
        
        val listPermissionsNeeded = ArrayList<String>()
        if (receiveSms != PackageManager.PERMISSION_GRANTED) {
            listPermissionsNeeded.add(Manifest.permission.RECEIVE_SMS)
        }
        if (readSms != PackageManager.PERMISSION_GRANTED) {
            listPermissionsNeeded.add(Manifest.permission.READ_SMS)
        }
        
        // Add Notification permission for Android 13+ (POST_NOTIFICATIONS)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            val notifications = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            if (notifications != PackageManager.PERMISSION_GRANTED) {
                listPermissionsNeeded.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }

        if (listPermissionsNeeded.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                listPermissionsNeeded.toTypedArray(),
                PERMISSION_REQUEST_CODE
            )
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSION_REQUEST_CODE) {
            var allGranted = true
            for (result in grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false
                }
            }
            if (allGranted) {
                Toast.makeText(this, "Permissions Granted!", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(this, "Permissions are required for SMS tracking!", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun triggerManualSync() {
        val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>().build()
        WorkManager.getInstance(this).enqueue(syncRequest)
        Toast.makeText(this, "Sync request enqueued!", Toast.LENGTH_SHORT).show()
        
        // Delay update slightly to allow WorkManager to run
        tvStats.postDelayed({
            refreshLogsAndStats()
        }, 1000)
    }

    private fun refreshLogsAndStats() {
        val db = dbHelper.readableDatabase
        
        // Count Total
        var totalCount = 0
        var cursor = db.rawQuery("SELECT COUNT(*) FROM ${DatabaseHelper.TABLE_SMS}", null)
        if (cursor.moveToFirst()) {
            totalCount = cursor.getInt(0)
        }
        cursor.close()

        // Count Unsynced
        var pendingCount = 0
        cursor = db.rawQuery("SELECT COUNT(*) FROM ${DatabaseHelper.TABLE_SMS} WHERE ${DatabaseHelper.COLUMN_SYNCED} = 0", null)
        if (cursor.moveToFirst()) {
            pendingCount = cursor.getInt(0)
        }
        cursor.close()

        tvStats.text = "Total Captured SMS: $totalCount\nPending Sync: $pendingCount"

        // Load logs
        cursor = db.rawQuery(
            "SELECT * FROM ${DatabaseHelper.TABLE_SMS} ORDER BY ${DatabaseHelper.COLUMN_ID} DESC LIMIT 50",
            null
        )

        val logBuilder = StringBuilder()
        val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())

        if (cursor.moveToFirst()) {
            do {
                val sender = cursor.getString(cursor.getColumnIndexOrThrow(DatabaseHelper.COLUMN_SENDER))
                val body = cursor.getString(cursor.getColumnIndexOrThrow(DatabaseHelper.COLUMN_BODY))
                val amount = cursor.getDouble(cursor.getColumnIndexOrThrow(DatabaseHelper.COLUMN_AMOUNT))
                val synced = cursor.getInt(cursor.getColumnIndexOrThrow(DatabaseHelper.COLUMN_SYNCED))
                val timestamp = cursor.getLong(cursor.getColumnIndexOrThrow(DatabaseHelper.COLUMN_TIMESTAMP))

                val statusLabel = if (synced == 1) "[SYNCED]" else "[PENDING]"
                val dateStr = dateFormat.format(Date(timestamp))

                logBuilder.append("$dateStr $statusLabel\n")
                logBuilder.append("From: $sender | Amt: Rs. $amount\n")
                logBuilder.append("Content: $body\n")
                logBuilder.append("------------------------------------\n\n")

            } while (cursor.moveToNext())
        } else {
            logBuilder.append("No SMS records captured in database yet.")
        }
        cursor.close()

        tvConsoleLogs.text = logBuilder.toString()
    }
}
