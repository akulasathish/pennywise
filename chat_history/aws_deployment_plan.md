# Lightweight AWS Deployment Plan (Low-Cost Alternatives)

Since PennyWise is a small, lightweight Express application, deploying it on **AWS ECS Fargate** is unnecessarily complex and expensive. Here are the three best lightweight, low-cost alternatives on AWS.

---

## 1. Option A: AWS Lambda + API Gateway (Serverless) — *Highly Recommended*

This option has **zero fixed standby cost** (typically $0.00/month under the AWS Free Tier) and requires no server maintenance. The application runs only when a webhook is received or when a user visits the checkout page.

### How it works:
We wrap the existing [server.js](file:///home/sathish/Desktop/projects/pennywise/server.js) Express app using the `serverless-http` package, converting it into a single AWS Lambda function.

```
┌──────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  Incoming Route  │ ────► │   API Gateway   │ ────► │   AWS Lambda    │
│  (/api/sms etc)  │       │ (Triggers Func) │       │ (Express App)   │
└──────────────────┘       └─────────────────┘       └─────────────────┘
```

### Setup Steps:
1. **Install Serverless Wrapper:**
   Install `serverless-http` in your project:
   ```bash
   npm install serverless-http
   ```
2. **Modify Entrypoint:**
   Export the express app wrapped in the serverless handler (e.g. `module.exports.handler = serverless(app)`).
3. **Deploy using Serverless Framework or AWS SAM:**
   Create a small `serverless.yml` configuration to deploy to Lambda with 1 click.

---

## 2. Option B: AWS Lightsail — *Simplest Virtual Server*

AWS Lightsail is a simplified version of EC2. It gives you a virtual machine with pre-installed Node.js for a low, predictable flat rate.

* **Cost:** Starts at **$3.50/month** (first 3 months free).
* **Pros:** Standard Linux server where you can run `npm start` directly, just like on your local computer.

### Setup Steps:
1. Create a Lightsail Instance select **OS Only** (Ubuntu) or **App + OS** (Node.js).
2. Clone your repository onto the instance.
3. Install dependencies (`npm install`) and start the process using a process manager like `pm2` so it runs continuously in the background:
   ```bash
   npm install -g pm2
   pm2 start server.js --name "pennywise"
   ```

---

## 3. Option C: AWS App Runner — *Simplest Container Hosting*

If you still want to use the [Dockerfile](file:///home/sathish/Desktop/projects/pennywise/Dockerfile) we created but want to avoid ECS Fargate configuration, AWS App Runner is the container alternative.

* **Cost:** ~$7.00/month (charges only for active memory when not processing requests, and can automatically pause when idle).
* **Pros:** Directly links to your GitHub repository. Every time you push code, App Runner automatically builds the container and redeploys it.

---

## Comparative Overview

| Metric | AWS Lambda (Serverless) | AWS Lightsail (VPS) | AWS App Runner |
| :--- | :--- | :--- | :--- |
| **Monthly Cost** | **$0.00** (Free Tier) | **$3.50** (Flat Rate) | **~$7.00** (Dynamic) |
| **Complexity** | Low (needs a wrapper) | Very Low (standard Linux) | Low (automatic from Git) |
| **Maintenance** | None | OS updates, PM2 setup | None |
| **Auto-scaling** | Infinite (instant) | Manual upgrade | Automated |
