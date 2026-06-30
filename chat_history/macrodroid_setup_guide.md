# MacroDroid SMS Forwarding Setup Guide

Using **MacroDroid** is the fastest and easiest way to forward your phone's incoming bank SMS alerts to your **Supabase Cloud database** without writing any Android code.

Follow these step-by-step instructions to configure MacroDroid on your phone:

---

## 1. Download MacroDroid
1. Open the **Google Play Store** on your Android device.
2. Search for **MacroDroid - Device Automation** and install it (free).

---

## 2. Create the Forwarding Macro

1. Open **MacroDroid** and click **Add Macro**.
2. Name the macro: `Forward Payments to Supabase`.

### Set the Trigger (Red Panel)
1. Click the **+** button on the Red panel.
2. Go to **Device Events** -> **SMS Received**.
3. Select **SMS from Any Number** (or choose "Select Number(s)" to filter specifically by bank senders like `SBI-Alert`, `HDFC`, etc.).
4. Under text matching, select **Any content** (or **Contains** and type keywords: `credited, received, deposited`).
5. Click **OK**.

### Set the Action (Blue Panel)
1. Click the **+** button on the Blue panel.
2. Go to **Applications** -> **HTTP Request**.
3. Configure the HTTP settings as follows:
   * **Method:** `POST`
   * **URL:** `https://<YOUR_SUPABASE_PROJECT_ID>.supabase.co/rest/v1/pennywise_sms_logs` 
     *(Replace `<YOUR_SUPABASE_PROJECT_ID>` with your actual Supabase project ID)*
   * **Content Type:** `application/json`
   * **Body / Block Content:** Copy and paste the JSON below:
     ```json
     {
       "sender": "{sms_number}",
       "body": "{sms_message}"
     }
     ```
4. Click the **Headers** option inside the HTTP action setup and add these two headers:
   * **Header 1:**
     * **Key:** `apikey`
     * **Value:** `YOUR_SUPABASE_ANON_KEY` *(Paste your actual Supabase `anon` API Key)*
   * **Header 2:**
     * **Key:** `Authorization`
     * **Value:** `Bearer YOUR_SUPABASE_ANON_KEY` *(Paste the exact same `anon` API Key here, prefixed with `Bearer `)*
5. Click **OK** to save the Action.

---

## 3. Enable Permissions & Save
1. Click the checkmark button in the bottom right corner to **Save** the Macro.
2. If Android prompts you, grant **SMS Permissions** to MacroDroid so it can read your incoming text messages.

---

## 4. Bypass Battery Optimization (Important)
To prevent Android from shutting down MacroDroid in the background when the screen is off:
1. Open phone **Settings** -> **Apps** -> **MacroDroid**.
2. Tap **Battery** (or Battery Saver).
3. Set it to **Unrestricted** (or **No restrictions**).
