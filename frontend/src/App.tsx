import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import AuthGuard from './components/AuthGuard';
import AdminDashboard from './pages/admin/AdminDashboard';
import ModelChat from './pages/admin/ModelChat';
import Home from './pages/Home';
import Login from './pages/Login';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* 公开路由 */}
          <Route path="/login" element={<Login />} />
          
          {/* 需要认证的路由 */}
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
          
          {/* 未匹配路由重定向 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
