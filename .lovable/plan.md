

# WhatsApp Auto-Send Preferences per Message Type

## Overview
Add a new "Auto-Send Preferences" section to the WhatsApp tab in Settings. This gives the gym admin toggle controls for each WhatsApp message type -- choosing whether messages are sent automatically after the corresponding action, or only manually. Promotional messages are always manual-only (no toggle).

## Current State
- WhatsApp messages are triggered automatically in several flows: Registration (`Register.tsx`), Renewal (`Renew.tsx`), PT Extension (`ExtendPT.tsx`), Admin Add Member (`AddMemberDialog.tsx`), Admin Add Payment (`AddPaymentDialog.tsx`)
- The daily cron job (`daily-whatsapp-job`) auto-sends expiring-in-2-days and expiring-today notifications
- There is no per-message-type auto/manual preference -- all are auto-sent when WhatsApp is enabled
- Templates exist for: Promotional, Expiry Reminder, Expired Reminder (in WhatsAppTemplates component)

## Message Types and Auto-Send Toggles

| Message Type | Default | Notes |
|---|---|---|
| New Member Registration | ON | Sent after a new member registers |
| Member Renewal | ON | Sent after membership renewal |
| Daily Pass | ON | Sent after daily pass purchase |
| PT Extension | ON | Sent after personal training extension |
| Expiring Soon (2 days) | ON | Daily cron job |
| Expiring Today | ON | Daily cron job |
| Expired Reminder | OFF | Not currently auto-sent, but available for manual |
| Payment Receipt | OFF | Not currently auto-sent |
| Admin Add Member | ON | When admin adds a member manually |
| Promotional | N/A | Always manual only, no toggle shown |

## Database Changes

### Add `whatsapp_auto_send` JSONB column to `gym_settings`
A new column storing per-type preferences:

```text
{
  "new_registration": true,
  "renewal": true,
  "daily_pass": true,
  "pt_extension": true,
  "expiring_2days": true,
  "expiring_today": true,
  "expired_reminder": false,
  "payment_details": false,
  "admin_add_member": true
}
```

Default: all true except `expired_reminder` and `payment_details`.

## Frontend Changes

### 1. New component: `WhatsAppAutoSendSettings.tsx`
A card with toggle switches for each message type listed above. Each toggle:
- Shows the message type name and a short description
- Saves immediately to `gym_settings.whatsapp_auto_send` via database update
- Promotional is shown as a disabled row with "Manual Only" badge (no toggle)

### 2. Integrate into Settings WhatsApp tab
Place the new `WhatsAppAutoSendSettings` component between the WhatsApp enable/disable card and the `WhatsAppTemplates` component in `Settings.tsx`.

### 3. Update auto-send call sites
In each file that calls `send-whatsapp`, check the preference before sending:

- `Register.tsx` -- check `new_registration` (or `daily_pass`) preference before calling send-whatsapp
- `Renew.tsx` -- check `renewal` preference
- `ExtendPT.tsx` -- check `pt_extension` preference
- `AddMemberDialog.tsx` -- check `admin_add_member` preference
- `AddPaymentDialog.tsx` -- check `payment_details` preference (if applicable)

Each call site will fetch the `whatsapp_auto_send` from `gym_settings` for the branch, and skip the WhatsApp call if the relevant type is set to false.

### 4. Update `daily-whatsapp-job` edge function
Before sending expiring-in-2-days and expiring-today messages, read the `whatsapp_auto_send` JSONB from `gym_settings` for each branch. Skip sending if the corresponding type is disabled.

## Technical Details

### Files to Create
- `src/components/admin/WhatsAppAutoSendSettings.tsx` -- Toggle switches UI component

### Files to Modify
- Database migration -- Add `whatsapp_auto_send` JSONB column to `gym_settings`
- `src/pages/admin/Settings.tsx` -- Insert the new component in WhatsApp tab
- `src/pages/Register.tsx` -- Check auto-send preference before WhatsApp call
- `src/pages/Renew.tsx` -- Check auto-send preference before WhatsApp call
- `src/pages/ExtendPT.tsx` -- Check auto-send preference before WhatsApp call
- `src/components/admin/AddMemberDialog.tsx` -- Check auto-send preference before WhatsApp call
- `src/components/admin/AddPaymentDialog.tsx` -- Check auto-send preference before WhatsApp call
- `supabase/functions/daily-whatsapp-job/index.ts` -- Check per-branch auto-send preferences
- `src/integrations/supabase/types.ts` -- Will auto-update after migration

### Helper function
A shared utility `getWhatsAppAutoSendPreference(branchId, type)` that fetches `gym_settings.whatsapp_auto_send` for the branch and returns whether that type is enabled. This avoids duplicating the fetch logic in every call site.

