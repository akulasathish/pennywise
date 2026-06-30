const express = require('express');
const path = require('path');
const QRCode = require('qrcode');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Extract amount from SMS content
function parseSmsForAmount(body) {
  if (!body) return null;

  // Convert to lowercase, remove commas (thousand separators), and normalize spaces
  const text = body.toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ');

  // List of regex patterns to extract amounts (supports decimals and commas)
  const patterns = [
    // Pattern 1: rs. 100.02 or rs 100.02 or rs.100.02
    /(?:rs\.?|inr|rupees)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    
    // Pattern 2: credited with/by 100.02
    /credited\s+(?:with|by|of)?\s*(?:rs\.?|inr)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    
    // Pattern 3: received 100.02
    /received\s+(?:rs\.?|inr)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    
    // Pattern 4: deposited rs 100.02
    /deposited\s+(?:rs\.?|inr)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,

    // Pattern 5: general decimal matching as fallback if we see bank-related words
    /(?:credit|deposit|receive|ref|upi).+?\b([0-9]+\.[0-9]{2})\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const amount = parseFloat(match[1]);
      if (!isNaN(amount) && amount > 0) {
        return amount;
      }
    }
  }

  // Fallback: look for any decimal number
  const fallbackMatch = text.match(/\b([0-9]+\.[0-9]{2})\b/);
  if (fallbackMatch && fallbackMatch[1]) {
    const amount = parseFloat(fallbackMatch[1]);
    if (!isNaN(amount)) return amount;
  }

  return null;
}

// REST APIs

// 0. QR Code Generation (Offline Local Alternative)
app.get('/api/qr', async (req, res) => {
  const { data } = req.query;
  if (!data) {
    return res.status(400).send("Missing data parameter");
  }
  try {
    const qrBuffer = await QRCode.toBuffer(data, { type: 'png', margin: 1, width: 220 });
    res.setHeader('Content-Type', 'image/png');
    res.send(qrBuffer);
  } catch (err) {
    console.error("QR Code Generation Error:", err);
    res.status(500).send("Error generating QR code");
  }
});

// 1. Users
app.get('/api/users', async (req, res) => {
  try {
    const users = await db.get('users');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: "Name and email are required" });
  }
  try {
    const newUser = await db.insert('users', {
      name,
      email,
      status: 'inactive',
      expiresAt: null
    });
    res.status(201).json(newUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Payment Requests
app.get('/api/payment-requests', async (req, res) => {
  try {
    await db.cleanExpiredPayments();
    const requests = await db.get('paymentRequests');
    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payment-requests', async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: "User ID is required" });
  }

  try {
    const user = await db.getById('users', userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const settings = db.getSettings();
    const basePrice = settings.basePrice || 100.00;

    // Allocate exact penny-wise amount
    const paymentRequest = await db.allocatePennyWiseAmount(user.id, user.name, basePrice);
    res.status(201).json(paymentRequest);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Check individual payment status (polling)
app.get('/api/payment-status/:id', async (req, res) => {
  try {
    await db.cleanExpiredPayments();
    const payment = await db.getById('paymentRequests', req.params.id);
    if (!payment) {
      return res.status(404).json({ error: "Payment request not found" });
    }
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. SMS Management
app.get('/api/sms', async (req, res) => {
  try {
    const sms = await db.get('receivedSms');
    res.json(sms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. INCOMING SMS WEBHOOK (MacroDroid/Tasker or Simulator calls this)
app.post('/api/sms', async (req, res) => {
  const { sender, body } = req.body;
  
  if (!body) {
    return res.status(400).json({ error: "SMS body is required" });
  }

  const settings = db.getSettings();
  const normalizedSender = (sender || "UNKNOWN").toUpperCase();
  const lowerBody = body.toLowerCase();

  // Validate sender if filter is enabled
  let senderAllowed = true;
  if (settings.allowedSenders && settings.allowedSenders.length > 0) {
    senderAllowed = settings.allowedSenders.some(allowed => 
      normalizedSender.includes(allowed.toUpperCase())
    );
  }

  // Validate keywords
  let containsKeyword = true;
  if (settings.keywords && settings.keywords.length > 0) {
    containsKeyword = settings.keywords.some(kw => 
      lowerBody.includes(kw.toLowerCase())
    );
  }

  try {
    // If failed basic checks, mark as ignored
    if (!senderAllowed || !containsKeyword) {
      const ignoredSms = await db.insert('receivedSms', {
        sender: sender || "Unknown",
        body,
        parsedAmount: null,
        matchedPaymentId: null,
        status: "ignored"
      });
      return res.json({ 
        success: true, 
        status: "ignored", 
        reason: !senderAllowed ? "Sender not in allowed list" : "Keywords not matched",
        sms: ignoredSms 
      });
    }

    // Parse amount from SMS
    const amount = parseSmsForAmount(body);

    if (amount === null) {
      const unmatchedSms = await db.insert('receivedSms', {
        sender: sender || "Unknown",
        body,
        parsedAmount: null,
        matchedPaymentId: null,
        status: "unmatched"
      });
      return res.json({ 
        success: true, 
        status: "unmatched", 
        reason: "Could not parse amount from SMS content",
        sms: unmatchedSms 
      });
    }

    // Search for matching payment (either pending or recently expired within 30 minutes)
    await db.cleanExpiredPayments();
    const allRequests = await db.get('paymentRequests');
    const candidateRequests = allRequests.filter(req => {
      if (req.status === 'pending') return true;
      if (req.status === 'expired') {
        const timeSinceExpiry = Date.now() - req.expiresAt;
        return timeSinceExpiry < (30 * 60 * 1000); // 30 minutes cooldown
      }
      return false;
    });
    
    // Find a match (match amount exactly with float tolerance)
    const match = candidateRequests.find(req => Math.abs(req.amountExact - amount) < 0.005);

    if (match) {
      // 1. Mark payment as completed
      await db.update('paymentRequests', match.id, { status: "completed" });

      // 2. Activate user subscription (e.g. valid for 30 days)
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      await db.update('users', match.userId, { 
        status: "active", 
        expiresAt: Date.now() + thirtyDays 
      });

      // 3. Log SMS as processed
      const processedSms = await db.insert('receivedSms', {
        sender: sender || "Unknown",
        body,
        parsedAmount: amount,
        matchedPaymentId: match.id,
        status: "processed"
      });

      return res.json({
        success: true,
        status: "processed",
        amount,
        matchedUser: match.userName,
        paymentId: match.id,
        sms: processedSms
      });
    } else {
      // Log SMS as unmatched (amount parsed but no active pending checkout matched)
      const unmatchedSms = await db.insert('receivedSms', {
        sender: sender || "Unknown",
        body,
        parsedAmount: amount,
        matchedPaymentId: null,
        status: "unmatched"
      });

      return res.json({
        success: true,
        status: "unmatched",
        amount,
        reason: `Parsed amount Rs. ${amount.toFixed(2)} but found no active pending payment for this exact amount`,
        sms: unmatchedSms
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Settings REST
app.get('/api/settings', (req, res) => {
  res.json(db.getSettings());
});

app.post('/api/settings', (req, res) => {
  const updated = db.updateSettings(req.body);
  res.json(updated);
});

// 7. Reset DB (Simulator only)
app.post('/api/simulate-reset', (req, res) => {
  const fs = require('fs');
  const DB_FILE = path.join(__dirname, 'db.json');
  try {
    if (fs.existsSync(DB_FILE)) {
      fs.unlinkSync(DB_FILE);
    }
    db.init();
    res.json({ success: true, message: "Database reset to initial mockup data" });
  } catch (e) {
    res.status(500).json({ error: "Failed to reset database" });
  }
});

// Catch-all to serve index.html for unknown routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`PennyWise Backend Server running!`);
    console.log(`Local Access: http://localhost:${PORT}`);
    console.log(`========================================`);
  });
}

