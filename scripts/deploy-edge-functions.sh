#!/bin/bash

# ============================================================================
# Edge Functions Deployment Script
# Target: ydswesigiavvgllqrbze.supabase.co
# ============================================================================

# Prerequisites:
# 1. Install Supabase CLI: npm install -g supabase
# 2. Login: supabase login
# 3. Run this script from project root

echo "🚀 Deploying Edge Functions to Supabase..."

# Link to project (run once)
# supabase link --project-ref ydswesigiavvgllqrbze

# Deploy all functions
echo "📦 Deploying create-razorpay-order..."
supabase functions deploy create-razorpay-order --no-verify-jwt

echo "📦 Deploying verify-razorpay-payment..."
supabase functions deploy verify-razorpay-payment --no-verify-jwt

echo "📦 Deploying send-whatsapp..."
supabase functions deploy send-whatsapp --no-verify-jwt

echo "📦 Deploying daily-whatsapp-job..."
supabase functions deploy daily-whatsapp-job --no-verify-jwt

echo "📦 Deploying staff-auth..."
supabase functions deploy staff-auth --no-verify-jwt

echo "📦 Deploying staff-operations..."
supabase functions deploy staff-operations --no-verify-jwt

echo "📦 Deploying protected-data..."
supabase functions deploy protected-data --no-verify-jwt

echo "📦 Deploying public-data..."
supabase functions deploy public-data --no-verify-jwt

echo ""
echo "✅ All functions deployed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Verify functions in Dashboard → Edge Functions"
echo "2. Check logs for any startup errors"
echo "3. Test each endpoint"
