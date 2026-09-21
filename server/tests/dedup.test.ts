import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { Lead } from '../src/common/models/Lead';
import { LeadSource } from '../src/common/models/LeadSource';
import { TrackerEvent } from '../src/common/models/TrackerEvent';
import { InboundLeadService } from '../src/modules/inbound/inbound-lead.service';

describe('deduplication (§10–§11, §36)', () => {
  let companyAId: string;
  let companyBId: string;
  let branchAId: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const companyA = await new Company({ name: 'Dedup A', status: 'active' }).save();
    const companyB = await new Company({ name: 'Dedup B', status: 'active' }).save();
    companyAId = companyA._id.toString();
    companyBId = companyB._id.toString();
    const branchA = await new Branch({ companyId: companyA._id, name: 'HQ', status: 'active' }).save();
    branchAId = branchA._id.toString();
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('same person via website + meta + whatsapp in one company → one lead', async () => {
    const first = await InboundLeadService.ingest({
      sourceType: 'WEBSITE_FORM',
      payload: { name: 'Asha', email: 'asha@example.com', phone: '+919876543210' },
      companyId: companyAId,
      branchId: branchAId,
    });
    expect(first.success).toBe(true);
    expect(first.isDuplicate).toBe(false);

    const second = await InboundLeadService.ingest({
      sourceType: 'META_LEAD_ADS',
      payload: { full_name: 'Asha', email: 'asha@example.com', phone_number: '+919876543210' },
      companyId: companyAId,
      branchId: branchAId,
      externalId: 'lg-test-1',
    });
    expect(second.success).toBe(true);
    expect(second.isDuplicate).toBe(true);
    expect(second.leadId).toBe(first.leadId);

    const third = await InboundLeadService.ingest({
      sourceType: 'WHATSAPP',
      payload: { phone: '+91 98765-43210' },
      companyId: companyAId,
      branchId: branchAId,
      externalId: 'wamid-test-1',
    });
    expect(third.success).toBe(true);
    expect(third.isDuplicate).toBe(true);
    expect(third.leadId).toBe(first.leadId);

    expect(await Lead.countDocuments({ companyId: companyAId })).toBe(1);
    expect(await LeadSource.countDocuments({ leadId: first.leadId })).toBe(3);
    expect(await TrackerEvent.countDocuments({ leadId: first.leadId })).toBe(3);
  });

  test('email casing/whitespace variants still merge', async () => {
    const res = await InboundLeadService.ingest({
      sourceType: 'WEBSITE_FORM',
      payload: { name: 'Asha', email: '  ASHA@Example.COM  ', phone: '+919876543210' },
      companyId: companyAId,
    });
    expect(res.success).toBe(true);
    expect(res.isDuplicate).toBe(true);
  });

  test('same identity in another company → separate lead (no cross-tenant merge)', async () => {
    const res = await InboundLeadService.ingest({
      sourceType: 'WEBSITE_FORM',
      payload: { name: 'Asha', email: 'asha@example.com', phone: '+919876543210' },
      companyId: companyBId,
    });
    expect(res.success).toBe(true);
    expect(res.isDuplicate).toBe(false);
    expect(await Lead.countDocuments({})).toBe(2);
  });

  test('different person in same company → new lead (no false merge)', async () => {
    const res = await InboundLeadService.ingest({
      sourceType: 'WEBSITE_FORM',
      payload: { name: 'Ravi', email: 'ravi@example.com', phone: '+911111111111' },
      companyId: companyAId,
    });
    expect(res.success).toBe(true);
    expect(res.isDuplicate).toBe(false);
  });

  test('ingest without tenant context is refused', async () => {
    const res = await InboundLeadService.ingest({
      sourceType: 'WHATSAPP',
      payload: { phone: '+912222222222' },
    });
    expect(res.success).toBe(false);
  });
});
