import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Login from './components/auth/Login';
import Register from './components/auth/Register';
import Dashboard from './components/dashboard/Dashboard';
import VideoUpload from './components/videos/VideoUpload';
import ProjectCreate from './components/projects/ProjectCreate';
import ProjectList from './components/projects/ProjectList';
import ProjectDetail from './components/projects/ProjectDetail';
import ProcessingDashboard from './components/processing/ProcessingDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import CommunicationDashboard from './components/admin/CommunicationDashboard';
import LicenseVerification from './components/license/LicenseVerification';
import { CreditUsageDisplay } from './components/credits/CreditUsageDisplay';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            {/* Placeholder routes for future implementation */}
            <Route
              path="/projects"
              element={
                <ProtectedRoute>
                  <ProjectList />
                </ProtectedRoute>
              }
            />

            <Route
              path="/projects/new"
              element={
                <ProtectedRoute>
                  <ProjectCreate />
                </ProtectedRoute>
              }
            />

            <Route
              path="/projects/:id"
              element={
                <ProtectedRoute>
                  <ProjectDetail />
                </ProtectedRoute>
              }
            />

            <Route
              path="/videos"
              element={
                <ProtectedRoute>
                  <VideoUpload />
                </ProtectedRoute>
              }
            />

            <Route
              path="/videos/upload"
              element={
                <ProtectedRoute>
                  <VideoUpload />
                </ProtectedRoute>
              }
            />

            <Route
              path="/processing"
              element={
                <ProtectedRoute>
                  <ProcessingDashboard />
                </ProtectedRoute>
              }
            />

            {/* Admin routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRole="ADMIN">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin/communication"
              element={
                <ProtectedRoute requiredRole="ADMIN">
                  <CommunicationDashboard />
                </ProtectedRoute>
              }
            />

            {/* License and Credits routes */}
            <Route
              path="/license"
              element={
                <ProtectedRoute>
                  <LicenseVerification />
                </ProtectedRoute>
              }
            />

            <Route
              path="/credits"
              element={
                <ProtectedRoute>
                  <CreditUsageDisplay />
                </ProtectedRoute>
              }
            />

            {/* Catch all route */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>
        <ToastContainer
          position="top-right"
          autoClose={5000}
          hideProgressBar={false}
          newestOnTop={false}
          closeOnClick
          rtl={false}
          pauseOnFocusLoss
          draggable
          pauseOnHover
        />
      </Router>
    </AuthProvider>
  );
}

export default App;
