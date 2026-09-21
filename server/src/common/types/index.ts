export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  COMPANY_ADMIN = 'COMPANY_ADMIN',
  COMPANY_MANAGER = 'COMPANY_MANAGER',
  BRANCH_MANAGER = 'BRANCH_MANAGER',
  SALES_AGENT = 'SALES_AGENT',
}

export interface ITenantContext {
  userId: string;
  role: Role;
  companyId?: string;
  branchId?: string;
  allowedBranchIds: string[];
  isSuperAdmin: boolean;
}

export interface ICompany {
  _id?: string;
  name: string;
  domain?: string;
  status: 'active' | 'inactive' | 'suspended';
  settings?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IBranch {
  _id?: string;
  companyId: string;
  name: string;
  location?: string;
  status: 'active' | 'inactive';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IUser {
  _id?: string;
  email: string;
  password: string;
  companyId?: string;
  branchId?: string;
  role: Role;
  firstName: string;
  lastName: string;
  phone?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ICompanyMembership {
  _id?: string;
  userId: string;
  companyId: string;
  role: Role;
  branchIds: string[];
  isActive: boolean;
  createdAt?: Date;
}

export interface IBranchMembership {
  _id?: string;
  userId: string;
  branchId: string;
  role: Role;
  isActive: boolean;
  createdAt?: Date;
}

export interface LeadSourceType {
  WEBSITE_FORM: 'WEBSITE_FORM';
  META_LEAD_ADS: 'META_LEAD_ADS';
  WHATSAPP: 'WHATSAPP';
  CSV_IMPORT: 'CSV_IMPORT';
  SCRAPER: 'SCRAPER';
  MANUAL: 'MANUAL';
  API: 'API';
}

export interface IWebhookEvent {
  _id?: string;
  provider: string;
  eventType: string;
  externalEventId: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'processed' | 'failed';
  attempts: number;
  maxAttempts: number;
  receivedAt: Date;
  processedAt?: Date;
  error?: string;
  companyId?: string;
  branchId?: string;
  leadId?: string;
}
