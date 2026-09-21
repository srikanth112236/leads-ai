import { Request, Response } from 'express';
import { Company } from '../../common/models/Company';
import { User } from '../../common/models/User';
import { CompanyMembership } from '../../common/models/CompanyMembership';
import { hashPassword } from '../../common/security/hash';
import { Role } from '../../common/types';
import { MetaIntegration } from '../../common/models/MetaIntegration';
import { MetaPage } from '../../common/models/MetaPage';
import { WhatsAppIntegration } from '../../common/models/WhatsAppIntegration';
import { WebsiteLeadForm } from '../../common/models/WebsiteLeadForm';
import { AuthRequest } from '../../common/middleware/auth';
import { recordAudit } from '../../common/services/audit';
import { BaseController } from '../../common/controllers/BaseController';

export class CompanyController extends BaseController {
  static async getAll(_req: Request, res: Response): Promise<void> {
    try {
      const companies = await Company.find({}).sort({ createdAt: -1 });
      res.json({ success: true, data: companies });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const company = await Company.findById(req.params.id);
      if (!company) {
        res.status(404).json({ error: 'Company not found', code: 'NOT_FOUND' });
        return;
      }
      res.json({ success: true, data: company });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const { name, domain, status = 'active', contactEmail, contactPhone, address, city, country, website, settings, admin } = req.body;
      if (!name) {
        res.status(400).json({ error: 'Company name is required', code: 'VALIDATION_ERROR' });
        return;
      }
      if (admin) {
        const { firstName, lastName, email, password } = admin;
        if (!firstName || !lastName || !email || !password) {
          res.status(400).json({ error: 'Admin needs firstName, lastName, email and password', code: 'VALIDATION_ERROR' });
          return;
        }
        if (await User.findOne({ email })) {
          res.status(409).json({ error: 'Admin email already exists', code: 'USER_EXISTS' });
          return;
        }
      }
      const company = new Company({ name, domain, status, contactEmail, contactPhone, address, city, country, website, settings });
      await company.save();

      // Optional first admin login for the company. Returned ONCE in this
      // response — never stored or returned again.
      let adminCredentials: { email: string; password: string } | null = null;
      if (admin) {
        try {
          const adminUser = new User({
            email: admin.email,
            password: await hashPassword(admin.password),
            firstName: admin.firstName,
            lastName: admin.lastName,
            role: Role.COMPANY_ADMIN,
            companyId: company._id,
            isActive: true,
          });
          await adminUser.save();
          await CompanyMembership.create({
            userId: adminUser._id,
            companyId: company._id,
            role: Role.COMPANY_ADMIN,
            branchIds: [],
            isActive: true,
          });
          adminCredentials = { email: admin.email, password: admin.password };
        } catch (adminError) {
          await Company.findByIdAndDelete(company._id);
          throw adminError;
        }
      }

      await recordAudit({
        actorId: (req as AuthRequest).user?.userId,
        action: 'COMPANY_CREATED',
        companyId: company._id.toString(),
        metadata: { name, withAdmin: !!adminCredentials },
      });
      res.status(201).json({ success: true, data: { company, adminCredentials } });
    } catch (error: any) {
      if (error?.code === 11000) {
        res.status(409).json({ error: 'User already exists', code: 'USER_EXISTS' });
        return;
      }
      res.status(500).json({ error: error.message, code: 'CREATE_ERROR' });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { name, domain, status, contactEmail, contactPhone, address, city, country, website, settings } = req.body;
      const company = await Company.findByIdAndUpdate(req.params.id, { name, domain, status, contactEmail, contactPhone, address, city, country, website, settings }, { new: true, runValidators: true });
      if (!company) {
        res.status(404).json({ error: 'Company not found', code: 'NOT_FOUND' });
        return;
      }
      await recordAudit({
        actorId: (req as AuthRequest).user?.userId,
        action: 'COMPANY_UPDATED',
        companyId: company._id.toString(),
        metadata: { name, domain, status },
      });
      res.json({ success: true, data: company });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'UPDATE_ERROR' });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      await Company.findByIdAndDelete(req.params.id);
      res.json({ success: true, message: 'Company deleted' });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'DELETE_ERROR' });
    }
  }

  static async getUsers(_req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: [] });
  }

  static async getBranches(_req: Request, res: Response): Promise<void> {
    res.json({ success: true, data: [] });
  }

  static async getIntegrations(req: Request, res: Response): Promise<void> {
    try {
      const user = (req as AuthRequest).user;
      const companyId = user?.isSuperAdmin ? req.params.id : user?.companyId;
      if (!user?.isSuperAdmin && req.params.id !== user?.companyId) {
        res.status(403).json({ error: 'Access denied', code: 'FORBIDDEN' });
        return;
      }
      const [meta, metaPages, whatsapp, websiteForms] = await Promise.all([
        MetaIntegration.find({ companyId }).lean(),
        MetaPage.find({ companyId }).lean(),
        WhatsAppIntegration.find({ companyId }).lean(),
        WebsiteLeadForm.find({ companyId }).lean(),
      ]);
      res.json({ success: true, data: { meta, metaPages, whatsapp, websiteForms } });
    } catch (error: any) {
      res.status(500).json({ error: error.message, code: 'FETCH_ERROR' });
    }
  }
}
