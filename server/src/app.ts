import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { errorHandler, notFoundHandler } from './common/middleware/errorHandler';
import { authRoutes } from './modules/auth/auth.routes';
import { userRoutes } from './modules/user/user.routes';
import { companyRoutes } from './modules/company/company.routes';
import { branchRoutes } from './modules/branch/branch.routes';
import { leadRoutes } from './modules/lead/lead.routes';
import { webhookRoutes } from './modules/webhook/webhook.routes';
import { metaRoutes } from './modules/meta/meta.routes';
import { metaOAuthRoutes } from './modules/meta/meta-oauth.routes';
import { whatsappRoutes } from './modules/whatsapp/whatsapp.routes';
import { inboundRoutes } from './modules/inbound/inbound.routes';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes';
import { websiteLeadRoutes } from './modules/website/website-lead.routes';
import { webFormRoutes } from './modules/website/web-form.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { realtimeRoutes } from './modules/realtime/realtime.routes';
import { rbacRoutes } from './modules/rbac/rbac.routes';
import { campaignAccessRoutes } from './modules/campaign-access/campaign-access.routes';

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({
  limit: '10mb',
  // Preserve raw bytes: Meta signs the exact request body, and re-stringifying
  // the parsed object is not guaranteed byte-identical. Webhook signature
  // verification must use req.rawBody.
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.originalUrl?.includes('/realtime/') || req.originalUrl?.includes('/webhooks/'),
});
app.use('/api/', limiter);

app.use('/api/public/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many public requests', code: 'RATE_LIMITED' },
}));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/realtime', realtimeRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/meta', metaOAuthRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/inbound', inboundRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/public', websiteLeadRoutes);
app.use('/api/forms', webFormRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/rbac', rbacRoutes);
app.use('/api/campaign-access', campaignAccessRoutes);

app.use(errorHandler);
app.use(notFoundHandler);

export { app };
