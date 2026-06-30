package com.pennywise.smslistener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.SmsMessage
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.regex.Pattern

class SMSReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == "android.provider.Telephony.SMS_RECEIVED") {
            val bundle = intent.extras
            if (bundle != null) {
                val pdus = bundle["pdus"] as Array<*>? ?: return
                for (pdu in pdus) {
                    val message = SmsMessage.createFromPdu(pdu as ByteArray)
                    val sender = message.originatingAddress ?: "UNKNOWN"
                    val body = message.messageBody ?: ""

                    if (shouldProcessSms(context, sender, body)) {
                        val amount = parseAmount(body)

                        // Save locally
                        val db = DatabaseHelper(context)
                        db.insertSms(sender, body, amount)

                        // Trigger sync background worker
                        val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>().build()
                        WorkManager.getInstance(context).enqueue(syncRequest)
                    }
                }
            }
        }
    }

    private fun shouldProcessSms(context: Context, sender: String, body: String): Boolean {
        val prefs = context.getSharedPreferences("pennywise_prefs", Context.MODE_PRIVATE)
        
        // 1. Get configurations from SharedPreferences (with safe defaults)
        val allowedSendersStr = prefs.getString("allowed_senders", "SBI,HDFC,ICICI,AXIS,PAYTM,PHONEPE") ?: ""
        val keywordsStr = prefs.getString("keywords", "credited,received,deposited") ?: ""

        val allowedSenders = allowedSendersStr.split(",").map { it.trim().uppercase() }.filter { it.isNotEmpty() }
        val keywords = keywordsStr.split(",").map { it.trim().lowercase() }.filter { it.isNotEmpty() }

        val normSender = sender.uppercase()
        val normBody = body.lowercase()

        // 2. Validate sender filter
        var senderMatch = false
        if (allowedSenders.isEmpty()) {
            senderMatch = true // If empty allowed list, accept all senders
        } else {
            for (allowed in allowedSenders) {
                if (normSender.contains(allowed)) {
                    senderMatch = true
                    break
                }
            }
        }

        // 3. Validate keyword filter
        var keywordMatch = false
        if (keywords.isEmpty()) {
            keywordMatch = true // If empty keywords, accept all
        } else {
            for (kw in keywords) {
                if (normBody.contains(kw)) {
                    keywordMatch = true
                    break
                }
            }
        }

        return senderMatch && keywordMatch;
    }

    private fun parseAmount(body: String): Double? {
        // Remove commas (thousand separators) and lowercase for uniform regex matching
        val text = body.lowercase().replace(",", "")
        
        val patterns = arrayOf(
            Pattern.compile("(?:rs\\.?|inr|rupees)\\s*([0-9]+(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("credited\\s+(?:with|by|of)?\s*(?:rs\\.?|inr)?\s*([0-9]+(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("received\\s+(?:rs\\.?|inr)?\s*([0-9]+(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("deposited\\s+(?:rs\\.?|inr)?\s*([0-9]+(?:\\.[0-9]{1,2})?)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("\\b([0-9]+\\.[0-9]{2})\\b") // Decimal number check fallback
        )
        
        for (pattern in patterns) {
            val matcher = pattern.matcher(text)
            if (matcher.find()) {
                try {
                    val amtStr = matcher.group(1)
                    if (amtStr != null) {
                        return amtStr.toDouble()
                    }
                } catch (e: Exception) {
                    // Fail-safe
                }
            }
        }
        return null
    }
}
