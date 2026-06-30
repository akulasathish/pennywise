const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const DB_FILE = path.join(__dirname, 'db.json');

// Initialize Supabase Client if env vars are present
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;
let supabase = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log("========================================");
    console.log("Supabase Client initialized successfully!");
    console.log("========================================");
  } catch (err) {
    console.error("Failed to initialize Supabase client:", err);
  }
}

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
    this.localData = null;
    this.initLocal();
  }

  initLocal() {
    if (!fs.existsSync(DB_FILE)) {
      this.localData = JSON.parse(JSON.stringify(defaultData));
      this.saveLocal();
    } else {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.localData = JSON.parse(raw);
        for (const key of Object.keys(defaultData)) {
          if (!this.localData[key]) {
            this.localData[key] = JSON.parse(JSON.stringify(defaultData[key]));
          }
        }
      } catch (e) {
        console.error("Error reading database file, resetting to defaults:", e);
        this.localData = JSON.parse(JSON.stringify(defaultData));
        this.saveLocal();
      }
    }
  }

  saveLocal() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.localData, null, 2), 'utf8');
    } catch (e) {
      console.error("Error saving database file:", e);
    }
  }

  // Get active Supabase instance status
  isSupabaseEnabled() {
    return supabase !== null;
  }

  // Generic Helpers (Async supported)
  async get(collection) {
    if (supabase) {
      if (collection === 'paymentRequests') {
        const { data, error } = await supabase.from('pennywise_payment_requests').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map(d => this.mapFromSupabase(collection, d));
      }
      if (collection === 'receivedSms') {
        const { data, error } = await supabase.from('pennywise_sms_logs').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return (data || []).map(d => this.mapFromSupabase(collection, d));
      }
    }
    return this.localData[collection] || [];
  }

  async getById(collection, id) {
    if (supabase) {
      if (collection === 'paymentRequests') {
        const { data, error } = await supabase.from('pennywise_payment_requests').select('*').eq('id', id).maybeSingle();
        if (error) throw error;
        return data ? this.mapFromSupabase(collection, data) : null;
      }
      if (collection === 'users') {
        // Fallback for user simulation
        return this.localData.users.find(u => u.id === id);
      }
    }
    const list = await this.get(collection);
    return list.find(item => item.id === id);
  }

  async insert(collection, item) {
    if (supabase) {
      if (collection === 'paymentRequests') {
        const mapped = this.mapToSupabase(collection, item);
        const { data, error } = await supabase.from('pennywise_payment_requests').insert(mapped).select().single();
        if (error) throw error;
        return this.mapFromSupabase(collection, data);
      }
      if (collection === 'receivedSms') {
        const mapped = this.mapToSupabase(collection, item);
        const { data, error } = await supabase.from('pennywise_sms_logs').insert(mapped).select().single();
        if (error) throw error;
        return this.mapFromSupabase(collection, data);
      }
    }

    if (!this.localData[collection]) {
      this.localData[collection] = [];
    }
    const newItem = { 
      id: `${collection.slice(0, 3)}_${Math.random().toString(36).substring(2, 9)}`, 
      ...item, 
      createdAt: Date.now() 
    };
    this.localData[collection].push(newItem);
    this.saveLocal();
    return newItem;
  }

  async update(collection, id, updates) {
    if (supabase) {
      if (collection === 'paymentRequests') {
        const mapped = this.mapToSupabase(collection, updates);
        const { data, error } = await supabase.from('pennywise_payment_requests').update(mapped).eq('id', id).select().single();
        if (error) throw error;
        return this.mapFromSupabase(collection, data);
      }
    }

    const list = this.localData[collection] || [];
    const index = list.findIndex(item => item.id === id);
    if (index !== -1) {
      list[index] = { ...list[index], ...updates, updatedAt: Date.now() };
      this.saveLocal();
      return list[index];
    }
    return null;
  }

  // Settings
  getSettings() {
    return this.localData.settings;
  }

  updateSettings(newSettings) {
    this.localData.settings = { ...this.localData.settings, ...newSettings };
    this.saveLocal();
    return this.localData.settings;
  }

  // clean expired checkouts
  async cleanExpiredPayments() {
    const now = new Date().toISOString();
    if (supabase) {
      const { error } = await supabase
        .from('pennywise_payment_requests')
        .update({ status: 'expired', updated_at: now })
        .eq('status', 'pending')
        .lt('expires_at', now);
      if (error) console.error("Error cleaning expired payments on Supabase:", error);
    } else {
      const nowMs = Date.now();
      let updated = false;
      this.localData.paymentRequests.forEach(req => {
        if (req.status === 'pending' && req.expiresAt < nowMs) {
          req.status = 'expired';
          req.updatedAt = nowMs;
          updated = true;
        }
      });
      if (updated) {
        this.saveLocal();
      }
    }
  }

  // Unique amount allocation logic
  async allocatePennyWiseAmount(userId, userName, basePrice) {
    await this.cleanExpiredPayments();
    
    const COOLDOWN_MS = 30 * 60 * 1000;
    const now = Date.now();
    const expiryMin = this.localData.settings.expiryMinutes || 10;
    
    let blockedRequests = [];
    
    if (supabase) {
      const cutoffTime = new Date(now - COOLDOWN_MS).toISOString();
      const { data, error } = await supabase
        .from('pennywise_payment_requests')
        .select('*')
        .or(`status.eq.pending,updated_at.gt.${cutoffTime},created_at.gt.${cutoffTime}`);
      
      if (error) throw error;
      blockedRequests = data.map(d => this.mapFromSupabase('paymentRequests', d));
    } else {
      blockedRequests = this.localData.paymentRequests.filter(req => {
        if (req.status === 'pending') return true;
        const lastActiveTime = req.updatedAt || req.expiresAt || req.createdAt;
        return (now - lastActiveTime) < COOLDOWN_MS;
      });
    }
    
    const allocatedExactAmounts = new Set(blockedRequests.map(req => Number(req.amountExact).toFixed(2)));
    
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
    
    if (!found) {
      targetAmount = parseFloat((basePrice + Math.random()).toFixed(2));
    }

    const newRequest = {
      userId,
      userName,
      amountBase: basePrice,
      amountExact: targetAmount,
      status: "pending",
      expiresAt: now + expiryMin * 60 * 1000
    };
    
    return await this.insert('paymentRequests', newRequest);
  }

  // Mapping converters between Local format and Supabase snake_case format
  mapToSupabase(collection, item) {
    if (collection === 'paymentRequests') {
      const result = {};
      if (item.userId !== undefined) result.user_id = item.userId;
      if (item.userName !== undefined) result.user_name = item.userName;
      if (item.amountBase !== undefined) result.amount_base = item.amountBase;
      if (item.amountExact !== undefined) result.amount_exact = item.amountExact;
      if (item.status !== undefined) result.status = item.status;
      if (item.expiresAt !== undefined) result.expires_at = new Date(item.expiresAt).toISOString();
      if (item.createdAt !== undefined) result.created_at = new Date(item.createdAt).toISOString();
      return result;
    }
    if (collection === 'receivedSms') {
      return {
        sender: item.sender,
        body: item.body,
        parsed_amount: item.parsedAmount,
        status: item.status
      };
    }
    return item;
  }

  mapFromSupabase(collection, row) {
    if (collection === 'paymentRequests') {
      return {
        id: row.id,
        userId: row.user_id,
        userName: row.user_name,
        amountBase: parseFloat(row.amount_base),
        amountExact: parseFloat(row.amount_exact),
        status: row.status,
        expiresAt: new Date(row.expires_at).getTime(),
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime()
      };
    }
    if (collection === 'receivedSms') {
      return {
        id: row.id,
        sender: row.sender,
        body: row.body,
        parsedAmount: row.parsed_amount ? parseFloat(row.parsed_amount) : null,
        status: row.status,
        createdAt: new Date(row.created_at).getTime()
      };
    }
    return row;
  }
}

module.exports = new Database();
