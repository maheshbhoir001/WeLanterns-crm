# WeLanterns CRM

A Next.js customer and business management CRM for WeLanterns Group.

## Run locally

1. Install dependencies with `npm ci`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in a local `.env.local` file for the intended Supabase environment.
3. Start with `npm run dev`.

Use only a Supabase publishable key in this browser application. Never set a service-role or secret key in a `NEXT_PUBLIC_` variable.

## Checks

- `npm run lint`
- `npm test`
- `npm run build`

## Deploy on Vercel

Connect the repository to the existing `welanterns-crm` Vercel project. Configure the two Supabase variables above for the correct Vercel environment before deploying. Production must use the production Supabase project; Preview should use staging. Do not rerun database migrations as part of an application deployment.
