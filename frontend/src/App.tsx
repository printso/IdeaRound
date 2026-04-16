import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { AuthProvider } from './contexts/AuthContext';
import AuthGuard from './components/AuthGuard';
import ErrorBoundary from './components/ErrorBoundary';

const Home = lazy(() => import('./pages/Home'));
const Login = lazy(() => import('./pages/Login'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const ModelChat = lazy(() => import('./pages/admin/ModelChat'));

const PageFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <Spin size="large" tip="加载中..." />
  </div>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <ErrorBoundary>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />

              <Route
                path="/"
                element={
                  <AuthGuard requireAuth={true}>
                    <Home />
                  </AuthGuard>
                }
              />
              <Route
                path="/admin"
                element={
                  <AuthGuard requireAuth={true}>
                    <AdminDashboard />
                  </AuthGuard>
                }
              />
              <Route
                path="/admin/chat"
                element={
                  <AuthGuard requireAuth={true}>
                    <ModelChat />
                  </AuthGuard>
                }
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </Router>
    </AuthProvider>
  );
}

export default App;
