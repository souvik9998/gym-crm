# Secrets Configuration Checklist

## Target Supabase Project
**Project ID:** `ydswesigiavvgllqrbze`
**Project URL:** `https://ydswesigiavvgllqrbze.supabase.co`

Navigate to: **Supabase Dashboard → Settings → Edge Functions → Secrets**

---

## Required Secrets for Edge Functions

### Payment Gateway (Razorpay)
| Secret Name | Value | Notes |
|-------------|-------|-------|
| `RAZORPAY_KEY_ID` | `rzp_live_xxx` or `rzp_test_xxx` | Get from Razorpay Dashboard |
| `RAZORPAY_KEY_SECRET` | Your secret key | Never expose publicly |

### WhatsApp Integration (Periskope)
| Secret Name | Value | Notes |
|-------------|-------|-------|
| `PERISKOPE_API_KEY` | Your API key | From Periskope dashboard |
| `PERISKOPE_PHONE` | `91XXXXXXXXXX` | WhatsApp sender number |

### Admin Notifications
| Secret Name | Value | Notes |
|-------------|-------|-------|
| `ADMIN_WHATSAPP_NUMBER` | `91XXXXXXXXXX` | Optional - for daily summaries |

---

## Auto-Configured Secrets (Already Available)

These are automatically available in Edge Functions:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Project URL (auto-set) |
| `SUPABASE_ANON_KEY` | Anon/Public key (auto-set) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (auto-set) |

---

## Edge Functions Deployed

The following edge functions need these secrets:

| Function | Required Secrets |
|----------|------------------|
| `create-razorpay-order` | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` |
| `verify-razorpay-payment` | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` |
| `send-whatsapp` | `PERISKOPE_API_KEY`, `PERISKOPE_PHONE` |
| `daily-whatsapp-job` | `PERISKOPE_API_KEY`, `PERISKOPE_PHONE`, `ADMIN_WHATSAPP_NUMBER` |
| `public-data` | None (uses service role) |
| `protected-data` | None (uses service role) |
| `staff-auth` | None (uses service role) |
| `staff-operations` | None (uses service role) |
| `tenant-operations` | None (uses service role) |

---

## Verification

After adding secrets, verify they're available in your edge functions:

```typescript
// In any edge function, check:
console.log("RAZORPAY_KEY_ID:", Deno.env.get("RAZORPAY_KEY_ID") ? "✓ Set" : "✗ Missing");
console.log("PERISKOPE_API_KEY:", Deno.env.get("PERISKOPE_API_KEY") ? "✓ Set" : "✗ Missing");
```

---

## Security Notes

1. **Never commit secrets to git**
2. **Add secrets via Supabase Dashboard** - Edge Functions → Secrets
3. **Rotate keys periodically** - especially after team changes
4. **Use test keys in development** - production keys only in production

---

## Quick Setup Steps

1. Go to https://supabase.com/dashboard/project/ydswesigiavvgllqrbze/settings/functions
2. Click on "Secrets" tab
3. Add each secret from the tables above
4. Deploy edge functions (they should auto-deploy from the codebase)
