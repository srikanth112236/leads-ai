/**
 * Shared helpers for the campaign-grant assignment UIs
 * (UserDetailPage Campaigns tab + AdAccountDetailPage assign panel).
 *
 * Both UIs save through PUT /campaign-access/user/:id which REPLACES the
 * whole branch, so the visible selection must always be merged with grants
 * that live outside the current view (other ad accounts / hidden rows).
 */

export type CampaignAccess = 'view' | 'manage';

export interface GrantRow {
  campaignId: string;
  campaignName?: string;
  branchId?: string;
  access?: string;
  expiresAt?: string;
}

export interface VisibleCampaign {
  campaignId: string;
  name?: string;
}

/** campaignId -> access for one branch (used to preselect checklists). */
export function grantAccessMap(allGrants: GrantRow[], branchId: string): Map<string, CampaignAccess> {
  const map = new Map<string, CampaignAccess>();
  for (const g of (allGrants || []).filter((x) => String(x.branchId) === String(branchId))) {
    map.set(String(g.campaignId), g.access === 'manage' ? 'manage' : 'view');
  }
  return map;
}

/**
 * Build the PUT body: fresh selection for the visible campaigns + untouched
 * grants of the same branch that are NOT in the current view (other ad
 * accounts or rows hidden by filters). Nothing outside the view is lost.
 */
export function mergeGrantsForSave(
  allGrants: GrantRow[],
  branchId: string,
  visibleCampaigns: VisibleCampaign[],
  selected: Record<string, CampaignAccess>,
  expiresOn?: string,
): Array<{ campaignId: string; campaignName?: string; access: CampaignAccess; expiresAt?: string }> {
  const visible = new Set((visibleCampaigns || []).map((c) => String(c.campaignId)));
  const kept = (allGrants || [])
    .filter((g) => String(g.branchId) === String(branchId) && !visible.has(String(g.campaignId)))
    .map((g) => ({
      campaignId: String(g.campaignId),
      campaignName: g.campaignName,
      access: (g.access === 'manage' ? 'manage' : 'view') as CampaignAccess,
      expiresAt: g.expiresAt || undefined,
    }));
  const nameOf = new Map((visibleCampaigns || []).map((c) => [String(c.campaignId), c.name]));
  const fresh = Object.entries(selected).map(([campaignId, access]) => ({
    campaignId,
    campaignName: nameOf.get(campaignId),
    access,
    expiresAt: expiresOn || undefined,
  }));
  return [...kept, ...fresh];
}

/* ---------------- Doc auto-provisioning ---------------- */

export interface ProvisionItem {
  campaignId: string;
  name?: string;
  /** Mongo _id of the MetaAdAccount (when known). */
  adAccountId?: string;
  /** act_… id of the Meta ad account (when known). */
  metaAdAccountId?: string;
}

interface ApiLike {
  patch: (url: string, body: any) => Promise<any>;
}

/**
 * Ensure a MetaCampaign doc exists for every selected campaign, so the
 * strict grant validation (unknown campaigns are rejected) passes.
 * This branch-assigns campaigns that were never assigned before – paused /
 * inactive campaigns included. Returns per-id failures (caller should abort
 * the grant save when non-empty so nothing is half-applied).
 */
export async function ensureCampaignDocs(
  api: ApiLike,
  items: ProvisionItem[],
  ctx: { branchId: string; companyId?: string },
): Promise<{ ok: string[]; failed: Array<{ campaignId: string; error: string }> }> {
  const ok: string[] = [];
  const failed: Array<{ campaignId: string; error: string }> = [];
  for (const item of items) {
    try {
      await api.patch(`/meta/campaigns/${encodeURIComponent(item.campaignId)}/assign`, {
        branchId: ctx.branchId,
        name: item.name,
        adAccountId: item.adAccountId || undefined,
        metaAdAccountId: item.metaAdAccountId || undefined,
        companyId: ctx.companyId || undefined,
      });
      ok.push(item.campaignId);
    } catch (err: any) {
      failed.push({
        campaignId: item.campaignId,
        error: err?.response?.data?.error || err?.message || 'Provision failed',
      });
    }
  }
  return { ok, failed };
}

/* ---------------- Status helpers (active vs inactive) ---------------- */

const INACTIVE = new Set(['inactive', 'disabled', 'archived', 'closed']);

/** Branches / ad accounts use `status: 'active' | 'inactive'`. Missing status = active. */
export function isActiveRecord(row: any): boolean {
  if (!row) return false;
  if (typeof row.isActive === 'boolean') return row.isActive;
  if (typeof row.status === 'string') return !INACTIVE.has(row.status.toLowerCase());
  return true;
}

/** Meta marketing status: ACTIVE vs PAUSED/ARCHIVED/…. Missing = shown, not filtered. */
export function metaStatusOf(campaign: any): string {
  return String(campaign?.effectiveStatus || campaign?.status || '').toUpperCase();
}

export function statusPillClasses(metaStatus: string): string {
  if (metaStatus === 'ACTIVE') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (metaStatus === 'PAUSED') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}
