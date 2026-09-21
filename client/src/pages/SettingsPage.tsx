import React from 'react';
import Card from '../components/common/Card';
import { useAuth } from '../context/AuthContext';

const SettingsPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div>
      <Card title="Profile">
        <div className="space-y-3">
          <p><strong>Email:</strong> {user?.email}</p>
          <p><strong>Role:</strong> {user?.role}</p>
          <p><strong>Company:</strong> {user?.companyId || 'N/A'}</p>
        </div>
      </Card>
    </div>
  );
};

export default SettingsPage;
