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
      mustChangePassword: false,
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
      mustChangePassword: false,
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
      mustChangePassword: false,
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

  const { Lead } = await import('./common/models/Lead');
  const existingLeadCount = await Lead.countDocuments({ companyId: company._id });
  if (existingLeadCount === 0) {
    const demoLeads = [
      {
        name: 'Sarah Jenkins',
        email: 'sarah.jenkins@techcorp.io',
        phone: '+1 (555) 234-8901',
        company: 'TechCorp Solutions',
        status: 'new',
        priority: 'urgent',
        score: 94,
        source: 'meta_ads',
        message: 'Interested in enterprise multi-tenant rollout for 5 branches. Need immediate demo and quotation.',
        companyId: company._id,
        branchId: branch._id,
        metadata: {
          budget: '$50,000 - $100,000',
          timeline: 'Immediate (within 14 days)',
          scoringFactors: ['High budget ($50k+)', 'Decision maker', 'Immediate timeline'],
          followUp: {
            scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            type: 'call',
            note: 'Initial discovery call and enterprise architecture demo',
            completed: false,
          },
        },
      },
      {
        name: 'Michael Chang',
        email: 'mchang@summitgroup.com',
        phone: '+1 (555) 345-6789',
        company: 'Summit Capital Partners',
        status: 'contacted',
        priority: 'high',
        score: 86,
        source: 'meta_ads',
        message: 'Looking for automated WhatsApp routing and Facebook Lead Ads synchronization.',
        companyId: company._id,
        branchId: branch._id,
        assignedTo: demoAgent?._id,
        metadata: {
          budget: '$25,000 - $50,000',
          timeline: '1 Month',
          scoringFactors: ['Qualified company', 'Meta ads ad-spend active', 'Responsive phone'],
          followUp: {
            scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            type: 'meeting',
            note: 'Demonstrate Meta OAuth and webhook auto-sync feature',
            completed: false,
          },
        },
      },
      {
        name: 'Elena Rostova',
        email: 'elena@vanguardproperties.ae',
        phone: '+971 50 123 4567',
        company: 'Vanguard Luxury Properties',
        status: 'qualified',
        priority: 'urgent',
        score: 98,
        source: 'whatsapp',
        message: 'Need 12 branches connected with separate agent pools and phone numbers.',
        companyId: company._id,
        branchId: branch._id,
        assignedTo: demoAgent?._id,
        metadata: {
          budget: '$100,000+',
          timeline: 'Immediate',
          scoringFactors: ['Luxury sector', 'Multi-branch requirement', 'WhatsApp direct outreach'],
          followUp: {
            scheduledAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
            type: 'call',
            note: 'Urgent follow-up on custom SLA terms',
            completed: false,
          },
        },
      },
      {
        name: 'David Miller',
        email: 'david.miller@apexlogistics.com',
        phone: '+1 (555) 789-0123',
        company: 'Apex Logistics Global',
        status: 'proposal',
        priority: 'high',
        score: 89,
        source: 'website_form',
        message: 'Proposal received. Board review scheduled for Thursday afternoon.',
        companyId: company._id,
        branchId: branch._id,
        assignedTo: demoAgent?._id,
        metadata: {
          budget: '$45,000',
          timeline: '2 Weeks',
          scoringFactors: ['Proposal submitted', 'Executive sponsorship', 'Security compliance approved'],
          followUp: {
            scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
            type: 'meeting',
            note: 'Post-board review contract alignment call',
            completed: false,
          },
        },
      },
      {
        name: 'Aisha Al-Mansoor',
        email: 'aisha@gulfenterprises.qa',
        phone: '+974 3312 8765',
        company: 'Gulf Commerce Holding',
        status: 'converted',
        priority: 'medium',
        score: 95,
        source: 'referral',
        message: 'Contract signed. Onboarding starts next Monday with Branch #1.',
        companyId: company._id,
        branchId: branch._id,
        assignedTo: demoAgent?._id,
        metadata: {
          budget: '$75,000',
          timeline: 'Closed',
          scoringFactors: ['Closed won', 'Annual prepay contract'],
          followUp: {
            scheduledAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
            type: 'email',
            note: 'Sent welcome packet and onboarding credentials',
            completed: true,
            completedAt: new Date().toISOString(),
            outcome: 'Customer activated',
          },
        },
      },
      {
        name: 'Sofia Martinez',
        email: 'sofia@martinezlaw.com',
        phone: '+1 (555) 678-9012',
        company: 'Martinez Legal Associates',
        status: 'lost',
        priority: 'low',
        score: 38,
        source: 'website_form',
        message: 'Decided to renew with existing legacy software for another year.',
        companyId: company._id,
        branchId: branch._id,
        metadata: {
          budget: 'Under $5,000',
          timeline: 'Deferred',
          scoringFactors: ['Budget mismatch', 'Legacy software renewal'],
          lostReason: 'Budget constraints & renewed existing vendor',
        },
      },
    ];

    for (const leadData of demoLeads) {
      await Lead.create({
        ...leadData,
        normalizedPhone: leadData.phone.replace(/[\s\-\(\)\+]/g, ''),
        normalizedEmail: leadData.email.toLowerCase(),
      });
    }
    logger.info(`Seeded ${demoLeads.length} sample demo leads with scores, pipeline stages, and follow-ups`);
  }
  logger.info('Seed complete');
}

main().catch((err) => {
  logger.error('Seed failed:', err);
  process.exit(1);
});
