import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Card from '../components/common/Card';

const IntegrationsConnectedPage: React.FC = () => {
  const [params] = useSearchParams();
  const ok = params.get('ok') === '1';
  const error = params.get('error');

  return (
    <div className="max-w-lg mx-auto">
      <Card title={ok ? 'Meta connected' : 'Connection failed'}>
        {ok ? (
          <div className="space-y-3 text-sm">
            <p>Your Facebook Pages were imported ({params.get('pages') || 0} found).</p>
            <p className="text-slate-500">Assign each Page to a branch on the Integrations page to start receiving leads.</p>
            <Link to="/integrations" className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white font-medium">
              Go to Integrations
            </Link>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <p className="text-red-600">Could not complete the connection ({error || 'unknown error'}). Please try again.</p>
            <Link to="/integrations" className="inline-block px-4 py-2 rounded-lg bg-blue-600 text-white font-medium">
              Back to Integrations
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
};

export default IntegrationsConnectedPage;
