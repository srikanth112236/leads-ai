import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { MetaOAuthController } from './meta-oauth.controller';
import { MetaAdsController } from './meta-ads.controller';
import { authenticateToken, requireRole, requireRoleOrPermission } from '../../common/middleware/auth';
import { enforceTenantIsolation } from '../../common/middleware/tenant';
import { Role } from '../../common/types';

const router = Router();

const INTEGRATION_MANAGE_ROLES = [Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER];
const INTEGRATION_READ_ROLES = [Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.COMPANY_MANAGER, Role.BRANCH_MANAGER];
const INTEGRATION_MANAGE_PERMS = ['integrations:manage', 'meta:manage'];
const INTEGRATION_READ_PERMS = ['integrations:read', 'integrations:manage', 'meta:manage', 'campaigns:read'];

router.get(
  '/oauth/start',
  authenticateToken,
  requireRoleOrPermission(INTEGRATION_MANAGE_ROLES, INTEGRATION_MANAGE_PERMS),
  MetaOAuthController.start,
);
router.get(
  '/oauth/callback',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { error: 'Too many requests', code: 'RATE_LIMITED' } }),
  MetaOAuthController.callback,
);
router.post(
  '/disconnect',
  authenticateToken,
  requireRoleOrPermission([Role.SUPER_ADMIN, Role.COMPANY_ADMIN], INTEGRATION_MANAGE_PERMS),
  MetaOAuthController.disconnect,
);
router.put(
  '/pages/:id/assign',
  authenticateToken,
  requireRoleOrPermission(INTEGRATION_MANAGE_ROLES, ['campaigns:assign', ...INTEGRATION_MANAGE_PERMS]),
  MetaOAuthController.assignPage,
);
router.get(
  '/pages',
  authenticateToken,
  requireRoleOrPermission(INTEGRATION_READ_ROLES, INTEGRATION_READ_PERMS),
  enforceTenantIsolation,
  MetaOAuthController.listPages,
);
router.get(
  '/forms',
  authenticateToken,
  requireRoleOrPermission(INTEGRATION_READ_ROLES, INTEGRATION_READ_PERMS),
  enforceTenantIsolation,
  MetaOAuthController.listForms,
);
router.put(
  '/forms/:id/assign',
  authenticateToken,
  requireRoleOrPermission(INTEGRATION_READ_ROLES, ['campaigns:assign', ...INTEGRATION_MANAGE_PERMS]),
  MetaOAuthController.assignForm,
);
router.get(
  '/adaccounts',
  authenticateToken,
  requireRoleOrPermission(INTEGRATION_READ_ROLES, INTEGRATION_READ_PERMS),
  enforceTenantIsolation,
  MetaOAuthController.listAdAccounts,
);
router.get(
  '/sync-settings',
  authenticateToken,
  requireRoleOrPermission(INTEGRATION_READ_ROLES, ['settings:read', 'settings:manage', ...INTEGRATION_READ_PERMS]),
  MetaOAuthController.getSyncSettings,
);
router.put(
  '/sync-settings',
  authenticateToken,
  requireRoleOrPermission(INTEGRATION_MANAGE_ROLES, ['settings:manage', ...INTEGRATION_MANAGE_PERMS]),
  MetaOAuthController.putSyncSettings,
);
router.post(
  '/adaccounts/sync',
  authenticateToken,
  requireRoleOrPermission([Role.SUPER_ADMIN, Role.COMPANY_ADMIN], INTEGRATION_MANAGE_PERMS),
  MetaOAuthController.syncAdAccounts,
);
router.patch(
  '/adaccounts/:id/assign',
  authenticateToken,
  requireRoleOrPermission([Role.SUPER_ADMIN, Role.COMPANY_ADMIN], ['campaigns:assign', ...INTEGRATION_MANAGE_PERMS]),
  MetaOAuthController.assignAdAccount,
);
router.patch(
  '/adaccounts/:id/branch',
  authenticateToken,
  requireRoleOrPermission([Role.SUPER_ADMIN, Role.COMPANY_ADMIN], ['campaigns:assign', ...INTEGRATION_MANAGE_PERMS]),
  MetaOAuthController.assignAdAccount,
);
router.get(
  '/debug-token',
  authenticateToken,
  requireRoleOrPermission([Role.SUPER_ADMIN, Role.COMPANY_ADMIN], INTEGRATION_MANAGE_PERMS),
  MetaOAuthController.debugToken,
);
router.post(
  '/permissions/revoke',
  authenticateToken,
  requireRoleOrPermission([Role.SUPER_ADMIN, Role.COMPANY_ADMIN], INTEGRATION_MANAGE_PERMS),
  MetaOAuthController.revokePermission,
);
router.post(
  '/permissions/audit',
  authenticateToken,
  requireRoleOrPermission(INTEGRATION_MANAGE_ROLES, INTEGRATION_READ_PERMS),
  MetaOAuthController.auditPermissions,
);
router.post(
  '/integrations/:id/sync-scopes',
  authenticateToken,
  requireRoleOrPermission([Role.SUPER_ADMIN, Role.COMPANY_ADMIN], INTEGRATION_MANAGE_PERMS),
  MetaOAuthController.syncScopes,
);
router.get(
  '/adaccounts/:id/overview',
  authenticateToken,
  requireRoleOrPermission(INTEGRATION_READ_ROLES, INTEGRATION_READ_PERMS),
  enforceTenantIsolation,
  MetaAdsController.getOverview,
);
router.get(
  '/campaigns/ads',
  authenticateToken,
  requireRoleOrPermission(INTEGRATION_READ_ROLES, INTEGRATION_READ_PERMS),
  enforceTenantIsolation,
  MetaAdsController.getCampaignAds,
);
router.get(
  '/campaigns/leads',
  authenticateToken,
  requireRoleOrPermission(INTEGRATION_READ_ROLES, INTEGRATION_READ_PERMS),
  enforceTenantIsolation,
  MetaAdsController.getCampaignLeads,
);
router.patch(
  '/campaigns/:campaignId/assign',
  authenticateToken,
  requireRoleOrPermission([Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.BRANCH_MANAGER], ['campaigns:assign', ...INTEGRATION_MANAGE_PERMS]),
  MetaAdsController.assignCampaign,
);
router.post(
  '/capi/events',
  authenticateToken,
  requireRoleOrPermission([Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.BRANCH_MANAGER], ['campaigns:assign', ...INTEGRATION_MANAGE_PERMS]),
  enforceTenantIsolation,
  MetaAdsController.sendCapiEvent,
);
router.patch(
  '/campaigns/:campaignId/branch',
  authenticateToken,
  requireRoleOrPermission([Role.SUPER_ADMIN, Role.COMPANY_ADMIN, Role.BRANCH_MANAGER], ['campaigns:assign', ...INTEGRATION_MANAGE_PERMS]),
  MetaAdsController.assignCampaign,
);
router.get(
  '/branches/:branchId/spend',
  authenticateToken,
  requireRoleOrPermission(INTEGRATION_READ_ROLES, ['campaigns:spend_read', ...INTEGRATION_READ_PERMS]),
  enforceTenantIsolation,
  MetaAdsController.getBranchSpend,
);
router.get(
  '/ads/:adId/leads',
  authenticateToken,
  requireRoleOrPermission(INTEGRATION_READ_ROLES, INTEGRATION_READ_PERMS),
  enforceTenantIsolation,
  MetaAdsController.getAdLeads,
);
router.post(
  '/leads/import-crm',
  authenticateToken,
  requireRoleOrPermission(INTEGRATION_READ_ROLES, ['leads:create', ...INTEGRATION_READ_PERMS]),
  MetaAdsController.importLeadToCrm,
);
router.post(
  '/subscribe-webhooks',
  authenticateToken,
  requireRoleOrPermission([Role.SUPER_ADMIN, Role.COMPANY_ADMIN], ['webhooks:manage', ...INTEGRATION_MANAGE_PERMS]),
  MetaAdsController.subscribeWebhooks,
);
router.post(
  '/refresh',
  authenticateToken,
  requireRole(Role.SUPER_ADMIN),
  MetaOAuthController.refresh,
);

export { router as metaOAuthRoutes };
