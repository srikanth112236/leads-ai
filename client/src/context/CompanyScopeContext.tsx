import React, { createContext, useContext, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface CompanyScopeContextType {
  /** Super-admin company filter; null = all companies. */
  scopedCompanyId: string | null;
  setScopedCompanyId: (id: string | null) => void;
}

const CompanyScopeContext = createContext<CompanyScopeContextType>({
  scopedCompanyId: null,
  setScopedCompanyId: () => {},
});

export const useCompanyScope = () => useContext(CompanyScopeContext);

export const CompanyScopeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const queryClient = useQueryClient();
  const [scopedCompanyId, setScopedCompanyIdState] = useState<string | null>(
    sessionStorage.getItem('scopedCompanyId'),
  );

  const setScopedCompanyId = (id: string | null) => {
    if (id) sessionStorage.setItem('scopedCompanyId', id);
    else sessionStorage.removeItem('scopedCompanyId');
    setScopedCompanyIdState(id);
    // Scope is not part of query keys – refetch everything instead.
    queryClient.invalidateQueries();
  };

  return (
    <CompanyScopeContext.Provider value={{ scopedCompanyId, setScopedCompanyId }}>
      {children}
    </CompanyScopeContext.Provider>
  );
};
