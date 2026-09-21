import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { Lead } from '../src/common/models/Lead';
import { LeadSource } from '../src/common/models/LeadSource';
import { WhatsAppIntegration } from '../src/common/models/WhatsAppIntegration';
import { WhatsAppPhoneNumber } from '../src/common/models/WhatsAppPhoneNumber';
import { Conversation } from '../src/common/models/Conversation';
import { Message } from '../src/common/models/Message';
import { WebhookEvent } from '../src/common/models/WebhookEvent';
import { QueueService } from '../src/modules/queue/queue.service';

function messagePayload(messageId: string, from: string, body: string, phoneNumberId = 'pn-1') {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15550001111', phone_number_id: phoneNumberId },
          messages: [{ from, id: messageId, timestamp: '1700000000', type: 'text', text: { body } }],
        },
      }],
    }],
  };
}

function statusesPayload(statusId: string, phoneNumberId = 'pn-1') {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '15550001111', phone_number_id: phoneNumberId },
          statuses: [{ id: statusId, status: 'delivered', recipient_id: '+915555555555' }],
        },
      }],
    }],
  };
}

describe('whatsapp persistence (§22–§23)', () => {
  let companyId: string;
  let branchId: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const company = await new Company({ name: 'WA Co', status: 'active' }).save();
    companyId = company._id.toString();
    const branch = await new Branch({ companyId: company._id, name: 'HQ', status: 'active' }).save();
    branchId = branch._id.toString();
    const integration = await new WhatsAppIntegration({ companyId: company._id, status: 'active' }).save();
    await new WhatsAppPhoneNumber({
      phoneNumberId: 'pn-1',
      phoneNumber: '+15550001111',
      companyId: company._id,
      branchId: branch._id,
      integrationId: integration._id,
      status: 'active',
    }).save();
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('inbound message creates lead + conversation + message under mapped tenant', async () => {
    const event = await WebhookEvent.create({
      provider: 'whatsapp',
      eventType: 'message',
      externalEventId: 'wamid-1',
      payload: messagePayload('wamid-1', '+916666666666', 'Hi, I need a quote'),
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      receivedAt: new Date(),
    });
    await QueueService.processWebhookJob('whatsapp', event._id.toString());

    const done = await WebhookEvent.findById(event._id);
    expect(done?.status).toBe('processed');
    const lead = await Lead.findById(done?.leadId);
    expect(lead?.companyId.toString()).toBe(companyId);
    expect(lead?.branchId?.toString()).toBe(branchId);
    expect(lead?.phone).toBe('+916666666666');
    const conversations = await Conversation.find({ leadId: lead!._id });
    expect(conversations).toHaveLength(1);
    expect(conversations[0].channel).toBe('whatsapp');
    const messages = await Message.find({ conversationId: conversations[0]._id }).sort({ createdAt: 1 });
    expect(messages).toHaveLength(1);
    expect(messages[0].direction).toBe('inbound');
    expect(messages[0].sender).toBe('customer');
    expect(messages[0].content).toBe('Hi, I need a quote');
    expect(await LeadSource.countDocuments({ leadId: lead!._id, sourceType: 'WHATSAPP' })).toBe(1);
  });

  test('second message from same sender reuses lead and conversation', async () => {
    const event = await WebhookEvent.create({
      provider: 'whatsapp',
      eventType: 'message',
      externalEventId: 'wamid-2',
      payload: messagePayload('wamid-2', '+916666666666', 'Any update?'),
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      receivedAt: new Date(),
    });
    await QueueService.processWebhookJob('whatsapp', event._id.toString());

    expect(await Lead.countDocuments({ companyId })).toBe(1);
    const lead = await Lead.findOne({ companyId });
    expect(await Conversation.countDocuments({ leadId: lead!._id })).toBe(1);
    expect(await Message.countDocuments({ leadId: lead!._id })).toBe(2);
  });

  test('statuses-only event is processed with no lead work', async () => {
    const leadsBefore = await Lead.countDocuments({});
    const event = await WebhookEvent.create({
      provider: 'whatsapp',
      eventType: 'message',
      externalEventId: 'wamid-status-1',
      payload: statusesPayload('wamid-status-1'),
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      receivedAt: new Date(),
    });
    await QueueService.processWebhookJob('whatsapp', event._id.toString());

    const done = await WebhookEvent.findById(event._id);
    expect(done?.status).toBe('processed');
    expect(await Lead.countDocuments({})).toBe(leadsBefore);
  });

  test('message to unknown number fails without creating a lead', async () => {
    const leadsBefore = await Lead.countDocuments({});
    const event = await WebhookEvent.create({
      provider: 'whatsapp',
      eventType: 'message',
      externalEventId: 'wamid-unknown-1',
      payload: messagePayload('wamid-unknown-1', '+917777777777', 'Hello?', 'pn-unknown'),
      status: 'pending',
      attempts: 0,
      maxAttempts: 1,
      receivedAt: new Date(),
    });
    await expect(QueueService.processWebhookJob('whatsapp', event._id.toString())).rejects.toThrow('no tenant mapping');
    const done = await WebhookEvent.findById(event._id);
    expect(done?.status).toBe('failed');
    expect(await Lead.countDocuments({})).toBe(leadsBefore);
  });
});
