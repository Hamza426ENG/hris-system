import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { employeesAPI, leavesAPI, salaryAPI, profileRequestsAPI, documentsAPI, resignationsAPI } from '@/services/api';
import useGoBack from '@/hooks/useGoBack';
import {
  ArrowLeft, Mail, Phone, MapPin, Calendar, Briefcase, User, DollarSign,
  Clock, Plus, Camera, Edit, Send, CheckCircle2, XCircle, ClipboardList,
  Heart, Shield, Globe, Hash, Users, Building, MapPinned, Star, Activity, TrendingUp, Badge,
  FileText, Upload, Download, Eye, Trash2, AlertTriangle, CreditCard, Landmark
} from 'lucide-react';
import Modal from '@/components/common/Modal';
import Avatar from '@/components/common/Avatar';
import { useAuth } from '@/context/AuthContext';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '-';
const fmtDateShort = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtCurrency = (n) => n ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '-';
const fmtType = (t) => t ? t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '—';

function SField({ name, label, salaryForm, setSalaryForm }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type="number" step="0.01" className="input" value={salaryForm[name] || ''} onChange={e => setSalaryForm({ ...salaryForm, [name]: e.target.value })} placeholder="0.00" />
    </div>
  );
}

function DetailRow({ icon: Icon, label, value, iconColor = 'text-oe-primary' }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${empty ? '' : 'bg-oe-surface'}`}>
        <Icon size={13} className={empty ? 'text-oe-muted/25' : iconColor} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-oe-muted uppercase tracking-wide font-medium leading-tight">{label}</div>
        <div className={`text-sm leading-snug break-words ${empty ? 'text-oe-muted/40 font-normal' : 'font-medium text-oe-text'}`}>
          {empty ? '—' : value}
        </div>
      </div>
    </div>
  );
}

const TABS = ['Leave History', 'Salary & Comp', 'Payroll History', 'Documents'];

const DOC_TYPES = [
  { value: 'id_card', label: 'ID Card' },
  { value: 'driving_license', label: 'Driving License' },
  { value: 'resume', label: 'Resume / CV' },
  { value: 'degree', label: 'Degree / Certificate' },
  { value: 'offer_letter', label: 'Offer Letter' },
  { value: 'contract', label: 'Contract' },
  { value: 'medical', label: 'Medical Report' },
  { value: 'passport_copy', label: 'Passport Copy' },
  { value: 'nda', label: 'NDA' },
  { value: 'other', label: 'Other' },
];

const DOC_STATUS_COLORS = {
  pending:  'bg-yellow-100 text-yellow-700',
  verified: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired:  'bg-gray-100 text-gray-500',
};

function EmployeeProfileContent() {
  const router = useRouter();
  const { id } = router.query;
  const goBack = useGoBack('/employees');
  const { user, permissions } = useAuth();
  const canEditPhoto = permissions?.canManageAll;

  const [emp, setEmp] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [salary, setSalary] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [balances, setBalances] = useState([]);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [salaryModal, setSalaryModal] = useState(false);
  const [salaryForm, setSalaryForm] = useState({ basic_salary: '', housing_allowance: '', transport_allowance: '', meal_allowance: '', medical_allowance: '', mobile_allowance: '', other_allowances: '', tax_deduction: '', pension_deduction: '', health_insurance: '', other_deductions: '', effective_date: new Date().toISOString().split('T')[0], notes: '' });
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef(null);

  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [myRequests, setMyRequests] = useState([]);

  // Documents
  const [documents, setDocuments] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadForm, setUploadForm] = useState({ document_type: 'id_card', document_name: '', expiry_date: '', comments: '' });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const docFileRef = useRef(null);

  // Resignation
  const [resignation, setResignation] = useState(null);

  const isHR = permissions?.canManageAll;
  const isSelf = user?.employeeId === id;

  const openEditProfile = () => {
    if (!emp) return;
    setEditForm({
      phone_primary: emp.phone_primary || '',
      phone_secondary: emp.phone_secondary || '',
      personal_email: emp.personal_email || '',
      address_line1: emp.address_line1 || '',
      city: emp.city || '',
      state: emp.state || '',
      country: emp.country || '',
      postal_code: emp.postal_code || '',
      emergency_contact_name: emp.emergency_contact_name || '',
      emergency_contact_relation: emp.emergency_contact_relation || '',
      emergency_contact_phone: emp.emergency_contact_phone || '',
      bio: emp.bio || '',
      insurance_card_number: emp.insurance_card_number || '',
      // Banking — only super_admin can edit these
      bank_name: emp.bank_name || '',
      bank_account_number: emp.bank_account_number || '',
      account_holder_name: emp.account_holder_name || '',
      iban: emp.iban || '',
    });
    setEditModal(true);
  };

  const handleEditSave = async () => {
    const changes = {};
    for (const key of Object.keys(editForm)) {
      if (editForm[key] !== (emp[key] || '')) changes[key] = editForm[key];
    }
    if (Object.keys(changes).length === 0) { setEditModal(false); return; }

    setEditSaving(true);
    try {
      if (isHR) {
        await employeesAPI.update(id, { ...emp, ...changes });
        setEmp(prev => ({ ...prev, ...changes }));
        setEditModal(false);
      } else {
        await profileRequestsAPI.create({ employee_id: id, changes });
        setEditModal(false);
        alert('Your profile update request has been submitted for HR approval.');
        loadMyRequests();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save changes');
    } finally {
      setEditSaving(false);
    }
  };

  const loadMyRequests = () => {
    if (isSelf) {
      profileRequestsAPI.list({ employee_id: id }).then(r => setMyRequests(r.data || [])).catch(() => {});
    }
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file'); return; }
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB'); return; }
    setAvatarUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        await employeesAPI.updateAvatar(id, ev.target.result);
        setEmp(prev => ({ ...prev, avatar_url: ev.target.result }));
      } catch (err) {
        alert(err.response?.data?.error || 'Failed to update photo');
      } finally { setAvatarUploading(false); }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!router.isReady || !user) return;
    // Employees can only view their own profile
    const isEmployeeRole = user.role === 'employee' || user.role === 'team_lead';
    const isSelfNav = user.employeeId === id;
    if (isEmployeeRole && !isSelfNav && !['super_admin', 'hr_admin', 'manager'].includes(user.role)) {
      // Redirect employee trying to view someone else's profile
      if (user.employeeId) router.replace(`/employees/${user.employeeId}`);
      else router.replace('/');
      return;
    }
    setLoading(true);
    employeesAPI.get(id).then(r => setEmp(r.data)).catch(() => {
      // If access denied, redirect to own profile
      if (user.employeeId) router.replace(`/employees/${user.employeeId}`);
      else router.replace('/');
    }).finally(() => setLoading(false));
  }, [id, router.isReady, user]);

  const loadDocuments = () => {
    if (!id) return;
    setDocsLoading(true);
    documentsAPI.list(id).then(r => setDocuments(r.data?.data || [])).catch(console.error).finally(() => setDocsLoading(false));
  };

  useEffect(() => {
    if (!emp) return;
    employeesAPI.getLeaves(id).then(r => setLeaves(r.data)).catch(console.error);
    employeesAPI.getSalary(id).then(r => setSalary(r.data)).catch(console.error);
    employeesAPI.getPayroll(id).then(r => setPayroll(r.data)).catch(console.error);
    leavesAPI.balances(id).then(r => setBalances(r.data)).catch(console.error);
    loadMyRequests();
    loadDocuments();
    // Load resignation for self-view or HR
    if (isSelf || isHR) {
      employeesAPI.getResignation(id).then(r => setResignation(r.data?.data || null)).catch(() => {});
    }
  }, [emp, id]);

  const handleDocUpload = async () => {
    if (!uploadFile) { alert('Please select a file'); return; }
    if (!uploadForm.document_type) { alert('Please select a document type'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('document_type', uploadForm.document_type);
      fd.append('document_name', uploadForm.document_name || uploadFile.name);
      if (uploadForm.expiry_date) fd.append('expiry_date', uploadForm.expiry_date);
      if (uploadForm.comments) fd.append('comments', uploadForm.comments);
      await documentsAPI.upload(id, fd);
      setUploadModal(false);
      setUploadFile(null);
      setUploadForm({ document_type: 'id_card', document_name: '', expiry_date: '', comments: '' });
      loadDocuments();
    } catch (err) {
      alert(err.response?.data?.error || 'Upload failed');
    } finally { setUploading(false); }
  };

  const handleDocDelete = async (docId) => {
    if (!confirm('Delete this document?')) return;
    try {
      await documentsAPI.delete(docId);
      loadDocuments();
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  const handleDocStatusChange = async (docId, status) => {
    try {
      await documentsAPI.updateStatus(docId, { status });
      loadDocuments();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update status');
    }
  };

  const handleDocDownload = async (doc) => {
    try {
      const res = await documentsAPI.download(doc.id);
      const url = URL.createObjectURL(new Blob([res.data], { type: doc.mime_type }));
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.document_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Download failed'); }
  };

  const handleSalary = async () => {
    if (!salaryForm.basic_salary) { alert('Basic salary required'); return; }
    setSaving(true);
    try {
      await salaryAPI.create({ employee_id: id, ...salaryForm });
      employeesAPI.getSalary(id).then(r => setSalary(r.data));
      setSalaryModal(false);
    } catch (err) { alert(err.response?.data?.error || 'Failed to save salary'); }
    finally { setSaving(false); }
  };

  if (!router.isReady || loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!emp) return null;

  const currentSalary = salary[0];
  const performance = emp.performance;
  const calcYears = (d) => { if (!d) return null; return ((new Date() - new Date(d)) / (1000 * 60 * 60 * 24 * 365.25)).toFixed(1); };
  const tenure = calcYears(emp.hire_date);
  const age = calcYears(emp.date_of_birth);
  const fullAddress = [emp.address_line1, emp.address_line2, emp.city, emp.state, emp.country, emp.postal_code].filter(Boolean).join(', ');

  const statusBadge = (s) => {
    const map = { pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected', cancelled: 'badge-inactive' };
    return <span className={map[s] || 'badge-inactive'}>{s}</span>;
  };

  return (
    <div className="space-y-5">
      {/* Back */}
      <button onClick={goBack} className="flex items-center gap-2 text-oe-muted hover:text-oe-text transition-colors text-sm">
        <ArrowLeft size={16} /> Back
      </button>

      {/* ══════════════════════════════════════════════════════════════
          SINGLE EMPLOYEE PROFILE CARD — all info in one place
         ══════════════════════════════════════════════════════════════ */}
      <div className="card p-0 overflow-hidden">

        {/* ── Top Banner: Avatar + Name + Quick Info + Actions ──────── */}
        <div className="p-5 sm:p-6 border-b border-oe-border/50">
          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-5">
            {/* Avatar */}
            <div
              className={`relative flex-shrink-0 ${canEditPhoto ? 'group cursor-pointer' : ''}`}
              onClick={() => canEditPhoto && avatarInputRef.current?.click()}
            >
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden ring-2 ring-oe-border">
                <Avatar src={emp.avatar_url} firstName={emp.first_name} lastName={emp.last_name} size={80} className="w-full h-full" />
              </div>
              {canEditPhoto && (
                <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {avatarUploading
                    ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <Camera size={18} className="text-white" />}
                </div>
              )}
              {canEditPhoto && <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />}
            </div>

            {/* Name + badges + quick info */}
            <div className="flex-1 min-w-0 w-full">
              <div className="flex flex-wrap items-center gap-3 mb-1">
                <h2 className="text-xl font-bold text-oe-text">{emp.first_name} {emp.last_name}</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${emp.status === 'active' ? 'badge-active' : 'badge-inactive'}`}>{emp.status}</span>
              </div>
              <div className="text-oe-muted text-sm mb-3">{emp.position_title}{emp.department_name ? ` · ${emp.department_name}` : ''}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-oe-muted">
                <span className="flex items-center gap-1.5"><Briefcase size={13} className="flex-shrink-0" /> {emp.employee_id}</span>
                {emp.work_email && <span className="flex items-center gap-1.5"><Mail size={13} className="flex-shrink-0" /> {emp.work_email}</span>}
                {emp.phone_primary && <span className="flex items-center gap-1.5"><Phone size={13} className="flex-shrink-0" /> {emp.phone_primary}</span>}
                {emp.city && <span className="flex items-center gap-1.5"><MapPin size={13} className="flex-shrink-0" /> {emp.city}{emp.country ? `, ${emp.country}` : ''}</span>}
                <span className="flex items-center gap-1.5"><Calendar size={13} className="flex-shrink-0" /> Joined {fmtDate(emp.hire_date)}</span>
              </div>
              {(isSelf || isHR) && (
                <button onClick={openEditProfile} className="btn-secondary mt-3 text-xs gap-1.5">
                  <Edit size={13} /> {isHR ? 'Edit Profile' : 'Request Profile Update'}
                </button>
              )}
            </div>

            {/* Salary badge */}
            {currentSalary && (
              <div className="text-left sm:text-right mt-2 sm:mt-0 flex-shrink-0">
                <div className="text-xs text-oe-muted mb-0.5">Current Salary</div>
                <div className="text-xl font-bold text-oe-text">{fmtCurrency(currentSalary.gross_salary)}</div>
                <div className="text-xs text-oe-muted">gross/month</div>
              </div>
            )}
          </div>
        </div>

        {/* ── Bio ──────────────────────────────────────────────────── */}
        {emp.bio && (
          <div className="px-5 sm:px-6 pt-5">
            <div className="p-3 rounded-lg bg-oe-surface/50 border border-oe-border/30">
              <p className="text-sm text-oe-text leading-relaxed">{emp.bio}</p>
            </div>
          </div>
        )}

        {/* ── Detail Grid: Personal / Employment / Contact ─────────── */}
        <div className="p-5 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">

            {/* Personal Details */}
            <div>
              <h4 className="text-xs font-bold text-oe-muted uppercase tracking-wider mb-3 pb-2 border-b border-oe-border/40">Personal Details</h4>
              <div className="space-y-0.5">
                <DetailRow icon={Calendar} label="Date of Birth" value={emp.date_of_birth ? `${fmtDateShort(emp.date_of_birth)}${age ? ` (${age} yrs)` : ''}` : null} />
                <DetailRow icon={User} label="Gender" value={fmtType(emp.gender)} iconColor="text-oe-purple" />
                <DetailRow icon={Heart} label="Marital Status" value={fmtType(emp.marital_status)} iconColor="text-oe-danger" />
                <DetailRow icon={Globe} label="Nationality" value={emp.nationality} iconColor="text-oe-success" />
                <DetailRow icon={Hash} label="National ID" value={emp.national_id} iconColor="text-oe-warning" />
                <DetailRow icon={Star} label="Skills" value={emp.skills?.length > 0 ? (Array.isArray(emp.skills) ? emp.skills.join(', ') : emp.skills) : null} iconColor="text-oe-warning" />
                <DetailRow icon={Globe} label="Languages" value={emp.languages?.length > 0 ? (Array.isArray(emp.languages) ? emp.languages.join(', ') : emp.languages) : null} iconColor="text-oe-cyan" />
              </div>
            </div>

            {/* Employment Details */}
            <div>
              <h4 className="text-xs font-bold text-oe-muted uppercase tracking-wider mb-3 pb-2 border-b border-oe-border/40">Employment Details</h4>
              <div className="space-y-0.5">
                <DetailRow icon={Building} label="Department" value={emp.department_name} iconColor="text-oe-purple" />
                <DetailRow icon={Briefcase} label="Position" value={emp.position_title} iconColor="text-oe-success" />
                <DetailRow icon={TrendingUp} label="Grade / Level" value={emp.grade ? `${emp.grade}${emp.level ? ` · Level ${emp.level}` : ''}` : null} iconColor="text-oe-warning" />
                <DetailRow icon={Users} label="Manager" value={emp.manager_name} iconColor="text-oe-cyan" />
                <DetailRow icon={Activity} label="Employment Type" value={fmtType(emp.employment_type)} iconColor="text-oe-primary" />
                <DetailRow icon={Calendar} label="Hire Date" value={emp.hire_date ? `${fmtDateShort(emp.hire_date)}${tenure ? ` (${tenure} yrs)` : ''}` : null} iconColor="text-oe-success" />
                <DetailRow icon={Calendar} label="Confirmation Date" value={fmtDateShort(emp.confirmation_date)} iconColor="text-oe-warning" />
                <DetailRow icon={MapPinned} label="Work Location" value={emp.work_location} iconColor="text-oe-purple" />
                {emp.termination_date && <DetailRow icon={LogOut} label="Last Working Day" value={fmtDateShort(emp.termination_date)} iconColor="text-oe-danger" />}
                {emp.termination_reason && <DetailRow icon={FileText} label="Departure Reason" value={emp.termination_reason} iconColor="text-oe-danger" />}
              </div>
            </div>

            {/* Contact & Emergency */}
            <div>
              <h4 className="text-xs font-bold text-oe-muted uppercase tracking-wider mb-3 pb-2 border-b border-oe-border/40">Contact & Emergency</h4>
              <div className="space-y-0.5">
                <DetailRow icon={Mail} label="Personal Email" value={emp.personal_email} iconColor="text-oe-purple" />
                <DetailRow icon={Phone} label="Secondary Phone" value={emp.phone_secondary} iconColor="text-oe-warning" />
                <DetailRow icon={MapPin} label="Address" value={fullAddress || null} iconColor="text-oe-cyan" />
              </div>

              {/* Emergency Contact — always visible */}
              <div className="mt-4 p-3 rounded-lg bg-oe-danger/5 border border-oe-danger/15">
                <div className="text-[11px] text-oe-danger uppercase tracking-wide font-bold mb-1.5">Emergency Contact</div>
                {emp.emergency_contact_name ? (
                  <>
                    <div className="text-sm text-oe-text font-semibold">{emp.emergency_contact_name}</div>
                    {emp.emergency_contact_relation && <div className="text-xs text-oe-muted">{emp.emergency_contact_relation}</div>}
                    {emp.emergency_contact_phone && (
                      <div className="text-sm text-oe-text mt-1 flex items-center gap-1.5">
                        <Phone size={12} className="text-oe-danger flex-shrink-0" /> {emp.emergency_contact_phone}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-oe-muted/40">—</div>
                )}
              </div>

              {/* Benefits & Insurance — always visible */}
              <div className="mt-4">
                <div className="text-[11px] text-oe-muted uppercase tracking-wide font-bold mb-2">Benefits & Insurance</div>
                <div className="space-y-0.5">
                  <DetailRow icon={Heart} label="Life Insurance" value={emp.life_insurance_group} iconColor="text-oe-danger" />
                  <DetailRow icon={Shield} label="Health Insurance" value={emp.health_insurance_group} iconColor="text-oe-primary" />
                </div>
              </div>
            </div>

            {/* Banking & Finance — always visible to self and HR/admin */}
            {(isHR || isSelf) && (
              <div>
                <h4 className="text-xs font-bold text-oe-muted uppercase tracking-wider mb-3 pb-2 border-b border-oe-border/40">Banking & Finance</h4>
                <div className="space-y-0.5">
                  <DetailRow icon={Landmark} label="Bank Name" value={emp.bank_name} iconColor="text-oe-primary" />
                  <DetailRow icon={User} label="Account Holder" value={emp.account_holder_name} iconColor="text-oe-muted" />
                  {/* Backend masks account number / IBAN for non-super_admin */}
                  <DetailRow icon={CreditCard} label="Account Number" value={emp.bank_account_number} iconColor="text-oe-warning" />
                  <DetailRow icon={Hash} label="IBAN" value={emp.iban} iconColor="text-oe-cyan" />
                  <DetailRow icon={Shield} label="Insurance Card No." value={emp.insurance_card_number} iconColor="text-oe-success" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Resignation Status (self or HR) ─────────────────────── */}
        {(isHR || isSelf) && resignation && (
          <div className="px-5 sm:px-6 pb-4">
            {(() => {
              const statusColors = {
                pending:   'border-yellow-300 bg-yellow-50',
                approved:  'border-blue-300 bg-blue-50',
                completed: 'border-green-300 bg-green-50',
                rejected:  'border-gray-300 bg-gray-50',
                withdrawn: 'border-gray-200 bg-gray-50',
              };
              const statusText = {
                pending: 'Resignation Pending Approval',
                approved: 'Resignation Approved',
                completed: 'Offboarding Complete',
                rejected: 'Resignation Rejected',
                withdrawn: 'Resignation Withdrawn',
              };
              return (
                <div className={`rounded-xl border p-4 ${statusColors[resignation.status] || 'border-oe-border bg-oe-surface'}`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <LogOut size={14} className="text-oe-danger flex-shrink-0" />
                      <span className="text-sm font-semibold text-oe-text">{statusText[resignation.status] || resignation.status}</span>
                    </div>
                    {isHR && (
                      <a href="/resignations" className="text-xs text-oe-primary hover:underline">View Details →</a>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-oe-muted">
                    <span>Resigned: <strong className="text-oe-text">{fmtDateShort(resignation.resignation_date)}</strong></span>
                    <span>Last Day: <strong className="text-oe-danger">{fmtDateShort(resignation.last_working_day)}</strong></span>
                    {resignation.reason && <span>Reason: <strong className="text-oe-text">{resignation.reason}</strong></span>}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Leave Balances (inline inside the card) ──────────────── */}
        {balances.length > 0 && (
          <div className="px-5 sm:px-6 pb-5 sm:pb-6">
            <h4 className="text-xs font-bold text-oe-muted uppercase tracking-wider mb-3 pb-2 border-b border-oe-border/40">Leave Balances</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {balances.map(b => (
                <div key={b.id} className="p-2.5 rounded-lg bg-oe-surface/50 border border-oe-border/30 text-center">
                  <div className="text-lg font-bold text-oe-text">{parseFloat(b.available_days) || 0}</div>
                  <div className="text-[11px] font-medium text-oe-text leading-tight">{b.leave_type_name}</div>
                  <div className="text-[10px] text-oe-muted">{b.used_days} used / {b.allocated_days} total</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Performance (inline inside the card) ─────────────────── */}
        {performance && (
          <div className="px-5 sm:px-6 pb-5 sm:pb-6">
            <div className="border-t border-oe-border/40 pt-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-xs font-bold text-oe-muted uppercase tracking-wider">Performance Metrics</h4>
                  {(performance.period_start || performance.period_end) && (
                    <p className="text-[11px] text-oe-muted mt-0.5">{fmtDateShort(performance.period_start)} – {fmtDateShort(performance.period_end)}</p>
                  )}
                </div>
                {performance.total_pct != null && (
                  <div className="text-right">
                    <div className="text-2xl font-bold text-oe-primary">{performance.total_pct}%</div>
                    <div className="text-[11px] text-oe-muted">Overall Score</div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {performance.productivity != null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-oe-muted">Productivity</span>
                      <span className="text-xs font-bold text-oe-text">{performance.productivity} <span className="text-oe-muted font-normal">({performance.productivity_pct || 0}%)</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-oe-border/40 overflow-hidden">
                      <div className="h-full rounded-full bg-oe-primary transition-all duration-500" style={{ width: `${Math.min(performance.productivity_pct || 0, 100)}%` }} />
                    </div>
                  </div>
                )}
                {performance.knowledge != null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-oe-muted">Knowledge</span>
                      <span className="text-xs font-bold text-oe-text">{performance.knowledge} <span className="text-oe-muted font-normal">({performance.knowledge_pct || 0}%)</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-oe-border/40 overflow-hidden">
                      <div className="h-full rounded-full bg-oe-success transition-all duration-500" style={{ width: `${Math.min(performance.knowledge_pct || 0, 100)}%` }} />
                    </div>
                  </div>
                )}
                {performance.attitude != null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-oe-muted">Attitude</span>
                      <span className="text-xs font-bold text-oe-text">{performance.attitude} <span className="text-oe-muted font-normal">({performance.attitude_pct || 0}%)</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-oe-border/40 overflow-hidden">
                      <div className="h-full rounded-full bg-oe-warning transition-all duration-500" style={{ width: `${Math.min(performance.attitude_pct || 0, 100)}%` }} />
                    </div>
                  </div>
                )}
                {performance.discipline != null && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-oe-muted">Discipline</span>
                      <span className="text-xs font-bold text-oe-text">{performance.discipline} <span className="text-oe-muted font-normal">({performance.discipline_pct || 0}%)</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-oe-border/40 overflow-hidden">
                      <div className="h-full rounded-full bg-oe-purple transition-all duration-500" style={{ width: `${Math.min(performance.discipline_pct || 0, 100)}%` }} />
                    </div>
                  </div>
                )}
              </div>
              {(performance.actual_time || performance.active_time || performance.total_hours) && (
                <div className="grid grid-cols-3 gap-3 mt-4">
                  {performance.actual_time != null && (
                    <div className="text-center p-2.5 rounded-lg bg-oe-surface/50 border border-oe-border/30">
                      <div className="text-lg font-bold text-oe-text">{performance.actual_time}</div>
                      <div className="text-[11px] text-oe-muted">Actual Hours</div>
                    </div>
                  )}
                  {performance.active_time != null && (
                    <div className="text-center p-2.5 rounded-lg bg-oe-surface/50 border border-oe-border/30">
                      <div className="text-lg font-bold text-oe-text">{performance.active_time}</div>
                      <div className="text-[11px] text-oe-muted">Active Hours</div>
                    </div>
                  )}
                  {performance.total_hours != null && (
                    <div className="text-center p-2.5 rounded-lg bg-oe-surface/50 border border-oe-border/30">
                      <div className="text-lg font-bold text-oe-text">{performance.total_hours}</div>
                      <div className="text-[11px] text-oe-muted">Total Hours</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {/* ═══════ END SINGLE CARD ═══════ */}

      {/* Tabs — only Leave / Salary / Payroll (no Overview since it's all above) */}
      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <div className="flex gap-1 bg-oe-surface rounded-xl p-1 w-max sm:w-fit">
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(i)}
              className={`px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${tab === i ? 'bg-oe-card text-oe-text shadow' : 'text-oe-muted hover:text-oe-text'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab: Leave History */}
      {tab === 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-oe-border flex items-center justify-between">
            <span className="font-semibold text-oe-text text-sm">Leave History</span>
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-oe-surface/50">
                <tr>
                  {['Type', 'Start', 'End', 'Days', 'Reason', 'Status', 'Reviewed By'].map(h => <th key={h} className="table-header">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {leaves.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-oe-muted text-sm">No leave history</td></tr>
                ) : leaves.map(l => (
                  <tr key={l.id} className="table-row">
                    <td className="table-cell"><div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: l.color }} />{l.leave_type_name}</div></td>
                    <td className="table-cell text-xs">{fmtDate(l.start_date)}</td>
                    <td className="table-cell text-xs">{fmtDate(l.end_date)}</td>
                    <td className="table-cell">{l.total_days}</td>
                    <td className="table-cell text-oe-muted text-xs max-w-48"><span className="line-clamp-2 break-words">{l.reason || '—'}</span></td>
                    <td className="table-cell">{statusBadge(l.status)}</td>
                    <td className="table-cell text-xs text-oe-muted">{l.reviewer_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-oe-border">
            {leaves.length === 0 ? (
              <div className="text-center py-8 text-oe-muted text-sm">No leave history</div>
            ) : leaves.map(l => (
              <div key={l.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: l.color }} />
                    <span className="text-sm font-medium text-oe-text">{l.leave_type_name}</span>
                  </div>
                  {statusBadge(l.status)}
                </div>
                <div className="text-xs text-oe-muted">{fmtDate(l.start_date)} – {fmtDate(l.end_date)} · {l.total_days} days</div>
                {l.reason && <div className="text-xs text-oe-muted break-words">{l.reason}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Salary */}
      {tab === 1 && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setSalaryModal(true)} className="btn-primary"><Plus size={15} /> Add Salary Structure</button>
          </div>
          {currentSalary && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card">
                <h4 className="font-semibold text-oe-text mb-4 text-sm">Earnings</h4>
                {[['Basic Salary', currentSalary.basic_salary], ['Housing', currentSalary.housing_allowance], ['Transport', currentSalary.transport_allowance], ['Meal', currentSalary.meal_allowance], ['Medical', currentSalary.medical_allowance], ['Mobile', currentSalary.mobile_allowance], ['Other', currentSalary.other_allowances]].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm py-1.5 border-b border-oe-border/30 last:border-0">
                    <span className="text-oe-muted">{k}</span>
                    <span className="text-oe-text">{fmtCurrency(v)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm py-2 mt-1 font-semibold">
                  <span className="text-oe-text">Gross Salary</span>
                  <span className="text-oe-success">{fmtCurrency(currentSalary.gross_salary)}</span>
                </div>
              </div>
              <div className="card">
                <h4 className="font-semibold text-oe-text mb-4 text-sm">Deductions</h4>
                {[['Tax', currentSalary.tax_deduction], ['Pension', currentSalary.pension_deduction], ['Health Insurance', currentSalary.health_insurance], ['Other', currentSalary.other_deductions]].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm py-1.5 border-b border-oe-border/30 last:border-0">
                    <span className="text-oe-muted">{k}</span>
                    <span className="text-oe-danger">-{fmtCurrency(v)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm py-2 mt-1 font-semibold">
                  <span className="text-oe-text">Net Salary</span>
                  <span className="text-oe-primary">{fmtCurrency(currentSalary.net_salary)}</span>
                </div>
              </div>
            </div>
          )}
          {!currentSalary && <div className="card text-center py-8 text-oe-muted">No salary structure defined. Click &ldquo;Add Salary Structure&rdquo; to begin.</div>}
        </div>
      )}

      {/* Tab: Payroll */}
      {tab === 2 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-3 border-b border-oe-border">
            <span className="font-semibold text-oe-text text-sm">Payroll History</span>
          </div>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-oe-surface/50">
                <tr>
                  {['Period', 'Gross', 'Deductions', 'Net', 'Leave Days', 'Status'].map(h => <th key={h} className="table-header">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {payroll.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-oe-muted text-sm">No payroll history</td></tr>
                ) : payroll.map(p => (
                  <tr key={p.id} className="table-row">
                    <td className="table-cell text-xs">{fmtDate(p.period_start)} – {fmtDate(p.period_end)}</td>
                    <td className="table-cell text-oe-success">{fmtCurrency(p.gross_salary)}</td>
                    <td className="table-cell text-oe-danger">-{fmtCurrency(p.total_deductions)}</td>
                    <td className="table-cell text-oe-primary font-medium">{fmtCurrency(p.net_salary)}</td>
                    <td className="table-cell">{p.leave_days_taken}</td>
                    <td className="table-cell"><span className={p.run_status === 'completed' ? 'badge-approved' : 'badge-pending'}>{p.run_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-oe-border">
            {payroll.length === 0 ? (
              <div className="text-center py-8 text-oe-muted text-sm">No payroll history</div>
            ) : payroll.map(p => (
              <div key={p.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-oe-muted">{fmtDate(p.period_start)} – {fmtDate(p.period_end)}</div>
                  <span className={p.run_status === 'completed' ? 'badge-approved' : 'badge-pending'}>{p.run_status}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-xs text-oe-muted">Gross</div>
                    <div className="text-sm font-semibold text-oe-success">{fmtCurrency(p.gross_salary)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-oe-muted">Deductions</div>
                    <div className="text-sm font-semibold text-oe-danger">-{fmtCurrency(p.total_deductions)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-oe-muted">Net</div>
                    <div className="text-sm font-semibold text-oe-primary">{fmtCurrency(p.net_salary)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Documents */}
      {tab === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-oe-text">Documents</h3>
            {(isHR || isSelf) && (
              <button onClick={() => setUploadModal(true)} className="btn-primary text-xs">
                <Upload size={13} /> Upload Document
              </button>
            )}
          </div>

          {docsLoading ? (
            <div className="flex items-center justify-center py-8"><div className="w-6 h-6 border-2 border-oe-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : documents.length === 0 ? (
            <div className="card text-center py-10">
              <FileText size={32} className="text-oe-muted mx-auto mb-2" />
              <p className="text-sm text-oe-muted">No documents uploaded yet.</p>
              {(isHR || isSelf) && <button onClick={() => setUploadModal(true)} className="btn-primary mt-3 text-xs"><Upload size={12} /> Upload First Document</button>}
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-oe-surface/50">
                    <tr>
                      {['Document', 'Type', 'Upload Date', 'Expiry', 'Status', 'Version', 'Actions'].map(h => (
                        <th key={h} className="table-header">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map(doc => (
                      <tr key={doc.id} className="table-row">
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <FileText size={14} className="text-oe-primary flex-shrink-0" />
                            <span className="font-medium text-oe-text text-xs truncate max-w-40">{doc.document_name}</span>
                          </div>
                        </td>
                        <td className="table-cell text-xs text-oe-muted">
                          {DOC_TYPES.find(t => t.value === doc.document_type)?.label || doc.document_type}
                        </td>
                        <td className="table-cell text-xs text-oe-muted">{fmtDateShort(doc.created_at)}</td>
                        <td className="table-cell text-xs">
                          {doc.expiry_date ? (
                            <span className={new Date(doc.expiry_date) < new Date() ? 'text-oe-danger font-medium' : 'text-oe-muted'}>
                              {fmtDateShort(doc.expiry_date)}
                              {new Date(doc.expiry_date) < new Date() && <AlertTriangle size={10} className="inline ml-1" />}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="table-cell">
                          {isHR ? (
                            <select
                              value={doc.status}
                              onChange={e => handleDocStatusChange(doc.id, e.target.value)}
                              className={`text-xs px-2 py-1 rounded-full border-0 font-semibold cursor-pointer ${DOC_STATUS_COLORS[doc.status] || ''}`}
                            >
                              {['pending','verified','rejected','expired'].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                            </select>
                          ) : (
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${DOC_STATUS_COLORS[doc.status] || ''}`}>
                              {doc.status.charAt(0).toUpperCase()+doc.status.slice(1)}
                            </span>
                          )}
                        </td>
                        <td className="table-cell text-xs text-oe-muted text-center">v{doc.version}</td>
                        <td className="table-cell">
                          <div className="flex items-center gap-1">
                            <button onClick={() => window.open(documentsAPI.viewUrl(doc.id), '_blank')} className="p-1.5 hover:bg-oe-primary/10 rounded text-oe-primary" title="View">
                              <Eye size={13} />
                            </button>
                            <button onClick={() => handleDocDownload(doc)} className="p-1.5 hover:bg-oe-primary/10 rounded text-oe-muted" title="Download">
                              <Download size={13} />
                            </button>
                            {isHR && (
                              <button onClick={() => handleDocDelete(doc.id)} className="p-1.5 hover:bg-oe-danger/10 rounded text-oe-danger" title="Delete">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-oe-border">
                {documents.map(doc => (
                  <div key={doc.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={14} className="text-oe-primary flex-shrink-0" />
                        <span className="text-sm font-medium text-oe-text truncate">{doc.document_name}</span>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${DOC_STATUS_COLORS[doc.status] || ''}`}>
                        {doc.status}
                      </span>
                    </div>
                    <div className="text-xs text-oe-muted">{DOC_TYPES.find(t=>t.value===doc.document_type)?.label} · v{doc.version} · {fmtDateShort(doc.created_at)}</div>
                    {doc.expiry_date && <div className={`text-xs ${new Date(doc.expiry_date) < new Date() ? 'text-oe-danger' : 'text-oe-muted'}`}>Expires: {fmtDateShort(doc.expiry_date)}</div>}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => window.open(documentsAPI.viewUrl(doc.id), '_blank')} className="btn-secondary text-xs py-1 px-2"><Eye size={11}/> View</button>
                      <button onClick={() => handleDocDownload(doc)} className="btn-secondary text-xs py-1 px-2"><Download size={11}/> Download</button>
                      {isHR && <button onClick={() => handleDocDelete(doc.id)} className="text-xs text-oe-danger hover:underline py-1 px-2">Delete</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Upload Document Modal */}
      <Modal open={uploadModal} onClose={() => { setUploadModal(false); setUploadFile(null); }} title="Upload Document" size="sm">
        <div className="p-4 space-y-3">
          <div>
            <label className="label">Document Type *</label>
            <select className="input" value={uploadForm.document_type} onChange={e => setUploadForm({...uploadForm, document_type: e.target.value})}>
              {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Document Name</label>
            <input className="input" placeholder="Leave blank to use filename" value={uploadForm.document_name} onChange={e => setUploadForm({...uploadForm, document_name: e.target.value})} />
          </div>
          <div>
            <label className="label">File *</label>
            <div
              className="border-2 border-dashed border-oe-border rounded-lg p-4 text-center cursor-pointer hover:border-oe-primary transition-colors"
              onClick={() => docFileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setUploadFile(f); }}
            >
              {uploadFile ? (
                <div className="flex items-center justify-center gap-2 text-sm text-oe-text">
                  <FileText size={16} className="text-oe-primary" />
                  <span className="truncate max-w-xs">{uploadFile.name}</span>
                  <span className="text-oe-muted">({(uploadFile.size/1024/1024).toFixed(2)} MB)</span>
                </div>
              ) : (
                <div className="text-sm text-oe-muted">
                  <Upload size={20} className="mx-auto mb-1 text-oe-muted" />
                  Click or drag & drop · PDF, Word, Image (max 10 MB)
                </div>
              )}
            </div>
            <input ref={docFileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.xlsx,.xls" onChange={e => setUploadFile(e.target.files[0])} />
          </div>
          <div>
            <label className="label">Expiry Date (if applicable)</label>
            <input type="date" className="input" value={uploadForm.expiry_date} onChange={e => setUploadForm({...uploadForm, expiry_date: e.target.value})} />
          </div>
          <div>
            <label className="label">Comments</label>
            <textarea className="input" rows={2} placeholder="Optional notes..." value={uploadForm.comments} onChange={e => setUploadForm({...uploadForm, comments: e.target.value})} />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button onClick={() => { setUploadModal(false); setUploadFile(null); }} className="btn-secondary">Cancel</button>
            <button onClick={handleDocUpload} disabled={uploading} className="btn-primary">
              {uploading ? 'Uploading...' : <><Upload size={13}/> Upload</>}
            </button>
          </div>
        </div>
      </Modal>

      {/* Salary Modal */}
      <Modal open={salaryModal} onClose={() => setSalaryModal(false)} title="Add Salary Structure" size="md">
        <div className="p-4 sm:p-6 space-y-4">
          <div>
            <label className="label">Effective Date</label>
            <input type="date" className="input" value={salaryForm.effective_date} onChange={e => setSalaryForm({ ...salaryForm, effective_date: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SField salaryForm={salaryForm} setSalaryForm={setSalaryForm} name="basic_salary" label="Basic Salary *" />
            <SField salaryForm={salaryForm} setSalaryForm={setSalaryForm} name="housing_allowance" label="Housing Allowance" />
            <SField salaryForm={salaryForm} setSalaryForm={setSalaryForm} name="transport_allowance" label="Transport Allowance" />
            <SField salaryForm={salaryForm} setSalaryForm={setSalaryForm} name="meal_allowance" label="Meal Allowance" />
            <SField salaryForm={salaryForm} setSalaryForm={setSalaryForm} name="medical_allowance" label="Medical Allowance" />
            <SField salaryForm={salaryForm} setSalaryForm={setSalaryForm} name="mobile_allowance" label="Mobile Allowance" />
            <SField salaryForm={salaryForm} setSalaryForm={setSalaryForm} name="other_allowances" label="Other Allowances" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-oe-muted uppercase tracking-wider mb-2">Deductions</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SField salaryForm={salaryForm} setSalaryForm={setSalaryForm} name="tax_deduction" label="Tax" />
              <SField salaryForm={salaryForm} setSalaryForm={setSalaryForm} name="pension_deduction" label="Pension" />
              <SField salaryForm={salaryForm} setSalaryForm={setSalaryForm} name="health_insurance" label="Health Insurance" />
              <SField salaryForm={salaryForm} setSalaryForm={setSalaryForm} name="other_deductions" label="Other Deductions" />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={salaryForm.notes} onChange={e => setSalaryForm({ ...salaryForm, notes: e.target.value })} />
          </div>
          <div className="flex flex-col sm:flex-row justify-end gap-3">
            <button onClick={() => setSalaryModal(false)} className="btn-secondary justify-center">Cancel</button>
            <button onClick={handleSalary} disabled={saving} className="btn-primary justify-center">
              {saving ? 'Saving...' : 'Save Salary'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title={isHR ? 'Edit Profile' : 'Request Profile Update'} size="md">
        <div className="p-4 sm:p-6 space-y-5">
          {!isHR && (
            <div className="bg-oe-warning/10 border border-oe-warning/30 rounded-lg p-3 text-xs text-oe-warning">
              <strong>Note:</strong> Your changes will be sent to HR for approval before they take effect.
            </div>
          )}
          <div>
            <h4 className="text-xs font-semibold text-oe-muted uppercase tracking-wider mb-3">Contact Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="label">Primary Phone</label><input className="input" value={editForm.phone_primary || ''} onChange={e => setEditForm({ ...editForm, phone_primary: e.target.value })} /></div>
              <div><label className="label">Secondary Phone</label><input className="input" value={editForm.phone_secondary || ''} onChange={e => setEditForm({ ...editForm, phone_secondary: e.target.value })} /></div>
              <div className="sm:col-span-2"><label className="label">Personal Email</label><input type="email" className="input" value={editForm.personal_email || ''} onChange={e => setEditForm({ ...editForm, personal_email: e.target.value })} /></div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-oe-muted uppercase tracking-wider mb-3">Address</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2"><label className="label">Address</label><input className="input" value={editForm.address_line1 || ''} onChange={e => setEditForm({ ...editForm, address_line1: e.target.value })} /></div>
              <div><label className="label">City</label><input className="input" value={editForm.city || ''} onChange={e => setEditForm({ ...editForm, city: e.target.value })} /></div>
              <div><label className="label">State</label><input className="input" value={editForm.state || ''} onChange={e => setEditForm({ ...editForm, state: e.target.value })} /></div>
              <div><label className="label">Country</label><input className="input" value={editForm.country || ''} onChange={e => setEditForm({ ...editForm, country: e.target.value })} /></div>
              <div><label className="label">Postal Code</label><input className="input" value={editForm.postal_code || ''} onChange={e => setEditForm({ ...editForm, postal_code: e.target.value })} /></div>
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-oe-muted uppercase tracking-wider mb-3">Emergency Contact</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className="label">Name</label><input className="input" value={editForm.emergency_contact_name || ''} onChange={e => setEditForm({ ...editForm, emergency_contact_name: e.target.value })} /></div>
              <div><label className="label">Relation</label><input className="input" value={editForm.emergency_contact_relation || ''} onChange={e => setEditForm({ ...editForm, emergency_contact_relation: e.target.value })} /></div>
              <div><label className="label">Phone</label><input className="input" value={editForm.emergency_contact_phone || ''} onChange={e => setEditForm({ ...editForm, emergency_contact_phone: e.target.value })} /></div>
            </div>
          </div>
          <div>
            <label className="label">Bio</label>
            <textarea className="input" rows={2} value={editForm.bio || ''} onChange={e => setEditForm({ ...editForm, bio: e.target.value })} />
          </div>
          <div>
            <label className="label">Insurance Card Number</label>
            <input className="input" value={editForm.insurance_card_number || ''} onChange={e => setEditForm({ ...editForm, insurance_card_number: e.target.value })} />
          </div>
          {user?.role === 'super_admin' && (
            <div>
              <h4 className="text-xs font-semibold text-oe-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Landmark size={12} /> Banking Information <span className="text-oe-warning text-[10px] font-normal">(Super Admin only)</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="label">Bank Name</label><input className="input" value={editForm.bank_name || ''} onChange={e => setEditForm({...editForm, bank_name: e.target.value})} /></div>
                <div><label className="label">Account Holder Name</label><input className="input" value={editForm.account_holder_name || ''} onChange={e => setEditForm({...editForm, account_holder_name: e.target.value})} /></div>
                <div><label className="label">Account Number</label><input className="input" value={editForm.bank_account_number || ''} onChange={e => setEditForm({...editForm, bank_account_number: e.target.value})} /></div>
                <div><label className="label">IBAN</label><input className="input" value={editForm.iban || ''} onChange={e => setEditForm({...editForm, iban: e.target.value})} /></div>
              </div>
            </div>
          )}
          <div className="flex flex-col sm:flex-row justify-end gap-3 pt-1">
            <button onClick={() => setEditModal(false)} className="btn-secondary justify-center">Cancel</button>
            <button onClick={handleEditSave} disabled={editSaving} className="btn-primary justify-center gap-1.5">
              {editSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send size={13} />}
              {editSaving ? 'Submitting...' : isHR ? 'Save Changes' : 'Submit for Approval'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Pending Profile Change Requests (visible to employee) */}
      {isSelf && myRequests.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList size={16} className="text-oe-primary" />
            <h3 className="font-semibold text-oe-text text-sm">My Profile Update Requests</h3>
          </div>
          <div className="space-y-3">
            {myRequests.map(r => {
              const statusCls = r.status === 'approved' ? 'badge-approved' : r.status === 'rejected' ? 'badge-rejected' : 'badge-pending';
              const changedFields = Object.keys(r.changes || {});
              return (
                <div key={r.id} className="flex items-start justify-between py-2 border-b border-oe-border/50 last:border-0 gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-oe-muted mb-1">
                      {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div className="text-sm text-oe-text break-words">
                      Changed: {changedFields.map(f => f.replace(/_/g, ' ')).join(', ')}
                    </div>
                    {r.review_notes && <div className="text-xs text-oe-muted mt-1">Note: {r.review_notes}</div>}
                  </div>
                  <span className={statusCls}>{r.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EmployeeProfilePage() {
  return (
    <PrivateRoute>
      <Layout>
        <EmployeeProfileContent />
      </Layout>
    </PrivateRoute>
  );
}
