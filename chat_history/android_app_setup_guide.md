# PennyWise Android App Setup Guide

I have created a complete, native Android Studio project inside your workspace directory at [android-app](file:///home/sathish/Desktop/projects/pennywise/android-app). 

This app runs on your physical Android phone, listens for incoming bank transaction SMS notifications, parses the amount, and writes them directly to your remote **Supabase Cloud database**.

---

## 1. Project Directory Structure

You can view the source files directly here:
* **Settings:** [settings.gradle](file:///home/sathish/Desktop/projects/pennywise/android-app/settings.gradle) & [app/build.gradle](file:///home/sathish/Desktop/projects/pennywise/android-app/app/build.gradle) (WorkManager + OkHttp dependencies configured).
* **Manifest:** [AndroidManifest.xml](file:///home/sathish/Desktop/projects/pennywise/android-app/app/src/main/AndroidManifest.xml) (Declares SMS, Internet permissions, and listener).
* **Settings Layout:** [activity_main.xml](file:///home/sathish/Desktop/projects/pennywise/android-app/app/src/main/res/layout/activity_main.xml) (The app configurations UI).
* **Main Logic:** [MainActivity.kt](file:///home/sathish/Desktop/projects/pennywise/android-app/app/src/main/java/com/pennywise/smslistener/MainActivity.kt) (Saves keys in preferences, requests runtime permissions, displays logs).
* **SMS Interceptor:** [SMSReceiver.kt](file:///home/sathish/Desktop/projects/pennywise/android-app/app/src/main/java/com/pennywise/smslistener/SMSReceiver.kt) (Catches incoming messages, applies filters, and parses amounts).
* **Sync Manager:** [SyncWorker.kt](file:///home/sathish/Desktop/projects/pennywise/android-app/app/src/main/java/com/pennywise/smslistener/SyncWorker.kt) (Performs HTTP POST requests to your Supabase `/rest/v1/pennywise_sms_logs` endpoint, retrying automatically if offline).

---

## 2. Setup & Installation Steps

### Step 1: Open in Android Studio
1. Open **Android Studio** on your computer.
2. Select **File** -> **Open**.
3. Choose the [android-app](file:///home/sathish/Desktop/projects/pennywise/android-app) folder.
4. Allow Gradle to download dependencies and sync the project (takes ~1-2 minutes).

### Step 2: Build & Install
1. Connect your physical Android phone to your computer with a USB cable.
2. Enable **USB Debugging** on your phone (Settings -> Developer Options -> USB Debugging).
3. Select your device in the top toolbar dropdown in Android Studio.
4. Click the green **Run** (Play) button. The app will compile and install on your phone automatically.
5. *Alternatively:* Go to **Build** -> **Build Bundle(s) / APK(s)** -> **Build APK(s)** to generate a standalone `.apk` file that you can share or install manually.

### Step 3: Configure Settings in the App UI
When you open the app on your phone, you don't need to write any code. Simply fill out the text fields:
1. **Supabase URL:** Enter your Supabase Project URL (`https://xyz.supabase.co`).
2. **Supabase Key:** Enter your Supabase `anon` API Key.
3. **Allowed Senders:** Specify bank SMS senders (e.g., `SBI-Alert, HDFC, ICICI, AXIS`).
4. **Keywords:** Specify credit filters (e.g., `credited, received, deposited`).
5. Click **Save Configurations**.
6. When prompted, grant **SMS Receive** and **SMS Read** permissions.

---

## 3. Disabling Android Background Restrictions (Critical)

Modern Android versions aggressively put background apps to sleep to save battery. To ensure the app can scan incoming SMS 24/7 without being closed:

1. Open your phone's **Settings**.
2. Go to **Apps** -> **PennyWise SMS Listener**.
3. Tap on **Battery** or **Battery Saver**.
4. Set it to **Unrestricted** (or **No Restrictions**).
5. Ensure **Background data** is enabled under mobile data usage settings.
