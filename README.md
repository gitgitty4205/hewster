# PetNoteBook

A mobile-first shared dog care tracker built with Next.js, Tailwind CSS, and designed to be tested locally at `http://localhost:3000` and remotely at `https://lindy.b-average.com`.

## Current focus

V1 is centered on shared daily dog care tracking:

- feeding plan preview for today
- meal check-off with actual time logging
- reminder/late alert concepts
- weight tracking with target weight
- poop record history for food correlation
- simple daily timeline for caregivers

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS

## Local development

```bash
npm install
npm run dev
```

Then open:

- Local: `http://localhost:3000`
- Shared tunnel: `https://lindy.b-average.com`

## Environment

Copy `.env.example` to `.env.local` when you're ready to connect Supabase:

```bash
cp .env.example .env.local
```

Then fill in:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Next build steps

1. Connect Supabase for auth + shared dog profiles
2. Move meal defaults from local browser storage into shared database state
3. Add real database models for meals, logs, and weights
4. Add notifications/reminder workflow
5. Split Today / Log / Weight / History into real routes
