# Secrets Configuration Checklist

## Required Secrets for Supabase Project

Navigate to: **Supabase Dashboard → Settings → Vault → Secrets**

### Payment Gateway
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

## Auto-Configured Secrets

These are automatically available in Edge Functions:

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Anon/Public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (admin access) |

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
2. **Use Supabase Vault** - not environment variables
3. **Rotate keys periodically** - especially after team changes
4. **Use test keys in development** - production keys only in production
