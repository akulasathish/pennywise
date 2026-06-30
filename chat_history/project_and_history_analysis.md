# PennyWise Project & Chat History Analysis

This document provides a clean, focused analysis of the **PennyWise** project codebase and its history, aligning with your goals.

---

## 1. Chat History Context (PennyWise-focused)

The chat logs trace the development of **PennyWise** as an offline UPI payment matching gateway designed for your Property Management System (PMS):

* **The Problem:** Direct bank credit alerts do not contain customer IDs. If multiple tenants pay the base rent (e.g. Rs. 1000) at the same time, automatic matching is impossible.
* **The Solution:** Allocate a unique fractional paisa amount (e.g. `Rs. 1000.00`, `Rs. 1000.01`, `Rs. 1000.02`) to each user during checkout.
* **Resilience Mechanisms:** 
  - **Cooldown Reservation:** Expired/completed fractional amounts enter a **30-minute cooldown** to prevent another tenant from receiving the same fraction.
  - **Late-Matching:** SMS logs arriving up to 30 minutes late can still reconcile expired sessions, avoiding conflicts.
  - **No UTR Dependability:** Designed to match on exact cents + time window rather than UTR, as bank messages do not always reliably include UTRs.
* **Integration Strategy (Path A):**
  - Use **MacroDroid** (free Android app) to forward raw incoming bank SMS text messages directly to the database. Setup details can be found in the [macrodroid_setup_guide.md](file:///home/sathish/.gemini/antigravity-cli/brain/a0aecd09-da42-455c-b315-72567741ea8e/macrodroid_setup_guide.md).
  - Run matching/parsing logic inside the **Supabase Cloud database** via SQL database triggers.

---

## 2. Project Codebase & Setup Status

The workspace has been adapted to support both local development and live production serverless environments.

### Core File Structure
* [package.json](file:///home/sathish/Desktop/projects/pennywise/package.json): Updated with `@supabase/supabase-js` and `serverless-http` dependencies.
* [server.js](file:///home/sathish/Desktop/projects/pennywise/server.js): Modified to export the Express `app` instance, and converted route handlers to support async database queries.
* [database.js](file:///home/sathish/Desktop/projects/pennywise/database.js): Rewritten to connect to Supabase Cloud if `SUPABASE_URL` and `SUPABASE_KEY` are provided. Otherwise, automatically falls back to local `db.json` file storage.
* [netlify.toml](file:///home/sathish/Desktop/projects/pennywise/netlify.toml): Configures Netlify functions and path redirection for deployments.
* [netlify/functions/api.js](file:///home/sathish/Desktop/projects/pennywise/netlify/functions/api.js): Entrypoint wrapping the Express application for Netlify's serverless pipeline.
* [.gitignore](file:///home/sathish/Desktop/projects/pennywise/.gitignore): Excludes build packages and database/env files.
* [supabase_sms_trigger.sql](file:///home/sathish/Desktop/projects/pennywise/supabase_sms_trigger.sql): Supabase SQL trigger script for automatic SMS payment reconciliation in the cloud.

---

## 3. Supabase Cloud Integration & Trigger Logic

We created [supabase_sms_trigger.sql](file:///home/sathish/Desktop/projects/pennywise/supabase_sms_trigger.sql). Executing this SQL in your Supabase Editor does the following:

1. Listens to `INSERT` operations on the `pennywise_sms_logs` table (triggered by MacroDroid).
2. Extracts payment amounts (e.g., `100.02`) from the message text using PL/pgSQL regex matching.
3. Finds matching pending (or expired within 30 minutes) requests in the `pennywise_payment_requests` table.
4. Reconciles transaction status to `completed` and updates the SMS log.
