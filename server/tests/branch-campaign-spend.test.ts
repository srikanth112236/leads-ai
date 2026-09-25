import request from 'supertest';
import { app } from '../src/app';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { User } from '../src/common/models/User';
import { MetaIntegration } from '../src/common/models/MetaIntegration';
import { MetaAdAccount } from '../src/common/models/MetaAdAccount';
import { MetaCampaign } from '../src/common/models/MetaCampaign';
import { MetaLeadForm } from '../src/common/models/MetaLeadForm';
import { MetaPage } from '../src/common/models/MetaPage';
import { Lead } from '../src/common/models/Lead';
import { Role } from '../src/common/types';
import { MetaService } from '../src/modules/meta/meta.service';
import jwt from 'jsonwebtoken';

import { connectTestDB, closeTestDB, clearTestDB } from './setup';

describe('Branch-Specific Meta Campaign Routing & Spend', () => {
  let companyId: string;
  let branchAId: string;
  let branchBId: string;
  let tokenManagerA: string;
  let tokenManagerB: string;
  let tokenSuper: string;
  let adAccountId: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();
    const comp = await new Company({ name: 'Campaign Routing Motors', slug: 'crm-motors' }).save();
    companyId = comp._id.toString();

    const branchA = await new Branch({ companyId, name: 'Downtown Branch', branchCode: 'DT-01', status: 'active' }).save();
    branchAId = branchA._id.toString();

    const branchB = await new Branch({ companyId, name: 'Uptown Branch', branchCode: 'UP-02', status: 'active' }).save();
    branchBId = branchB._id.toString();

    const userMgrA = await new User({
      email: 'mgra@test.local',
      role: Role.BRANCH_MANAGER,
      companyId,
      branchId: branchAId,
      allowedBranchIds: [branchAId],
      firstName: 'Manager',
      lastName: 'A',
      password: 'TestPassword123!',
    }).save();

    const userMgrB = await new User({
      email: 'mgrb@test.local',
      role: Role.BRANCH_MANAGER,
      companyId,
      branchId: branchBId,
      allowedBranchIds: [branchBId],
      firstName: 'Manager',
      lastName: 'B',
      password: 'TestPassword123!',
    }).save();

    const userSuper = await new User({
      email: 'super@test.local',
      role: Role.SUPER_ADMIN,
      firstName: 'Super',
      lastName: 'Admin',
      password: 'TestPassword123!',
    }).save();

    const secret = process.env.JWT_SECRET || 'dev-secret';
    tokenManagerA = jwt.sign(
      { userId: userMgrA._id.toString(), role: Role.BRANCH_MANAGER, companyId, branchId: branchAId, allowedBranchIds: [branchAId] },
      secret,
    );
    tokenManagerB = jwt.sign(
      { userId: userMgrB._id.toString(), role: Role.BRANCH_MANAGER, companyId, branchId: branchBId, allowedBranchIds: [branchBId] },
      secret,
    );
    tokenSuper = jwt.sign(
      { userId: userSuper._id.toString(), role: Role.SUPER_ADMIN, isSuperAdmin: true, allowedBranchIds: [] },
      secret,
    );

    const int = await new MetaIntegration({
      companyId,
      status: 'active',
      accessToken: 'dummy-token',
      portfolioBusinessId: 'biz-111',
    }).save();

    const acc = await new MetaAdAccount({
      companyId,
      integrationId: int._id,
      metaAdAccountId: 'act_998877',
      name: 'Main Motors Ads',
      status: 'active',
      currency: 'INR',
    }).save();
    adAccountId = acc._id.toString();

    // Create campaigns mapped to different branches
    await new MetaCampaign({
      companyId,
      branchId: branchAId,
      adAccountId: acc._id,
      metaAdAccountId: 'act_998877',
      campaignId: 'camp-100',
      name: 'Downtown EV Promotion',
      status: 'ACTIVE',
    }).save();

    await new MetaCampaign({
      companyId,
      branchId: branchBId,
      adAccountId: acc._id,
      metaAdAccountId: 'act_998877',
      campaignId: 'camp-200',
      name: 'Uptown SUV Promotion',
      status: 'ACTIVE',
    }).save();

    // Mock MetaService.getCampaigns for spend calculation
    jest.spyOn(MetaService, 'getCampaigns').mockImplementation(async () => [
      { id: 'camp-100', name: 'Downtown EV Promotion', status: 'ACTIVE', insights: { spend: '4500.50' } },
      { id: 'camp-200', name: 'Uptown SUV Promotion', status: 'ACTIVE', insights: { spend: '8200.00' } },
    ] as any);
  }, 30000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await closeTestDB();
  });

  test('BRANCH_MANAGER can assign a campaign to their own allowed branch', async () => {
    const res = await request(app)
      .patch('/api/meta/campaigns/camp-100/assign')
      .set('Authorization', `Bearer ${tokenManagerA}`)
      .send({ branchId: branchAId, name: 'Downtown EV Promotion' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('BRANCH_MANAGER is forbidden from assigning campaign to a branch they do not manage', async () => {
    const res = await request(app)
      .patch('/api/meta/campaigns/camp-300/assign')
      .set('Authorization', `Bearer ${tokenManagerA}`)
      .send({ branchId: branchBId, name: 'Unauthorized Assignment' });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Cannot assign campaign to an unauthorized branch');
  });

  test('BRANCH_MANAGER is forbidden from stealing a campaign already belonging to another branch', async () => {
    const res = await request(app)
      .patch('/api/meta/campaigns/camp-200/assign')
      .set('Authorization', `Bearer ${tokenManagerA}`)
      .send({ branchId: branchAId });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Cannot reassign a campaign belonging to another branch');
  });

  test('GET /meta/branches/:branchId/spend aggregates only campaigns belonging to that branch', async () => {
    const resA = await request(app)
      .get(`/api/meta/branches/${branchAId}/spend`)
      .set('Authorization', `Bearer ${tokenManagerA}`);

    expect(resA.status).toBe(200);
    expect(resA.body.data.totalSpend).toBe(4500.50);
    expect(resA.body.data.campaignCount).toBe(1);
    expect(resA.body.data.campaigns[0].campaignId).toBe('camp-100');

    // Manager A cannot view branch B's spend
    const forbiddenRes = await request(app)
      .get(`/api/meta/branches/${branchBId}/spend`)
      .set('Authorization', `Bearer ${tokenManagerA}`);

    expect(forbiddenRes.status).toBe(403);
  });

  test('Webhook lead routes directly to campaign branchId', async () => {
    // Setup page and form
    const page = await new MetaPage({
      companyId,
      integrationId: (await MetaIntegration.findOne({ companyId }))!._id,
      metaPageId: 'page-routed',
      name: 'Central Page',
      status: 'active',
      branchId: undefined, // no page default
    }).save();

    const form = await new MetaLeadForm({
      companyId,
      metaFormId: 'form-routed',
      metaPageId: 'page-routed',
      name: 'Multi-Branch Booking Form',
      status: 'active',
      branchId: undefined, // no form default
    }).save();

    // Mock retrieveLeadDetailed to return lead with campaign_id = camp-200 (which belongs to branchB)
    jest.spyOn(MetaService, 'retrieveLeadDetailed').mockResolvedValueOnce({
      data: {
        id: 'lead-test-camp-routing',
        form_id: 'form-routed',
        campaign_id: 'camp-200',
        field_data: [
          { name: 'full_name', values: ['Priya Sharma'] },
          { name: 'phone_number', values: ['+919876543210'] },
          { name: 'email', values: ['priya@example.com'] },
        ],
      },
    });

    const result = await MetaService.ingestLeadEvent({
      payload: {
        entry: [{
          id: 'page-routed',
          changes: [{
            field: 'leadgen',
            value: { leadgen_id: 'lead-test-camp-routing', page_id: 'page-routed', form_id: 'form-routed' },
          }],
        }],
      },
      externalEventId: 'lead-test-camp-routing',
    });

    expect(result.success).toBe(true);
    const createdLead = await Lead.findById(result.leadId);
    expect(createdLead).not.toBeNull();
    // Routed to branchB because camp-200 is assigned to branchB!
    expect(createdLead?.branchId?.toString()).toBe(branchBId);
  });
});
