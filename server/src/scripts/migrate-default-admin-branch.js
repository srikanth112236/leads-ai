const mongoose = require('mongoose');

async function run() {
  const uri = process.env.DATABASE_URL || 'mongodb://localhost:27017/leads-crm';
  await mongoose.connect(uri);
  console.log('Connected to DB');

  const companies = await mongoose.connection.db.collection('companies').find({}).toArray();
  for (const c of companies) {
    console.log('Processing company:', c.name, c._id);
    let defBranch = await mongoose.connection.db.collection('branches').findOne({ companyId: c._id, isDefault: true });
    if (!defBranch) {
      defBranch = await mongoose.connection.db.collection('branches').find({ companyId: c._id }).sort({ createdAt: 1 }).limit(1).next();
      if (defBranch) {
        await mongoose.connection.db.collection('branches').updateOne({ _id: defBranch._id }, { $set: { isDefault: true } });
        console.log('  Marked branch as default:', defBranch.name, defBranch._id);
      }
    }
    if (defBranch) {
      // Clear isDefault on other branches
      await mongoose.connection.db.collection('branches').updateMany(
        { companyId: c._id, _id: { $ne: defBranch._id }, isDefault: true },
        { $set: { isDefault: false } }
      );
      // Update company defaultBranchId
      await mongoose.connection.db.collection('companies').updateOne(
        { _id: c._id },
        { $set: { defaultBranchId: defBranch._id } }
      );
      console.log('  Set company defaultBranchId to:', defBranch.name, defBranch._id);

      // Find all COMPANY_ADMIN users in this company
      const admins = await mongoose.connection.db.collection('users').find({
        companyId: c._id,
        role: { $in: ['COMPANY_ADMIN', 'company_admin'] }
      }).toArray();

      for (const a of admins) {
        // Set branchId on user
        await mongoose.connection.db.collection('users').updateOne(
          { _id: a._id },
          { $set: { branchId: defBranch._id } }
        );
        console.log('  Assigned default branch to admin:', a.email, '-> branch:', defBranch.name);

        // Update CompanyMembership
        await mongoose.connection.db.collection('companymemberships').updateOne(
          { userId: a._id, companyId: c._id },
          { $addToSet: { branchIds: defBranch._id } }
        );

        // Upsert BranchMembership
        await mongoose.connection.db.collection('branchmemberships').updateOne(
          { userId: a._id, branchId: defBranch._id },
          {
            $set: { role: 'COMPANY_ADMIN', accessLevel: 'full_manage', isActive: true, updatedAt: new Date() },
            $setOnInsert: { createdAt: new Date() }
          },
          { upsert: true }
        );
        console.log('  Created/updated BranchMembership for admin:', a.email);
      }
    }
  }

  console.log('Migration completed successfully!');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
