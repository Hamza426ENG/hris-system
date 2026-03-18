import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import HRChatbot from './HRChatbot';
import AnnouncementPopup from './AnnouncementPopup';
import PendingApprovalsPopup from './PendingApprovalsPopup';
import { announcementsAPI, leavesAPI, wfhAPI, resignationsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState([]);
  const [showApprovals, setShowApprovals] = useState(false);

  useEffect(() => {
    announcementsAPI.unread()
      .then(res => setUnreadAnnouncements(res.data || []))
      .catch(() => {});
  }, []);

  // Auto-show pending approvals popup on every load for approvers
  useEffect(() => {
    const isApprover = ['super_admin', 'hr_admin', 'team_lead'].includes(user?.role);
    if (!isApprover || !user?.employeeId) return;

    const isHR = ['super_admin', 'hr_admin'].includes(user.role);
    const empId = user.employeeId;

    Promise.all([
      leavesAPI.list({ status: 'pending' }),
      wfhAPI.list(),
      resignationsAPI.list(),
    ]).then(([lRes, wRes, rRes]) => {
      const lCount = (lRes.data || []).filter(l => l.status === 'pending').length;
      const wCount = (wRes.data || []).filter(w => w.status === 'pending' && w.supervisor_id === empId).length;
      const rList = rRes.data || [];
      const rCount = isHR
        ? rList.filter(r => r.status === 'supervisor_approved').length
        : rList.filter(r => r.status === 'pending' && r.supervisor_id === empId).length;
      if (lCount + wCount + rCount > 0) setShowApprovals(true);
    }).catch(() => {});
  }, [user?.role, user?.employeeId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col overflow-hidden transition-all duration-300 min-w-0">
        <Header sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
        <main className="flex-1 overflow-auto p-3 sm:p-6">
          <Outlet />
        </main>
      </div>
      <HRChatbot />
      {unreadAnnouncements.length > 0 && (
        <AnnouncementPopup
          announcements={unreadAnnouncements}
          onAllAcknowledged={() => setUnreadAnnouncements([])}
        />
      )}
      {showApprovals && (
        <PendingApprovalsPopup onClose={() => setShowApprovals(false)} />
      )}
    </div>
  );
}
