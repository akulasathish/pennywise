// Checkout Portal Logic
let timerInterval = null;
let statusInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const paymentId = urlParams.get('id');

  if (!paymentId) {
    showErrorGate("Invalid Session ID", "Please request a checkout link through the Property Management Dashboard.");
    return;
  }

  // Initial load
  loadPaymentDetails(paymentId);
  
  // Poll payment status every 2.5 seconds
  statusInterval = setInterval(() => {
    pollPaymentStatus(paymentId);
  }, 2500);
});

// Load details from server
async function loadPaymentDetails(paymentId) {
  try {
    const res = await fetch(`/api/payment-status/${paymentId}`);
    if (!res.ok) {
      showErrorGate("Payment Link Not Found", "The requested checkout portal ID does not exist in our PMS records.");
      return;
    }

    const payment = await res.json();
    
    // Check if already processed
    if (payment.status === 'completed') {
      showSuccessGate(payment);
      return;
    } else if (payment.status === 'expired') {
      showErrorGate("Session Expired", "The 10-minute reservation window for this unique fractional payment has expired.");
      return;
    }

    // Populate checkout values
    document.getElementById('checkout-for').textContent = `Subscription for: ${payment.userName}`;
    
    // Split amount to highlight cents (paise)
    const amtStr = payment.amountExact.toFixed(2);
    const parts = amtStr.split('.');
    document.getElementById('amount-rupees').textContent = parts[0];
    document.getElementById('amount-paise').textContent = `.${parts[1]}`;
    document.getElementById('instruction-exact-amount').textContent = `Rs. ${amtStr}`;

    // Initialize UPI QR Code
    generateUpiQrCode(payment);

    // Initialize Countdown Timer
    startCountdown(payment.expiresAt);

  } catch (err) {
    console.error("Error loading payment portal:", err);
    showErrorGate("Connection Error", "Failed to reach the PMS server. Please try again later.");
  }
}

// Generate UPI QR using offline local endpoint
function generateUpiQrCode(payment) {
  // standard UPI URL: upi://pay?pa=upi_address&pn=payee_name&am=amount&cu=currency&tn=note
  // Note: we can use a mock UPI address, e.g., 'pmsmerchant@upi' or a generic one.
  const upiId = "pmsmerchant@okaxis"; // Mock UPI ID, easily configurable
  const merchantName = "PennyWise PMS Subscriptions";
  const amountStr = payment.amountExact.toFixed(2);
  const note = `Subscription Fee ID ${payment.id}`;

  const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}&am=${amountStr}&cu=INR&tn=${encodeURIComponent(note)}`;
  const qrServerUrl = `/api/qr?data=${encodeURIComponent(upiUrl)}`;

  const imgEl = document.getElementById('upi-qr');
  const loadingEl = document.getElementById('qr-loading');

  imgEl.src = qrServerUrl;
  imgEl.onload = () => {
    loadingEl.style.display = 'none';
    imgEl.style.display = 'block';
  };
}

// Countdown Timer logic
function startCountdown(expiresAt) {
  if (timerInterval) clearInterval(timerInterval);

  const timerTextEl = document.getElementById('timer-text');
  
  function updateTimer() {
    const timeLeftMs = expiresAt - Date.now();

    if (timeLeftMs <= 0) {
      clearInterval(timerInterval);
      clearInterval(statusInterval);
      showErrorGate("Session Expired", "The 10-minute reservation window for this unique fractional payment has expired.");
      return;
    }

    const minutes = Math.floor(timeLeftMs / 1000 / 60);
    const seconds = Math.floor((timeLeftMs / 1000) % 60);

    const minStr = String(minutes).padStart(2, '0');
    const secStr = String(seconds).padStart(2, '0');

    timerTextEl.textContent = `${minStr}:${secStr} minutes remaining`;
  }

  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

// Poll status in background
async function pollPaymentStatus(paymentId) {
  try {
    const res = await fetch(`/api/payment-status/${paymentId}`);
    if (res.ok) {
      const payment = await res.json();
      if (payment.status === 'completed') {
        clearInterval(timerInterval);
        clearInterval(statusInterval);
        showSuccessGate(payment);
      } else if (payment.status === 'expired') {
        clearInterval(timerInterval);
        clearInterval(statusInterval);
        showErrorGate("Session Expired", "The 10-minute reservation window for this unique fractional payment has expired.");
      }
    }
  } catch (err) {
    console.warn("Polling error:", err);
  }
}

// Display transition gates
function showSuccessGate(payment) {
  document.getElementById('payment-gate').style.display = 'none';
  document.getElementById('error-gate').style.display = 'none';
  
  // Populate receipt
  document.getElementById('receipt-user').textContent = `Subscriber: ${payment.userName}`;
  document.getElementById('receipt-amount').textContent = `Amount Paid: Rs. ${payment.amountExact.toFixed(2)}`;
  document.getElementById('receipt-id').textContent = `Reference ID: ${payment.id}`;
  
  document.getElementById('success-gate').style.display = 'block';
  document.title = "Payment Confirmed! - PennyWise";
}

function showErrorGate(title, subtitle) {
  document.getElementById('payment-gate').style.display = 'none';
  document.getElementById('success-gate').style.display = 'none';
  
  const errorGate = document.getElementById('error-gate');
  errorGate.querySelector('h2').textContent = title;
  errorGate.querySelector('p').textContent = subtitle;
  
  errorGate.style.display = 'block';
  document.title = "Session Expired - PennyWise";
}
