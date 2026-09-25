import { Router } from 'express';
import { CampaignAccessController } from './campaign-access.controller';
import { authenticateToken, requireAnyPermission } from '../../common/middleware/auth';
import { enforceTenantIsolation } from '../../common/middleware/tenant';

const router = Router();

router.use(authenticateToken);

// Own grants – any authenticated user (for "My access" display).
router.get('/mine', CampaignAccessController.myGrants);

// Own grants enriched with campaign/branch/account details (My Campaigns workspace).
router.get('/mine/detailed', CampaignAccessController.myDetailedGrants);

// Step 2 of the assignment flow: ad accounts visible inside one branch.
router.get(
  '/branch/:branchId/adaccounts',
  requireAnyPermission('campaigns:read'),
  enforceTenantIsolation,
  CampaignAccessController.branchAdAccounts,
);

// Checklist source: synced campaigns of one branch (optionally one ad account).
router.get(
  '/branch/:branchId/campaigns',
  requireAnyPermission('campaigns:read'),
  enforceTenantIsolation,
  CampaignAccessController.branchCampaigns,
);

// Read a team member's grants.
router.get(
  '/user/:userId',
  requireAnyPermission('campaigns:assign'),
  CampaignAccessController.userGrants,
);

// Replace a team member's grants inside one branch.
router.put(
  '/user/:userId',
  requireAnyPermission('campaigns:assign'),
  enforceTenantIsolation,
  CampaignAccessController.replaceUserGrants,
);

export { router as campaignAccessRoutes };
