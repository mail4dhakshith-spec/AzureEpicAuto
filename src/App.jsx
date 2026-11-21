import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, BadgeCheck, Bell, CalendarDays, Check,
  CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  Clock3, Download, FileSpreadsheet, FileText, Filter, LayoutDashboard,
  LogOut, Menu, MoreHorizontal, Pencil, Plus, Search, Settings2, ShieldCheck,
  Paperclip, Trash2, UsersRound, WalletCards, X,
} from 'lucide-react';
import AuthScreen from './auth/AuthScreen.jsx';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const AUTH_STORAGE_KEY = 'ssn-treasury-session-v1';
const CURRENCY = import.meta.env.VITE_CURRENCY || 'INR';
const DATABASE_GOOGLE_SHEET_URL = import.meta.env.VITE_DATABASE_GOOGLE_SHEET_URL || 'https://docs.google.com/spreadsheets/';
const QUARTERLY_MAINTENANCE_AMOUNT = 1500;
const EXPENSE_TYPES = ['Phase 1 Park', 'Phase 2 Park', 'Road', 'Phase 3 Park', 'Mandabam', 'EB Work', 'Security Payment'];
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const STATUSES = ['Pending', 'Pending Approval', 'Approved', 'Paid'];
const STORE_KEY = 'ledgerline-treasury-v1';
const SEED = {
  owners: [
    { id: 'OWN-1042', name: 'Arun Mehta', email: 'arun.mehta@example.com', phone: '+91 98765 41021', bank: 'HDFC Bank', account: '•••• 4821', status: 'Active' },
    { id: 'OWN-1043', name: 'Priya Nair', email: 'priya.nair@example.com', phone: '+91 98765 41022', bank: 'ICICI Bank', account: '•••• 7913', status: 'Active' },
    { id: 'OWN-1044', name: 'Dev Shah', email: 'dev.shah@example.com', phone: '+91 98765 41023', bank: 'Axis Bank', account: '•••• 1608', status: 'Active' },
    { id: 'OWN-1045', name: 'Mira Kapoor', email: 'mira.kapoor@example.com', phone: '+91 98765 41024', bank: 'SBI', account: '•••• 9334', status: 'Active' },
    { id: 'OWN-1046', name: 'Rohan Iyer', email: 'rohan.iyer@example.com', phone: '+91 98765 41025', bank: 'Kotak Mahindra', account: '•••• 2057', status: 'Active' },
  ],
  expenses: [
    { id: 'EXP-24081', ownerId: 'OWN-1042', owner: 'Arun Mehta', category: 'Travel & lodging', description: 'Site visit · Pune', amount: 24800, submittedAt: '2026-10-28', dueDate: '2026-11-12', status: 'Pending', attachmentName: 'pune-travel.pdf' },
    { id: 'EXP-24080', ownerId: 'OWN-1043', owner: 'Priya Nair', category: 'Office supplies', description: 'Printer and paper stock', amount: 12450, submittedAt: '2026-10-27', dueDate: '2026-11-10', status: 'Pending', attachmentName: 'invoice-771.pdf' },
    { id: 'EXP-24079', ownerId: 'OWN-1044', owner: 'Dev Shah', category: 'Repairs & maintenance', description: 'Electrical repair · Block B', amount: 38600, submittedAt: '2026-10-25', dueDate: '2026-11-08', status: 'Approved', attachmentName: 'repair-bill.jpg' },
    { id: 'EXP-24078', ownerId: 'OWN-1045', owner: 'Mira Kapoor', category: 'Professional fees', description: 'Quarterly audit support', amount: 52000, submittedAt: '2026-10-24', dueDate: '2026-11-06', status: 'Paid', attachmentName: 'audit-invoice.pdf' },
    { id: 'EXP-24077', ownerId: 'OWN-1046', owner: 'Rohan Iyer', category: 'Utilities', description: 'Generator fuel · October', amount: 18900, submittedAt: '2026-10-22', dueDate: '2026-11-05', status: 'Paid', attachmentName: 'fuel-oct.pdf' },
    { id: 'EXP-24076', ownerId: 'OWN-1042', owner: 'Arun Mehta', category: 'Travel & lodging', description: 'Board meeting · Mumbai', amount: 15600, submittedAt: '2026-10-20', dueDate: '2026-11-03', status: 'Rejected', attachmentName: 'travel-claim.pdf' },
  ],
  payments: [
    { id: 'PAY-18031', ownerId: 'OWN-1045', owner: 'Mira Kapoor', amount: 52000, date: '2026-10-30', method: 'Bank transfer', reference: 'NEFT-90412', attachmentName: 'receipt-90412.pdf' },
    { id: 'PAY-18030', ownerId: 'OWN-1046', owner: 'Rohan Iyer', amount: 18900, date: '2026-10-29', method: 'UPI', reference: 'UPI-712804', attachmentName: 'upi-oct.png' },
    { id: 'PAY-18029', ownerId: 'OWN-1043', amount: 36000, date: '2026-10-25', method: 'Bank transfer', reference: 'NEFT-90176' },
  ],
};

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'expenses', label: 'Expense requests', icon: FileText, count: true },
  { id: 'income', label: 'Income', icon: WalletCards },
  { id: 'my-maintenance', label: 'My Maintenance', icon: WalletCards },
  { id: 'owners-maintenance', label: 'Owners Maintenance Details', icon: WalletCards },
  { id: 'quarterly', label: 'Quarterly Payment Management', icon: CalendarDays },
  { id: 'owners', label: 'Owners', icon: UsersRound },
];

async function compressEvidence(file) {
  const sourceUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The evidence image could not be read.'));
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The evidence image could not be decoded.'));
    img.src = sourceUrl;
  });
  const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  let quality = 0.78;
  let result = canvas.toDataURL('image/jpeg', quality);
  while (result.length > 24000 && quality > 0.42) {
    quality -= 0.08;
    result = canvas.toDataURL('image/jpeg', quality);
  }
  if (result.length > 24000) throw new Error('Compress the evidence image further; it is too large for the Excel cell.');
  return { mediaType: 'image/jpeg', dataBase64: result.split(',')[1] };
}

function readLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    return saved?.owners ? saved : SEED;
  } catch {
    return SEED;
  }
}

function financialYear(date = new Date()) {
  const year = date.getFullYear();
  return date.getMonth() >= 3 ? `${year}-${String(year + 1).slice(-2)}` : `${year - 1}-${String(year).slice(-2)}`;
}

function financialYearOptions(date = new Date()) {
  const current = financialYear(date);
  const startYear = Number(current.slice(0, 4));
  return Array.from({ length: 11 }, (_, index) => {
    const year = startYear - 5 + index;
    return `${year}-${String(year + 1).slice(-2)}`;
  });
}

function FinancialYearSelect({ value, onChange, label = 'Financial year', className = 'select-compact' }) {
  return <label className="financial-year-control"><span>{label}</span><select className={className} value={value} onChange={(event) => onChange(event.target.value)}>{financialYearOptions().map((item) => <option key={item} value={item}>FY {item}</option>)}</select></label>;
}

function recordMatchesFinancialYear(record, selectedFinancialYear) {
  if (!record) return false;
  if (String(record.financialYear || '').trim() === selectedFinancialYear) return true;
  const title = String(record.title || '');
  if (title.includes(selectedFinancialYear)) return true;
  return inFinancialYear(record.createdDate || record.date || record.paymentDate, selectedFinancialYear);
}

function inFinancialYear(value, selectedFinancialYear) {
  if (!value) return false;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const startYear = Number(selectedFinancialYear.slice(0, 4));
  const endYear = startYear + 1;
  const start = new Date(startYear, 3, 1);
  const end = new Date(endYear, 3, 1);
  return date >= start && date < end;
}

function inCurrentFinancialYear(value) {
  return Boolean(value) && financialYear(new Date(`${value}T00:00:00`)) === financialYear();
}

function quarterFor(value) {
  const month = new Date(`${value}T00:00:00`).getMonth();
  return `Q${Math.floor(((month + 9) % 12) / 3) + 1}`;
}

function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function isMaintenanceCollected(item) {
  return ['Approved', 'Paid'].includes(item.status);
}

function shortDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(`${value}T00:00:00`));
}

function makeId(prefix, rows) {
  const max = rows.reduce((value, row) => Math.max(value, Number(row.id?.match(/\d+$/)?.[0]) || 0), 0);
  return `${prefix}-${max + 1}`;
}

async function request(action, payload = {}) {
  const session = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null');
  if (!session?.access_token) throw new Error('Your session has expired. Sign in again.');
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const result = await response.json();
  if (!response.ok || result.error) throw new Error(result.error || `Treasury API returned ${response.status}`);
  return result;
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function App() {
  const [session, setSession] = useState(readSession);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!session?.access_token) {
      setAuthLoading(false);
      return undefined;
    }
    let active = true;
    fetch(`${API_URL}/auth/session`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Your session is no longer valid.');
        if (active) {
          const verifiedSession = { ...session, user: result.user };
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(verifiedSession));
          setSession(verifiedSession);
        }
      })
      .catch(() => {
        if (active) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
          setSession(null);
          setAuthError('Your saved session is no longer valid. Sign in again.');
        }
      })
      .finally(() => { if (active) setAuthLoading(false); });
    return () => {
      active = false;
    };
  }, []);

  const role = session?.user?.role;

  useEffect(() => {
    if (!session || ['owner', 'admin'].includes(role)) return;
    setAuthError('This account has no assigned Owner or Admin role. Contact your administrator.');
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setSession(null);
  }, [session, role]);

  if (authLoading) return <div className="auth-loading"><span className="auth-brand-mark"><i /><i /><i /><i /></span><span>Verifying secure session</span></div>;
  if (!session || !['owner', 'admin'].includes(role)) {
    return <AuthScreen initialError={authError} onAuthenticated={(nextSession) => { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession)); setAuthError(''); setSession(nextSession); }} />;
  }
  return <TreasuryApp role={role} user={session.user} onSignOut={(message = '') => {
    if (message) setAuthError(message);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setSession(null);
  }} />;
}

function TreasuryApp({ role, user, onSignOut }) {
  const [data, setData] = useState(() => API_URL ? { owners: [], adminAccounts: [], expenses: [], payments: [], maintenance: [] } : readLocal());
  const [page, setPage] = useState('dashboard');
  const [modal, setModal] = useState('');
  const [selectedMaintenancePhase, setSelectedMaintenancePhase] = useState('');
  const [selectedMaintenanceOwnerId, setSelectedMaintenanceOwnerId] = useState('');
  const [editingMaintenance, setEditingMaintenance] = useState(null);
  const [quarter, setQuarter] = useState('All quarters');
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(() => localStorage.getItem('ssn-treasury-financial-year') || financialYear());
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [editingOwner, setEditingOwner] = useState(null);
  const [periodMenu, setPeriodMenu] = useState(false);
  const [income, setIncome] = useState([]);
  const importRef = useRef(null);
  const demoMode = !API_URL;
  const driveMode = Boolean(API_URL && DATABASE_GOOGLE_SHEET_URL);
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.phone || 'Treasury user';
  const initials = displayName.split(/[\s@+.-]+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  const navItems = role === 'admin'
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => ['dashboard', 'my-maintenance', 'income'].includes(item.id));

  useEffect(() => {
    localStorage.setItem('ssn-treasury-financial-year', selectedFinancialYear);
  }, [selectedFinancialYear]);

  useEffect(() => {
    if (API_URL) {
      request('bootstrap', { financialYear: selectedFinancialYear }).then((result) => setData(result.data)).catch((error) => {
        if (/owner account|owner details row|owner id link|owner record/i.test(error.message)) {
          onSignOut('Your Owner account is not linked to an Owner Details record. Contact an administrator.');
        } else if (/session is invalid|session has expired/i.test(error.message)) {
          onSignOut('Your session expired. Sign in again.');
        } else {
          setNotice(`Could not load the Excel workbook: ${error.message}`);
        }
      });
    }
  }, [selectedFinancialYear]);

  useEffect(() => {
    if (role === 'admin') request('getIncome', { financialYear: selectedFinancialYear }).then((result) => setIncome(result.income || [])).catch(() => setIncome([]));
  }, [role, selectedFinancialYear, busy]);

  useEffect(() => {
    if (demoMode) localStorage.setItem(STORE_KEY, JSON.stringify(data));
  }, [data, demoMode]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(''), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const pendingCount = data.expenses.filter((item) => item.status === 'Pending').length;
  const filteredExpenses = useMemo(() => data.expenses.filter((expense) => {
    const text = `${expense.id} ${expense.expenseType} ${expense.title} ${expense.description} ${expense.comment} ${expense.owner} ${expense.requestedBy} ${expense.approvedBy} ${expense.financialYear || ''}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (!expense.financialYear || expense.financialYear === selectedFinancialYear);
  }), [data.expenses, query, selectedFinancialYear]);
  const directoryUsers = data.owners;
  const filteredOwners = useMemo(() => directoryUsers.filter((owner) => `${owner.username || ''} ${owner.name || ''} ${owner.role || 'Member'} ${owner.email || ''} ${owner.id || ''} ${owner.phone || ''} ${owner.secondaryPhone || ''} ${owner.secondaryEmail || ''} ${owner.phase || ''} ${owner.plotNumber || ''} ${owner.address || ''}`.toLowerCase().includes(query.toLowerCase())), [directoryUsers, query]);
  const filteredPayments = useMemo(() => data.payments.filter((payment) => `${payment.id} ${payment.owner || ''} ${payment.reference || ''}`.toLowerCase().includes(query.toLowerCase())), [data.payments, query]);

  const notify = (message) => setNotice(message);

  async function saveRecord(action, payload, update) {
    setBusy(true);
    try {
      const result = demoMode ? null : await request(action, payload);
      setData((current) => update(current, result));
      setModal('');
      notify(demoMode ? 'Saved in this browser.' : 'Saved to the Excel workbook.');
    } catch (error) {
      notify(error.message || 'The record could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function submitExpense(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('attachment');
    const ownerId = role === 'owner' ? user.id : form.get('ownerId');
    const owner = data.owners.find((item) => item.id === ownerId);
    const expense = {
      ownerId: owner?.id || '', title: form.get('title'), description: form.get('description'),
      comment: form.get('comment'), amount: Number(form.get('amount')), expenseType: form.get('expenseType'), financialYear: form.get('financialYear') || selectedFinancialYear,
    };
    let attachment;
    if (file instanceof File && file.size) {
      if (file.size > 10 * 1024 * 1024 || !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        notify('Choose a PDF, JPEG, PNG, or WebP attachment smaller than 10 MB.');
        return;
      }
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('The attachment could not be read.'));
        reader.readAsDataURL(file);
      });
      attachment = { originalName: file.name, mediaType: file.type, dataBase64: String(dataUrl).split(',')[1] };
    }
    saveRecord('createExpense', { expense, attachment }, (current, result) => role === 'admin'
      ? { ...current, expenses: [result?.expense || expense, ...current.expenses] }
      : current);
  }

  async function submitOwner(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const owner = {
      username: form.get('username'), password: form.get('password'), name: form.get('name'), mobileNumber: form.get('mobileNumber'), email: form.get('email'),
      phase: form.get('phase'), plotNumber: form.get('plotNumber'), address: form.get('address'),
      secondaryMobileNumber: form.get('secondaryMobileNumber'), secondaryEmail: form.get('secondaryEmail'), moveInDate: form.get('moveInDate'),
    };
    const updating = Boolean(editingOwner);
    const { password, ...ownerDetails } = owner;
    saveRecord(updating ? 'updateOwner' : 'createOwner', { id: editingOwner?.id, owner }, (current, result) => ({
      ...current,
      owners: updating
        ? current.owners.map((item) => item.id === editingOwner.id ? result?.owner || { ...editingOwner, ...ownerDetails } : item)
        : [result?.owner || ownerDetails, ...current.owners],
    }));
    setEditingOwner(null);
  }

  async function updateExpenseStatus(expense, status) {
    const updated = { ...expense, status };
    setBusy(true);
    try {
      const result = demoMode ? null : await request('updateExpenseStatus', { id: expense.id, status });
      setData((current) => ({ ...current, expenses: current.expenses.map((item) => item.id === expense.id ? result?.expense || updated : item) }));
      setSelectedExpense(null);
      notify(demoMode ? `Request ${status.toLowerCase()} in this browser.` : `Request ${status.toLowerCase()}.`);
    } catch (error) {
      notify(error.message || 'The request could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function generateQuarterlyMaintenance(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const result = await request('generateQuarterlyMaintenance', { ownerId: form.get('ownerId'), phase: form.get('phase'), quarter: form.get('quarter'), financialYear: form.get('financialYear') });
      setData((current) => ({ ...current, maintenance: [...(result.created || []), ...current.maintenance], payments: [...(result.created || []).map((item) => ({ ...item, date: item.createdDate })), ...current.payments] }));
      setModal('');
      notify(`${result.created?.length || 0} maintenance record(s) generated; ${result.skipped || 0} existing record(s) skipped.`);
    } catch (error) {
      notify(error.message || 'Maintenance records could not be generated.');
    } finally {
      setBusy(false);
    }
  }

  async function saveFinancialYear(input) {
    if (role !== 'admin') throw new Error('Administrator access is required.');
    setBusy(true);
    try {
      const result = await request('saveFinancialYear', input);
      const refreshed = await request('bootstrap');
      setData(refreshed.data);
      notify(`Financial year ${result.financialYear.financialYear} saved.`);
    } finally {
      setBusy(false);
    }
  }

  async function generateQuarterlyMaintenanceBulk(input) {
    if (role !== 'admin') throw new Error('Administrator access is required.');
    setBusy(true);
    try {
      const result = await request('generateQuarterlyMaintenance', input);
      const refreshed = await request('bootstrap');
      setData(refreshed.data);
      notify(`${result.created?.length || 0} record(s) generated; ${result.skipped || 0} existing record(s) skipped.`);
    } finally {
      setBusy(false);
    }
  }

  async function updateMaintenanceStatus(payment, status) {
    setBusy(true);
    try {
      const result = await request('updateMaintenanceStatus', { ownerId: payment.ownerId, title: payment.title, quarter: payment.quarter, status });
      setData((current) => {
        const updated = result.payment || { ...payment, status };
        const maintenance = current.maintenance.map((item) => item.id === payment.id ? updated : item);
        return { ...current, maintenance, payments: maintenance };
      });
      notify(`Maintenance payment marked ${status.toLowerCase()}.`);
    } catch (error) {
      notify(error.message || 'Maintenance payment could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function submitMaintenanceDetails(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('evidence');
    setBusy(true);
    try {
      let evidence;
      if (file instanceof File && file.size) {
        if (file.size > 4 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          throw new Error('Choose a JPEG, PNG, or WebP image smaller than 4 MB.');
        }
        evidence = await compressEvidence(file);
      }
      const result = await request('updateOwnerMaintenanceDetails', {
        title: editingMaintenance.title,
        quarter: editingMaintenance.quarter,
        paymentDate: form.get('paymentDate'),
        paymentMethod: form.get('paymentMethod'),
        reference: form.get('reference'),
        evidence,
      });
      setData((current) => {
        const maintenance = current.maintenance.map((item) => item.id === result.payment.id ? result.payment : item);
        return { ...current, maintenance, payments: maintenance };
      });
      setEditingMaintenance(null);
      notify('Payment details and evidence saved.');
    } catch (error) {
      notify(error.message || 'Payment details could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecord(action, payload, confirmation, successMessage) {
    if (!window.confirm(confirmation)) return;
    setBusy(true);
    try {
      const result = await request(action, payload);
      const refreshed = await request('bootstrap');
      setData(refreshed.data);
      setSelectedOwner(null);
      setSelectedExpense(null);
      notify(typeof successMessage === 'function' ? successMessage(result) : successMessage);
    } catch (error) {
      notify(error.message || 'The record could not be deleted.');
    } finally {
      setBusy(false);
    }
  }

  function deleteOwner(owner) {
    return deleteRecord(
      'deleteOwner',
      { id: owner.id },
      `Delete ${owner.name} and their linked expenses and maintenance records? This cannot be undone.`,
      (result) => `${owner.name} deleted with ${result.deletedExpenses} expense(s) and ${result.deletedMaintenance} maintenance record(s).`,
    );
  }

  function deleteExpense(expense) {
    return deleteRecord('deleteExpense', { id: expense.id }, `Delete expense "${expense.title || expense.description}"? This cannot be undone.`, 'Expense request deleted.');
  }

  function deleteMaintenance(payment) {
    return deleteRecord(
      'deleteMaintenance',
      { ownerId: payment.ownerId, title: payment.title, quarter: payment.quarter },
      `Delete ${payment.quarter} maintenance for ${payment.ownerName || payment.owner}? This cannot be undone.`,
      'Maintenance record deleted.',
    );
  }

  function deleteActivity(item) {
    return item.type === 'Expense' ? deleteExpense(item) : deleteMaintenance(item);
  }

  async function importOwners(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const readXlsxFile = (await import('read-excel-file/browser')).default;
      const sheets = await readXlsxFile(file);
      const rows = sheets[0]?.data || [];
      if (!rows.length) throw new Error('The workbook does not contain owner rows.');
      const headers = rows[0]?.map((value) => String(value || '').trim().toLowerCase()) || [];
      const cellText = (row, name) => {
        const index = headers.indexOf(name.toLowerCase());
        return index >= 0 ? String(row[index] || '').trim() : '';
      };
      const imported = rows.slice(1)
        .filter((row) => cellText(row, 'Name') || cellText(row, 'Mobile Number'))
        .map((row) => ({
          username: cellText(row, 'User Name') || cellText(row, 'Username'),
          password: cellText(row, 'Password'),
          name: cellText(row, 'Name'), mobileNumber: cellText(row, 'Mobile Number'), email: cellText(row, 'Email'),
          phase: cellText(row, 'Phase'), plotNumber: cellText(row, 'Plot Number'), address: cellText(row, 'Address'),
          secondaryMobileNumber: cellText(row, 'Secondary Mobile Number'), secondaryEmail: cellText(row, 'Secondary Email'), moveInDate: cellText(row, 'Move-In Date'),
        }));
      if (!imported.length) throw new Error('No Owner Details rows were found.');
      const result = await request('importOwners', { owners: imported });
      const created = result.owners || [];
      setData((current) => ({ ...current, owners: [...created, ...current.owners] }));
      notify(`${created.length} owner${created.length === 1 ? '' : 's'} imported to the workbook.`);
    } catch (error) {
      notify(error.message || 'The workbook could not be imported.');
    } finally {
      setBusy(false);
      event.target.value = '';
    }
  }

  async function exportReport() {
    try {
      const writeXlsxFile = (await import('write-excel-file/browser')).default;
      const rows = [
        ...data.expenses.filter((item) => String(item.financialYear || '').trim() === selectedFinancialYear).map((item) => ({ Type: 'Expense', 'Expense ID': item.id, 'Expense Type': item.expenseType, Title: item.title, Description: item.description, Comment: item.comment, Amount: item.amount, 'Approved By': item.approvedBy, 'Requested By': item.requestedBy, Status: item.status, 'Financial Year': item.financialYear || '' })),
        ...(data.maintenance || []).filter((item) => String(item.financialYear || '').trim() === selectedFinancialYear).map((item) => ({ Type: 'Maintenance', 'Owner ID': item.ownerId, 'Owner Name': item.ownerName, Title: item.title, Quarter: item.quarter, 'Plot Number': item.plotNumber, 'Phase Number': item.phaseNumber, 'Payment Amount': item.paymentAmount, Status: item.status, 'Created Date': item.createdDate, 'Created By': item.createdBy, 'Financial Year': item.financialYear || '' })),
      ];
      const columns = ['Type', 'Expense ID', 'Expense Type', 'Owner ID', 'Owner Name', 'Title', 'Description', 'Comment', 'Amount', 'Approved By', 'Requested By', 'Quarter', 'Plot Number', 'Phase Number', 'Payment Amount', 'Status', 'Created Date', 'Created By', 'Financial Year']
        .map((header) => ({ header, cell: (row) => ({ value: row[header] }), width: 22 }));
      await writeXlsxFile(rows, { columns, sheet: 'Treasury activity' }).toFile(`treasury-${selectedFinancialYear}-activity.xlsx`);
      notify('Treasury workbook downloaded.');
    } catch (error) {
      notify(error.message || 'The workbook could not be exported.');
    }
  }

  const currentTitle = navItems.find((item) => item.id === page)?.label || (page === 'reports' ? 'Reports' : 'Overview');

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><span /><span /><span /><span /></div>
          <div><div className="brand-name">SSN Treasury</div><div className="brand-caption">COMMUNITY OFFICE</div></div>
          <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X size={18} /></button>
        </div>
        <div className="workspace-switch"><div className="workspace-avatar">S</div><div className="workspace-label"><strong>SSN Community</strong><span>Treasury workspace</span></div><ChevronDown size={15} /></div>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon, count }) => (
            <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => { setPage(id); setMobileNav(false); }}>
              <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{count && pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}
            </button>
          ))}
          <button className={`nav-item ${page === 'reports' ? 'active' : ''}`} onClick={() => { setPage('reports'); setMobileNav(false); }}><CalendarDays size={18} strokeWidth={1.8} /><span>Reports</span></button>
          <button className="nav-item" onClick={() => { window.open(DATABASE_GOOGLE_SHEET_URL, '_blank', 'noopener,noreferrer'); setMobileNav(false); }}><FileSpreadsheet size={18} strokeWidth={1.8} /><span>Google Sheets</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="fy-side-card"><div className="fy-side-top"><span>FINANCIAL YEAR</span><span className="live-dot" /></div><strong>FY {selectedFinancialYear}</strong><div className="fy-progress"><span /></div><div className="fy-side-foot"><span>Apr 01, {selectedFinancialYear.slice(0, 4)}</span><span>Mar 31, {Number(selectedFinancialYear.slice(0, 4)) + 1}</span></div></div>
          <button className="nav-item settings-link" onClick={() => notify(driveMode ? 'Google Sheets workbook connected' : 'Excel workbook connected') }><Settings2 size={18} strokeWidth={1.8} /><span>Workbook</span></button>
          <div className="profile-row"><div className="profile-avatar">{initials}</div><div className="profile-text"><strong>{displayName}</strong><span>{role === 'admin' ? 'Administrator' : 'Owner account'}</span></div><button className="icon-button sign-out-button" aria-label="Sign out" title="Sign out" onClick={onSignOut}><LogOut size={17} /></button></div>
        </div>
      </aside>
      {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={19} /></button><div className="breadcrumb">Treasury <ChevronRight size={14} /> <span>{currentTitle}</span></div></div>
          <div className="topbar-right"><div className="connection-state"><span className={`connection-dot ${demoMode ? 'demo-dot' : ''}`} />{demoMode ? 'Demo workspace' : 'Google Sheets connected'}</div>{role === 'admin' && <button className="icon-button notification-button" aria-label="Open expense requests" onClick={() => setPage('expenses')}><Bell size={18} />{pendingCount > 0 && <i />}</button>}<div className="topbar-avatar">AM</div><button className="icon-button topbar-signout" aria-label="Sign out" title="Sign out" onClick={onSignOut}><LogOut size={17} /></button></div>
        </header>

        <div className="page-content">
          {page === 'dashboard' && <Dashboard data={data} income={income} pendingCount={pendingCount} quarter={quarter} setQuarter={setQuarter} selectedFinancialYear={selectedFinancialYear} setSelectedFinancialYear={setSelectedFinancialYear} periodMenu={periodMenu} setPeriodMenu={setPeriodMenu} onNavigate={setPage} onNewExpense={() => setModal('expense')} onExport={exportReport} displayName={displayName} role={role} onDelete={deleteActivity} />}
          {page === 'income' && <IncomePage role={role} selectedFinancialYear={selectedFinancialYear} setSelectedFinancialYear={setSelectedFinancialYear} />}
          {page === 'expenses' && role === 'admin' && <ExpensesPage expenses={filteredExpenses} query={query} setQuery={setQuery} selectedFinancialYear={selectedFinancialYear} setSelectedFinancialYear={setSelectedFinancialYear} onNew={() => setModal('expense')} onSelect={setSelectedExpense} canDelete onDelete={deleteExpense} />}
          {page === 'payments' && (role === 'admin'
            ? <OwnersMaintenancePage payments={(data.maintenance || []).filter((item) => recordMatchesFinancialYear(item, selectedFinancialYear))} owners={data.owners || []} selectedFinancialYear={selectedFinancialYear} setSelectedFinancialYear={setSelectedFinancialYear} onUpdateStatus={updateMaintenanceStatus} onDelete={deleteMaintenance} />
            : <MyMaintenancePage payments={(data.maintenance || []).filter((item) => recordMatchesFinancialYear(item, selectedFinancialYear) && String(item.ownerId) === String(user.id))} selectedFinancialYear={selectedFinancialYear} setSelectedFinancialYear={setSelectedFinancialYear} />)}
          {page === 'my-maintenance' && <MyMaintenancePage payments={(data.maintenance || []).filter((item) => recordMatchesFinancialYear(item, selectedFinancialYear) && String(item.ownerId) === String(user.id))} selectedFinancialYear={selectedFinancialYear} setSelectedFinancialYear={setSelectedFinancialYear} />}
          {page === 'owners-maintenance' && role === 'admin' && <OwnersMaintenancePage payments={(data.maintenance || []).filter((item) => recordMatchesFinancialYear(item, selectedFinancialYear))} owners={data.owners || []} selectedFinancialYear={selectedFinancialYear} setSelectedFinancialYear={setSelectedFinancialYear} onUpdateStatus={updateMaintenanceStatus} onDelete={deleteMaintenance} />}

          {page === 'quarterly' && role === 'admin' && <QuarterlyManagementPage owners={data.owners || []} financialYears={data.financialYears || []} selectedFinancialYear={selectedFinancialYear} setSelectedFinancialYear={setSelectedFinancialYear} onSave={saveFinancialYear} onGenerate={generateQuarterlyMaintenanceBulk} busy={busy} />}
          {page === 'owners' && <OwnersPage owners={filteredOwners} query={query} setQuery={setQuery} canManage={role === 'admin'} onNew={() => { setEditingOwner(null); setModal('owner'); }} onImport={() => importRef.current?.click()} onView={setSelectedOwner} onDelete={deleteOwner} />}
          {page === 'reports' && <ReportsPage data={{ ...data, maintenance: (data.maintenance || []).filter((item) => String(item.financialYear || '').trim() === selectedFinancialYear) }} quarter={quarter} setQuarter={setQuarter} selectedFinancialYear={selectedFinancialYear} setSelectedFinancialYear={setSelectedFinancialYear} onExport={exportReport} role={role} />}
        </div>
      </main>

      <input ref={importRef} className="visually-hidden" type="file" accept=".xlsx" onChange={importOwners} />
      {notice && <div className="toast" role="status"><CheckCircle2 size={17} />{notice}<button className="toast-close" aria-label="Dismiss" onClick={() => setNotice('')}><X size={15} /></button></div>}
      {modal && <Modal title={modal === 'expense' ? 'New expense request' : modal === 'maintenance' ? 'Generate quarterly maintenance' : editingOwner ? 'Edit owner details' : 'Add owner details'} onClose={() => { setModal(''); setEditingOwner(null); setSelectedMaintenancePhase(''); setSelectedMaintenanceOwnerId(''); }}>
        {modal === 'expense' && <form className="record-form" onSubmit={submitExpense}><p className="form-intro">Create an expense request for Admin review.</p>{role === 'admin' ? <label>Owner<select name="ownerId" required defaultValue=""><option value="" disabled>Select owner</option>{data.owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name} · Plot {owner.plotNumber}</option>)}</select></label> : <div className="owner-summary"><div className="owner-summary-icon"><UsersRound size={18} /></div><div><strong>{data.owners.find((owner) => owner.id === user.id)?.name || displayName}</strong><span>Requesting as your account</span></div></div>}<div className="form-grid"><label>Expense Type<select name="expenseType" required defaultValue=""><option value="" disabled>Select an expense type</option>{EXPENSE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label><label>Amount ({CURRENCY})<input name="amount" type="number" min="0.01" step="0.01" placeholder="0" required /></label></div><div className="form-grid"><label>Financial Year<select name="financialYear" defaultValue={selectedFinancialYear}>{financialYearOptions().map((item) => <option key={item} value={item}>FY {item}</option>)}</select></label></div><label>Title<input name="title" maxLength="120" placeholder="Expense title" required /></label><label>Description<textarea name="description" rows="3" maxLength="1000" placeholder="Describe the expense" /></label><label>Comment<textarea name="comment" rows="2" maxLength="1000" placeholder="Additional details" /></label><label className="expense-attachment-field">Attachment (optional)<span><Paperclip size={15} /><input name="attachment" type="file" accept=".pdf,image/jpeg,image/png,image/webp" /><small>PDF or image, up to 10 MB</small></span></label><div className="form-footer"><span><ShieldCheck size={15} /> Saved to Expense Details</span><button className="button button-primary" disabled={busy}><Plus size={16} /> Submit request</button></div></form>}
        {modal === 'maintenance' && <form className="record-form" onSubmit={generateQuarterlyMaintenance}><p className="form-intro">Create one pending record for the selected user.</p><label>Phase<select name="phase" value={selectedMaintenancePhase} onChange={(event) => { setSelectedMaintenancePhase(event.target.value); setSelectedMaintenanceOwnerId(''); }} required><option value="" disabled>Select a phase</option>{['Phase 1', 'Phase 2', 'Phase 3'].map((phase) => <option key={phase}>{phase}</option>)}</select></label><label>User<select name="ownerId" value={selectedMaintenanceOwnerId} onChange={(event) => setSelectedMaintenanceOwnerId(event.target.value)} disabled={!selectedMaintenancePhase} required><option value="" disabled>Select a user</option>{data.owners.filter((owner) => owner.phase === selectedMaintenancePhase).map((owner) => <option key={owner.id} value={owner.id}>{owner.name} · {owner.username}</option>)}</select></label><label>Plot number<input value={data.owners.find((owner) => owner.id === selectedMaintenanceOwnerId)?.plotNumber || ''} placeholder="Selected user's plot" readOnly /></label><div className="form-grid"><label>Financial Year<select name="financialYear" defaultValue={selectedFinancialYear}>{financialYearOptions().map((item) => <option key={item} value={item}>FY {item}</option>)}</select></label><label>Quarter<select name="quarter" defaultValue="Q1">{QUARTERS.map((item) => <option key={item}>{item}</option>)}</select></label><label>Financial year<input name="financialYear" defaultValue={financialYear()} pattern="[0-9]{4}-[0-9]{2}" required /></label></div><div className="maintenance-total-note">Quarterly amount per house <strong>{money(QUARTERLY_MAINTENANCE_AMOUNT)}</strong></div><div className="form-footer"><span><ShieldCheck size={15} /> Existing user-quarter records are skipped</span><button className="button button-primary" disabled={busy || !selectedMaintenanceOwnerId}><Plus size={16} /> Generate record</button></div></form>}
        {modal === 'owner' && <form className="record-form" onSubmit={submitOwner}>
          <p className="form-intro">{editingOwner ? `Update ${editingOwner.name}'s Owner Details record.` : 'Owner IDs and creator details are assigned automatically.'}</p>
          {editingOwner && <label>Owner ID<input value={editingOwner.id} disabled /></label>}
          <label>User name<input name="username" autoComplete="username" defaultValue={editingOwner?.username || ''} minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]{2,31}" required /></label>
          <label>Full name<input name="name" defaultValue={editingOwner?.name || ''} maxLength="120" required /></label>
          <div className="form-grid"><label>Mobile number<input name="mobileNumber" type="tel" defaultValue={editingOwner?.phone || ''} required /></label><label>Primary email<input name="email" type="email" defaultValue={editingOwner?.email || ''} /></label></div>
          <div className="form-grid"><label>Phase<select name="phase" defaultValue={editingOwner?.phase || 'Phase 1'} required><option>Phase 1</option><option>Phase 2</option><option>Phase 3</option></select></label><label>Plot number<input name="plotNumber" defaultValue={editingOwner?.plotNumber || ''} required /></label></div>
          <label>Address<textarea name="address" rows="2" defaultValue={editingOwner?.address || ''} /></label>
          <div className="form-grid"><label>Secondary mobile<input name="secondaryMobileNumber" type="tel" defaultValue={editingOwner?.secondaryPhone || ''} /></label><label>Secondary email<input name="secondaryEmail" type="email" defaultValue={editingOwner?.secondaryEmail || ''} /></label></div>
          <label>Move-In Date<input name="moveInDate" type="date" defaultValue={editingOwner?.moveInDate || ''} required /></label>
          <label>Password<input name="password" type="password" autoComplete="new-password" minLength="12" maxLength="256" required={!editingOwner} placeholder={editingOwner ? 'Leave blank to keep current password' : 'At least 12 characters'} /></label>
          <div className="form-footer"><span><ShieldCheck size={15} /> Password is saved directly in the Excel database</span><button className="button button-primary" disabled={busy}><Plus size={16} /> {editingOwner ? 'Save changes' : 'Add owner'}</button></div>
        </form>}
      </Modal>}
      {editingMaintenance && <Modal title="Update maintenance payment" onClose={() => setEditingMaintenance(null)}><form className="record-form" onSubmit={submitMaintenanceDetails}>
        <p className="form-intro">Update payment details for {editingMaintenance.quarter}. Status remains pending until reviewed by Admin.</p>
        <div className="form-grid"><label>Payment date<input name="paymentDate" type="date" defaultValue={editingMaintenance.paymentDate || new Date().toISOString().slice(0, 10)} required /></label><label>Payment method<select name="paymentMethod" defaultValue={editingMaintenance.paymentMethod || ''} required><option value="" disabled>Select method</option><option>UPI</option><option>Bank transfer</option><option>Cash</option><option>Other</option></select></label></div>
        <label>Transaction reference<input name="reference" maxLength="120" defaultValue={editingMaintenance.reference || ''} placeholder="Optional reference number" /></label>
        <label>Payment evidence image<input name="evidence" type="file" accept="image/jpeg,image/png,image/webp" required={!editingMaintenance.evidenceFile} /></label>
        <div className="evidence-hint">JPEG, PNG, or WebP up to 4 MB. {editingMaintenance.evidenceFile && <>Current evidence: <EvidencePreview filename={editingMaintenance.evidenceFile} /></>}</div>
        <div className="form-footer"><span><ShieldCheck size={15} /> Only you and Admin can view this evidence</span><button className="button button-primary" disabled={busy}><Pencil size={15} /> Save payment details</button></div>
      </form></Modal>}
      {selectedOwner && <Modal title="Owner details" onClose={() => setSelectedOwner(null)}><OwnerDetail owner={selectedOwner} maintenance={(data.maintenance || []).filter((payment) => payment.ownerId === selectedOwner.id)} viewOnly={role === 'owner'} onEdit={() => { setEditingOwner(selectedOwner); setSelectedOwner(null); setModal('owner'); }} onDelete={deleteOwner} /></Modal>}
      {selectedExpense && <Modal title="Expense request" onClose={() => setSelectedExpense(null)}><ExpenseDetail expense={selectedExpense} canReview={role === 'admin'} onUpdate={updateExpenseStatus} onPay={role === 'admin' ? () => updateExpenseStatus(selectedExpense, 'Paid') : null} onDelete={deleteExpense} busy={busy} /></Modal>}
    </div>
  );
}

function PageHeading({ eyebrow, title, description, actions }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{actions}</div></div>;
}

function LegacyDashboard({ data, quarter, setQuarter, periodMenu, setPeriodMenu, onNavigate, onNewExpense, onExport, displayName }) {
  const maintenance = data.maintenance || [];
  const quarterRecords = maintenance.filter((item) => quarter === 'All quarters' || item.quarter === quarter);
  const collected = maintenance.filter(isMaintenanceCollected);
  const pendingMaintenance = maintenance.filter((item) => ['Pending', 'Pending Approval'].includes(item.status));
  const pendingExpenses = data.expenses.filter((item) => item.status === 'Pending');
  const expenseTotal = data.expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const collectedTotal = collected.reduce((sum, item) => sum + Number(item.paymentAmount ?? item.amount), 0);
  const pendingTotal = pendingMaintenance.reduce((sum, item) => sum + Number(item.paymentAmount ?? item.amount), 0);
  const periodCollected = quarterRecords.filter(isMaintenanceCollected).reduce((sum, item) => sum + Number(item.paymentAmount ?? item.amount), 0);
  const periodPending = quarterRecords.filter((item) => ['Pending', 'Pending Approval'].includes(item.status)).reduce((sum, item) => sum + Number(item.paymentAmount ?? item.amount), 0);
  const quarters = QUARTERS;
  const fiscalStart = Number(financialYear().slice(0, 4));
  const phaseTotals = ['Phase 1', 'Phase 2', 'Phase 3'].map((phase) => ({
    phase,
    total: collected.filter((item) => String(item.phaseNumber) === phase.replace('Phase ', '')).reduce((sum, item) => sum + Number(item.paymentAmount ?? item.amount), 0),
  }));
  const phaseMax = Math.max(1, ...phaseTotals.map((item) => item.total));
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const month = (index + 3) % 12 + 1;
    const year = fiscalStart + (index > 8 ? 1 : 0);
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return maintenance.filter((item) => item.createdDate?.startsWith(prefix) && isMaintenanceCollected(item)).reduce((sum, item) => sum + Number(item.paymentAmount ?? item.amount), 0);
  });
  const maxMonth = Math.max(1, ...monthly);
  const quarterPaid = quarters.map((item) => collected.filter((payment) => payment.quarter === item).reduce((sum, payment) => sum + Number(payment.paymentAmount ?? payment.amount), 0));
  return <>
    <PageHeading eyebrow={new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase()} title={`Good morning, ${displayName.split(/[\s@+.-]+/)[0]}`} description="Here’s your treasury at a glance." actions={<><button className="button button-quiet" onClick={onExport}><Download size={16} /> Export</button><button className="button button-primary" onClick={onNewExpense}><Plus size={16} /> New request</button></>} />
    <div className="period-row"><div className="period-title"><CalendarDays size={16} /><span>FY {financialYear()}</span><span className="period-divider">/</span><div className="period-control"><button onClick={() => setPeriodMenu(!periodMenu)}>{quarter}<ChevronDown size={14} /></button>{periodMenu && <div className="period-menu">{['All quarters', ...quarters].map((item) => <button key={item} onClick={() => { setQuarter(item); setPeriodMenu(false); }}>{item}{quarter === item && <Check size={14} />}</button>)}</div>}</div></div><span className="period-note">April {fiscalStart} — March {fiscalStart + 1}</span></div>
    <section className="metric-grid" aria-label="Financial summary">
      <MetricCard label="Total owners" value={String(data.owners.length)} note="Registered houses" tone="blue" icon={UsersRound} />
      <MetricCard label="Maintenance collected" value={money(periodCollected)} note={`${quarterRecords.filter(isMaintenanceCollected).length} records counted · ${quarter}`} tone="green" icon={ArrowUpRight} />
      <MetricCard label="Pending maintenance" value={money(periodPending)} note={`${quarterRecords.filter((item) => ['Pending', 'Pending Approval'].includes(item.status)).length} records`} tone="amber" icon={Clock3} />
      <MetricCard label="Total expenses" value={money(expenseTotal)} note={`${data.expenses.length} expense records`} tone="coral" icon={ArrowDownLeft} />
      <MetricCard label="Pending approvals" value={String(pendingExpenses.length).padStart(2, '0')} note="Expense requests" tone="blue" icon={BadgeCheck} />
    </section>
    <section className="dashboard-grid">
      <div className="panel spend-panel"><div className="panel-heading"><div><h2>Maintenance collection</h2><p>Approved or paid records by creation month · FY {financialYear()}</p></div><button className="select-compact" onClick={() => onNavigate('payments')}>Open payments<ChevronRight size={14} /></button></div><div className="chart-legend"><span><i className="legend-expense" /> Maintenance collected</span></div><div className="chart-area"><div className="chart-y-labels"><span>{CURRENCY} {Math.round(maxMonth / 1000)}k</span><span>{CURRENCY} {Math.round(maxMonth * .67 / 1000)}k</span><span>{CURRENCY} {Math.round(maxMonth * .33 / 1000)}k</span><span>0</span></div><div className="chart-main"><div className="chart-grid-lines"><i /><i /><i /><i /></div><div className="bar-set">{monthly.map((amount, index) => <div className="bar-pair" key={index}><span className="bar expense-bar" style={{ height: `${amount ? Math.max(3, amount / maxMonth * 100) : 2}%` }} /></div>)}</div><div className="chart-x-labels">{quarters.map((item) => <span key={item}>{item}</span>)}</div></div></div></div>
      <div className="panel quarter-panel"><div className="panel-heading"><div><h2>Quarterly snapshot</h2><p>FY {financialYear()} performance</p></div><button className="icon-button panel-more" aria-label="Open reports" onClick={() => onNavigate('reports')}><MoreHorizontal size={19} /></button></div><div className="quarter-summary"><span className="quarter-ring"><span>FY<br /><b>{financialYear().slice(2).replace('-', '–')}</b></span></span><div className="quarter-total"><span>Collected this year</span><strong>{money(collectedTotal)}</strong><small>Across {collected.length} records</small></div></div><div className="quarter-list">{quarters.map((item, index) => <div className="quarter-line" key={item}><span className={`quarter-dot q-${index + 1}`} /> <span>{item}</span><span>{['Apr – Jun', 'Jul – Sep', 'Oct – Dec', 'Jan – Mar'][index]}</span><b>{money(quarterPaid[index])}</b></div>)}</div></div>
    </section>
    <section className="panel phase-summary-panel"><div className="panel-heading"><div><h2>Phase-wise collection</h2><p>Approved or paid maintenance records by development phase</p></div><span className="phase-summary-total">{money(collectedTotal)} total</span></div><div className="phase-summary-list">{phaseTotals.map((item) => <div className="phase-summary-row" key={item.phase}><span>{item.phase}</span><div className="phase-track"><i style={{ width: `${item.total / phaseMax * 100}%` }} /></div><strong>{money(item.total)}</strong></div>)}</div></section>
    <section className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Your latest requests and payments</p></div><button className="text-button" onClick={() => onNavigate('expenses')}>View all <ChevronRight size={15} /></button></div><ActivityTable data={data} onSelect={(item) => { if (item.type === 'Expense') onNavigate('expenses'); else onNavigate(role === 'admin' ? 'owners-maintenance' : 'my-maintenance'); }} /></section>
    <div className="dashboard-foot"><span><ShieldCheck size={15} /> Financial year runs April to March</span><button onClick={() => onNavigate('reports')}>View annual report <ArrowUpRight size={14} /></button></div>
  </>;
}

function Dashboard({ data, income = [], quarter, setQuarter, selectedFinancialYear, setSelectedFinancialYear, periodMenu, setPeriodMenu, onNavigate, onNewExpense, onExport, displayName, role, onDelete }) {
  const overviewData = data.overview || data;
  const maintenance = overviewData.maintenance || [];
  const fiscalStart = Number(selectedFinancialYear.slice(0, 4));
  const yearMaintenance = maintenance.filter((item) => String(item.financialYear || '').trim() === selectedFinancialYear || (!item.financialYear && inFinancialYear(item.createdDate, selectedFinancialYear)));
  const quarterRecords = yearMaintenance.filter((item) => quarter === 'All quarters' || item.quarter === quarter);
  const collected = quarterRecords.filter(isMaintenanceCollected);
  const pendingMaintenance = quarterRecords.filter((item) => ['Pending', 'Pending Approval'].includes(item.status));
  const pendingExpenses = overviewData.expenses.filter((item) => item.status === 'Pending');
  const approvedIncome = income.filter((item) => item.status === 'Approved' && (!item.financialYear || item.financialYear === selectedFinancialYear)).reduce((sum, item) => sum + Number(item.amount), 0);
  const pendingIncome = income.filter((item) => item.status === 'Pending' && (!item.financialYear || item.financialYear === selectedFinancialYear)).reduce((sum, item) => sum + Number(item.amount), 0);
  const paidExpenses = overviewData.expenses.filter((item) => item.status === 'Paid' && (!item.financialYear || item.financialYear === selectedFinancialYear)).reduce((sum, item) => sum + Number(item.amount), 0);
  const outstandingAmount = Math.max(0, yearlyCollected + approvedIncome - paidExpenses);
  const collectedTotal = collected.reduce((sum, item) => sum + Number(item.paymentAmount), 0);
  const pendingTotal = pendingMaintenance.reduce((sum, item) => sum + Number(item.paymentAmount), 0);
  const yearlyCollected = yearMaintenance.filter(isMaintenanceCollected).reduce((sum, item) => sum + Number(item.paymentAmount), 0);
  const quarterlyTotals = QUARTERS.map((item) => yearMaintenance.filter((record) => record.quarter === item && isMaintenanceCollected(record)).reduce((sum, record) => sum + Number(record.paymentAmount), 0));
  const phaseTotals = ['Phase 1', 'Phase 2', 'Phase 3'].map((phase) => ({
    phase,
    amount: yearMaintenance.filter((item) => String(item.phaseNumber) === phase.replace('Phase ', '') && isMaintenanceCollected(item)).reduce((sum, item) => sum + Number(item.paymentAmount), 0),
  }));
  const phaseMax = Math.max(1, ...phaseTotals.map((item) => item.amount));
  const monthlyTotals = Array.from({ length: 12 }, (_, index) => {
    const month = (index + 3) % 12 + 1;
    const year = fiscalStart + (index > 8 ? 1 : 0);
    const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
    return yearMaintenance.filter((item) => isMaintenanceCollected(item) && item.createdDate?.startsWith(monthPrefix)).reduce((sum, item) => sum + Number(item.paymentAmount), 0);
  });
  const maxMonth = Math.max(1, ...monthlyTotals);
  return <>
    <PageHeading eyebrow={new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()).toUpperCase()} title={`Good morning, ${displayName.split(/[\s@+.-]+/)[0]}`} description="Community treasury overview." actions={<><button className="button button-quiet" onClick={onExport}><Download size={16} /> Export</button><button className="button button-primary" onClick={onNewExpense}><Plus size={16} /> New expense</button></>} />
    <div className="period-row"><div className="period-title"><CalendarDays size={16} /><FinancialYearSelect value={selectedFinancialYear} onChange={setSelectedFinancialYear} /><span className="period-divider">/</span><div className="period-control"><button onClick={() => setPeriodMenu(!periodMenu)}>{quarter}<ChevronDown size={14} /></button>{periodMenu && <div className="period-menu">{['All quarters', ...QUARTERS].map((item) => <button key={item} onClick={() => { setQuarter(item); setPeriodMenu(false); }}>{item}{quarter === item && <Check size={14} />}</button>)}</div>}</div></div><span className="period-note">April {fiscalStart} — March {fiscalStart + 1}</span></div>
    <section className="metric-grid" aria-label="Treasury summary">
      <MetricCard label="Maintenance collected" value={money(yearlyCollected)} note={`${yearMaintenance.filter(isMaintenanceCollected).length} collected records`} tone="green" icon={ArrowUpRight} />
      <MetricCard label="Approved other income" value={money(approvedIncome)} note="Approved income only" tone="blue" icon={WalletCards} />
      <MetricCard label="Outstanding amount" value={money(outstandingAmount)} note="Available funds after paid expenses" tone="amber" icon={BadgeCheck} />
      <MetricCard label="Paid expenses" value={money(paidExpenses)} note={`${overviewData.expenses.filter((item) => item.status === 'Paid').length} paid expense records`} tone="coral" icon={ArrowDownLeft} />
      <MetricCard label="Pending income & maintenance" value={money(pendingIncome + pendingTotal)} note={`${pendingIncome ? 'Includes pending income · ' : ''}${pendingMaintenance.length} pending maintenance`} tone="blue" icon={Clock3} />
    </section>
    <section className="dashboard-grid">
      <div className="panel spend-panel"><div className="panel-heading"><div><h2>Maintenance collection</h2><p>Approved or paid records by creation month · FY {financialYear()}</p></div><button className="select-compact" onClick={() => onNavigate('payments')}>Open payments<ChevronRight size={14} /></button></div><div className="chart-legend"><span><i className="legend-expense" /> Maintenance collected</span></div><div className="chart-area"><div className="chart-y-labels"><span>{CURRENCY} {Math.round(maxMonth / 1000)}k</span><span>{CURRENCY} {Math.round(maxMonth * .67 / 1000)}k</span><span>{CURRENCY} {Math.round(maxMonth * .33 / 1000)}k</span><span>0</span></div><div className="chart-main"><div className="chart-grid-lines"><i /><i /><i /><i /></div><div className="bar-set">{monthlyTotals.map((amount, index) => <div className="bar-pair" key={index}><span className="bar expense-bar" style={{ height: `${amount ? Math.max(3, amount / maxMonth * 100) : 2}%` }} /></div>)}</div><div className="chart-x-labels">{QUARTERS.map((item) => <span key={item}>{item}</span>)}</div></div></div></div>
      <div className="panel quarter-panel"><div className="panel-heading"><div><h2>Quarterly snapshot</h2><p>FY {financialYear()} performance</p></div><button className="icon-button panel-more" aria-label="Open maintenance payments" onClick={() => onNavigate(role === 'admin' ? 'owners-maintenance' : 'my-maintenance')}><MoreHorizontal size={19} /></button></div><div className="quarter-summary"><span className="quarter-ring"><span>FY<br /><b>{financialYear().slice(2).replace('-', '–')}</b></span></span><div className="quarter-total"><span>Collected this year</span><strong>{money(yearlyCollected)}</strong><small>Across {yearMaintenance.filter(isMaintenanceCollected).length} records</small></div></div><div className="quarter-list">{QUARTERS.map((item, index) => <div className="quarter-line" key={item}><span className={`quarter-dot q-${index + 1}`} /> <span>{item}</span><span>{['Apr – Jun', 'Jul – Sep', 'Oct – Dec', 'Jan – Mar'][index]}</span><b>{money(quarterlyTotals[index])}</b></div>)}</div></div>
    </section>
    <section className="panel phase-summary-panel"><div className="panel-heading"><div><h2>Phase-wise collection</h2><p>Approved or paid maintenance records by development phase</p></div><span className="phase-summary-total">{money(yearlyCollected)} total</span></div><div className="phase-summary-list">{phaseTotals.map((item) => <div className="phase-summary-row" key={item.phase}><span>{item.phase}</span><div className="phase-track"><i style={{ width: `${item.amount / phaseMax * 100}%` }} /></div><strong>{money(item.amount)}</strong></div>)}</div></section>
    <section className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Latest expense requests and maintenance payments</p></div>{role === 'admin' ? <button className="text-button" onClick={() => onNavigate('expenses')}>View expenses <ChevronRight size={15} /></button> : <button className="text-button" onClick={() => onNavigate(role === 'admin' ? 'owners-maintenance' : 'my-maintenance')}>View maintenance <ChevronRight size={15} /></button>}</div><ActivityTable data={overviewData} onSelect={role === 'admin' ? (item) => onNavigate(item.type === 'Expense' ? 'expenses' : 'owners-maintenance') : undefined} canDelete={role === 'admin'} onDelete={onDelete} /></section>
  </>;
}

function MetricCard({ label, value, delta, note, tone, icon: Icon }) {
  return <div className={`metric-card metric-${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17} strokeWidth={1.8} /></span></div><div className="metric-value">{value}</div><div className="metric-note">{delta && <span className="metric-delta">↗ {delta}</span>}{note}</div><div className="metric-spark"><svg viewBox="0 0 120 25" preserveAspectRatio="none" aria-hidden="true"><path d="M0 19 C12 16 15 21 25 15 S43 18 51 10 S66 16 74 9 S88 12 96 5 S108 10 120 1" /></svg></div></div>;
}

function ActivityTable({ data, onSelect, canDelete = false, onDelete }) {
  const items = [
    ...data.expenses.map((item) => ({ ...item, type: 'Expense', date: item.submittedAt })),
    ...data.payments.map((item) => ({ ...item, type: 'Payment', date: item.date, description: item.title || item.method || 'Maintenance payment', category: item.quarter || item.reference || 'Maintenance', status: item.status || 'Paid' })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
  return <div className="table-wrap"><table className="data-table"><thead><tr><th>ACTIVITY</th><th>OWNER</th><th>DATE</th><th>AMOUNT</th><th>STATUS</th><th />{canDelete && <th>ACTIONS</th>}</tr></thead><tbody>{items.map((item) => <tr key={`${item.type}-${item.id}`} onClick={onSelect ? () => onSelect(item) : undefined}><td><span className={`row-type-icon ${item.type === 'Payment' ? 'payment-type' : ''}`}>{item.type === 'Payment' ? <ArrowUpRight size={15} /> : <FileText size={15} />}</span><span className="activity-name"><strong>{item.description}</strong><small>{item.id} <i /> {item.category}</small></span></td><td>{item.owner || '—'}</td><td>{shortDate(item.date)}</td><td className="amount-cell">{money(item.amount)}</td><td><StatusPill status={item.status} /></td><td>{onSelect && <ChevronRight size={15} className="table-chevron" />}</td>{canDelete && <td><button className="icon-button row-delete" type="button" title="Delete record" aria-label={`Delete ${item.description}`} onClick={(event) => { event.stopPropagation(); onDelete(item); }}><Trash2 size={15} /></button></td>}</tr>)}</tbody></table></div>;
}

function StatusPill({ status }) {
  const className = status.toLowerCase().replace(/\s+/g, '-');
  return <span className={`status-pill status-${className}`}><i />{status}</span>;
}

function ListToolbar({ query, setQuery, children, placeholder = 'Search records...' }) {
  return <div className="list-toolbar"><label className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} /><kbd>⌘ K</kbd></label><div className="toolbar-actions">{children}</div></div>;
}

function IncomePage({ role, selectedFinancialYear, setSelectedFinancialYear }) {
  const [income, setIncome] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [busy, setBusy] = useState(false);
  const [modalIncome, setModalIncome] = useState(null);

  async function refresh() {
    const result = await request('getIncome', { financialYear: selectedFinancialYear });
    setIncome(result.income || []);
  }

  useEffect(() => { refresh().catch(() => setIncome([])); }, [selectedFinancialYear]);

  async function saveIncome(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const record = { title: form.get('title'), description: form.get('description'), amount: form.get('amount'), incomeDate: form.get('incomeDate'), financialYear: form.get('financialYear'), comments: form.get('comments') };
      const file = form.get('evidence');
      let attachment;
      if (file instanceof File && file.size) {
        if (file.size > 10 * 1024 * 1024 || !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a PDF, JPEG, PNG, or WebP attachment smaller than 10 MB.');
        const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The attachment could not be read.')); reader.readAsDataURL(file); });
        attachment = { originalName: file.name, mediaType: file.type, dataBase64: String(dataUrl).split(',')[1] };
      }
      await request(modalIncome ? 'updateIncome' : 'createIncome', modalIncome ? { id: modalIncome.id, income: { ...record, evidenceName: modalIncome.evidenceName || '', evidenceFile: modalIncome.evidenceFile || '' }, attachment } : { income: record, attachment });
      await refresh();
      setModalIncome(null);
    } catch (error) {
      window.alert(error.message || 'Income could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(record, status) {
    setBusy(true);
    try {
      const comments = status === 'Rejected' ? window.prompt('Approval/Rejection comments:', '') || '' : window.prompt('Approval comments:', '') || '';
      await request('updateIncomeStatus', { id: record.id, status, comments });
      await refresh();
    } catch (error) {
      window.alert(error.message || 'Income status could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  const visible = income.filter((item) => (statusFilter === 'All' || item.status === statusFilter)
    && `${item.id} ${item.title} ${item.description} ${item.requestedBy} ${item.approvedBy}`.toLowerCase().includes(query.toLowerCase()));

  return <>
    <PageHeading eyebrow="INCOME MANAGEMENT" title="Income" description="Submit and manage approved, pending, and rejected income records." actions={<button type="button" className="button button-primary" onClick={() => setModalIncome({})}><Plus size={16} /> Create income</button>} />
    <div className="payment-summary"><div><span>PENDING</span><strong>{money(visible.filter((item) => item.status === 'Pending').reduce((sum, item) => sum + Number(item.amount), 0))}</strong></div><div><span>APPROVED</span><strong>{money(visible.filter((item) => item.status === 'Approved').reduce((sum, item) => sum + Number(item.amount), 0))}</strong></div><div><span>REJECTED</span><strong>{money(visible.filter((item) => item.status === 'Rejected').reduce((sum, item) => sum + Number(item.amount), 0))}</strong></div></div>
    <ListToolbar query={query} setQuery={setQuery} placeholder="Search income title, requester...">
      <FinancialYearSelect value={selectedFinancialYear} onChange={setSelectedFinancialYear} />
      <select className="select-compact" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All</option><option>Pending</option><option>Approved</option><option>Rejected</option></select>
    </ListToolbar>
    <div className="panel listing-panel"><div className="table-wrap"><table className="data-table"><thead><tr><th>INCOME</th><th>FINANCIAL YEAR</th><th>DATE</th><th>AMOUNT</th><th>REQUESTED BY</th><th>STATUS</th><th>APPROVED BY</th><th>ACTIONS</th></tr></thead>
      <tbody>{visible.map((item) => <tr key={item.id}><td><span className="activity-name"><strong>{item.title}</strong><small>{item.id}</small></span></td><td>{item.financialYear || 'Unassigned'}</td><td>{shortDate(item.incomeDate)}</td><td className="amount-cell">{money(item.amount)}</td><td>{item.requestedBy || '—'}</td><td>{item.evidenceFile ? <IncomeAttachmentLink filename={item.evidenceFile} originalName={item.evidenceName} /> : '—'}</td><td><StatusPill status={item.status} /></td><td>{item.approvedBy || '—'}</td><td>{role === 'admin' && item.status === 'Pending' ? <div className="row-actions"><button className="button button-quiet" type="button" disabled={busy} onClick={() => updateStatus(item, 'Approved')}>Approve</button><button className="button button-quiet button-danger" type="button" disabled={busy} onClick={() => updateStatus(item, 'Rejected')}>Reject</button></div> : item.status === 'Pending' ? <button className="icon-button row-menu" type="button" title="Edit pending income" aria-label="Edit pending income" onClick={() => setModalIncome(item)}><Pencil size={15} /></button> : null}</td></tr>)}</tbody>
    </table>{visible.length === 0 && <EmptyState text="No income records match these filters." />}</div></div>
    {modalIncome && <Modal title={modalIncome.id ? 'Edit pending income' : 'Create income'} onClose={() => setModalIncome(null)}><form className="record-form" onSubmit={saveIncome}><label>Income title<input name="title" defaultValue={modalIncome.title || ''} maxLength="120" required /></label><label>Description<textarea name="description" rows="3" defaultValue={modalIncome.description || ''} /></label><div className="form-grid"><label>Income amount ({CURRENCY})<input name="amount" type="number" min="0.01" step="0.01" defaultValue={modalIncome.amount || ''} required /></label><label>Income date<input name="incomeDate" type="date" defaultValue={modalIncome.incomeDate || new Date().toISOString().slice(0, 10)} required /></label></div><label>Financial Year<select name="financialYear" defaultValue={modalIncome.financialYear || selectedFinancialYear}>{financialYearOptions().map((item) => <option key={item}>{item}</option>)}</select></label><label>Comments<textarea name="comments" rows="2" defaultValue={modalIncome.comments || ''} /></label><label className="expense-attachment-field">Income evidence (optional)<span><Paperclip size={15} /><input name="evidence" type="file" accept=".pdf,image/jpeg,image/png,image/webp" /><small>PDF or image, up to 10 MB</small></span></label>{modalIncome.evidenceFile && <div className="evidence-hint">Current evidence: <IncomeAttachmentLink filename={modalIncome.evidenceFile} originalName={modalIncome.evidenceName} /></div>}<div className="form-footer"><span>New records start Pending</span><button className="button button-primary" type="submit" disabled={busy}>{modalIncome.id ? 'Save changes' : 'Submit income'}</button></div></form></Modal>}
  </>;
}

function IncomeAttachmentLink({ filename, originalName }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    const session = readSession();
    if (!session?.access_token || !filename) return undefined;
    fetch(`${API_URL}/income/attachments/${encodeURIComponent(filename)}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((response) => { if (!response.ok) throw new Error('Attachment unavailable'); return response.blob(); })
      .then((blob) => { objectUrl = URL.createObjectURL(blob); if (active) setUrl(objectUrl); else URL.revokeObjectURL(objectUrl); })
      .catch(() => { if (active) setUrl(''); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [filename]);
  return url ? <a className="attachment-link" href={url} download={originalName || filename} target="_blank" rel="noreferrer">View evidence</a> : <span className="evidence-hint">Loading evidence...</span>;
}

function ExpensesPage({ expenses, query, setQuery, selectedFinancialYear, setSelectedFinancialYear, onNew, onSelect, canDelete, onDelete }) {
  const [filter, setFilter] = useState('All requests');
  const visible = filter === 'All requests' ? expenses : expenses.filter((item) => item.status === filter);
  return <>
    <PageHeading eyebrow="EXPENSE MANAGEMENT" title="Expense requests" description="Create requests, review decisions, and track payments." actions={<button className="button button-primary" onClick={onNew}><Plus size={16} /> New request</button>} />
    <div className="list-summary"><div><strong>{expenses.length}</strong><span> requests</span><i /><strong>{expenses.filter((item) => item.status === 'Pending').length}</strong><span> need review</span></div><button className="button button-quiet" onClick={() => setFilter(filter === 'All requests' ? 'Pending' : 'All requests')}><Filter size={15} /> {filter}</button></div>
    <ListToolbar query={query} setQuery={setQuery} placeholder="Search title, requester..."><FinancialYearSelect value={selectedFinancialYear} onChange={setSelectedFinancialYear} /></ListToolbar>
    <div className="panel listing-panel"><div className="table-wrap"><table className="data-table">
      <thead><tr><th>EXPENSE</th><th>FINANCIAL YEAR</th><th>REQUESTED BY</th><th>AMOUNT</th><th>STATUS</th><th>APPROVED BY</th><th />{canDelete && <th>ACTIONS</th>}</tr></thead>
      <tbody>{visible.map((item) => <tr key={item.id} onClick={() => onSelect(item)}>
        <td><span className="activity-name"><strong>{item.title || item.description}</strong><small>{item.id} · {item.expenseType || 'Uncategorized'} · {item.description || 'No description'}</small></span></td>
        <td>{item.financialYear || 'Unassigned'}</td><td>{item.owner || item.requestedBy || '—'}</td><td className="amount-cell">{money(item.amount)}</td><td><StatusPill status={item.status} /></td><td>{item.approvedBy || '—'}</td><td><ChevronRight size={15} className="table-chevron" /></td>{canDelete && <td><button className="icon-button row-delete" type="button" title="Delete expense" aria-label={`Delete ${item.title || item.description}`} onClick={(event) => { event.stopPropagation(); onDelete(item); }}><Trash2 size={15} /></button></td>}
      </tr>)}</tbody>
    </table>{visible.length === 0 && <EmptyState text="No expense requests match this search." />}</div><div className="table-footer">Showing {visible.length} of {expenses.length} expense records</div></div>
  </>;
}

function QuarterlyManagementPage({ owners, financialYears, selectedFinancialYear, setSelectedFinancialYear, onSave, onGenerate, busy }) {
  const active = financialYears.find((item) => item.status === 'Active');
  const [financialYearValue, setFinancialYearValue] = useState(selectedFinancialYear || active?.financialYear || financialYear());
  const [quarterlyAmount, setQuarterlyAmount] = useState(active?.quarterlyAmount || QUARTERLY_MAINTENANCE_AMOUNT);
  const [startDate, setStartDate] = useState(active?.startDate || `${financialYearValue.slice(0, 4)}-04-01`);
  const [endDate, setEndDate] = useState(active?.endDate || `${Number(financialYearValue.slice(0, 4)) + 1}-03-31`);
  const [quarter, setQuarter] = useState('Q1');
  const [phase, setPhase] = useState('All phases');
  const [selection, setSelection] = useState('all');
  const [ownerIds, setOwnerIds] = useState([]);
  const [ownerQuery, setOwnerQuery] = useState('');

  useEffect(() => {
    const matching = financialYears.find((item) => item.financialYear === financialYearValue);
    if (matching) {
      setQuarterlyAmount(matching.quarterlyAmount);
      setStartDate(matching.startDate);
      setEndDate(matching.endDate);
    }
  }, [financialYearValue, financialYears]);

  const selectedOwners = phase === 'All phases' ? owners : owners.filter((owner) => owner.phase === phase);
  const visibleOwners = selectedOwners.filter((owner) => `${owner.name || ''} ${owner.username || ''} ${owner.plotNumber || ''} ${owner.mobileNumber || owner.phone || ''}`.toLowerCase().includes(ownerQuery.toLowerCase()));
  const allVisibleSelected = visibleOwners.length > 0 && visibleOwners.every((owner) => ownerIds.includes(owner.id));

  function toggleOwner(ownerId) {
    if (selection === 'individual') {
      setOwnerIds(ownerIds.includes(ownerId) ? [] : [ownerId]);
      return;
    }
    setOwnerIds((current) => current.includes(ownerId) ? current.filter((id) => id !== ownerId) : [...current, ownerId]);
  }

  function toggleVisibleOwners() {
    const visibleIds = visibleOwners.map((owner) => owner.id);
    setOwnerIds((current) => allVisibleSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : Array.from(new Set([...current, ...visibleIds])));
  }

  return <>
    <PageHeading eyebrow="ADMIN CONFIGURATION" title="Quarterly Payment Management" description="Create financial years, configure quarterly charges, and generate owner payment records." />
    <section className="panel config-section config-section-primary">
      <h3 className="section-heading">Financial year configuration</h3>
      <div className="form-grid">
        <FinancialYearSelect value={financialYearValue} onChange={(value) => { setFinancialYearValue(value); setSelectedFinancialYear(value); }} />
        <label>Quarterly amount ({CURRENCY})<input type="number" min="1" step="1" value={quarterlyAmount} onChange={(event) => setQuarterlyAmount(event.target.value)} /></label>
        <label>Start date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
        <label>End date<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
      </div>
      <div className="form-footer"><span>{active ? `Active: FY ${active.financialYear}` : 'No active financial year'} · Selected: FY {financialYearValue}</span><button type="button" className="button button-primary" disabled={busy} onClick={() => onSave({ financialYear: financialYearValue, startDate, endDate, quarterlyAmount, status: 'Active' })}>Save & activate</button></div>
    </section>
    <section className="panel config-section">
      <h3 className="section-heading">Generate quarterly records</h3>
      <div className="form-grid quarterly-generation-grid">
        <FinancialYearSelect value={financialYearValue} onChange={(value) => { setFinancialYearValue(value); setSelectedFinancialYear(value); }} />
        <label>Quarter<select value={quarter} onChange={(event) => setQuarter(event.target.value)}>{QUARTERS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Phase<select value={phase} onChange={(event) => setPhase(event.target.value)}>{['All phases', 'Phase 1', 'Phase 2', 'Phase 3'].map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <div className="quarterly-generation-selection">
        <label>Generate for<select value={selection} onChange={(event) => setSelection(event.target.value)}><option value="all">All selected owners</option><option value="multiple">Multiple selected owners</option><option value="individual">Individual owner</option></select></label>
      </div>
      {selection !== 'all' && <div className="quarterly-owner-picker">
        <div className="quarterly-owner-toolbar">
          <label className="search-box"><Search size={16} /><input value={ownerQuery} onChange={(event) => setOwnerQuery(event.target.value)} placeholder="Search owner, username, plot, mobile..." /></label>
          {selection === 'multiple' && <button type="button" className="button button-quiet" onClick={toggleVisibleOwners}>{allVisibleSelected ? 'Clear visible' : 'Select visible'}</button>}
          {ownerIds.length > 0 && <button type="button" className="button button-quiet" onClick={() => setOwnerIds([])}>Clear selection</button>}
        </div>
        <div className="panel listing-panel quarterly-owner-table">
          <div className="table-wrap"><table className="data-table"><thead><tr>
            <th className="selection-column"><input type="checkbox" aria-label="Select all visible owners" checked={allVisibleSelected} disabled={selection !== 'multiple'} onChange={toggleVisibleOwners} /></th>
            <th>OWNER</th><th>USER NAME</th><th>PHASE</th><th>PLOT</th><th>MOBILE</th>
          </tr></thead><tbody>{visibleOwners.map((owner) => <tr key={owner.id} className={ownerIds.includes(owner.id) ? 'selected-owner-row' : ''} onClick={() => toggleOwner(owner.id)}>
            <td><input type={selection === 'individual' ? 'radio' : 'checkbox'} name="quarterly-owner-selection" aria-label={`Select ${owner.name}`} checked={ownerIds.includes(owner.id)} onChange={() => toggleOwner(owner.id)} onClick={(event) => event.stopPropagation()} /></td>
            <td><span className="activity-name"><strong>{owner.name}</strong><small>{owner.id}</small></span></td><td className="mono-cell">{owner.username || '—'}</td><td>{owner.phase || '—'}</td><td>{owner.plotNumber || '—'}</td><td>{owner.mobileNumber || owner.phone || '—'}</td>
          </tr>)}</tbody></table>{visibleOwners.length === 0 && <EmptyState text="No owners match this search." />}</div>
        </div>
      </div>}
      <div className="form-footer"><span>{selection === 'all' ? `${selectedOwners.length} owner(s) selected` : `${ownerIds.length} owner(s) selected`}</span><button type="button" className="button button-primary" disabled={busy || (selection !== 'all' && ownerIds.length === 0)} onClick={() => onGenerate({ financialYear: financialYearValue, quarterlyAmount, quarter, phase: phase === 'All phases' ? '' : phase, ownerIds: selection === 'all' ? selectedOwners.map((owner) => owner.id) : ownerIds })}>Generate records</button></div>
    </section>
  </>;
}

function maintenancePaidAmount(payment) {
  return isMaintenanceCollected(payment) ? Number(payment.paymentAmount ?? payment.amount ?? 0) : 0;
}

function maintenanceBalance(payment) {
  const amount = Number(payment.paymentAmount ?? payment.amount ?? 0);
  return Math.max(0, amount - maintenancePaidAmount(payment));
}

function MyMaintenancePage({ payments, selectedFinancialYear, setSelectedFinancialYear }) {
  const [scopedPayments, setScopedPayments] = useState(payments);
  useEffect(() => {
    let active = true;
    request('getMyMaintenance', { financialYear: selectedFinancialYear })
      .then((result) => { if (active) setScopedPayments(result.maintenance || []); })
      .catch(() => { if (active) setScopedPayments([]); });
    return () => { active = false; };
  }, [selectedFinancialYear]);
  const [quarterFilter, setQuarterFilter] = useState('All quarters');
  const [statusFilter, setStatusFilter] = useState('All');
  const visible = scopedPayments.filter((payment) =>
    (quarterFilter === 'All quarters' || payment.quarter === quarterFilter)
    && (statusFilter === 'All' || (statusFilter === 'Paid' ? isMaintenanceCollected(payment) : ['Pending', 'Pending Approval'].includes(payment.status))));
  const total = visible.reduce((sum, payment) => sum + Number(payment.paymentAmount ?? payment.amount ?? 0), 0);
  const paid = visible.reduce((sum, payment) => sum + maintenancePaidAmount(payment), 0);
  const pending = Math.max(0, total - paid);

  return <>
    <PageHeading eyebrow="PERSONAL PAYMENTS" title="My Maintenance" description="View only your own quarterly maintenance payment records." />
    <div className="payment-summary"><div><span>TOTAL MAINTENANCE</span><strong>{money(total)}</strong></div><div><span>TOTAL PAID</span><strong>{money(paid)}</strong></div><div><span>TOTAL PENDING</span><strong>{money(pending)}</strong></div></div>
    <ListToolbar query="" setQuery={() => {}} placeholder="Search records...">
      <FinancialYearSelect value={selectedFinancialYear} onChange={setSelectedFinancialYear} />
      <select className="select-compact" aria-label="Filter by quarter" value={quarterFilter} onChange={(event) => setQuarterFilter(event.target.value)}>{['All quarters', ...QUARTERS].map((item) => <option key={item}>{item}</option>)}</select>
      <select className="select-compact" aria-label="Filter by payment status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{['All', 'Pending', 'Paid'].map((item) => <option key={item}>{item}</option>)}</select>
    </ListToolbar>
    <div className="panel listing-panel"><div className="table-wrap"><table className="data-table">
      <thead><tr><th>FINANCIAL YEAR</th><th>QUARTER</th><th>MAINTENANCE</th><th>PAID</th><th>BALANCE</th><th>STATUS</th><th>PAYMENT DATE</th></tr></thead>
      <tbody>{visible.map((payment) => <tr key={payment.id}><td>{payment.financialYear || (String(payment.title || '').match(/FY ([0-9]{4}-[0-9]{2})/)?.[1] || 'Unassigned')}</td><td><span className="quarter-badge">{payment.quarter}</span></td><td className="amount-cell">{money(payment.paymentAmount ?? payment.amount)}</td><td className="amount-cell">{money(maintenancePaidAmount(payment))}</td><td className="amount-cell">{money(maintenanceBalance(payment))}</td><td><StatusPill status={payment.status} /></td><td>{shortDate(payment.paymentDate)}</td></tr>)}</tbody>
    </table>{visible.length === 0 && <EmptyState text="No maintenance records match these filters." />}</div></div>
  </>;
}

function OwnersMaintenancePage({ payments, owners, selectedFinancialYear, setSelectedFinancialYear, onUpdateStatus, onDelete }) {
  const [scopedPayments, setScopedPayments] = useState(payments);
  useEffect(() => {
    let active = true;
    request('getOwnersMaintenance', { financialYear: selectedFinancialYear })
      .then((result) => { if (active) setScopedPayments(result.maintenance || []); })
      .catch(() => { if (active) setScopedPayments([]); });
    return () => { active = false; };
  }, [selectedFinancialYear]);
  const [ownerFilter, setOwnerFilter] = useState('All owners');
  const [phaseFilter, setPhaseFilter] = useState('All phases');
  const [quarterFilter, setQuarterFilter] = useState('All quarters');
  const [statusFilter, setStatusFilter] = useState('All');
  const ownerName = (ownerId) => owners.find((owner) => String(owner.id) === String(ownerId))?.name || scopedPayments.find((payment) => String(payment.ownerId) === String(ownerId))?.ownerName || '—';
  const visible = scopedPayments.filter((payment) =>
    (ownerFilter === 'All owners' || ownerName(payment.ownerId) === ownerFilter)
    && (phaseFilter === 'All phases' || String(payment.phaseNumber) === phaseFilter.replace('Phase ', ''))
    && (quarterFilter === 'All quarters' || payment.quarter === quarterFilter)
    && (statusFilter === 'All' || payment.status === statusFilter));
  const totalExpected = visible.reduce((sum, payment) => sum + Number(payment.paymentAmount ?? payment.amount ?? 0), 0);
  const totalCollected = visible.reduce((sum, payment) => sum + maintenancePaidAmount(payment), 0);
  const totalPending = Math.max(0, totalExpected - totalCollected);

  return <>
    <PageHeading eyebrow="ADMIN COLLECTIONS" title="Owners Maintenance Details" description="View and manage maintenance records for all registered owners." />
    <div className="payment-summary owners-payment-summary"><div><span>TOTAL EXPECTED COLLECTION</span><strong>{money(totalExpected)}</strong></div><div><span>TOTAL COLLECTED</span><strong>{money(totalCollected)}</strong></div><div><span>TOTAL PENDING</span><strong>{money(totalPending)}</strong></div><div><span>TOTAL OWNERS</span><strong>{owners.length}</strong></div></div>
    <ListToolbar query="" setQuery={() => {}} placeholder="Search owner...">
      <FinancialYearSelect value={selectedFinancialYear} onChange={setSelectedFinancialYear} />
      <select className="select-compact" aria-label="Filter by owner" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}><option>All owners</option>{owners.map((owner) => <option key={owner.id}>{owner.name}</option>)}</select>
      <select className="select-compact" aria-label="Filter by phase" value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value)}>{['All phases', 'Phase 1', 'Phase 2', 'Phase 3'].map((item) => <option key={item}>{item}</option>)}</select>
      <select className="select-compact" aria-label="Filter by quarter" value={quarterFilter} onChange={(event) => setQuarterFilter(event.target.value)}>{['All quarters', ...QUARTERS].map((item) => <option key={item}>{item}</option>)}</select>
      <select className="select-compact" aria-label="Filter by payment status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{['All', ...STATUSES].map((item) => <option key={item}>{item}</option>)}</select>
    </ListToolbar>
    <div className="panel listing-panel"><div className="table-wrap"><table className="data-table"><thead><tr><th>OWNER</th><th>OWNER ID</th><th>PHASE</th><th>PLOT</th><th>FINANCIAL YEAR</th><th>QUARTER</th><th>MAINTENANCE</th><th>PAID</th><th>BALANCE</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
      <tbody>{visible.map((payment) => <tr key={payment.id}><td><strong>{ownerName(payment.ownerId)}</strong></td><td className="mono-cell">{payment.ownerId}</td><td>Phase {payment.phaseNumber}</td><td>{payment.plotNumber || '—'}</td><td>{payment.financialYear || (String(payment.title || '').match(/FY ([0-9]{4}-[0-9]{2})/)?.[1] || 'Unassigned')}</td><td><span className="quarter-badge">{payment.quarter}</span></td><td className="amount-cell">{money(payment.paymentAmount ?? payment.amount)}</td><td className="amount-cell">{money(maintenancePaidAmount(payment))}</td><td className="amount-cell">{money(maintenanceBalance(payment))}</td><td><select className="status-select" aria-label={`Set ${ownerName(payment.ownerId)} ${payment.quarter} status`} value={payment.status} onChange={(event) => onUpdateStatus(payment, event.target.value)}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></td><td><button className="icon-button row-delete" type="button" title="Delete maintenance record" aria-label={`Delete ${ownerName(payment.ownerId)} ${payment.quarter}`} onClick={() => onDelete(payment)}><Trash2 size={15} /></button></td></tr>)}</tbody>
    </table>{visible.length === 0 && <EmptyState text="No maintenance records match these filters." />}</div></div>
  </>;
}

function MaintenancePage({ payments, query, setQuery, role, selfOwnerId, selectedFinancialYear, setSelectedFinancialYear, onGenerate, onUpdateStatus, onDelete, onEditPayment }) {
  const [quarterFilter, setQuarterFilter] = useState('All quarters');
  const [phaseFilter, setPhaseFilter] = useState('All phases');
  const [plotFilter, setPlotFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [ownerScope, setOwnerScope] = useState('all');
  const visible = payments.filter((item) => {
    if (role === 'admin' && ownerScope === 'mine' && String(item.ownerId) !== String(selfOwnerId)) return false;
    const text = `${item.ownerId} ${item.ownerName || item.owner} ${item.title} ${item.plotNumber}`.toLowerCase();
    return text.includes(query.toLowerCase())
      && (quarterFilter === 'All quarters' || item.quarter === quarterFilter)
      && (phaseFilter === 'All phases' || String(item.phaseNumber) === phaseFilter.replace('Phase ', ''))
      && String(item.plotNumber).toLowerCase().includes(plotFilter.toLowerCase())
      && recordMatchesFinancialYear(item, selectedFinancialYear)
      && (role !== 'owner' || statusFilter === 'All' || (statusFilter === 'Completed' ? item.status === 'Paid' : ['Pending', 'Pending Approval'].includes(item.status)));
  });
  const collected = visible.filter(isMaintenanceCollected).reduce((sum, item) => sum + Number(item.paymentAmount ?? item.amount), 0);
  const pending = visible.filter((item) => ['Pending', 'Pending Approval'].includes(item.status)).reduce((sum, item) => sum + Number(item.paymentAmount ?? item.amount), 0);
  return <>
    <PageHeading eyebrow="MAINTENANCE COLLECTIONS" title={role === 'owner' ? 'My Maintenance' : 'Maintenance payments'} description={role === 'owner' ? 'Your quarterly charges and payment status.' : 'Quarterly house contributions at ₹1,500 per quarter.'} actions={role === 'admin' ? <button className="button button-primary" onClick={onGenerate}><Plus size={16} /> Generate quarterly records</button> : null} />
    <div className="payment-summary"><div><span>COLLECTED</span><strong>{money(collected)}</strong></div><div><span>PENDING</span><strong>{money(pending)}</strong></div><div><span>QUARTERLY PER HOUSE</span><strong>{money(QUARTERLY_MAINTENANCE_AMOUNT)}</strong></div></div>
    <ListToolbar query={query} setQuery={setQuery} placeholder="Search owner, plot, title...">
      {role === 'admin' && <div className="quarter-tabs" role="tablist" aria-label="Maintenance owner scope"><button type="button" role="tab" aria-selected={ownerScope === 'all'} className={ownerScope === 'all' ? 'selected' : ''} onClick={() => setOwnerScope('all')}>All owners</button><button type="button" role="tab" aria-selected={ownerScope === 'mine'} className={ownerScope === 'mine' ? 'selected' : ''} onClick={() => setOwnerScope('mine')}>My maintenance</button></div>}
      <FinancialYearSelect value={selectedFinancialYear} onChange={setSelectedFinancialYear} />
      {role === 'owner' && <div className="quarter-tabs" role="tablist" aria-label="Filter maintenance payments">{['All', 'Pending', 'Completed'].map((status) => <button key={status} type="button" role="tab" aria-selected={statusFilter === status} className={statusFilter === status ? 'selected' : ''} onClick={() => setStatusFilter(status)}>{status}</button>)}</div>}
      <select className="select-compact" aria-label="Filter by quarter" value={quarterFilter} onChange={(event) => setQuarterFilter(event.target.value)}>{['All quarters', ...QUARTERS].map((item) => <option key={item}>{item}</option>)}</select>
      <select className="select-compact" aria-label="Filter by phase" value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value)}>{['All phases', 'Phase 1', 'Phase 2', 'Phase 3'].map((item) => <option key={item}>{item}</option>)}</select>
      <input className="plot-filter" aria-label="Filter by plot number" placeholder="Plot number" value={plotFilter} onChange={(event) => setPlotFilter(event.target.value)} />
    </ListToolbar>
    <div className="panel listing-panel"><div className="table-wrap"><table className="data-table">
      <thead><tr><th>OWNER</th><th>FINANCIAL YEAR</th><th>PHASE</th><th>PLOT</th><th>QUARTER</th><th>TITLE</th><th>AMOUNT</th><th>PAYMENT DETAILS</th><th>STATUS</th><th>CREATED</th>{role !== 'owner' || visible.some((item) => ['Pending', 'Pending Approval'].includes(item.status)) ? <th>ACTIONS</th> : null}</tr></thead>
      <tbody>{visible.map((item) => <tr key={item.id}>
        <td><span className="activity-name"><strong>{item.ownerName || item.owner}</strong><small>{item.ownerId}</small></span></td><td>{item.financialYear || 'Unassigned'}</td><td>Phase {item.phaseNumber}</td><td>{item.plotNumber}</td><td><span className="quarter-badge">{item.quarter}</span></td><td><span className="activity-name"><strong>{item.title}</strong>{item.evidenceFile && <EvidencePreview filename={item.evidenceFile} />}</span></td><td className="amount-cell">{money(item.paymentAmount ?? item.amount)}</td>
        <td><span className="contact-cell">{item.paymentDate ? shortDate(item.paymentDate) : '—'}<small>{[item.paymentMethod, item.reference].filter(Boolean).join(' · ') || 'No details submitted'}</small></span></td><td>{role === 'admin' ? <select className="status-select" aria-label={`Set ${item.ownerName || item.owner} ${item.quarter} status`} value={item.status} disabled={item.busy} onChange={(event) => onUpdateStatus(item, event.target.value)}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select> : <StatusPill status={item.status} />}</td><td>{shortDate(item.createdDate || item.date)}</td>{role === 'admin' ? <td><button className="icon-button row-delete" type="button" title="Delete maintenance record" aria-label={`Delete ${item.ownerName || item.owner} ${item.quarter} maintenance`} onClick={() => onDelete(item)}><Trash2 size={15} /></button></td> : role === 'owner' && ['Pending', 'Pending Approval'].includes(item.status) ? <td><button className="icon-button row-menu" type="button" title="Update payment details" aria-label={`Update ${item.quarter} payment details`} onClick={() => onEditPayment(item)}><Pencil size={15} /></button></td> : role === 'owner' && visible.some((payment) => ['Pending', 'Pending Approval'].includes(payment.status)) ? <td /> : null}
      </tr>)}</tbody>
    </table>{visible.length === 0 && <EmptyState text="No maintenance records match these filters." />}</div><div className="table-footer">Showing {visible.length} maintenance records <span>Quarterly charge: {money(QUARTERLY_MAINTENANCE_AMOUNT)} per house</span></div></div>
  </>;
}

function EvidencePreview({ filename }) {
  const [imageUrl, setImageUrl] = useState('');

  if (typeof filename === 'string' && filename.startsWith('data:image/')) {
    return <a className="attachment-link" href={filename} target="_blank" rel="noreferrer">View evidence</a>;
  }

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    const session = readSession();
    if (!session?.access_token) return undefined;
    fetch(`${API_URL}/maintenance/evidence/${encodeURIComponent(filename)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).then((response) => {
      if (!response.ok) throw new Error('Evidence is unavailable.');
      return response.blob();
    }).then((blob) => {
      objectUrl = URL.createObjectURL(blob);
      if (active) setImageUrl(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch(() => {
      if (active) setImageUrl('');
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [filename]);

  return imageUrl
    ? <a className="attachment-link" href={imageUrl} target="_blank" rel="noreferrer">View evidence</a>
    : <span className="evidence-hint">Loading evidence...</span>;
}

function OwnersPage({ owners, query, setQuery, canManage, onNew, onImport, onView, onDelete }) {
  const [phaseFilter, setPhaseFilter] = useState('All phases');
  const [plotFilter, setPlotFilter] = useState('');
  const visible = owners.filter((owner) => (phaseFilter === 'All phases' || owner.phase === phaseFilter)
    && String(owner.plotNumber).toLowerCase().includes(plotFilter.toLowerCase()));
  return <>
    <PageHeading eyebrow="OWNER DIRECTORY" title="Owners" description={canManage ? 'Manage owner details, plots, phases, and contact information.' : 'Browse owner names and plot details.'} actions={canManage ? <><button className="button button-quiet" onClick={onImport}><FileSpreadsheet size={16} /> Import Excel</button><button className="button button-primary" onClick={onNew}><Plus size={16} /> Add owner</button></> : null} />
    <div className="owner-summary"><div className="owner-summary-icon"><UsersRound size={20} /></div><div><strong>{visible.length}</strong><span> owner records</span></div><span className="owner-summary-note">{canManage ? 'Owner and secondary contacts' : 'Names, phases, and plots'}</span></div>
    <ListToolbar query={query} setQuery={setQuery} placeholder="Search owners, contacts...">
      <select className="select-compact" aria-label="Filter owners by phase" value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value)}>{['All phases', 'Phase 1', 'Phase 2', 'Phase 3'].map((phase) => <option key={phase}>{phase}</option>)}</select>
      <input className="plot-filter" aria-label="Filter owners by plot" placeholder="Plot number" value={plotFilter} onChange={(event) => setPlotFilter(event.target.value)} />
    </ListToolbar>
    <div className="panel listing-panel"><div className="table-wrap"><table className="data-table owner-table">
      <thead><tr><th>OWNER</th>{canManage && <th>USER NAME</th>}<th>ROLE</th><th>PHASE</th><th>PLOT</th>{canManage && <><th>PRIMARY CONTACT</th><th>SECONDARY CONTACT</th><th>ADDRESS</th></>}<th /></tr></thead>
      <tbody>{visible.map((owner) => <tr key={owner.id} onClick={() => onView(owner)}>
        <td><span className="owner-cell"><span className="owner-avatar">{owner.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span className="activity-name"><strong>{owner.name}</strong><small>{owner.id}</small></span></span></td>
        {canManage && <td className="mono-cell">{owner.username}</td>}<td>{owner.role === 'Admin' ? 'Admin' : 'Member'}</td><td>{owner.phase || '—'}</td><td>{owner.plotNumber || '—'}</td>{canManage && <><td><span className="contact-cell">{owner.phone || '—'}<small>{owner.email || '—'}</small></span></td><td><span className="contact-cell">{owner.secondaryPhone || '—'}<small>{owner.secondaryEmail || '—'}</small></span></td><td>{owner.address || '—'}</td></>}
        <td>{canManage ? <div className="row-actions"><button className="icon-button row-menu" aria-label={`View ${owner.name}`} title="View owner" onClick={(event) => { event.stopPropagation(); onView(owner); }}><ChevronRight size={18} /></button><button className="icon-button row-delete" type="button" title="Delete owner" aria-label={`Delete ${owner.name}`} onClick={(event) => { event.stopPropagation(); onDelete(owner); }}><Trash2 size={15} /></button></div> : null}</td>
      </tr>)}</tbody>
    </table>{visible.length === 0 && <EmptyState text="No owners match these filters." />}</div><div className="table-footer">Showing {visible.length} owner records <span>IDs are assigned by the Excel API</span></div></div>
  </>;
}

function LegacyReportsPage({ data, quarter, setQuarter, onExport }) {
  const selectedQuarter = quarter === 'All quarters' ? null : quarter;
  const expenses = data.expenses;
  const payments = (data.maintenance || []).filter((item) => !selectedQuarter || item.quarter === selectedQuarter);
  const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const paymentTotal = payments.filter(isMaintenanceCollected).reduce((sum, item) => sum + Number(item.paymentAmount), 0);
  const quarters = [{ name: 'Q1', dates: 'APR — JUN', months: ['April', 'May', 'June'] }, { name: 'Q2', dates: 'JUL — SEP', months: ['July', 'August', 'September'] }, { name: 'Q3', dates: 'OCT — DEC', months: ['October', 'November', 'December'] }, { name: 'Q4', dates: 'JAN — MAR', months: ['January', 'February', 'March'] }];
  const fiscalStart = Number(financialYear().slice(0, 4));
  const quarterTotals = quarters.map((item) => (data.maintenance || []).filter((payment) => payment.quarter === item.name && isMaintenanceCollected(payment)).reduce((sum, payment) => sum + Number(payment.paymentAmount), 0));
  return <><PageHeading eyebrow="FINANCIAL REPORTING" title="Reports" description="Quarterly and annual activity for your April–March financial year." actions={<button className="button button-primary" onClick={onExport}><Download size={16} /> Export workbook</button>} /><div className="report-year-banner"><div className="report-year-mark">FY</div><div><span>FINANCIAL YEAR</span><strong>{financialYear()}</strong><small>01 April {fiscalStart} — 31 March {fiscalStart + 1}</small></div><div className="report-year-status"><span className="live-dot" /> In progress</div></div><div className="period-row report-filter-row"><div className="period-title"><CalendarDays size={16} /><span>Report period</span></div><div className="quarter-tabs">{['All quarters', 'Q1', 'Q2', 'Q3', 'Q4'].map((item) => <button key={item} className={quarter === item ? 'selected' : ''} onClick={() => setQuarter(item)}>{item}</button>)}</div></div><section className="report-metrics"><div><span>TOTAL EXPENSES</span><strong>{money(expenseTotal)}</strong><small>{expenses.length} requests</small></div><div><span>PAYMENTS MADE</span><strong>{money(paymentTotal)}</strong><small>{payments.length} transactions</small></div><div><span>NET MOVEMENT</span><strong>{money(paymentTotal - expenseTotal)}</strong><small>Payments less expenses</small></div><div><span>OPEN APPROVALS</span><strong>{expenses.filter((item) => item.status === 'Pending').length}</strong><small>Awaiting review</small></div></section><div className="report-quarter-grid">{quarters.map((item, index) => <div className={`quarter-report-card ${selectedQuarter === item.name ? 'quarter-card-active' : ''}`} key={item.name} onClick={() => setQuarter(selectedQuarter === item.name ? 'All quarters' : item.name)} role="button" tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && setQuarter(item.name)}><div className="quarter-card-head"><span>{item.name}</span><small>{item.dates}</small></div><strong>{money(quarterTotals[index])}</strong><span className="quarter-card-caption">Payments made</span><div className="quarter-mini-bars">{item.months.map((month, monthIndex) => <i key={month} style={{ height: `${24 + ((index + monthIndex * 2) % 4) * 13}%` }} />)}</div><div className="quarter-card-foot"><span>{item.months[0]} 01</span><span>{item.months[2]} {index === 3 ? '31' : '30'}</span></div></div>)}</div><div className="report-footnote"><CircleHelp size={15} /> Financial quarters: Q1 Apr–Jun · Q2 Jul–Sep · Q3 Oct–Dec · Q4 Jan–Mar</div></>;
}

function ReportsPage({ data, quarter, setQuarter, selectedFinancialYear, setSelectedFinancialYear, onExport, role }) {
  const expenses = data.expenses || [];
  const maintenance = data.maintenance || [];
  const selectedQuarter = quarter === 'All quarters' ? null : quarter;
  const selectedPayments = maintenance.filter((item) => (!selectedQuarter || item.quarter === selectedQuarter) && isMaintenanceCollected(item));
  const expenseTotal = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  const maintenanceTotal = selectedPayments.reduce((sum, item) => sum + Number(item.paymentAmount), 0);
  const pendingMaintenanceTotal = maintenance.filter((item) => (!selectedQuarter || item.quarter === selectedQuarter) && ['Pending', 'Pending Approval'].includes(item.status)).reduce((sum, item) => sum + Number(item.paymentAmount), 0);
  const quarterlyTotals = QUARTERS.map((name) => maintenance.filter((item) => item.quarter === name && isMaintenanceCollected(item)).reduce((sum, item) => sum + Number(item.paymentAmount), 0));
  const fyStart = Number(selectedFinancialYear.slice(0, 4));
  const monthlyNames = [['Apr', 'May', 'Jun'], ['Jul', 'Aug', 'Sep'], ['Oct', 'Nov', 'Dec'], ['Jan', 'Feb', 'Mar']];
  return <>
    <PageHeading eyebrow="FINANCIAL REPORTING" title="Reports" description={role === 'admin' ? 'Expense and maintenance activity for the April–March financial year.' : 'Your maintenance activity for the April–March financial year.'} actions={<button className="button button-primary" onClick={onExport}><Download size={16} /> Export workbook</button>} />
    <div className="report-year-banner"><div className="report-year-mark">FY</div><div><span>FINANCIAL YEAR</span><FinancialYearSelect value={selectedFinancialYear} onChange={setSelectedFinancialYear} /><small>01 April {fyStart} — 31 March {fyStart + 1}</small></div><div className="report-year-status"><span className="live-dot" /> Selected period</div></div>
    <div className="period-row report-filter-row"><div className="period-title"><CalendarDays size={16} /><span>Report period</span></div><div className="quarter-tabs">{['All quarters', ...QUARTERS].map((item) => <button key={item} className={quarter === item ? 'selected' : ''} onClick={() => setQuarter(item)}>{item}</button>)}</div></div>
    <section className={`report-metrics ${role === 'owner' ? 'owner-report-metrics' : ''}`}>
      {role === 'admin' && <div><span>TOTAL EXPENSES</span><strong>{money(expenseTotal)}</strong><small>{expenses.length} records</small></div>}
      <div><span>MAINTENANCE COLLECTED</span><strong>{money(maintenanceTotal)}</strong><small>{selectedPayments.length} approved or paid records</small></div>
      {role === 'admin' ? <div><span>NET MOVEMENT</span><strong>{money(maintenanceTotal - expenseTotal)}</strong><small>Collection less expenses</small></div> : <div><span>MAINTENANCE PENDING</span><strong>{money(pendingMaintenanceTotal)}</strong><small>Pending payment records</small></div>}
      {role === 'admin' && <div><span>PENDING APPROVALS</span><strong>{expenses.filter((item) => item.status === 'Pending').length}</strong><small>Expense requests</small></div>}
    </section>
    <div className="report-quarter-grid">{QUARTERS.map((name, index) => {
      const quarterPayments = maintenance.filter((item) => item.quarter === name);
      const collected = quarterPayments.filter(isMaintenanceCollected);
      return <div className={`quarter-report-card ${selectedQuarter === name ? 'quarter-card-active' : ''}`} key={name}>
        <div className="quarter-card-head"><span>{name}</span><small>{monthlyNames[index].join(' — ').toUpperCase()}</small></div>
        <strong>{money(quarterlyTotals[index])}</strong><span className="quarter-card-caption">{collected.length} of {quarterPayments.length} collected</span>
        <div className="quarter-mini-bars">{monthlyNames[index].map((month) => <i key={month} style={{ height: `${collected.length ? 35 + (collected.length % 4) * 13 : 4}%` }} />)}</div>
        <div className="quarter-card-foot"><span>₹1,500 / quarter</span><span>{money(quarterPayments.filter((item) => ['Pending', 'Pending Approval'].includes(item.status)).reduce((sum, item) => sum + Number(item.paymentAmount), 0))} pending</span></div>
      </div>;
    })}</div>
    <div className="report-footnote"><CircleHelp size={15} /> Quarterly maintenance is ₹1,500 per house.{role === 'admin' ? ' Expense Details has no date column, so total expenses include all workbook records.' : ''}</div>
  </>;
}

function EmptyState({ text }) { return <div className="empty-state"><Search size={20} /><span>{text}</span></div>; }

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKeyDown = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><div><span>SSN COMMUNITY / TREASURY</span><h2>{title}</h2></div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></div>{children}</section></div>;
}

function OwnerDetail({ owner, maintenance = [], viewOnly = false, onEdit, onDelete }) {
  const sortedMaintenance = [...maintenance].sort((left, right) => String(right.createdDate || '').localeCompare(String(left.createdDate || '')));
  const completedTotal = maintenance.filter(isMaintenanceCollected).reduce((sum, payment) => sum + Number(payment.paymentAmount), 0);
  const pendingTotal = maintenance.filter((payment) => ['Pending', 'Pending Approval'].includes(payment.status)).reduce((sum, payment) => sum + Number(payment.paymentAmount), 0);
  return <div className="expense-detail">
    <div className="detail-top"><span className="owner-avatar">{owner.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span><span className="mono-cell">{owner.id}</span></div>
    <h3>{owner.name}</h3>
    <div className="detail-grid">
      <span>Phase</span><strong>{owner.phase}</strong>
      {!viewOnly && <><span>User name</span><strong>{owner.username || '—'}</strong></>}
      <span>Plot number</span><strong>{owner.plotNumber}</strong>
      {!viewOnly && <>
      <span>Mobile</span><strong>{owner.phone || '—'}</strong>
      <span>Email</span><strong>{owner.email || '—'}</strong>
      <span>Secondary mobile</span><strong>{owner.secondaryPhone || '—'}</strong>
      <span>Secondary email</span><strong>{owner.secondaryEmail || '—'}</strong>
      <span>Address</span><strong>{owner.address || '—'}</strong>
      <span>Move-In Date</span><strong>{owner.moveInDate ? shortDate(owner.moveInDate) : '—'}</strong>
      <span>Created</span><strong>{shortDate(owner.createdDate)} · {owner.createdBy || '—'}</strong>
      </>}
    </div>
    {!viewOnly && <section className="owner-payment-section" aria-labelledby="owner-payment-heading">
      <div className="owner-payment-heading"><div><h3 id="owner-payment-heading">Maintenance payment details</h3><p>Quarterly payment history for this owner.</p></div><span>{maintenance.length} records</span></div>
      <div className="payment-summary owner-payment-summary"><div><span>COMPLETED</span><strong>{money(completedTotal)}</strong></div><div><span>PENDING</span><strong>{money(pendingTotal)}</strong></div><div><span>QUARTERLY CHARGE</span><strong>{money(QUARTERLY_MAINTENANCE_AMOUNT)}</strong></div></div>
      <div className="panel listing-panel owner-payment-panel"><div className="table-wrap"><table className="data-table"><thead><tr><th>FINANCIAL YEAR</th><th>QUARTER</th><th>TITLE</th><th>AMOUNT</th><th>STATUS</th><th>CREATED</th></tr></thead><tbody>{sortedMaintenance.map((payment) => <tr key={payment.id}><td>{payment.financialYear || 'Unassigned'}</td><td><span className="quarter-badge">{payment.quarter}</span></td><td>{payment.title}</td><td className="amount-cell">{money(payment.paymentAmount)}</td><td><StatusPill status={payment.status} /></td><td>{shortDate(payment.createdDate)}</td></tr>)}</tbody></table>{sortedMaintenance.length === 0 && <EmptyState text="No maintenance payment records for this owner." />}</div></div>
    </section>}
    {!viewOnly && <div className="detail-actions"><button className="button button-quiet button-danger" onClick={() => onDelete(owner)}><Trash2 size={15} /> Delete owner</button><button className="button button-primary" onClick={onEdit}>Edit owner details</button></div>}
  </div>;
}

function ExpenseDetail({ expense, canReview, onUpdate, onPay, onDelete, busy }) {
  return <div className="expense-detail">
    <div className="detail-top"><StatusPill status={expense.status} /><span className="mono-cell">{expense.id}</span></div>
    <h3>{expense.title || expense.description}</h3>
    <div className="detail-amount">{money(expense.amount)}</div>
    <div className="detail-grid">
      <span>Requested by</span><strong>{expense.owner || expense.requestedBy || '—'}</strong>
      <span>Expense type</span><strong>{expense.expenseType || '—'}</strong>
      <span>Description</span><strong>{expense.description || '—'}</strong>
      <span>Comment</span><strong>{expense.comment || '—'}</strong>
      <span>Approved by</span><strong>{expense.approvedBy || '—'}</strong>
      <span>Financial Year</span><strong>{expense.financialYear || 'Unassigned'}</strong>
      {(expense.evidenceFile || expense.attachmentFile) && <><span>Evidence</span><strong><ExpenseAttachmentLink filename={expense.evidenceFile || expense.attachmentFile} originalName={expense.evidenceName || expense.attachmentName} /></strong></>}
    </div>
    {expense.status === 'Pending' && canReview && <div className="detail-actions"><button className="button button-quiet" onClick={() => onUpdate(expense, 'Rejected')} disabled={busy}>Reject</button><button className="button button-primary" onClick={() => onUpdate(expense, 'Approved')} disabled={busy}><Check size={16} /> Approve request</button></div>}
    {expense.status === 'Pending' && !canReview && <div className="detail-actions"><p>Your request is waiting for treasury review.</p></div>}
    {expense.status === 'Approved' && canReview && <div className="detail-actions"><button className="button button-primary" onClick={onPay} disabled={busy}><Check size={16} /> Mark as paid</button></div>}
    {canReview && <div className="detail-actions"><button className="button button-quiet button-danger" onClick={() => onDelete(expense)} disabled={busy}><Trash2 size={15} /> Delete request</button></div>}
  </div>;
}

function ExpenseAttachmentLink({ filename, originalName }) {
  const [attachmentUrl, setAttachmentUrl] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    const session = readSession();
    if (!session?.access_token) return undefined;
    fetch(`${API_URL}/expenses/attachments/${encodeURIComponent(filename)}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).then((response) => {
      if (!response.ok) throw new Error('Attachment is unavailable.');
      return response.blob();
    }).then((blob) => {
      objectUrl = URL.createObjectURL(blob);
      if (active) setAttachmentUrl(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch(() => {
      if (active) setAttachmentUrl('');
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [filename]);

  return attachmentUrl
    ? <a className="attachment-link" href={attachmentUrl} target="_blank" rel="noreferrer">{originalName || 'View attachment'}</a>
    : <span className="evidence-hint">Loading attachment...</span>;
}

export default App;