

## Where the button is — and why you can't see it

**Short answer:** It's not visible yet. In the previous turn I created all the Backup & Restore building blocks (the cards, the edge functions, the database functions), but I never added the new tab to the Settings page itself. So the feature exists in the codebase but has no entry point in the UI.

That's why you're sitting on `/admin/settings?tab=general` and can't find it — the tab is missing from the tab bar.

## Fix: wire the Backup & Restore tab into Settings

One file changes: `src/pages/admin/Settings.tsx`.

1. **Import** `BackupRestoreTab` at the top of the file.
2. **Add a new entry** to the `settingsTabs` array (around line 1124):
   - `{ value: "backup", label: "Backup & Restore" }`
   - Placed last in the list so it sits at the end of the tab bar (and end of the mobile dropdown).
   - Visible only to gym owners — gated using `useAuth().isGymOwner` (staff won't see the tab at all).
3. **Add a matching `<TabsContent value="backup">` block** alongside the other tab panels (after the Subscription tab around line 1992), rendering `<BackupRestoreTab />`.
4. No other files touched. No changes to routing, query keys, or styling — the new tab uses the same pattern as every other Settings tab.

## After this change

- Desktop (your current 1021px viewport): a new **"Backup & Restore"** pill appears at the right end of the Settings tab bar.
- Mobile: it appears at the bottom of the collapsible tab dropdown.
- Clicking it shows the **Export this branch** card and the **Restore into this branch** card you approved last turn.
- Hidden entirely for non-owner staff accounts.

