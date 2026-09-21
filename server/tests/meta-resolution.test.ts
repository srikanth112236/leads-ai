import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { Lead } from '../src/common/models/Lead';
import { LeadSource } from '../src/common/models/LeadSource';
import { MetaIntegration } from '../src/common/models/MetaIntegration';
import { MetaPage } from '../src/common/models/MetaPage';
import { MetaLeadForm } from '../src/common/models/MetaLeadForm';
import { WebhookEvent } from '../src/common/models/WebhookEvent';
import { MetaService } from '../src/modules/meta/meta.service';
import { QueueService } from '../src/modules/queue/queue.service';

const GRAPH_LEAD = {
  id: 'lg-test-1',
  created_time: '2026-01-01T00:00:00+0000',
  ad_id: 'ad-1',
  form_id: 'form-1',
  field_data: [
    { name: 'full_name', values: ['Meta Meera'] },
    { name: 'email', values: ['meera@example.com'] },
    { name: 'phone_number', values: ['+914444444444'] },
  ],
};

function webhookPayload(leadgenId: string, formId: string, pageId: string) {
  return {
    object: 'page',
    entry: [{ id: pageId, changes: [{ field: 'leadgen', value: { leadgen_id: leadgenId, page_id: pageId, form_id: formId } }] }],
  };
}

describe('meta tenant resolution (§17)', () => {
  let companyId: string;
  let branchId: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const company = await new Company({ name: 'Meta Co', status: 'active' }).save();
    companyId = company._id.toString();
    const branch = await new Branch({ companyId: company._id, name: 'HQ', status: 'active' }).save();
    branchId = branch._id.toString();
    const integration = await new MetaIntegration({ companyId: company._id, accessToken: 'test-page-token', status: 'active' }).save();
    await new MetaPage({ metaPageId: 'page-1', companyId: company._id, branchId: branch._id, integrationId: integration._id, status: 'active' }).save();
    await new MetaLeadForm({ metaFormId: 'form-1', metaPageId: 'page-1', companyId: company._id, branchId: branch._id, status: 'active' }).save();

    (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => GRAPH_LEAD }));
  }, 30000);

  afterAll(async () => {
    delete (global as any).fetch;
    await closeTestDB();
  });

  test('known form resolves to mapped company+branch', async () => {
    const tenant = await MetaService.resolveTenant('form-1', 'page-1');
    expect(tenant?.companyId).toBe(companyId);
    expect(tenant?.branchId).toBe(branchId);
  });

  test('unknown form falls back to page mapping', async () => {
    const tenant = await MetaService.resolveTenant('form-unknown', 'page-1');
    expect(tenant?.companyId).toBe(companyId);
  });

  test('unknown form and page resolve to nothing', async () => {
    await expect(MetaService.resolveTenant('form-x', 'page-x')).resolves.toBeNull();
  });

  test('mapped leadgen event creates lead in the right tenant via worker path', async () => {
    const event = await WebhookEvent.create({
      provider: 'meta',
      eventType: 'leadgen',
      externalEventId: 'lg-test-1',
      payload: webhookPayload('lg-test-1', 'form-1', 'page-1'),
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      receivedAt: new Date(),
    });
    await QueueService.processWebhookJob('meta', event._id.toString());

    const done = await WebhookEvent.findById(event._id);
    expect(done?.status).toBe('processed');
    expect(done?.leadId).toBeDefined();
    const lead = await Lead.findById(done?.leadId);
    expect(lead?.companyId.toString()).toBe(companyId);
    expect(lead?.branchId?.toString()).toBe(branchId);
    expect(lead?.email).toBe('meera@example.com');
    expect(await LeadSource.countDocuments({ leadId: lead!._id, sourceType: 'META_LEAD_ADS' })).toBe(1);
  });

  test('unmapped leadgen event fails without creating a lead', async () => {
    const before = await Lead.countDocuments({});
    const event = await WebhookEvent.create({
      provider: 'meta',
      eventType: 'leadgen',
      externalEventId: 'lg-unknown-1',
      payload: webhookPayload('lg-unknown-1', 'form-nope', 'page-nope'),
      status: 'pending',
      attempts: 0,
      maxAttempts: 1,
      receivedAt: new Date(),
    });
    await expect(QueueService.processWebhookJob('meta', event._id.toString())).rejects.toThrow('no tenant mapping');
    const done = await WebhookEvent.findById(event._id);
    expect(done?.status).toBe('failed');
    expect(await Lead.countDocuments({})).toBe(before);
  });
});
