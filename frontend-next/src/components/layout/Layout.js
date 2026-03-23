import React, { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import StartupNotificationModal from '@/components/common/StartupNotificationModal';

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen bg-oe-bg overflow-hidden">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col overflow-hidden transition-all duration-300 min-w-0">
        <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <main className="flex-1 overflow-auto p-3 sm:p-6">
          {children}
        </main>
      </div>
      <StartupNotificationModal />
    </div>
  );
}
