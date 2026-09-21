# Multi-Tenant Lead CRM

A complete multi-tenant SaaS lead management system built with the MERN stack (React, TypeScript, Node.js, MongoDB).

## Architecture

- **Backend**: Node.js + Express + TypeScript + Mongoose (MongoDB)
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Queue**: BullMQ + Redis
- **Auth**: JWT + Role-based Access Control
- **Multi-Tenancy**: Company/Branch isolation with tenant context enforcement

## Project Structure

```
leads-system/
├── server/           # NestJS-style Express backend
│   ├── src/
│   │   ├── modules/  # Feature modules (auth, company, branch, lead, etc.)
│   │   ├── common/   # Shared code (models, middleware, services, config)
│   │   └── server.ts # Entry point
│   ├── package.json
│   └── tsconfig.json
├── client/           # React frontend
│   ├── src/
│   │   ├── modules/  # Feature components
│   │   ├── components/ # Shared UI components
│   │   ├── hooks/    # Custom hooks
│   │   ├── context/  # React context
│   │   └── App.tsx
│   ├── package.json
│   └── tsconfig.json
├── .env              # Environment variables
├── .env.example      # Environment template
└── README.md
```

## Quick Start

1. Install dependencies:
```bash
npm run install:all
```

2. Start MongoDB and Redis

3. Copy `.env.example` to `.env` and configure

4. Start development:
```bash
npm run dev
```

## API Endpoints

- `POST /api/auth/register` - Register
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get profile
- `GET /api/companies` - List companies (SUPER_ADMIN)
- `GET /api/branches` - List branches
- `GET /api/leads` - List leads
- `POST /api/public/leads` - Public website lead form
- `GET /api/webhooks/meta` - Meta webhook verify
- `POST /api/webhooks/meta` - Meta webhook
- `GET /api/webhooks/whatsapp` - WhatsApp webhook verify
- `POST /api/webhooks/whatsapp` - WhatsApp webhook

## Roles

- `SUPER_ADMIN` - Full platform access
- `COMPANY_ADMIN` - Company management
- `COMPANY_MANAGER` - Company + authorized branches
- `BRANCH_MANAGER` - Branch management
- `SALES_AGENT` - Lead management

## License

MIT
