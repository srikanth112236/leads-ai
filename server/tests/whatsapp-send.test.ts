import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { Lead } from '../src/common/models/Lead';
import { WhatsAppIntegration } from '../src/common/models/WhatsAppIntegration';
import { Conversation } from '../src/common/models/Conversation';
import { Message } from '../src/common/models/Message';
import { WhatsAppService } from '../src/modules/whatsapp/whatsapp.service';

describe('whatsapp send (§24)', () => {
  let integrationId: string;
  let leadId: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const company = await new Company({ name: 'WA Send Co', status: 'active' }).save();
    const branch = await new Branch({ companyId: company._id, name: 'HQ', status: 'active' }).save();
    const integration = await new WhatsAppIntegration({
      companyId: company._id,
      phoneNumberId: 'pn-send-1',
      accessToken: 'test-wa-token',
      status: 'active',
    }).save();
    integrationId = integration._id.toString();
    const lead = await new Lead({ companyId: company._id, branchId: branch._id, name: 'Send Sam', phone: '+918888888888', source: 'WHATSAPP' }).save();
    leadId = lead._id.toString();
  }, 30000);

  afterEach(() => {
    delete (global as any).fetch;
  });

  afterAll(async () => {
    await closeTestDB();
  });

  test('text message inside window sends and stores outbound row', async () => {
    const calls: any[] = [];
    (global as any).fetch = jest.fn(async (url: string, init: any) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ messages: [{ id: 'wamid-out-1' }] }) };
    });

    const res = await WhatsAppService.sendMessage('+918888888888', 'Hello from sales', integrationId, { leadId });
    expect(res.success).toBe(true);
    expect(res.via).toBe('text');
    expect(res.messageId).toBe('wamid-out-1');
    expect(calls).toHaveLength(1);
    expect(String(calls[0].url)).toContain('pn-send-1/messages');
    expect(calls[0].body.type).toBe('text');

    const rows = await Message.find({ leadId, direction: 'outbound' });
    expect(rows).toHaveLength(1);
    expect(rows[0].sender).toBe('agent');
    expect(rows[0].content).toBe('Hello from sales');
    expect(await Conversation.countDocuments({ leadId })).toBe(1);
  });

  test('outside-window error falls back to template', async () => {
    const calls: any[] = [];
    (global as any).fetch = jest.fn(async (_url: string, init: any) => {
      calls.push(JSON.parse(init.body));
      if (calls.length === 1) {
        return { ok: false, json: async () => ({ error: { code: 131047, message: 'Re-engagement message outside window' } }) };
      }
      return { ok: true, json: async () => ({ messages: [{ id: 'wamid-out-2' }] }) };
    });

    const res = await WhatsAppService.sendMessage('+918888888888', 'Hello again', integrationId, {
      leadId,
      template: { name: 'hello_world' },
    });
    expect(res.success).toBe(true);
    expect(res.via).toBe('template');
    expect(calls).toHaveLength(2);
    expect(calls[1].type).toBe('template');
    expect(calls[1].template.name).toBe('hello_world');
  });

  test('unrecoverable failure returns error and stores nothing', async () => {
    (global as any).fetch = jest.fn(async () => ({
      ok: false,
      json: async () => ({ error: { code: 123, message: 'Bad request' } }),
    }));
    const before = await Message.countDocuments({ leadId });
    const res = await WhatsAppService.sendMessage('+918888888888', 'Nope', integrationId, { leadId });
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
    expect(await Message.countDocuments({ leadId })).toBe(before);
  });

  test('missing token fails closed', async () => {
    const res = await WhatsAppService.sendMessage('+918888888888', 'Hi', '000000000000000000000000');
    expect(res.success).toBe(false);
  });
});
