import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { Company } from '../src/common/models/Company';
import { Branch } from '../src/common/models/Branch';
import { User } from '../src/common/models/User';
import { Lead } from '../src/common/models/Lead';
import { Notification } from '../src/common/models/Notification';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';
import { NotificationService } from '../src/modules/notification/notification.service';

describe('notification dispatch (§28)', () => {
  let companyId: string;
  let leadId: string;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    const company = await new Company({ name: 'Notify Co', status: 'active' }).save();
    companyId = company._id.toString();
    const branch = await new Branch({ companyId: company._id, name: 'HQ', status: 'active' }).save();
    const password = await hashPassword('Test123!');
    await new User({ email: 'boss@notify.local', password, firstName: 'B', lastName: 'O', role: Role.COMPANY_ADMIN, companyId: company._id, isActive: true }).save();
    await new User({ email: 'mgr@notify.local', password, firstName: 'M', lastName: 'G', role: Role.COMPANY_MANAGER, companyId: company._id, isActive: true }).save();
    await new User({ email: 'agent@notify.local', password, firstName: 'A', lastName: 'G', role: Role.SALES_AGENT, companyId: company._id, branchId: branch._id, isActive: true }).save();
    const lead = await new Lead({ companyId: company._id, branchId: branch._id, name: 'Notify Nina', source: 'WEBSITE_FORM' }).save();
    leadId = lead._id.toString();

    delete process.env.FCM_SERVER_KEY;
    delete process.env.BREVO_API_KEY;
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('lead_created creates in-app rows for admins/managers only', async () => {
    await NotificationService.dispatch({ type: 'lead_created', leadId, companyId });
    const rows = await Notification.find({ companyId });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.read === false)).toBe(true);
    expect(rows[0].body).toContain('Notify Nina');
  });

  test('email without keys is skipped gracefully', async () => {
    await expect(
      NotificationService.dispatch({ type: 'email', leadId, companyId, to: 'boss@notify.local' }),
    ).resolves.toBeUndefined();
  });

  test('unknown job type is ignored without throwing', async () => {
    await expect(NotificationService.dispatch({ type: 'carrier_pigeon' })).resolves.toBeUndefined();
  });
});
