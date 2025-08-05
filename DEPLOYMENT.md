# 🚀 Deployment Guide - Water Trading Platform

This guide will walk you through deploying your water trading platform to production.

## 📋 Prerequisites

1. **GitHub Account** - For hosting your code
2. **Clerk Account** - For authentication (https://clerk.com)
3. **Railway Account** - For backend hosting (https://railway.app)
4. **Vercel Account** - For frontend hosting (https://vercel.com)

## 🔄 Step 1: Push to GitHub

1. Create a new repository on GitHub
2. Push your code:

```bash
# Add your GitHub repository as remote
git remote add origin https://github.com/JasonPhan-ship-it/water-trading-platform.git


# Push to GitHub
git push -u origin main
```

## 🔐 Step 2: Set Up Clerk Authentication

1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Create a new application
3. Copy your keys:
   - **Publishable Key** (starts with `pk_test_` or `pk_live_`)
   - **Secret Key** (starts with `sk_test_` or `sk_live_`)
4. Configure authentication providers (Email, Google, etc.)

## 🚂 Step 3: Deploy Backend to Railway

### 3.1 Connect Repository

1. Go to [Railway Dashboard](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `water-trading-platform` repository
5. Select the `server` directory

### 3.2 Add PostgreSQL Database

1. In your Railway project, click "New"
2. Select "Database" → "PostgreSQL"
3. Railway will automatically add the `DATABASE_URL` environment variable

### 3.3 Configure Environment Variables

In Railway dashboard, go to your server service and add these environment variables:

```env
DATABASE_URL=postgresql://... (auto-added by Railway)
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key_here
CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key_here
NODE_ENV=production
FRONTEND_URL=https://your-frontend-domain.vercel.app
```

### 3.4 Deploy

1. Railway will automatically deploy when you push to GitHub
2. Wait for the build to complete
3. Copy your Railway domain (e.g., `https://your-app.railway.app`)

## ⚡ Step 4: Deploy Frontend to Vercel

### 4.1 Connect Repository

1. Go to [Vercel Dashboard](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. Configure the project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`

### 4.2 Configure Environment Variables

In Vercel dashboard, add these environment variables:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key_here
NEXT_PUBLIC_API_URL=https://your-backend-domain.railway.app
```

### 4.3 Deploy

1. Click "Deploy"
2. Vercel will build and deploy your frontend
3. Copy your Vercel domain (e.g., `https://your-app.vercel.app`)

## 🔄 Step 5: Update Environment Variables

### 5.1 Update Backend (Railway)

Go back to Railway and update the `FRONTEND_URL`:

```env
FRONTEND_URL=https://your-frontend-domain.vercel.app
```

### 5.2 Update Frontend (Vercel)

In Vercel, update the `NEXT_PUBLIC_API_URL`:

```env
NEXT_PUBLIC_API_URL=https://your-backend-domain.railway.app
```

## 🗄️ Step 6: Set Up Database

### 6.1 Run Database Migrations

1. In Railway dashboard, go to your server service
2. Click on "Deployments" tab
3. Find the latest deployment and click "View Logs"
4. You should see Prisma migrations running automatically

### 6.2 Verify Database Connection

1. Go to your Railway PostgreSQL database
2. Click "Connect" → "PostgreSQL"
3. You can view your database tables here

## 🧪 Step 7: Test Your Deployment

1. **Frontend**: Visit your Vercel URL
2. **Backend Health Check**: Visit `https://your-backend-domain.railway.app/health`
3. **Authentication**: Test sign-up/sign-in flow
4. **Create Listing**: Test the create listing form
5. **Marketplace**: Browse listings
6. **Dashboard**: View user dashboard

## 🔧 Troubleshooting

### Common Issues:

1. **CORS Errors**

   - Ensure `FRONTEND_URL` in Railway matches your Vercel domain exactly
   - Check that the URL includes `https://`

2. **Database Connection Issues**

   - Verify `DATABASE_URL` is set correctly in Railway
   - Check that Prisma migrations ran successfully

3. **Authentication Issues**

   - Verify Clerk keys are correct
   - Check that Clerk application is configured for your domains

4. **Build Failures**
   - Check build logs in Vercel/Railway
   - Ensure all dependencies are in `package.json`

### Debug Commands:

```bash
# Check Railway logs
railway logs

# Check Vercel build logs
vercel logs

# Test API locally
curl https://your-backend-domain.railway.app/health
```

## 🔄 Continuous Deployment

Both Railway and Vercel will automatically redeploy when you push changes to your GitHub repository:

```bash
# Make changes to your code
git add .
git commit -m "Update feature"
git push origin main
```

## 📊 Monitoring

### Railway Monitoring

- View logs in Railway dashboard
- Monitor database usage
- Check deployment status

### Vercel Monitoring

- View build logs in Vercel dashboard
- Monitor performance with Vercel Analytics
- Check function execution logs

## 🔒 Security Checklist

- [ ] Environment variables are set (not in code)
- [ ] CORS is configured correctly
- [ ] Authentication is working
- [ ] Database is secure (Railway handles this)
- [ ] HTTPS is enabled (automatic with Railway/Vercel)

## 🎉 You're Live!

Your water trading platform is now deployed and accessible at:

- **Frontend**: `https://your-app.vercel.app`
- **Backend API**: `https://your-app.railway.app`

Users can now:

- Sign up and authenticate
- Browse water listings
- Create new listings
- Execute trades
- Manage their dashboard

---
