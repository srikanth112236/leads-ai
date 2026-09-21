# Deploy — GitHub + Render (autodeploy)

## 1. Push to GitHub (run from repo root)

Do NOT run the `echo "# leads-ai" >> README.md` line — the README already exists
and that would append junk. Use a real commit message (empty `-m ""` is rejected
by most setups):

```bash
git init
git add .
git status            # confirm server/.env is NOT listed (it's gitignored)
git commit -m "Multi-tenant Lead CRM: phases 00-19, 74/74 tests green"
git branch -M main
git remote add origin https://github.com/srikanth112236/leads-ai.git
git push -u origin main
```

Afterwards, every `git push` to `main` auto-deploys both services.

## 2. Databases (Render has no managed MongoDB)

- **MongoDB**: MongoDB Atlas free tier → create cluster → Database Access user →
  Network Access `0.0.0.0/0` (or Render IPs) → copy connection string.
- **Redis**: Upstash free tier (Redis) — copy the `rediss://` URL.
  (Render managed Redis is paid; Upstash works with our `redis` client.)

## 3. Deploy on Render

Render Dashboard → New → **Blueprint** → select `leads-ai` repo (uses `render.yaml`).
It creates `leads-crm-api` (Node) + `leads-crm-web` (static). Then set env vars:

**Backend (`leads-crm-api`)** — replace placeholders:
- `DATABASE_URL` = Atlas URI, `REDIS_URL` = Upstash URL
- `FRONTEND_URL` = frontend URL (step 4), `BACKEND_URL` = backend URL (step 4)
- `JWT_SECRET`, `META_TOKEN_KEY` are auto-generated — keep them
- Meta/WhatsApp tokens whenever ready (empty = integrations dormant, rest works)

**Frontend (`leads-crm-web`)**:
- `VITE_API_URL` = `https://<your-api>.onrender.com/api`
- NOTE: Vite bakes this in at build time — after changing it, use
  Dashboard → Manual Deploy → Deploy latest commit.

## 4. Give me the two URLs

Paste the Render URLs for backend + frontend. I will then:
1. Verify CORS/health (`GET <backend>/health`).
2. Tell you the exact `FRONTEND_URL` / `VITE_API_URL` values to set.
3. Give you the Meta App Dashboard values: webhook callback
   `https://<backend>/api/webhooks/meta` (+ `/whatsapp`) and OAuth
   redirect `https://<backend>/api/meta/oauth/callback`.

## 5. First login on production

No seed data exists in Atlas. Either run `npm run seed` locally pointed at
Atlas (`DATABASE_URL=<atlas-uri> npm run seed`), or create the SUPER_ADMIN via
`POST <backend>/api/auth/register` then promote the role in MongoDB.
Rotate `SEED_*` defaults immediately.
