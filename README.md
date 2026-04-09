# House Expenses Tracker

A web app to track house-buying expenses, monthly costs, and who paid what — built for David and his girlfriend.

## Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS v4 + shadcn/ui (hand-rolled components)
- **Charts**: Recharts (bar, pie, line)
- **Forms**: React Hook Form + Zod validation
- **Routing**: React Router v7
- **Backend**: Firebase (Auth + Firestore + Storage + Hosting)
- **Icons**: lucide-react
- **Dates**: date-fns

## Features

- **Dashboard** — summary cards (total, per person, this month), bar chart by category, pie chart by person, monthly trend line
- **Expenses** — add/edit/delete expenses, filter by category and payer, inline editing
- **Recurring** — manage recurring costs (monthly/quarterly/yearly), estimated monthly total, one-click generate
- **Attachments** — drag & drop file uploads (images, PDF, Word, Excel), inline preview for images/PDFs, download for others
- **Auth** — email/password and Google sign-in
- **Settings** — export data as JSON, account info, sign out
- **Mobile-first** — bottom nav on mobile, sidebar on desktop

## Architecture

```
src/
  types/expense.ts              # Data models (Expense, RecurringExpense, Attachment)
  data/
    repository.ts               # ExpenseRepository interface
    firestore-repository.ts     # Firestore implementation
    firebase.ts                 # Firebase app init (auth, db, storage)
    firebase-attachment-store.ts # Upload/delete files in Firebase Storage
  context/
    AuthContext.tsx              # Auth provider (email + Google)
    ExpenseContext.tsx           # Expense data provider
  components/
    ui/                         # shadcn/ui components (button, input, dialog, etc.)
    layout/AppShell.tsx         # Sidebar + bottom nav
    expenses/                   # ExpenseForm, ExpenseList, QuickAddDialog, FileDropZone, AttachmentViewer
    dashboard/                  # SummaryCards, CategoryChart, PersonBreakdown, MonthlyTrend
    recurring/                  # RecurringForm, RecurringList
  pages/                        # DashboardPage, ExpensesPage, RecurringPage, SettingsPage, LoginPage
  lib/
    utils.ts                    # cn(), formatCurrency(), parseCurrencyInput()
    constants.ts                # Categories, payers, colors
```

**Key patterns:**
- **Repository pattern** — `ExpenseRepository` interface with Firestore implementation. Easy to swap backends.
- **All data scoped per user** — Firestore path: `users/{uid}/...`
- **Amounts as integer cents** — 1500 = €15.00, avoids float bugs
- **Attachments** — blobs in Firebase Storage (`users/{uid}/attachments/{id}/{filename}`), metadata on Expense docs

## Firebase

- **Project ID**: `house-expenses-tracker-812cf`
- **Config**: `.env` (gitignored), template in `.env.example`
- **Security rules**: `firestore.rules`, `storage.rules`
- **Hosting**: `firebase.json` — serves from `dist/`, SPA rewrites

## Development

```bash
# Install dependencies
npm install

# Start dev server (connects to real Firebase)
npm run dev

# Type-check + build
npm run build

# Deploy to Firebase Hosting
npm run build && firebase deploy
```

## Setup (from scratch)

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Add a web app (click `</>` icon), enable Firebase Hosting
3. Enable **Authentication** (Email/Password + Google providers)
4. Enable **Cloud Firestore**
5. Enable **Storage**
6. Copy your Firebase config into `.env` (see `.env.example`)
7. `npm install && npm run dev` to develop locally
8. `npm run build && firebase deploy` to go live

## Gotchas

- **Firestore rejects `undefined`** — `stripUndefined()` in `firestore-repository.ts` strips them before writes
- **TypeScript 6** — no `baseUrl` in tsconfig, only `paths`
- **Production mode Firestore/Storage** — no problem, our rules files overwrite defaults on deploy
