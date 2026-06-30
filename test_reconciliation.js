const { createClient } = require('@supabase/supabase-js');

// Parse command line arguments
const args = process.argv.slice(2);
const supabaseUrl = args[0] || process.env.SUPABASE_URL;
const supabaseKey = args[1] || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log("Usage: node test_reconciliation.js <SUPABASE_URL> <SUPABASE_KEY>");
  console.log("Please provide your Supabase URL and Key as arguments or environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runTest() {
  console.log("==================================================");
  console.log("PennyWise Live Pipeline Test Script");
  console.log("==================================================");
  
  // Clean up any old test requests for 1000.77
  await supabase
    .from('pennywise_payment_requests')
    .delete()
    .eq('amount_exact', 1000.77);

  console.log("1. Generating a test payment request for Rs. 1000.77...");
  
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins expiry
  
  const { data: request, error } = await supabase
    .from('pennywise_payment_requests')
    .insert({
      user_id: 'usr_test_99',
      user_name: 'Live Test Tenant',
      amount_base: 1000.00,
      amount_exact: 1000.77,
      status: 'pending',
      expires_at: expiresAt
    })
    .select()
    .single();

  if (error) {
    console.error("❌ Failed to create payment request in Supabase:", error.message);
    return;
  }

  console.log(`✅ Success! Payment request created in Supabase with ID: ${request.id}`);
  console.log(`💵 Expected payment amount: Rs. 1000.77`);
  console.log("--------------------------------------------------");
  
  console.log("2. Waiting for incoming SMS via MacroDroid...");
  console.log("👉 ACTION REQUIRED: Send a test SMS to your phone containing the exact amount.");
  console.log("Example SMS text:\n'Dear Customer, Your a/c no. XXXXXXXX9349 is credited by Rs. 1000.77'");
  console.log("\nWatching Supabase Realtime changes... (Press Ctrl+C to cancel)");
  
  // Set up realtime listener
  const channel = supabase
    .channel('db-changes')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'pennywise_payment_requests',
        filter: `id=eq.${request.id}`
      },
      (payload) => {
        const updatedRequest = payload.new;
        if (updatedRequest.status === 'completed') {
          console.log("\n🎉 SUCCESS! 🎉");
          console.log("==================================================");
          console.log("✅ The payment request has been completed!");
          console.log(`ID: ${updatedRequest.id}`);
          console.log(`User: ${updatedRequest.user_name}`);
          console.log(`Amount Reconciled: Rs. ${updatedRequest.amount_exact}`);
          console.log("==================================================");
          channel.unsubscribe();
          process.exit(0);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log("📡 Connected to Supabase Realtime! Send the SMS now.");
      }
    });
}

runTest();
