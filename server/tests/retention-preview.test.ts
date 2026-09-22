import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { Lead } from '../src/common/models/Lead';
import { LeadSource } from '../src/common/models/LeadSource';
import { LeadNote } from '../src/common/models/LeadNote';
import { Message } from '../src/common/models/Message';
import { Conversation } from '../src/common/models/Conversation';
import { MetaIntegration } from '../src/common/models/MetaIntegration';
import { MetaPage } from '../src/common/models/MetaPage';
import { MetaLeadForm } from '../src/common/models/MetaLeadForm';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';
import { MetaService } from '../src/modules/meta/meta.service';
import { RetentionService } from '../src/modules/admin/retention.service';

function mockMeta() {
  (global as any).fetch = jest.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('/previews')) {
      return { ok: true, json: async () => ({ data: [{ body: '<iframe>ad</iframe>' }] }) };
    }
    if (u.includes('fields=creative')) {
      return { ok: true, json: async () => ({ creative: { id: 'cr-1' } }) };
    }
    return {
      ok: true,
      json: async () => ({
        id: 'lg-pv-1',
        created_time: '2026-01-01T00:00:00+0000',
        ad_id: 'ad-9',
        form_id: 'form-pv',
        field_data: [{ name: 'full_name', values: ['Preview Pam'] }, { name: 'email', values: ['pam@pv.local'.replace('.local', '.com')] }],
      }),
    };
  });
}

describe('retention + ad preview + purge', () => {
  let tokenSuper: string;
  let tokenA: string;
  let companyAId: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const companyA = await new Company({ name: 'Retain A', status: 'active' }).save();
    companyAId = companyA._id.toString();
    const branch = await new Branch({ companyId: companyA._id, name: 'HQ', status: 'active' }).save();
    const password = await hashPassword('Test123!');
    await new User({ email: 'retsuper@t.local', password, firstName: 'S', lastName: 'U', role: Role.SUPER_ADMIN, isActive: true }).save();
    await new User({ email: 'retA@t.local', password, firstName: 'R', lastName: 'A', role: Role.COMPANY_ADMIN, companyId: companyA._id, isActive: true }).save();

    const integration = await new MetaIntegration({ companyId: companyA._id, accessToken: 'tok', status: 'active' }).save();
    await new MetaPage({ metaPageId: 'page-pv', companyId: companyA._id, branchId: branch._id, integrationId: integration._id, status: 'active' }).save();
    await new MetaLeadForm({ metaFormId: 'form-pv', metaPageId: 'page-pv', companyId: companyA._id, branchId: branch._id, status: 'active' }).save();

    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const stale = await new Lead({ companyId: companyA._id, branchId: branch._id, name: 'Old Ollie', email: 'ollie@old.com', phone: '+911111111111', status: 'new', source: 'WEBSITE_FORM' }).save();
    await Lead.updateOne({ _id: stale._id }, { $set: { updatedAt: oldDate } }, { timestamps: false });
    const conv = await new Conversation({ leadId: stale._id, companyId: companyA._id, channel: 'whatsapp', status: 'active' }).save();
    await new Message({ conversationId: conv._id, leadId: stale._id, companyId: companyA._id, direction: 'inbound', sender: 'customer', content: 'my ssn is 123', channel: 'whatsapp' }).save();
    await new LeadNote({ leadId: stale._id, companyId: companyA._id, authorId: stale._id, body: 'call 555-1234' }).save();

    const warm = await new Lead({ companyId: companyA._id, name: 'Warm Wendy', email: 'wendy@warm.com', status: 'qualified', source: 'WEBSITE_FORM' }).save();
    await Lead.updateOne({ _id: warm._id }, { $set: { updatedAt: oldDate } }, { timestamps: false });

    const sLogin = await request(app).post('/api/auth/login').send({ email: 'retsuper@t.local', password: 'Test123!' });
    tokenSuper = sLogin.body.data.accessToken as string;
    const aLogin = await request(app).post('/api/auth/login').send({ email: 'retA@t.local', password: 'Test123!' });
    tokenA = aLogin.body.data.accessToken as string;

    mockMeta();
  }, 30000);

  afterEach(() => {
    mockMeta();
  });

  afterAll(async () => {
    delete (global as any).fetch;
    await closeTestDB();
  });

  test('ad preview is stored on the Meta source row', async () => {
    const result = await MetaService.ingestLeadEvent({
      payload: { object: 'page', entry: [{ changes: [{ value: { leadgen_id: 'lg-pv-1', page_id: 'page-pv', form_id: 'form-pv' } }] }] },
      externalEventId: 'lg-pv-1',
    });
    expect(result.success).toBe(true);
    const source = await LeadSource.findOne({ leadId: result.leadId, sourceType: 'META_LEAD_ADS' });
    expect((source?.metadata as any)?.adCreativeId).toBe('cr-1');
    expect((source?.metadata as any)?.adPreview).toBe('<iframe>ad</iframe>');
  });

  test('retention anonymizes stale PII but spares active relationships', async () => {
    const result = await RetentionService.run(90);
    expect(result.leadsAnonymized).toBe(1);

    const stale = await Lead.findOne({ email: 'ollie@old.com' });
    expect(stale).toBeNull();
    const redacted = await Lead.findOne({ name: 'Redacted contact' });
    expect(redacted?.phone).toBeUndefined();
    expect(await Message.countDocuments({ content: 'my ssn is 123' })).toBe(0);
    expect(await LeadNote.countDocuments({ body: 'call 555-1234' })).toBe(0);

    expect(await Lead.findOne({ email: 'wendy@warm.com' })).not.toBeNull();
  });

  test('retention endpoint is super-only', async () => {
    const forbidden = await request(app).post('/api/admin/retention/run').set('Authorization', `Bearer ${tokenA}`).send({});
    expect(forbidden.status).toBe(403);
    const ok = await request(app).post('/api/admin/retention/run').set('Authorization', `Bearer ${tokenSuper}`).send({ days: 90 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.cutoffDays).toBe(90);
  });

  test('disconnect with purge deletes tenant Meta assets', async () => {
    const res = await request(app).post('/api/meta/disconnect').set('Authorization', `Bearer ${tokenA}`).send({ purge: true });
    expect(res.status).toBe(200);
    expect(await MetaPage.countDocuments({ companyId: companyAId })).toBe(0);
    expect(await MetaLeadForm.countDocuments({ companyId: companyAId })).toBe(0);
    expect(await MetaIntegration.countDocuments({ companyId: companyAId })).toBe(0);
  });
});
