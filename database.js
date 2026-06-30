const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'db.json');

const defaultData = {
  users: [
    { id: "usr_1", name: "Rohan Sharma", email: "rohan@example.com", status: "inactive", expiresAt: null },
    { id: "usr_2", name: "Priya Patel", email: "priya@example.com", status: "active", expiresAt: Date.now() + 15 * 24 * 60 * 60 * 1000 },
    { id: "usr_3", name: "Amit Kumar", email: "amit@example.com", status: "inactive", expiresAt: null }
  ],
  paymentRequests: [
    {
      id: "pay_1",
      userId: "usr_2",
      userName: "Priya Patel",
      amountBase: 100,
      amountExact: 100.00,
      status: "completed",
      createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000,
      expiresAt: Date.now() - 15 * 24 * 60 * 60 * 1000 + 10 * 60 * 1000
    }
  ],
  receivedSms: [
    {
      id: "sms_1",
      sender: "SBI-Alert",
      body: "Dear Customer, your A/c X5432 is credited with Rs.100.00 on 14-Jun-2026. Ref No: 9876543210. SBI Bank.",
      parsedAmount: 100.00,
      matchedPaymentId: "pay_1",
      status: "processed",
      createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000 + 1 * 60 * 1000
    }
  ],
  settings: {
    basePrice: 100.00,
    currency: "INR",
    expiryMinutes: 10,
    allowedSenders: ["SBI", "HDFC", "ICICI", "AXIS", "PAYTM", "PHONEPE", "UNION", "BOB"],
    keywords: ["credited", "received", "deposited", "credited with", "received rs"]
  }
};

class Database {
  constructor() {
    this.init();
  }

  init() {
    if (!fs.existsSync(DB_FILE)) {
      this.data = JSON.parse(JSON.stringify(defaultData));
      this.save();
    } else {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.data = JSON.parse(raw);
        // Ensure all default keys exist
        for (const key of Object.keys(defaultData)) {
          if (!this.data[key]) {
            this.data[key] = JSON.parse(JSON.stringify(defaultData[key]));
          }
        }
      } catch (e) {
        console.error("Error reading database file, resetting to defaults:", e);
        this.data = JSON.parse(JSON.stringify(defaultData));
        this.save();
      }
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      console.error("Error saving database file:", e);
    }
  }

  // Generic Helpers
  get(collection) {
    return this.data[collection] || [];
  }

  getById(collection, id) {
    const list = this.get(collection);
    return list.find(item => item.id === id);
  }

  insert(collection, item) {
    if (!this.data[collection]) {
      this.data[collection] = [];
    }
    const newItem = { id: `${collection.slice(0, 3)}_${Math.random().toString(36).substring(2, 9)}`, ...item, createdAt: Date.now() };
    this.data[collection].push(newItem);
    this.save();
    return newItem;
  }

  update(collection, id, updates) {
    const list = this.get(collection);
    const index = list.findIndex(item => item.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...updates, updatedAt: Date.now() };
      this.save();
      return list[index];
    }
    return null;
  }

  delete(collection, id) {
    const list = this.get(collection);
    const index = list.findIndex(item => item.id === id);
    if (index !== -1) {
      const removed = list.splice(index, 1)[0];
      this.save();
      return removed;
    }
    return null;
  }

  // Settings helpers
  getSettings() {
    return this.data.settings;
  }

  updateSettings(newSettings) {
    this.data.settings = { ...this.data.settings, ...newSettings };
    this.save();
    return this.data.settings;
  }

  // Clean expired payments
  cleanExpiredPayments() {
    const now = Date.now();
    let updated = false;
    this.data.paymentRequests.forEach(req => {
      if (req.status === 'pending' && req.expiresAt < now) {
        req.status = 'expired';
        req.updatedAt = now;
        updated = true;
      }
    });
    if (updated) {
      this.save();
    }
  }

  // Core Penny-Wise allocation algorithm
  allocatePennyWiseAmount(userId, userName, basePrice) {
    this.cleanExpiredPayments();
    
    const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes cooldown
    const now = Date.now();
    
    // Get all requests that are currently pending, or completed/expired within cooldown
    const blockedRequests = this.data.paymentRequests.filter(req => {
      if (req.status === 'pending') return true;
      const lastActiveTime = req.updatedAt || req.expiresAt || req.createdAt;
      return (now - lastActiveTime) < COOLDOWN_MS;
    });
    
    // Find already allocated exact amounts among blocked requests
    const allocatedExactAmounts = new Set(blockedRequests.map(req => Number(req.amountExact).toFixed(2)));
    
    // Search for a free fractional amount starting from basePrice + 0.00 up to basePrice + 0.99
    let targetAmount = basePrice;
    let increment = 0.01;
    let found = false;
    
    for (let i = 0; i < 100; i++) {
      const currentCandidate = (basePrice + (i * increment));
      const candidateStr = currentCandidate.toFixed(2);
      
      if (!allocatedExactAmounts.has(candidateStr)) {
        targetAmount = parseFloat(candidateStr);
        found = true;
        break;
      }
    }
    
    // If we somehow exceed 100 concurrent payments, reset to a random cents
    if (!found) {
      targetAmount = parseFloat((basePrice + Math.random()).toFixed(2));
    }

    const expiryMin = this.data.settings.expiryMinutes || 10;
    
    const newRequest = {
      userId,
      userName,
      amountBase: basePrice,
      amountExact: targetAmount,
      status: "pending",
      expiresAt: Date.now() + expiryMin * 60 * 1000
    };
    
    return this.insert('paymentRequests', newRequest);
  }
}

module.exports = new Database();
