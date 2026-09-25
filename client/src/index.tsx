import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { CompanyScopeProvider } from './context/CompanyScopeContext';
import './index.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <CompanyScopeProvider>
            <App />
          </CompanyScopeProvider>
        </AuthProvider>
        <Toaster containerStyle={{ zIndex: 99999 }} />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
