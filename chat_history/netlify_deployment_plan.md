# Netlify Deployment Plan for PennyWise

Netlify is an excellent, **100% free** alternative for deploying the PennyWise application. It serves your static frontend assets (HTML/CSS/JS) via a global CDN and executes your Express backend APIs using **Netlify Serverless Functions** (which run on AWS Lambda under the hood, completely managed by Netlify).

---

## 1. How It Works

Instead of running a Node.js server 24/7, Netlify splits your application into two parts:

1. **Frontend (`public/` directory):** Hosted as static files. Super fast and secure.
2. **Backend APIs (`/api/*` routes):** Handled by a single Netlify Function that runs your existing Express logic wrapped in a serverless adapter.

```
                   ┌──────────────────────────┐
                   │  User / Webhook Request  │
                   └────────────┬─────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  Netlify Edge   │
                       └────────┬────────┘
                                │
                   ┌────────────┴────────────┐
                   │ (Static / HTML / JS)    │ (API Routes /api/*)
                   ▼                         ▼
         ┌───────────────────┐     ┌───────────────────┐
         │ Global CDN (Free) │     │ Netlify Functions │
         │   (Serve Files)   │     │ (Runs Express)    │
         └───────────────────┘     └─────────┬─────────┘
                                             │
                                             ▼
                                   ┌───────────────────┐
                                   │  Supabase Cloud   │
                                   └───────────────────┘
```

---

## 2. Step-by-Step Code Configuration

To prepare PennyWise for Netlify, we need to create two configuration files and make a minor modification to [server.js](file:///home/sathish/Desktop/projects/pennywise/server.js).

### Step 1: Install Serverless Wrapper
We need the `serverless-http` package to adapt the Express app to Netlify's serverless environment. Run this command in your terminal:
```bash
npm install serverless-http
```

### Step 2: Export `app` from `server.js`
Open [server.js](file:///home/sathish/Desktop/projects/pennywise/server.js) and make sure we export the `app` instance, and only call `app.listen()` when running locally:

```javascript
// ... existing server.js setup ...

// Export app for serverless function import
module.exports = app;

// Only start the server listener if run directly (local development)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`PennyWise Backend Server running on http://localhost:${PORT}`);
  });
}
```

### Step 3: Create the Netlify Function File
Create a new file named [netlify/functions/api.js](file:///home/sathish/Desktop/projects/pennywise/netlify/functions/api.js):

```javascript
const serverless = require('serverless-http');
const app = require('../../server');

// Wrap the Express app inside serverless handler
module.exports.handler = serverless(app);
```

### Step 4: Create the Netlify Configuration File
Create a file named [netlify.toml](file:///home/sathish/Desktop/projects/pennywise/netlify.toml) in the root of your project:

```toml
[build]
  functions = "netlify/functions"
  publish = "public"

# Redirect all API requests from /api/* to the serverless function
[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/api/:splat"
  status = 200

# Redirect clean index/checkout URLs if needed (Single Page Application fallback)
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
  force = false
```

---

## 3. How to Deploy to Netlify

### Option 1: Deploy via GitHub (Continuous Deployment)
1. Push your PennyWise project to a private/public repository on GitHub.
2. Log in to [Netlify](https://www.netlify.com/).
3. Click **Add new site** → **Import an existing project**.
4. Authorize GitHub and select your repository.
5. Keep build command empty, publish directory as `public`, and click **Deploy**.
6. Set your environment variables in Netlify Dashboard under **Site configuration** -> **Environment variables** (e.g., `SUPABASE_URL` and `SUPABASE_KEY`).

### Option 2: Deploy via Netlify CLI (Command Line)
1. Install Netlify CLI globally:
   ```bash
   npm install -g netlify-cli
   ```
2. Login and deploy:
   ```bash
   netlify login
   netlify init
   netlify deploy --prod
   ```
