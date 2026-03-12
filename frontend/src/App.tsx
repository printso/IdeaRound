import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import ModelManagement from './pages/admin/ModelManagement';
import Home from './pages/Home';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="models" replace />} />
          <Route path="models" element={<ModelManagement />} />
          {/* Add other admin routes here */}
        </Route>
        <Route path="/" element={<Home />} />
      </Routes>
    </Router>
  );
}

export default App;
