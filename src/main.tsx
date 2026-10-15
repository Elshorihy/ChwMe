import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AdminDashboard from './AdminDashboard';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root was not found');

const isAdminRoute = window.location.pathname.replace(/\/+$/, '') === '/admin';
createRoot(root).render(
  <React.StrictMode>
    {isAdminRoute ? <AdminDashboard /> : <App />}
  </React.StrictMode>
);
