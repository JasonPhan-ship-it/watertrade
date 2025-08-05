#!/bin/bash

echo "🚀 Water Trading Platform Deployment Script"
echo "=========================================="

# Check if git remote exists
if ! git remote get-url origin > /dev/null 2>&1; then
    echo "❌ No GitHub remote found. Please add your GitHub repository first:"
    echo "   git remote add origin https://github.com/JasonPhan-ship-it/water-trading-platform.git"
    exit 1
fi

# Push to GitHub
echo "📤 Pushing to GitHub..."
git push origin main

echo ""
echo "✅ Code pushed to GitHub successfully!"
echo ""
echo "🌐 Next steps for deployment:"
echo ""
echo "1. Frontend (Vercel):"
echo "   - Go to https://vercel.com"
echo "   - Import your GitHub repository"
echo "   - Set Root Directory to 'frontend'"
echo "   - Add environment variables from frontend/env.example"
echo ""
echo "2. Backend (Railway):"
echo "   - Go to https://railway.app"
echo "   - Import your GitHub repository"
echo "   - Set Root Directory to 'server'"
echo "   - Add PostgreSQL plugin"
echo "   - Add environment variables from server/env.example"
echo ""
echo "3. Update frontend API URL:"
echo "   - Set NEXT_PUBLIC_API_URL to your Railway backend URL"
echo ""
echo "📖 See DEPLOYMENT.md for detailed instructions" 