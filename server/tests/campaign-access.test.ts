import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { Lead } from '../src/common/models/Lead';
import { MetaCampaign } from '../src/common/models/MetaCampaign';
import { MetaAdAccount } from '../src/common/models/MetaAdAccount';
import { MetaIntegration } from '../src/common/models/MetaIntegration';
import { CompanyMembership } from '../src/common/models/CompanyMembership';
import { CampaignAssignment } from '../src/common/models/CampaignAssignment';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';
import { RbacService } from '../src/common/services/RbacService';

describe('Tiered campaign access (branch x role x grants)', () => {
  let adminToken: string;
  let personAToken: string;
  let personBToken: string;
  let multiToken: string;
  let company: any;
  let branch1: any;
  let branch2: any;
  let personA: any;
  let personB: any;
  let multi: any;
  let adAccount1: any;
  let adAccount2: any;

  const campaignIn = (branch: any, n: number) => ({
    companyId: company._id,
    branchId: branch._id,
    campaignId: `camp-${branch.branchCode || branch.name}-${n}`,
    name: `Campaign ${n} (${branch.name})`,
    status: 'ACTIVE',
  });

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();
    await RbacService.seedSystemRoles();

    company = await new Company({ name: 'Campaign Co', status: 'active' }).save();
    branch1 = await new Branch({ name: 'Branch One', companyId: company._id, status: 'active' }).save();
    branch2 = await new Branch({ name: 'Branch Two', companyId: company._id, status: 'active' }).save();

    // 5 campaigns in B1, 2 in B2
    for (let n = 1; n <= 5; n++) await MetaCampaign.create(campaignIn(branch1, n));
    for (let n = 1; n <= 2; n++) await MetaCampaign.create(campaignIn(branch2, n));

    // Two ad accounts in B1; first 3 B1 campaigns under acc1, other 2 under acc2.
    const integration = await new MetaIntegration({ companyId: company._id, accessToken: 'tok-ca', status: 'active' }).save();
    adAccount1 = await MetaAdAccount.create({
      metaAdAccountId: 'act_ca_1',
      companyId: company._id,
      branchId: branch1._id,
      integrationId: integration._id,
      name: 'CA Account One',
      status: 'active',
    });
    adAccount2 = await MetaAdAccount.create({
      metaAdAccountId: 'act_ca_2',
      companyId: company._id,
      branchId: branch1._id,
      integrationId: integration._id,
      name: 'CA Account Two',
      status: 'active',
    });
    const b1camps = await MetaCampaign.find({ branchId: branch1._id }).sort({ campaignId: 1 }).lean();
    for (const [i, c] of b1camps.entries()) {
      const acc = i < 3 ? adAccount1 : adAccount2;
      await MetaCampaign.updateOne(
        { _id: c._id },
        { $set: { adAccountId: acc._id, metaAdAccountId: acc.metaAdAccountId } },
      );
    }

    const password = await hashPassword('Password123!');

    const mkUser = async (email: string, role: string, roleId: any, branchIds: string[], primaryBranch?: string) => {
      const u = await new User({
        email,
        password,
        firstName: email.split('@')[0],
        lastName: 'Test',
        role,
        roleId,
        companyId: company._id,
        branchId: primaryBranch || undefined,
        isActive: true,
      }).save();
      await CompanyMembership.create({
        userId: u._id,
        companyId: company._id,
        role,
        branchIds,
        isActive: true,
      });
      return u;
    };

    await mkUser('admin@campaign.local', Role.COMPANY_ADMIN, undefined, [branch1._id.toString(), branch2._id.toString()], branch1._id.toString());

    // Custom sales-level role with campaign read + assign (no manage-all)
    const agentRole = await RbacService.createCustomRole(company._id.toString(), {
      name: 'Campaign Agent',
      permissions: ['leads:read', 'campaigns:read', 'campaigns:assign'],
    });

    // Person A / B: membership ONLY in Branch One, no primary branch (multi-branch shape)
    personA = await mkUser('persona@campaign.local', agentRole.slug, agentRole._id, [branch1._id.toString()]);
    personB = await mkUser('personb@campaign.local', agentRole.slug, agentRole._id, [branch1._id.toString()]);
    // Multi: member of BOTH branches, no primary
    multi = await mkUser('multi@campaign.local', agentRole.slug, agentRole._id, [
      branch1._id.toString(),
      branch2._id.toString(),
    ]);

    const login = async (email: string) => {
      const res = await request(app).post('/api/auth/login').send({ email, password: 'Password123!' });
      expect(res.status).toBe(200);
      return res.body.data.accessToken as string;
    };
    adminToken = await login('admin@campaign.local');
    personAToken = await login('persona@campaign.local');
    personBToken = await login('personb@campaign.local');
    multiToken = await login('multi@campaign.local');

    // Leads in each branch
    await Lead.create({ companyId: company._id, branchId: branch1._id, name: 'Lead B1', phone: '+911111111111', status: 'new' });
    await Lead.create({ companyId: company._id, branchId: branch2._id, name: 'Lead B2', phone: '+912222222222', status: 'new' });
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('branch isolation: membership-only user lists only own-branch leads', async () => {
    const res = await request(app).get('/api/leads').set('Authorization', `Bearer ${personAToken}`);
    expect(res.status).toBe(200);
    const names = res.body.data.map((l: any) => l.name);
    expect(names).toContain('Lead B1');
    expect(names).not.toContain('Lead B2');
  });

  test('branch hopping via ?branchId= is blocked', async () => {
    const res = await request(app)
      .get(`/api/leads?branchId=${branch2._id}`)
      .set('Authorization', `Bearer ${personAToken}`);
    expect(res.status).toBe(403);
  });

  test('direct-ID access to other-branch lead is blocked without primary branch', async () => {
    const other = await Lead.findOne({ branchId: branch2._id });
    const res = await request(app).get(`/api/leads/${other!._id}`).set('Authorization', `Bearer ${personAToken}`);
    expect(res.status).toBe(403);
  });

  test('grant validation: target without branch membership is rejected', async () => {
    const res = await request(app)
      .put(`/api/campaign-access/user/${personA._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchId: branch2._id.toString(), grants: [{ campaignId: 'whatever', access: 'view' }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('TARGET_NOT_IN_BRANCH');
  });

  test('grant validation: unknown campaigns are rejected', async () => {
    const res = await request(app)
      .put(`/api/campaign-access/user/${personA._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchId: branch1._id.toString(), grants: [{ campaignId: 'nope-999', access: 'view' }] });
    expect(res.status).toBe(400);
  });

  test('admin grants person A exactly 3 of 5 branch campaigns', async () => {
    const list = await MetaCampaign.find({ branchId: branch1._id }).sort({ campaignId: 1 }).lean();
    expect(list.length).toBe(5);
    const grantIds = list.slice(0, 3).map((c) => String(c.campaignId));
    const res = await request(app)
      .put(`/api/campaign-access/user/${personA._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchId: branch1._id.toString(), grants: grantIds.map((campaignId) => ({ campaignId, access: 'view' })) });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(3);
  });

  test('person A branch spend shows exactly the 3 granted campaigns', async () => {
    const res = await request(app)
      .get(`/api/meta/branches/${branch1._id}/spend`)
      .set('Authorization', `Bearer ${personAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.campaignCount).toBe(3);
  });

  test('person B (no grants) inherits full branch scope: 5 campaigns', async () => {
    const res = await request(app)
      .get(`/api/meta/branches/${branch1._id}/spend`)
      .set('Authorization', `Bearer ${personBToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.campaignCount).toBe(5);
  });

  test('different grants per person in the same branch', async () => {
    const list = await MetaCampaign.find({ branchId: branch1._id }).sort({ campaignId: 1 }).lean();
    const otherTwo = list.slice(3, 5).map((c) => String(c.campaignId));
    await request(app)
      .put(`/api/campaign-access/user/${personB._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchId: branch1._id.toString(), grants: otherTwo.map((campaignId) => ({ campaignId, access: 'view' })) });
    const resB = await request(app)
      .get(`/api/meta/branches/${branch1._id}/spend`)
      .set('Authorization', `Bearer ${personBToken}`);
    expect(resB.body.data.campaignCount).toBe(2);
    const idsB = new Set(resB.body.data.campaigns.map((c: any) => c.campaignId));
    const resA = await request(app)
      .get(`/api/meta/branches/${branch1._id}/spend`)
      .set('Authorization', `Bearer ${personAToken}`);
    const idsA = new Set(resA.body.data.campaigns.map((c: any) => c.campaignId));
    for (const id of idsB) expect(idsA.has(id)).toBe(false);
  });

  test('view grant does not permit manage: assign branch is denied', async () => {
    const granted = await CampaignAssignment.findOne({ userId: personA._id }).lean();
    const res = await request(app)
      .patch(`/api/meta/campaigns/${granted!.campaignId}/assign`)
      .set('Authorization', `Bearer ${personAToken}`)
      .send({ branchId: branch1._id.toString() });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CAMPAIGN_FORBIDDEN');
  });

  test('manage grant permits manage: assign branch succeeds', async () => {
    const granted = await CampaignAssignment.find({ userId: personA._id }).lean();
    const ids = granted.map((g) => String(g.campaignId));
    await request(app)
      .put(`/api/campaign-access/user/${personA._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchId: branch1._id.toString(), grants: ids.map((campaignId) => ({ campaignId, access: 'manage' })) });
    const res = await request(app)
      .patch(`/api/meta/campaigns/${ids[0]}/assign`)
      .set('Authorization', `Bearer ${personAToken}`)
      .send({ branchId: branch1._id.toString() });
    expect(res.status).toBe(200);
  });

  test('multi-branch user: narrowed in B1, full scope in B2', async () => {
    const res1 = await request(app)
      .get(`/api/meta/branches/${branch1._id}/spend`)
      .set('Authorization', `Bearer ${multiToken}`);
    expect(res1.body.data.campaignCount).toBe(5);
    // grant multi 1 campaign in B1
    const one = await MetaCampaign.findOne({ branchId: branch1._id }).lean();
    await request(app)
      .put(`/api/campaign-access/user/${multi._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchId: branch1._id.toString(), grants: [{ campaignId: String(one!.campaignId), access: 'view' }] });
    const narrowed = await request(app)
      .get(`/api/meta/branches/${branch1._id}/spend`)
      .set('Authorization', `Bearer ${multiToken}`);
    expect(narrowed.body.data.campaignCount).toBe(1);
    const other = await request(app)
      .get(`/api/meta/branches/${branch2._id}/spend`)
      .set('Authorization', `Bearer ${multiToken}`);
    expect(other.body.data.campaignCount).toBe(2);
  });

  test('expired grant falls back to branch scope', async () => {
    await CampaignAssignment.updateMany(
      { userId: multi._id },
      { $set: { expiresAt: new Date(Date.now() - 1000) } }
    );
    const res = await request(app)
      .get(`/api/meta/branches/${branch1._id}/spend`)
      .set('Authorization', `Bearer ${multiToken}`);
    expect(res.body.data.campaignCount).toBe(5);
  });

  test('clearing grants restores branch scope', async () => {
    await request(app)
      .put(`/api/campaign-access/user/${personA._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchId: branch1._id.toString(), grants: [] });
    const res = await request(app)
      .get(`/api/meta/branches/${branch1._id}/spend`)
      .set('Authorization', `Bearer ${personAToken}`);
    expect(res.body.data.campaignCount).toBe(5);
  });

  test('branch ad accounts endpoint lists accounts with campaign counts', async () => {
    const res = await request(app)
      .get(`/api/campaign-access/branch/${branch1._id}/adaccounts`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    const counts = Object.fromEntries(res.body.data.map((a: any) => [a.metaAdAccountId, a.campaignCount]));
    expect(counts).toEqual({ act_ca_1: 3, act_ca_2: 2 });
    // status is exposed so the UI can badge active vs inactive accounts
    for (const a of res.body.data) {
      expect(a.status).toBe('active');
      expect(a.name).toMatch(/CA Account/);
    }
  });

  test('inactive ad account still listed (UI filters, backend returns all)', async () => {
    await MetaAdAccount.updateOne({ _id: adAccount2._id }, { $set: { status: 'inactive' } });
    const res = await request(app)
      .get(`/api/campaign-access/branch/${branch1._id}/adaccounts`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    const byMeta = Object.fromEntries(res.body.data.map((a: any) => [a.metaAdAccountId, a.status]));
    expect(byMeta.act_ca_2).toBe('inactive');
    await MetaAdAccount.updateOne({ _id: adAccount2._id }, { $set: { status: 'active' } });
  });

  test('branch ad accounts endpoint respects branch isolation', async () => {
    const ok = await request(app)
      .get(`/api/campaign-access/branch/${branch1._id}/adaccounts`)
      .set('Authorization', `Bearer ${personAToken}`);
    expect(ok.status).toBe(200);
    const denied = await request(app)
      .get(`/api/campaign-access/branch/${branch2._id}/adaccounts`)
      .set('Authorization', `Bearer ${personAToken}`);
    expect(denied.status).toBe(403);
  });

  test('branch campaigns can be narrowed to one ad account', async () => {
    const acc1 = await request(app)
      .get(`/api/campaign-access/branch/${branch1._id}/campaigns?adAccountId=${adAccount1._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(acc1.status).toBe(200);
    expect(acc1.body.data.length).toBe(3);
    const acc2 = await request(app)
      .get(`/api/campaign-access/branch/${branch1._id}/campaigns?adAccountId=${adAccount2._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(acc2.status).toBe(200);
    expect(acc2.body.data.length).toBe(2);
    const all = await request(app)
      .get(`/api/campaign-access/branch/${branch1._id}/campaigns`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(all.body.data.length).toBe(5);
  });

  test('per-campaign access levels are stored per row', async () => {
    const list = await MetaCampaign.find({ branchId: branch1._id }).sort({ campaignId: 1 }).lean();
    const viewId = String(list[0].campaignId);
    const manageId = String(list[1].campaignId);
    const put = await request(app)
      .put(`/api/campaign-access/user/${personA._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        branchId: branch1._id.toString(),
        grants: [
          { campaignId: viewId, access: 'view' },
          { campaignId: manageId, access: 'manage' },
        ],
      });
    expect(put.status).toBe(200);
    expect(put.body.data.length).toBe(2);
    const grants = await request(app)
      .get(`/api/campaign-access/user/${personA._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const byId = Object.fromEntries(grants.body.data.map((g: any) => [String(g.campaignId), g.access]));
    expect(byId[viewId]).toBe('view');
    expect(byId[manageId]).toBe('manage');
  });

  test('manage is enforced per campaign: manage ok, view-only denied', async () => {
    const list = await MetaCampaign.find({ branchId: branch1._id }).sort({ campaignId: 1 }).lean();
    const viewId = String(list[0].campaignId);
    const manageId = String(list[1].campaignId);
    const ok = await request(app)
      .patch(`/api/meta/campaigns/${manageId}/assign`)
      .set('Authorization', `Bearer ${personAToken}`)
      .send({ branchId: branch1._id.toString() });
    expect(ok.status).toBe(200);
    const denied = await request(app)
      .patch(`/api/meta/campaigns/${viewId}/assign`)
      .set('Authorization', `Bearer ${personAToken}`)
      .send({ branchId: branch1._id.toString() });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('CAMPAIGN_FORBIDDEN');
  });

  test('branch ad accounts expose companyId for provisioning', async () => {
    const res = await request(app)
      .get(`/api/campaign-access/branch/${branch1._id}/adaccounts`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    for (const a of res.body.data) {
      expect(String(a.companyId)).toBe(String(company._id));
    }
  });

  test('unsynced (paused) campaign: branch-assign provisions doc, then grant succeeds', async () => {
    const freshId = 'camp-provision-1';
    // Unknown to the grant validator before provisioning.
    const before = await request(app)
      .put(`/api/campaign-access/user/${personA._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchId: branch1._id.toString(), grants: [{ campaignId: freshId, access: 'view' }] });
    expect(before.status).toBe(400);
    // Provision via the branch-assign endpoint (what the UI auto-does on save).
    const provisioned = await request(app)
      .patch(`/api/meta/campaigns/${freshId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        branchId: branch1._id.toString(),
        name: 'Provisioned Paused Campaign',
        adAccountId: adAccount1._id.toString(),
        metaAdAccountId: 'act_ca_1',
      });
    expect(provisioned.status).toBe(200);
    const doc = await MetaCampaign.findOne({ companyId: company._id, campaignId: freshId }).lean();
    expect(String(doc!.branchId)).toBe(String(branch1._id));
    expect(String(doc!.adAccountId)).toBe(String(adAccount1._id));
    // Now the grant succeeds.
    const put = await request(app)
      .put(`/api/campaign-access/user/${personA._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchId: branch1._id.toString(), grants: [{ campaignId: freshId, access: 'view' }] });
    expect(put.status).toBe(200);
    expect(put.body.data.length).toBe(1);
  });

  test('active branch scope: restricted user sees only the selected branch grants', async () => {
    const b1camp = await MetaCampaign.findOne({ branchId: branch1._id }).lean();
    const b2camp = await MetaCampaign.findOne({ branchId: branch2._id }).lean();
    await request(app)
      .put(`/api/campaign-access/user/${multi._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchId: branch1._id.toString(), grants: [{ campaignId: String(b1camp!.campaignId), access: 'view' }] });
    await request(app)
      .put(`/api/campaign-access/user/${multi._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ branchId: branch2._id.toString(), grants: [{ campaignId: String(b2camp!.campaignId), access: 'view' }] });

    const unscoped = await request(app)
      .get('/api/campaign-access/mine/detailed')
      .set('Authorization', `Bearer ${multiToken}`);
    expect(unscoped.status).toBe(200);
    expect(unscoped.body.data.length).toBe(2);

    const scopedB1 = await request(app)
      .get('/api/campaign-access/mine/detailed')
      .set('Authorization', `Bearer ${multiToken}`)
      .set('x-branch-id', branch1._id.toString());
    expect(scopedB1.status).toBe(200);
    expect(scopedB1.body.data.length).toBe(1);
    expect(String(scopedB1.body.data[0].branchId)).toBe(String(branch1._id));

    const scopedB2 = await request(app)
      .get('/api/campaign-access/mine')
      .set('Authorization', `Bearer ${multiToken}`)
      .set('x-branch-id', branch2._id.toString());
    expect(scopedB2.status).toBe(200);
    expect(scopedB2.body.data.length).toBe(1);
    expect(String(scopedB2.body.data[0].branchId)).toBe(String(branch2._id));
  });

  test('privileged roles keep the full grant view under a branch header', async () => {
    const res = await request(app)
      .get('/api/campaign-access/mine/detailed')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('x-branch-id', branch1._id.toString());
    expect(res.status).toBe(200);
    // Admin holds no personal grants – the point is no crash/no false scoping.
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('mine/detailed enriches own grants with campaign, branch and account data', async () => {
    const res = await request(app)
      .get('/api/campaign-access/mine/detailed')
      .set('Authorization', `Bearer ${personAToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    const row = res.body.data[0];
    expect(String(row.campaignId)).toBe('camp-provision-1');
    expect(row.campaignName).toBe('Provisioned Paused Campaign');
    expect(row.branchName).toBe('Branch One');
    expect(String(row.adAccountId)).toBe(String(adAccount1._id));
    expect(row.adAccountName).toBe('CA Account One');
    expect(row.access).toBe('view');
  });
});
