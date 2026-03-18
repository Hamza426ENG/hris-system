import React, { useState, useEffect } from 'react';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { attendanceAPI } from '../services/api';

const fmtTime = (ts) => ts ? new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';

export default function AttendanceWidget() {
  const [attendance, setAttendance] = useState(null);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    attendanceAPI.today()
      .then(res => setAttendance(res.data.record))
      .catch(() => {});
  }, []);

  const handleCheckIn = async () => {
    setCheckingIn(true);
    try {
      const res = await attendanceAPI.checkIn();
      setAttendance(res.data.record);
    } catch (err) { alert(err.response?.data?.error || 'Check-in failed'); }
    finally { setCheckingIn(false); }
  };

  const handleCheckOut = async () => {
    setCheckingOut(true);
    try {
      const res = await attendanceAPI.checkOut();
      setAttendance(res.data.record);
    } catch (err) { alert(err.response?.data?.error || 'Check-out failed'); }
    finally { setCheckingOut(false); }
  };

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Clock size={16} className="text-oe-primary" />
        <h3 className="font-semibold text-oe-text text-sm">Today's Attendance</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-oe-success/5 border border-oe-success/20 rounded-lg p-3 text-center">
          <div className="text-xs text-oe-muted mb-1 flex items-center justify-center gap-1">
            <LogIn size={11} />Check In
          </div>
          <div className="text-sm font-bold text-oe-success">{fmtTime(attendance?.check_in)}</div>
        </div>
        <div className="bg-oe-danger/5 border border-oe-danger/20 rounded-lg p-3 text-center">
          <div className="text-xs text-oe-muted mb-1 flex items-center justify-center gap-1">
            <LogOut size={11} />Check Out
          </div>
          <div className="text-sm font-bold text-oe-danger">{fmtTime(attendance?.check_out)}</div>
        </div>
      </div>

      {attendance?.hours_worked && (
        <div className="text-center text-xs text-oe-muted">
          Hours worked: <span className="font-semibold text-oe-text">{attendance.hours_worked}h</span>
          {attendance.overtime_hours > 0 && (
            <span className="text-oe-warning ml-1">+{attendance.overtime_hours}h OT</span>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {!attendance?.check_in ? (
          <button onClick={handleCheckIn} disabled={checkingIn}
            className="flex-1 btn-primary text-xs justify-center py-2">
            <LogIn size={14} />{checkingIn ? 'Checking in...' : 'Check In'}
          </button>
        ) : !attendance?.check_out ? (
          <button onClick={handleCheckOut} disabled={checkingOut}
            className="flex-1 bg-oe-danger text-white rounded-lg px-3 py-2 text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-red-700 transition-colors">
            <LogOut size={14} />{checkingOut ? 'Checking out...' : 'Check Out'}
          </button>
        ) : (
          <div className="flex-1 text-center text-xs text-oe-success font-medium py-2">
            Attendance complete
          </div>
        )}
      </div>
    </div>
  );
}
