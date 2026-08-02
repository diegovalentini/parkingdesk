import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Routes,
  Route,
} from 'react-router-dom';

import './styles.css';

import {
  AuthProvider,
  RequireAuth,
  RequirePlatformAdmin,
} from './auth/AuthContext';

import { ToastProvider } from './components/Toast';

import LoginPage from './pages/LoginPage';
import ParkingPage from './pages/ParkingPage';
import HistoryPage from './pages/HistoryPage';
import AdminPage from './pages/AdminPage';
import DailyReportPage from './pages/DailyReportPage';
import MonthlyReportPage from './pages/MonthlyReportPage';
import PlatformPage from './pages/PlatformPage';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            <Route
              path="/login"
              element={<LoginPage />}
            />

            <Route
              path="/"
              element={
                <RequireAuth>
                  <ParkingPage />
                </RequireAuth>
              }
            />

            <Route
              path="/history"
              element={
                <RequireAuth>
                  <HistoryPage />
                </RequireAuth>
              }
            />

            <Route
              path="/admin"
              element={
                <RequireAuth adminOnly>
                  <AdminPage />
                </RequireAuth>
              }
            />

            <Route
              path="/daily-report"
              element={
                <RequireAuth adminOnly>
                  <DailyReportPage />
                </RequireAuth>
              }
            />

            <Route
              path="/monthly-report"
              element={
                <RequireAuth adminOnly>
                  <MonthlyReportPage />
                </RequireAuth>
              }
            />

            <Route
              path="/platform"
              element={
                <RequirePlatformAdmin>
                  <PlatformPage />
                </RequirePlatformAdmin>
              }
            />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
);