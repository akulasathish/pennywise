// Admin Dashboard UI Controller
let appState = {
  users: [],
  payments: [],
  smsLogs: [],
  settings: {}
};

// DOM Elements
const panels = {
  dashboard: document.getElementById('panel-dashboard'),
  users: document.getElementById('panel-users'),
  payments: document.getElementById('panel-payments'),
  'sms-logs': document.getElementById('panel-sms-logs'),
  settings: document.getElementById('panel-settings'),
  'android-guide': document.getElementById('panel-android-guide')
};

const headings = {
  dashboard: { title: "Dashboard", sub: "Property Management Subscription Payment Portal" },
  users: { title: "User Accounts", sub: "Manage customer access and subscription statuses" },
  payments: { title: "Payment Links", sub: "Monitor unique fractional billing checkout requests" },
  'sms-logs': { title: "SMS Inbox Logs", sub: "Audit trail of webhook incoming SMS credit notifications" },
  settings: { title: "System Settings", sub: "Configure Penny-Wise matching rules and filters" },
  'android-guide': { title: "Android Sync Guide", sub: "Step-by-step instructions to connect your mobile device" }
};

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSettingsForm();
  initSmsSimulator();
  
  // Load data immediately and set up interval polling (every 4 seconds for admin)
  refreshAllData();
  setInterval(refreshAllData, 4000);

  // Setup static events
  document.getElementById('btn-reset-db').addEventListener('click', resetDatabase);
  document.getElementById('btn-create-checkout-direct').addEventListener('click', openCheckoutModal);
  document.getElementById('modal-checkout-cancel').addEventListener('click', closeCheckoutModal);
  document.getElementById('modal-checkout-confirm').addEventListener('click', confirmCreateCheckout);
});

// 1. Navigation Controller
function initNavigation() {
  const navItems = document.querySelectorAll('.sidebar .nav-item');
  const headingEl = document.getElementById('tab-heading');
  const subheadingEl = document.getElementById('tab-subheading');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.getAttribute('data-tab');
      
      // Update sidebar state
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      // Update Panel Visibility
      Object.keys(panels).forEach(pKey => {
        if (pKey === tabId) {
          panels[pKey].classList.add('active');
        } else {
          panels[pKey].classList.remove('active');
        }
      });

      // Update Title Text
      if (headings[tabId]) {
        headingEl.textContent = headings[tabId].title;
        subheadingEl.textContent = headings[tabId].sub;
      }
    });
  });
}

// 2. Fetch and Render Engine
async function refreshAllData() {
  try {
    const [usersRes, paymentsRes, smsRes, settingsRes] = await Promise.all([
      fetch('/api/users'),
      fetch('/api/payment-requests'),
      fetch('/api/sms'),
      fetch('/api/settings')
    ]);

    appState.users = await usersRes.json();
    appState.payments = await paymentsRes.json();
    appState.smsLogs = await smsRes.json();
    appState.settings = await settingsRes.json();

    // Render components
    renderMetrics();
    renderDashboardActivePayments();
    renderUsersPanel();
    renderPaymentsPanel();
    renderSmsLogsPanel();
    renderSettingsPanel();
    updateSimulatorDefaultText();
    updateLocalIpInGuide();
  } catch (err) {
    console.error("Error syncing app state with backend:", err);
  }
}

// 3. Render Metrics Overview
function renderMetrics() {
  // Total Earnings: sum of completed payments
  const completedPayments = appState.payments.filter(p => p.status === 'completed');
  const earnings = completedPayments.reduce((acc, curr) => acc + curr.amountExact, 0);
  document.getElementById('metric-earnings').textContent = `Rs. ${earnings.toFixed(2)}`;

  // Active Subscriptions: count of active users
  const activeUsers = appState.users.filter(u => u.status === 'active');
  document.getElementById('metric-active-subs').textContent = activeUsers.length;

  // Pending Payments: active non-expired requests
  const pendingPayments = appState.payments.filter(p => p.status === 'pending');
  document.getElementById('metric-pending').textContent = pendingPayments.length;
  document.getElementById('count-pending').textContent = `${pendingPayments.length} Active`;

  // SMS Received: total logs count
  document.getElementById('metric-sms').textContent = appState.smsLogs.length;
}

// 4. Render Active Payments on Dashboard
function renderDashboardActivePayments() {
  const container = document.getElementById('dashboard-active-payments');
  const pendingPayments = appState.payments.filter(p => p.status === 'pending');

  if (pendingPayments.length === 0) {
    container.innerHTML = `
      <p class="text-secondary" style="text-align: center; padding: 2rem;">No active checkout links. Generate one to see the flow!</p>
    `;
    return;
  }

  container.innerHTML = pendingPayments.map(pay => {
    const minLeft = Math.max(0, Math.round((pay.expiresAt - Date.now()) / 1000 / 60));
    return `
      <div class="list-item">
        <div class="item-main">
          <div class="item-avatar">${pay.userName.charAt(0)}</div>
          <div class="item-details">
            <span class="item-title">${pay.userName}</span>
            <span class="item-subtitle">Timeout in <strong>${minLeft}m</strong> • Ref: ${pay.id}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 1rem;">
          <span style="font-family: var(--font-display); font-weight: 700; color: var(--secondary);">Rs. ${pay.amountExact.toFixed(2)}</span>
          <button class="btn btn-secondary" onclick="window.open('/checkout.html?id=${pay.id}', '_blank')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">Launch Portal</button>
        </div>
      </div>
    `;
  }).join('');
}

// 5. Render Users Panel
function renderUsersPanel() {
  const container = document.getElementById('users-list');
  if (appState.users.length === 0) {
    container.innerHTML = `<p class="text-secondary" style="text-align: center; padding: 2rem;">No users found</p>`;
    return;
  }

  container.innerHTML = appState.users.map(u => {
    const hasActiveSub = u.status === 'active' && u.expiresAt && u.expiresAt > Date.now();
    const subText = hasActiveSub 
      ? `Subscription expires: ${new Date(u.expiresAt).toLocaleDateString()}` 
      : 'No active subscription';
    
    return `
      <div class="list-item">
        <div class="item-main">
          <div class="item-avatar">${u.name.charAt(0)}</div>
          <div class="item-details">
            <span class="item-title">${u.name}</span>
            <span class="item-subtitle">${u.email} • ${subText}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 1rem;">
          <span class="status-pill ${hasActiveSub ? 'active' : 'inactive'}">
            ${hasActiveSub ? 'Active' : 'Inactive'}
          </span>
          <button class="btn btn-primary" onclick="initiateUserCheckout('${u.id}')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">Get Checkout</button>
        </div>
      </div>
    `;
  }).join('');
}

// 6. Render Payments Panel
function renderPaymentsPanel() {
  const container = document.getElementById('payments-list');
  if (appState.payments.length === 0) {
    container.innerHTML = `<p class="text-secondary" style="text-align: center; padding: 2rem;">No payment requests generated yet</p>`;
    return;
  }

  // Sort payment links by creation time descending
  const sorted = [...appState.payments].sort((a,b) => b.createdAt - a.createdAt);

  container.innerHTML = sorted.map(p => {
    const dateStr = new Date(p.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let actionBtn = '';
    
    if (p.status === 'pending') {
      actionBtn = `<button class="btn btn-secondary" onclick="window.open('/checkout.html?id=${p.id}', '_blank')" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;">Open Portal</button>`;
    }

    return `
      <div class="list-item">
        <div class="item-main">
          <div class="item-details">
            <span class="item-title">${p.userName}</span>
            <span class="item-subtitle">Link generated at ${dateStr} • ID: ${p.id}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 1.5rem;">
          <div style="text-align: right;">
            <span style="font-family: var(--font-display); font-weight: 700; color: white; display: block; font-size: 1.1rem;">Rs. ${p.amountExact.toFixed(2)}</span>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Base: Rs. ${p.amountBase.toFixed(2)}</span>
          </div>
          <span class="status-pill ${p.status}">
            ${p.status}
          </span>
          ${actionBtn}
        </div>
      </div>
    `;
  }).join('');
}

// 7. Render SMS Logs Panel
function renderSmsLogsPanel() {
  const container = document.getElementById('sms-logs-list');
  if (appState.smsLogs.length === 0) {
    container.innerHTML = `<p class="text-secondary" style="text-align: center; padding: 2rem;">Inbox is empty. Try simulating an SMS on the Dashboard panel.</p>`;
    return;
  }

  // Sort by date descending
  const sorted = [...appState.smsLogs].sort((a,b) => b.createdAt - a.createdAt);

  container.innerHTML = sorted.map(sms => {
    const timeStr = new Date(sms.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const amountDetails = sms.parsedAmount 
      ? `<span style="font-family: var(--font-display); font-weight: 600; color: var(--secondary); margin-right: 1rem;">Rs. ${sms.parsedAmount.toFixed(2)}</span>`
      : '';

    return `
      <div class="list-item" style="flex-direction: column; align-items: flex-start; gap: 0.5rem;">
        <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-weight: 700; color: white;">${sms.sender}</span>
            <span style="font-size: 0.75rem; color: var(--text-muted);">${timeStr}</span>
          </div>
          <div style="display: flex; align-items: center;">
            ${amountDetails}
            <span class="status-pill ${sms.status}">${sms.status}</span>
          </div>
        </div>
        <p style="font-family: monospace; font-size: 0.85rem; color: var(--text-secondary); background: rgba(0,0,0,0.2); width: 100%; padding: 0.5rem 0.75rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.02);">
          ${sms.body}
        </p>
      </div>
    `;
  }).join('');
}

// 8. Settings Panel Management
let localSenders = [];
let localKeywords = [];

function initSettingsForm() {
  document.getElementById('form-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const basePrice = parseFloat(document.getElementById('set-base-price').value);
    const expiryMinutes = parseInt(document.getElementById('set-expiry').value);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          basePrice,
          expiryMinutes,
          allowedSenders: localSenders,
          keywords: localKeywords
        })
      });
      if (res.ok) {
        alert("System settings saved successfully!");
        refreshAllData();
      }
    } catch (e) {
      console.error(e);
    }
  });

  // Tag helper events
  document.getElementById('btn-add-sender').addEventListener('click', () => {
    const input = document.getElementById('set-new-sender');
    const val = input.value.trim().toUpperCase();
    if (val && !localSenders.includes(val)) {
      localSenders.push(val);
      input.value = '';
      renderSettingsTags();
    }
  });

  document.getElementById('btn-add-keyword').addEventListener('click', () => {
    const input = document.getElementById('set-new-keyword');
    const val = input.value.trim().toLowerCase();
    if (val && !localKeywords.includes(val)) {
      localKeywords.push(val);
      input.value = '';
      renderSettingsTags();
    }
  });
}

function renderSettingsPanel() {
  // Pre-fill inputs if not active edit
  if (document.activeElement !== document.getElementById('set-base-price')) {
    document.getElementById('set-base-price').value = appState.settings.basePrice;
  }
  if (document.activeElement !== document.getElementById('set-expiry')) {
    document.getElementById('set-expiry').value = appState.settings.expiryMinutes;
  }

  localSenders = appState.settings.allowedSenders || [];
  localKeywords = appState.settings.keywords || [];
  renderSettingsTags();
}

function renderSettingsTags() {
  const sendersContainer = document.getElementById('settings-senders');
  const keywordsContainer = document.getElementById('settings-keywords');

  sendersContainer.innerHTML = localSenders.map(sender => `
    <span class="tag">
      ${sender}
      <span class="tag-remove" onclick="removeSenderTag('${sender}')">&times;</span>
    </span>
  `).join('');

  keywordsContainer.innerHTML = localKeywords.map(kw => `
    <span class="tag">
      ${kw}
      <span class="tag-remove" onclick="removeKeywordTag('${kw}')">&times;</span>
    </span>
  `).join('');
}

function removeSenderTag(val) {
  localSenders = localSenders.filter(s => s !== val);
  renderSettingsTags();
}

function removeKeywordTag(val) {
  localKeywords = localKeywords.filter(k => k !== val);
  renderSettingsTags();
}

// 9. SMS Simulator Controller
function initSmsSimulator() {
  const templatesSelect = document.getElementById('sim-templates');
  const bodyTextarea = document.getElementById('sim-body');
  const senderInput = document.getElementById('sim-sender');
  
  const templateBank = {
    sbi: "Dear Customer, your A/c X5432 is credited with Rs.{AMOUNT} on 29-Jun-2026. Ref No: {REF}. SBI Bank.",
    hdfc: "Alert: Rs.{AMOUNT} credited to A/c X4321 on 29-06-2026 via UPI. Ref: {REF}. HDFC Bank.",
    icici: "ICICI Bank: Rs {AMOUNT} deposited to Account XX123 on 29/06/2026. Available Bal: Rs 15430.00.",
    custom: "My custom message with Rs {AMOUNT} in body."
  };

  function updateTemplate() {
    const selected = templatesSelect.value;
    const template = templateBank[selected];
    
    // Find active checkout request price to make simulation realistic
    const active = appState.payments.find(p => p.status === 'pending');
    const amountVal = active ? active.amountExact.toFixed(2) : "100.01";
    const mockRef = Math.floor(Math.random() * 10000000000);

    let filledText = template
      .replace(/{AMOUNT}/g, amountVal)
      .replace(/{REF}/g, mockRef);

    bodyTextarea.value = filledText;
    
    // Update sender
    if (selected === 'sbi') senderInput.value = 'SBI-Alert';
    else if (selected === 'hdfc') senderInput.value = 'HDFCBank';
    else if (selected === 'icici') senderInput.value = 'ICICIBank';
    
    updateSimAmountPreview();
  }

  templatesSelect.addEventListener('change', updateTemplate);
  bodyTextarea.addEventListener('input', updateSimAmountPreview);

  // Form submit Simulation
  document.getElementById('form-simulate-sms').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = bodyTextarea.value;
    const sender = senderInput.value;
    const consoleEl = document.getElementById('sim-console');

    consoleEl.textContent = `Sending simulated SMS webhook to POST /api/sms...\n`;

    try {
      const res = await fetch('/api/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender, body })
      });
      const data = await res.json();
      
      consoleEl.textContent += `Response status: ${res.status}\n`;
      consoleEl.textContent += `Response: ${JSON.stringify(data, null, 2)}\n`;
      consoleEl.scrollTop = consoleEl.scrollHeight;

      // Force instant refresh
      refreshAllData();
    } catch (err) {
      consoleEl.textContent += `ERROR: ${err.message}\n`;
    }
  });

  // Call once
  setTimeout(updateTemplate, 500);
}

function updateSimulatorDefaultText() {
  // This periodically adjusts the simulator amount to match any active pending checkout requests
  // so the user can just click "Simulate" and it matches instantly
  const active = appState.payments.find(p => p.status === 'pending');
  const previewText = document.getElementById('parsed-preview');
  
  if (active) {
    const amt = active.amountExact.toFixed(2);
    previewText.textContent = `Recommended simulation amount: Rs. ${amt}`;
  } else {
    previewText.textContent = `Detected Amount: Rs. ---`;
  }
}

function updateSimAmountPreview() {
  const body = document.getElementById('sim-body').value;
  // Mimic regex matching client-side
  const text = body.toLowerCase().replace(/,/g, '');
  const match = text.match(/(?:rs\.?|inr|rupees)\s*([0-9]+(?:\.[0-9]{1,2})?)/i) || text.match(/credited\s+(?:with|by|of)?\s*(?:rs\.?|inr)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i) || text.match(/\b([0-9]+\.[0-9]{2})\b/);
  const preview = document.getElementById('parsed-preview');

  if (match && match[1]) {
    preview.textContent = `Parsed amount from text: Rs. ${parseFloat(match[1]).toFixed(2)}`;
  } else {
    preview.textContent = `Parsed amount from text: Rs. ---`;
  }
}

// 10. Guide IP Helper
function updateLocalIpInGuide() {
  const localIpEl = document.getElementById('guide-webhook-url');
  // Dynamic host detection
  const host = window.location.host;
  localIpEl.textContent = `http://${host}/api/sms`;
}

// 11. Modal Dialog Managers
function openCheckoutModal() {
  const select = document.getElementById('checkout-user-select');
  select.innerHTML = appState.users.map(u => `<option value="${u.id}">${u.name} (${u.email})</option>`).join('');
  document.getElementById('modal-checkout').style.display = 'flex';
}

function closeCheckoutModal() {
  document.getElementById('modal-checkout').style.display = 'none';
}

async function confirmCreateCheckout() {
  const userId = document.getElementById('checkout-user-select').value;
  if (!userId) return;

  // Open blank window immediately to bypass pop-up blocker
  const newWindow = window.open('', '_blank');

  try {
    const res = await fetch('/api/payment-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (res.ok) {
      const pay = await res.json();
      closeCheckoutModal();
      refreshAllData();
      
      // Update the URL of the pre-opened window
      if (newWindow) {
        newWindow.location.href = `/checkout.html?id=${pay.id}`;
      }
    } else {
      if (newWindow) newWindow.close();
    }
  } catch (err) {
    console.error(err);
    if (newWindow) newWindow.close();
  }
}

function initiateUserCheckout(userId) {
  document.getElementById('modal-checkout').style.display = 'flex';
  setTimeout(() => {
    document.getElementById('checkout-user-select').value = userId;
  }, 100);
}

// 12. Reset DB Flow
async function resetDatabase() {
  if (confirm("Are you sure you want to reset the database? This will clear all pending payments and logs.")) {
    try {
      const res = await fetch('/api/simulate-reset', { method: 'POST' });
      if (res.ok) {
        alert("Database reset successfully!");
        refreshAllData();
      }
    } catch (e) {
      console.error(e);
    }
  }
}
