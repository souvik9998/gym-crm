

Looking at the registration flow to understand current loading states.
<lov-tool-use id="toolu_vrtx_01PuJYSdqJs8dCf4q9dYMS2K" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/Index.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01DkHbApmVsu3RVqQAP7aZeo" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/Register.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_012cyVZUT64tJ9NyG2mQS468" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/Index.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01Gvgz3DM9FhNE12kXoosuT5" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/Register.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01FAbqfY49dLV8VKfoi3HUiJ" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/registration/PackageSelectionForm.tsx\", \"lines\": \"1-100\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01A4CqRkpx24H4YPzvWkRZTh" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/registration/MemberDetailsForm.tsx\", \"lines\": \"1-80\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01BQFuZ3WRSyEXCs5m5QGUEe" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/Renew.tsx\", \"lines\": \"1-100\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01NXE6K45na7qdvtgY3iMrnj" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/ExtendPT.tsx\", \"lines\": \"1-100\"}">
</lov-tool-use>
I have enough context. Let me present the plan.

<lov-plan>

## Goal
Add proper, full-page loading skeletons to public registration pages so users see a polished placeholder UI while branch/package/trainer data is being fetched — instead of the current partial pulse on header only.

## Current state
- **Index.tsx** (`/b/:slug`): Only the header title shows a skeleton. The phone-input card renders immediately with "Gym Portal" as fallback name — looks broken if branch hasn't loaded.
- **Register.tsx** (`/b/:slug/register`): No skeleton while `branchInfo` / `fieldSettings` load — form mounts with default field visibility, can flicker once settings arrive.
- **Renew.tsx** & **ExtendPT.tsx**: No skeleton during branch + subscription fetch.
- **PackageSelectionForm.tsx**: Has a small `PackageSkeleton` but only for the package grid, not the whole card stack.

## Plan

### 1. Create a shared `RegistrationPageSkeleton` component
File: `src/components/registration/RegistrationPageSkeleton.tsx`

A full-page skeleton matching the registration layout:
- Hero area: 64×64 logo block, title bar (h-9 w-48), subtitle bar (h-5 w-56)
- Card placeholder (max-w-md): header lines + form field group + button
- 3-column feature grid skeleton (Secure / Instant / Easy)
- Variants via prop: `variant: "landing" | "form" | "package"` to match Index, Register, and PackageSelectionForm shapes
- Uses existing `Skeleton` primitive + `animate-fade-in` (per loading-states memory)

### 2. Wire into `Index.tsx`
- While `isBranchLoading && !branchInfo`, render `<RegistrationPageSkeleton variant="landing" />` for the entire main content (replace the current header-only skeleton + show the form card placeholder too).
- Keep the redirect-to-default-branch path unchanged.

### 3. Wire into `Register.tsx`
- Add an `isBootstrapping` state, true until the bootstrap-warmed cache is read or `fetchPublicBranch` returns.
- While bootstrapping (no `branchInfo` AND no `fieldSettings`), render `<RegistrationPageSkeleton variant="form" />`.
- This eliminates the field-visibility flicker.

### 4. Wire into `Renew.tsx` and `ExtendPT.tsx`
- Add `isInitializing` state; show `<RegistrationPageSkeleton variant="package" />` until branch + subscription fetches resolve.
- ExtendPT already has `isLoadingData` — replace the current "no UI until trainers load" gap with the skeleton.

### 5. Improve `PackageSelectionForm.tsx`
- Expand current `PackageSkeleton` to also include trainer-section and summary-row skeletons so the entire card looks intentional during the first 200-500ms before bootstrap cache hydrates.

## Files to edit
| File | Change |
|---|---|
| `src/components/registration/RegistrationPageSkeleton.tsx` | NEW — shared skeleton with 3 variants |
| `src/pages/Index.tsx` | Render skeleton when `isBranchLoading && !branchInfo` |
| `src/pages/Register.tsx` | Render skeleton until branch + fieldSettings ready |
| `src/pages/Renew.tsx` | Render skeleton until branch + sub data ready |
| `src/pages/ExtendPT.tsx` | Render skeleton during `isLoadingData` |
| `src/components/registration/PackageSelectionForm.tsx` | Expand existing skeleton to full card |

## Outcome
Users hitting a fresh registration QR/link see an instant, branded placeholder layout (logo block, title bar, form card, features) with `animate-fade-in` micro-anim — instead of a flash of "Gym Portal" text or empty white space. Layout stays stable when real data swaps in (no CLS).

