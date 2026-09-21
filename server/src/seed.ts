import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import { connectDB } from './common/config/database';
import { User } from './common/models/User';
import { Company } from './common/models/Company';
import { Branch } from './common/models/Branch';
import { CompanyMembership } from './common/models/CompanyMembership';
import { BranchMembership } from './common/models/BranchMembership';
import { WebsiteLeadForm } from './common/models/WebsiteLeadForm';
import { hashPassword } from './common/security/hash';
import { Role } from './common/types';
import { logger } from './common/utils/logger';

async function main(): Promise<void> {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'superadmin@leads-crm.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  if (!process.env.SEED_ADMIN_PASSWORD) {
    logger.warn('Using default seed admin password — set SEED_ADMIN_PASSWORD for any shared environment');
  }

  await connectDB();

  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = new User({
      email: adminEmail,
      password: await hashPassword(adminPassword),
      firstName: 'Super',
      lastName: 'Admin',
      role: Role.SUPER_ADMIN,
      isActive: true,
    });
    await admin.save();
    logger.info(`Seeded SUPER_ADMIN: ${adminEmail}`);
  } else {
    logger.info(`SUPER_ADMIN already exists: ${adminEmail}`);
  }

  let company = await Company.findOne({ name: 'Demo Company' });
  if (!company) {
    company = new Company({ name: 'Demo Company', domain: 'demo.local', status: 'active' });
    await company.save();
    logger.info('Seeded Demo Company');
  }

  let branch = await Branch.findOne({ companyId: company._id, name: 'Head Office' });
  if (!branch) {
    branch = new Branch({ companyId: company._id, name: 'Head Office', location: 'HQ', status: 'active' });
    await branch.save();
    logger.info('Seeded Head Office branch');
  }

  let form = await WebsiteLeadForm.findOne({ companyId: company._id, status: 'active' });
  if (!form) {
    form = new WebsiteLeadForm({
      companyId: company._id,
      branchId: branch._id,
      publicKey: randomBytes(24).toString('hex'),
      allowedDomains: [],
      status: 'active',
      configuration: { seeded: true },
    });
    await form.save();
    logger.info(`Seeded WebsiteLeadForm publicKey: ${form.publicKey}`);
  } else {
    logger.info(`WebsiteLeadForm already exists, publicKey: ${form.publicKey}`);
  }

  // Demo company logins (dev only — override via SEED_DEMO_* env vars)
  const demoAdminEmail = process.env.SEED_DEMO_ADMIN_EMAIL || 'admin@demo.local';
  const demoAdminPassword = process.env.SEED_DEMO_ADMIN_PASSWORD || 'DemoAdmin123!';
  const demoAgentEmail = process.env.SEED_DEMO_AGENT_EMAIL || 'agent@demo.local';
  const demoAgentPassword = process.env.SEED_DEMO_AGENT_PASSWORD || 'DemoAgent123!';

  let demoAdmin = await User.findOne({ email: demoAdminEmail });
  if (!demoAdmin) {
    demoAdmin = new User({
      email: demoAdminEmail,
      password: await hashPassword(demoAdminPassword),
      firstName: 'Demo',
      lastName: 'Admin',
      role: Role.COMPANY_ADMIN,
      companyId: company._id,
      isActive: true,
    });
    await demoAdmin.save();
    await CompanyMembership.create({
      userId: demoAdmin._id,
      companyId: company._id,
      role: Role.COMPANY_ADMIN,
      branchIds: [branch._id],
      isActive: true,
    });
    logger.info(`Seeded demo COMPANY_ADMIN: ${demoAdminEmail} / ${demoAdminPassword}`);
  } else {
    logger.info(`Demo admin already exists: ${demoAdminEmail}`);
  }

  let demoAgent = await User.findOne({ email: demoAgentEmail });
  if (!demoAgent) {
    demoAgent = new User({
      email: demoAgentEmail,
      password: await hashPassword(demoAgentPassword),
      firstName: 'Demo',
      lastName: 'Agent',
      role: Role.SALES_AGENT,
      companyId: company._id,
      branchId: branch._id,
      isActive: true,
    });
    await demoAgent.save();
    await BranchMembership.create({
      userId: demoAgent._id,
      branchId: branch._id,
      role: Role.SALES_AGENT,
      isActive: true,
    });
    logger.info(`Seeded demo SALES_AGENT: ${demoAgentEmail} / ${demoAgentPassword}`);
  } else {
    logger.info(`Demo agent already exists: ${demoAgentEmail}`);
  }

  await mongoose.disconnect();
  logger.info('Seed complete');
}

main().catch((err) => {
  logger.error('Seed failed:', err);
  process.exit(1);
});
