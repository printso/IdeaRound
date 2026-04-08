import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import AdminPageLayout from '../../components/admin/AdminPageLayout';
import type { AdminMenuKey } from '../../components/admin/AdminPageLayout';

import ModelManagement from './ModelManagement';
import PromptManagement from './PromptManagement';
import StyleConfigManagement from './StyleConfigManagement';
import RoleTemplateManagement from './RoleTemplateManagement';
import RoundtableConfigManagement from './RoundtableConfigManagement';
import UserManagement from './UserManagement';
import ScenarioTemplateManagement from './ScenarioTemplateManagement';
import RuntimeMonitor from './RuntimeMonitor';
import SearchEngineManagement from './SearchEngineManagement';

const AdminDashboard: React.FC = () => {
  const location = useLocation();
  const initialMenu = (location.state as any)?.selectedMenu || 'models';
  const [selectedMenu, setSelectedMenu] = useState<AdminMenuKey>(initialMenu);

  const renderContent = () => {
    switch (selectedMenu) {
      case 'models':
        return <ModelManagement />;
      case 'search_engines':
        return <SearchEngineManagement />;
      case 'scenario':
        return <ScenarioTemplateManagement />;
      case 'prompts':
        return <PromptManagement />;
      case 'styles':
        return <StyleConfigManagement />;
      case 'roles':
        return <RoleTemplateManagement />;
      case 'roundtable':
        return <RoundtableConfigManagement />;
      case 'users':
        return <UserManagement />;
      case 'runtime':
        return <RuntimeMonitor />;
      default:
        return <ModelManagement />;
    }
  };

  return (
    <AdminPageLayout
      selectedMenu={selectedMenu}
      onMenuClick={(key) => setSelectedMenu(key)}
    >
      {renderContent()}
    </AdminPageLayout>
  );
};

export default AdminDashboard;
