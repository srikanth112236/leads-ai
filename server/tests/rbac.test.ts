import request from 'supertest';
import { app } from '../src/app';
import { connectTestDB, clearTestDB, closeTestDB } from './setup';
import { User } from '../src/common/models/User';
import { Company } from '../src/common/models/Company';
import { RoleModel } from '../src/common/models/RoleModel';
import { hashPassword } from '../src/common/security/hash';
import { Role } from '../src/common/types';
import { RbacService } from '../src/common/services/RbacService';

describe('Advanced RBAC and Dynamic Permissions System', () => {
  let superAdminToken: string;
  let companyAdminTokenA: string;
  let companyAdminTokenB: string;
  let salesAgentToken: string;
  let companyA: any;
  let companyB: any;

  beforeAll(async () => {
    await connectTestDB();
    await clearTestDB();

    // Ensure system roles are seeded
    await RbacService.seedSystemRoles();

    companyA = await new Company({ name: 'RBAC Corp A', status: 'active' }).save();
    companyB = await new Company({ name: 'RBAC Corp B', status: 'active' }).save();

    const password = await hashPassword('Password123!');

    // Super Admin
    await new User({
      email: 'root@rbac.local',
      password,
      firstName: 'Root',
      lastName: 'Admin',
      role: Role.SUPER_ADMIN,
      isActive: true,
    }).save();

    // Company Admin A
    await new User({
      email: 'adminA@rbac.local',
      password,
      firstName: 'Admin',
      lastName: 'A',
      role: Role.COMPANY_ADMIN,
      companyId: companyA._id,
      isActive: true,
    }).save();

    // Company Admin B
    await new User({
      email: 'adminB@rbac.local',
      password,
      firstName: 'Admin',
      lastName: 'B',
      role: Role.COMPANY_ADMIN,
      companyId: companyB._id,
      isActive: true,
    }).save();

    // Sales Agent in Company A
    await new User({
      email: 'agentA@rbac.local',
      password,
      firstName: 'Agent',
      lastName: 'A',
      role: Role.SALES_AGENT,
      companyId: companyA._id,
      isActive: true,
    }).save();

    const loginRoot = await request(app).post('/api/auth/login').send({ email: 'root@rbac.local', password: 'Password123!' });
    superAdminToken = loginRoot.body.data.accessToken;

    const loginA = await request(app).post('/api/auth/login').send({ email: 'adminA@rbac.local', password: 'Password123!' });
    companyAdminTokenA = loginA.body.data.accessToken;

    const loginB = await request(app).post('/api/auth/login').send({ email: 'adminB@rbac.local', password: 'Password123!' });
    companyAdminTokenB = loginB.body.data.accessToken;

    const loginAgent = await request(app).post('/api/auth/login').send({ email: 'agentA@rbac.local', password: 'Password123!' });
    salesAgentToken = loginAgent.body.data.accessToken;
  }, 30000);

  afterAll(async () => {
    await closeTestDB();
  });

  test('GET /api/rbac/permissions lists catalog modules and granular permissions', async () => {
    const res = await request(app)
      .get('/api/rbac/permissions')
      .set('Authorization', `Bearer ${companyAdminTokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.modules).toContain('leads');
    expect(res.body.data.modules).toContain('roles');
    expect(res.body.data.permissions.some((p: any) => p.key === 'leads:export')).toBe(true);
    expect(res.body.data.permissions.some((p: any) => p.key === 'roles:create')).toBe(true);
  });

  test('GET /api/rbac/roles returns seeded system roles with accurate user counts', async () => {
    const res = await request(app)
      .get('/api/rbac/roles')
      .set('Authorization', `Bearer ${companyAdminTokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const roles = res.body.data;
    expect(roles.length).toBeGreaterThanOrEqual(5);

    const companyAdminRole = roles.find((r: any) => r.slug === 'company_admin');
    expect(companyAdminRole).toBeDefined();
    expect(companyAdminRole.isSystem).toBe(true);
  });

  test('Sales agent cannot create or delete custom roles (forbidden)', async () => {
    const createRes = await request(app)
      .post('/api/rbac/roles')
      .set('Authorization', `Bearer ${salesAgentToken}`)
      .send({
        name: 'Unauthorized Role',
        permissions: ['leads:delete'],
      });

    expect(createRes.status).toBe(403);
  });

  let createdCustomRoleId: string;

  test('Company Admin can create a custom company-scoped role', async () => {
    const res = await request(app)
      .post('/api/rbac/roles')
      .set('Authorization', `Bearer ${companyAdminTokenA}`)
      .send({
        name: 'Senior Telecaller',
        description: 'Telecaller with lead export and update abilities',
        permissions: ['leads:read', 'leads:update', 'leads:export'],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Senior Telecaller');
    expect(res.body.data.slug).toBe('senior_telecaller');
    expect(res.body.data.permissions).toEqual(
      expect.arrayContaining(['leads:read', 'leads:update', 'leads:export'])
    );
    expect(res.body.data.companyId).toBe(companyA._id.toString());
    createdCustomRoleId = res.body.data._id;
  });

  test('Custom role isolation: Company B cannot see Company A custom roles', async () => {
    const resB = await request(app)
      .get('/api/rbac/roles')
      .set('Authorization', `Bearer ${companyAdminTokenB}`);

    expect(resB.status).toBe(200);
    const hasCompanyARole = resB.body.data.some((r: any) => r._id === createdCustomRoleId);
    expect(hasCompanyARole).toBe(false);
  });

  test('Assign custom role to new user, and verify effective permissions on login', async () => {
    // Admin A creates a user with the custom role
    const userRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${companyAdminTokenA}`)
      .send({
        email: 'senior.caller@rbac.local',
        password: 'Password123!',
        firstName: 'Senior',
        lastName: 'Caller',
        role: 'senior_telecaller',
        roleId: createdCustomRoleId,
      });

    expect(userRes.status).toBe(201);
    expect(userRes.body.data.role).toBe('senior_telecaller');

    // Login with the new custom role user
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'senior.caller@rbac.local', password: 'Password123!' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user.permissions).toEqual(
      expect.arrayContaining(['leads:read', 'leads:update', 'leads:export'])
    );
    // Should NOT have leads:delete or roles:create
    expect(loginRes.body.data.user.permissions).not.toContain('leads:delete');
    expect(loginRes.body.data.user.permissions).not.toContain('roles:create');
  });

  test('Update custom role permissions', async () => {
    const res = await request(app)
      .put(`/api/rbac/roles/${createdCustomRoleId}`)
      .set('Authorization', `Bearer ${companyAdminTokenA}`)
      .send({
        permissions: ['leads:read', 'leads:update', 'leads:export', 'leads:assign'],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.permissions).toContain('leads:assign');
  });

  test('Deletion safeguards: System role cannot be deleted', async () => {
    const systemRole = await RoleModel.findOne({ slug: 'company_admin', isSystem: true });
    const res = await request(app)
      .delete(`/api/rbac/roles/${systemRole!._id}`)
      .set('Authorization', `Bearer ${companyAdminTokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('System roles cannot be deleted');
  });

  test('Deletion safeguards: Role assigned to active user cannot be deleted until reassigned', async () => {
    const res = await request(app)
      .delete(`/api/rbac/roles/${createdCustomRoleId}`)
      .set('Authorization', `Bearer ${companyAdminTokenA}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('active user(s) are assigned');

    // Deactivate user or reassign
    await User.deleteOne({ email: 'senior.caller@rbac.local' });

    // Now delete succeeds
    const deleteRes = await request(app)
      .delete(`/api/rbac/roles/${createdCustomRoleId}`)
      .set('Authorization', `Bearer ${companyAdminTokenA}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.message).toContain('Role deleted successfully');
  });

  test('Editing user with role sales_agent and branch assignments succeeds without membership validation error', async () => {
    const { Branch } = await import('../src/common/models/Branch');
    const branch = await new Branch({ name: 'Branch Test', branchCode: 'BR-TEST', location: 'City', companyId: companyA._id, status: 'active' }).save();

    const createRes = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${companyAdminTokenA}`)
      .send({
        email: 'agent.edit.test@rbac.local',
        password: 'Password123!',
        firstName: 'Edit',
        lastName: 'Agent',
        role: 'SALES_AGENT',
        branchIds: [branch._id.toString()],
      });

    expect(createRes.status).toBe(201);
    const userId = createRes.body.data._id;

    // Now edit the user with lowercase role slug 'sales_agent' and updated branch assignments
    const editRes = await request(app)
      .put(`/api/users/${userId}`)
      .set('Authorization', `Bearer ${companyAdminTokenA}`)
      .send({
        firstName: 'Edited Name',
        role: 'sales_agent',
        branchIds: [branch._id.toString()],
      });

    expect(editRes.status).toBe(200);
    expect(editRes.body.success).toBe(true);
    expect(editRes.body.data.firstName).toBe('Edited Name');
  });

  it('Branch Manager and Sales Agent can create leads without 403 forbidden error', async () => {
    const { Branch } = await import('../src/common/models/Branch');
    const branch = await new Branch({
      name: 'North Region',
      companyId: companyA._id,
      branchCode: 'BR-NR-001',
    }).save();

    const password = await hashPassword('Password123!');
    const bmUser = await new User({
      email: 'bm.leadtest@rbac.local',
      password,
      firstName: 'Branch',
      lastName: 'Manager',
      role: 'branch_manager',
      companyId: companyA._id,
      branchId: branch._id.toString(),
      isActive: true,
    }).save();

    // Login as Branch Manager
    const bmLogin = await request(app).post('/api/auth/login').send({
      email: 'bm.leadtest@rbac.local',
      password: 'Password123!',
    });
    expect(bmLogin.status).toBe(200);
    const bmToken = bmLogin.body.data.accessToken;

    // Create lead as Branch Manager
    const leadRes = await request(app)
      .post('/api/leads')
      .set('Authorization', `Bearer ${bmToken}`)
      .send({
        name: 'Enterprise Client Lead',
        email: 'lead@enterprise.com',
        phone: '9849849889',
        company: 'Enterprise Inc',
        branchId: branch._id.toString(),
        status: 'new',
        score: 65,
      });

    expect(leadRes.status).toBe(201);
    expect(leadRes.body.success).toBe(true);
    expect(leadRes.body.data.name).toBe('Enterprise Client Lead');
    expect(leadRes.body.data.phone).toBe('9849849889');
  });
});
