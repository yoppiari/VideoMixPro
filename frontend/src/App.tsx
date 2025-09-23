import React, { useEffect, useState } from 'react';
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
import ErrorBoundary from './components/common/ErrorBoundary';
import './App.css';

function App() {
  const [extensionNotification, setExtensionNotification] = useState<string | null>(null);

  useEffect(() => {
    // Remove initial loader when React app loads
    const removeInitialLoader = () => {
      const loader = document.getElementById('initial-loader');
      if (loader) {
        loader.style.opacity = '0';
        loader.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
          loader.remove();
        }, 300);
      }
    };

    // Check for extension detection and show appropriate messages
    const checkExtensionBlocking = () => {
      try {
        // Verify our extension blocking worked
        if (typeof window !== 'undefined') {
          const hasMetaMask = !!(window as any).ethereum;
          const errorCount = (window as any).__extensionErrorCount || 0;

          if (!hasMetaMask && errorCount === 0) {
            console.log('[VideoMix Pro] Extension injection successfully blocked');
          } else if (errorCount > 0) {
            console.warn(`[VideoMix Pro] ${errorCount} extension conflicts were handled`);
            setExtensionNotification(`Browser extensions detected and handled safely (${errorCount} conflicts resolved)`);
            // Auto-hide notification after 10 seconds
            setTimeout(() => setExtensionNotification(null), 10000);
          }
        }
      } catch (error) {
        console.debug('[VideoMix Pro] Extension check completed');
      }
    };

    // Initialize app
    const initializeApp = () => {
      checkExtensionBlocking();
      removeInitialLoader();
    };

    // Small delay to ensure DOM is ready
    setTimeout(initializeApp, 100);
  }, []);

  return (
    <ErrorBoundary name="App">
      <AuthProvider>
        <Router>
          <div className="App">
            {/* Extension notification */}
            {extensionNotification && (
              <div className="fixed top-4 right-4 z-50 max-w-sm bg-blue-50 border border-blue-200 rounded-lg p-3 shadow-lg">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-blue-800">{extensionNotification}</p>
                  </div>
                  <div className="ml-auto pl-3">
                    <button
                      onClick={() => setExtensionNotification(null)}
                      className="text-blue-400 hover:text-blue-600"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}
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
    </ErrorBoundary>
  );
}

export default App;
