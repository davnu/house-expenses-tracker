# House Expenses Tracker

## Stack
React 18 + TypeScript + Vite, Tailwind CSS v4, shadcn/ui (hand-rolled in src/components/ui/), Recharts, React Router v7, React Hook Form + Zod, date-fns, lucide-react, Firebase (Auth + Firestore + Storage + Hosting).

## Architecture
- **Multi-user households**: users create a house, invite others via shareable link. All members share expenses.
- **Firestore structure**: `houses/{houseId}/expenses`, `houses/{houseId}/recurring`, `houses/{houseId}/members/{uid}`, `users/{uid}` (profile), `invites/{inviteId}`
- **Repository pattern**: `src/data/repository.ts` (interface) → `src/data/firestore-repository.ts` (implementation, takes `houseId`)
- **Contexts**: `AuthContext` (Firebase Auth) → `HouseholdContext` (user profile, house, members, invites) → `ExpenseContext` (expenses, recurring)
- **Auth**: Firebase Auth (email/password + Google) with display name on registration
- **Attachments**: blobs in Firebase Storage (`houses/{houseId}/attachments/{id}/{filename}`), metadata on Expense docs
- **Payers are dynamic**: `Expense.payer` is a uid string, resolved to name via `HouseholdContext.getMemberName()`
- **Amounts stored as integer cents** (1500 = €15.00)
- **Member colors**: assigned from `MEMBER_COLOR_PALETTE` on join, stored on member doc

## Firebase
- Project ID: `house-expenses-tracker-812cf`
- Config: `.env` (gitignored), template: `.env.example`
- Rules: `firestore.rules` (membership-based), `storage.rules`
- Deploy: `npm run build && firebase deploy`

## Dev
- `npm run dev` — localhost:5173, connects to real Firebase
- `npm run build` — type-checks then builds to `dist/`

## Quality Standards
Always prioritize best UI design, best UX, best coding patterns, and maximum user value. Don't settle for "good enough" — aim for polished, well-designed solutions. Proper spacing, transitions, empty states, loading states, responsive behavior. Optimize for ease of use.

## Gotchas
- Firestore rejects `undefined` — use `stripUndefined()` in `firestore-repository.ts` before all writes
- TypeScript 6 — no `baseUrl` in tsconfig, only `paths`
- shadcn/ui components are hand-written (not from CLI), live in `src/components/ui/`
- Payer is a uid string, never hardcode names — always resolve via `getMemberName(uid)` from HouseholdContext
- Invite flow: top-level `invites` collection so unauthenticated users can read before joining
