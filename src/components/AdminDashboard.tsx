import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { readSheet } from 'read-excel-file/browser';
import writeXlsxFile, { type Row } from 'write-excel-file/browser';
import {
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileSpreadsheet,
  HardDriveUpload,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Trash2,
  Upload,
  Users,
  Wallet,
} from 'lucide-react';
import {
  MAX_MEMBERS_CAPACITY,
  MONTHLY_FEE_INR,
  type Member,
  type MemberInput,
  type MonthlyPayment,
  type PaymentMode,
  type WorkspaceSyncConfig,
} from '../types';
import {
  bulkImportMembers,
  markMonthlyPayment,
  removeMember,
  saveMember,
  saveWorkspaceSyncConfig,
} from '../lib/firestoreService';
import { getWorkspaceAccessToken, signInWithGoogleForAdmin } from '../lib/firebase';
import { downloadMemberSummaryReceiptPdf } from '../lib/receiptPdf';
import {
  createMasterSpreadsheet,
  downloadLocalExcel,
  extractSpreadsheetId,
  fetchSpreadsheetMetadata,
  syncToGoogleSheet,
  uploadExcelBackupToDrive,
} from '../lib/workspaceSync';
import {
  formatCurrencyINR,
  formatMonthShort,
  getCurrentMonth,
  getCurrentYear,
  isMonthDueForMember,
  maskAadhaar,
} from '../lib/utils';
import { ConfirmModal } from './ConfirmModal';
import { MemberDetailDrawer } from './MemberDetailDrawer';
import { MemberFormModal } from './MemberFormModal';

interface AdminDashboardProps {
  members: Member[];
  payments: MonthlyPayment[];
  syncConfig: WorkspaceSyncConfig | null;
  adminEmail: string;
  onLogout: () => Promise<void>;
}

type AdminTab = 'members' | 'dues' | 'workspace' | 'apk';
type DuesFilter = 'all' | 'paid' | 'pending';

type PendingConfirmAction =
  | { type: 'delete-member'; member: Member }
  | { type: 'sync-sheet'; spreadsheetId: string; spreadsheetTitle: string }
  | { type: 'upload-drive' }
  | null;

export function AdminDashboard({
  members,
  payments,
  syncConfig,
  adminEmail,
  onLogout,
}: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>('members');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [duesFilter, setDuesFilter] = useState<DuesFilter>('all');
  const [quickPaymentMode, setQuickPaymentMode] = useState<PaymentMode>('UPI');

  const [formOpen, setFormOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [drawerMember, setDrawerMember] = useState<Member | null>(null);

  const [sheetLinkInput, setSheetLinkInput] = useState('');
  const [newSheetTitle, setNewSheetTitle] = useState(`MemberLedger Registry ${getCurrentYear()}`);
  const [workspaceTokenVersion, setWorkspaceTokenVersion] = useState(0);

  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirmAction>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const hasWorkspaceToken = useMemo(() => {
    void workspaceTokenVersion;
    return Boolean(getWorkspaceAccessToken());
  }, [workspaceTokenVersion]);

  const selectedYear = selectedMonth.slice(0, 4) || getCurrentYear();

  const paymentIndex = useMemo(() => {
    const map = new Map<string, MonthlyPayment>();
    for (const p of payments) {
      map.set(`${p.memberId}_${p.month}`, p);
    }
    return map;
  }, [payments]);

  const monthStats = useMemo(() => {
    let dueMembers = 0;
    let paidMembers = 0;
    let pendingMembers = 0;
    for (const m of members) {
      if (m.status !== 'active' || !isMonthDueForMember(m.joinedMonth, selectedMonth)) continue;
      dueMembers += 1;
      const rec = paymentIndex.get(`${m.id}_${selectedMonth}`);
      if (rec && rec.status === 'paid') {
        paidMembers += 1;
      } else {
        pendingMembers += 1;
      }
    }
    return {
      dueMembers,
      paidMembers,
      pendingMembers,
      collectedAmount: paidMembers * MONTHLY_FEE_INR,
      pendingAmount: pendingMembers * MONTHLY_FEE_INR,
    };
  }, [members, paymentIndex, selectedMonth]);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.fullName.toLowerCase().includes(q) ||
        m.memberCode.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        m.aadhaarNumber.includes(q) ||
        m.panNumber.toLowerCase().includes(q) ||
        m.voterId.toLowerCase().includes(q) ||
        m.phone.toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

  const duesRows = useMemo(() => {
    return filteredMembers
      .filter((m) => m.status === 'active' && isMonthDueForMember(m.joinedMonth, selectedMonth))
      .map((m) => {
        const rec = paymentIndex.get(`${m.id}_${selectedMonth}`);
        const isPaid = rec?.status === 'paid';
        return { member: m, record: rec, isPaid };
      })
      .filter((item) => {
        if (duesFilter === 'paid') return item.isPaid;
        if (duesFilter === 'pending') return !item.isPaid;
        return true;
      });
  }, [filteredMembers, paymentIndex, selectedMonth, duesFilter]);

  const nextMemberCode = useMemo(() => {
    const nextNum = members.length + 1;
    return `MEM-${String(nextNum).padStart(3, '0')}`;
  }, [members.length]);

  const showToast = (kind: 'success' | 'error', text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 5000);
  };

  const handleSaveMember = async (input: MemberInput, existingId?: string) => {
    await saveMember(input, existingId, members.length);
    showToast('success', existingId ? 'Member details updated.' : 'New member added.');
  };

  const handleToggleMonthPayment = async (
    member: Member,
    month: string,
    nextStatus: 'paid' | 'pending',
    mode: PaymentMode
  ) => {
    try {
      await markMonthlyPayment(member, month, nextStatus, mode);
      showToast(
        'success',
        `${member.fullName} marked ${nextStatus === 'paid' ? 'Paid (₹100)' : 'Pending'} for ${formatMonthShort(month)}.`
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Unable to update payment.');
    }
  };

  const handleDownloadSampleTemplate = async () => {
    const sampleRows: Row[] = [
      [
        { value: 'Member Code', fontWeight: 'bold' },
        { value: 'Full Name', fontWeight: 'bold' },
        { value: 'Email ID', fontWeight: 'bold' },
        { value: 'Phone Number', fontWeight: 'bold' },
        { value: 'Aadhaar ID', fontWeight: 'bold' },
        { value: 'PAN Card', fontWeight: 'bold' },
        { value: 'Voter ID', fontWeight: 'bold' },
        { value: 'Address', fontWeight: 'bold' },
        { value: 'Joined Month', fontWeight: 'bold' },
        { value: 'Status', fontWeight: 'bold' },
      ],
      [
        { value: 'MEM-001', type: String },
        { value: 'Aarav Sharma', type: String },
        { value: 'aarav.sharma@example.com', type: String },
        { value: '9876543210', type: String },
        { value: '123456789012', type: String },
        { value: 'ABCDE1234F', type: String },
        { value: 'ABC1234567', type: String },
        { value: 'Hyderabad, Telangana', type: String },
        { value: getCurrentMonth(), type: String },
        { value: 'active', type: String },
      ],
    ];
    await writeXlsxFile(sampleRows, { sheet: 'Members_Template' }).toFile(
      'MemberLedger_Import_Template.xlsx'
    );
  };

  const parseCsvLines = (text: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(cell.trim());
        cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i += 1;
        currentRow.push(cell.trim());
        if (currentRow.some((v) => v.length > 0)) rows.push(currentRow);
        currentRow = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
    if (cell.length > 0 || currentRow.length > 0) {
      currentRow.push(cell.trim());
      if (currentRow.some((v) => v.length > 0)) rows.push(currentRow);
    }
    return rows;
  };

  const handleFileImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setBusyMessage('Importing member sheet...');

    try {
      let matrix: unknown[][];
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text();
        matrix = parseCsvLines(text);
      } else {
        matrix = await readSheet(file);
      }

      if (matrix.length < 2) {
        throw new Error('The uploaded file has no data rows.');
      }

      const headers = matrix[0].map((h) => String(h ?? '').trim());
      const rawRows = matrix.slice(1).map((row) => {
        const obj: Record<string, string> = {};
        headers.forEach((key, idx) => {
          obj[key] = row[idx] !== undefined && row[idx] !== null ? String(row[idx]).trim() : '';
        });
        return obj;
      });

      const parsed: MemberInput[] = rawRows.map((r, idx) => ({
        memberCode:
          r['Member Code'] ||
          r['memberCode'] ||
          `MEM-${String(members.length + idx + 1).padStart(3, '0')}`,
        fullName: r['Full Name'] || r['fullName'] || r['Name'] || '',
        email: r['Email ID'] || r['Email'] || r['email'] || '',
        phone: r['Phone Number'] || r['Phone'] || r['phone'] || '',
        aadhaarNumber: r['Aadhaar ID'] || r['Aadhaar'] || r['aadhaarNumber'] || '',
        panNumber: r['PAN Card'] || r['PAN'] || r['panNumber'] || '',
        voterId: r['Voter ID'] || r['voterId'] || '',
        address: r['Address'] || r['address'] || '',
        joinedMonth: r['Joined Month'] || r['joinedMonth'] || getCurrentMonth(),
        status: (r['Status'] || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active',
      }));

      const result = await bulkImportMembers(parsed, members);
      showToast(
        result.imported > 0 ? 'success' : 'error',
        `Imported ${result.imported} member(s). Skipped ${result.skipped} invalid or duplicate row(s).`
      );
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to import file.');
    } finally {
      setBusyMessage(null);
    }
  };

  const handleReconnectWorkspace = async () => {
    try {
      await signInWithGoogleForAdmin();
      setWorkspaceTokenVersion((v) => v + 1);
      showToast('success', 'Google Sheets & Drive access connected for this session.');
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to connect Google Workspace.');
    }
  };

  const handleCreateMasterSheet = async () => {
    const token = getWorkspaceAccessToken();
    if (!token) {
      showToast('error', 'Connect Google Workspace access first.');
      return;
    }
    setBusyMessage('Creating Google Sheet...');
    try {
      const created = await createMasterSpreadsheet(
        token,
        newSheetTitle.trim() || `MemberLedger Registry ${selectedYear}`,
        selectedYear
      );
      await saveWorkspaceSyncConfig({
        spreadsheetId: created.spreadsheetId,
        spreadsheetUrl: created.spreadsheetUrl,
        spreadsheetTitle: created.title,
        lastSyncedAt: syncConfig?.lastSyncedAt,
        lastBackupFileId: syncConfig?.lastBackupFileId,
        lastBackupAt: syncConfig?.lastBackupAt,
      });
      showToast('success', `Created Google Sheet "${created.title}". Click Sync Now to populate rows.`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to create Google Sheet.');
    } finally {
      setBusyMessage(null);
    }
  };

  const handleLinkExistingSheet = async () => {
    const token = getWorkspaceAccessToken();
    if (!token) {
      showToast('error', 'Connect Google Workspace access first.');
      return;
    }
    const id = extractSpreadsheetId(sheetLinkInput);
    if (!id) {
      showToast('error', 'Paste a valid Google Sheet URL or Spreadsheet ID.');
      return;
    }
    setBusyMessage('Verifying Google Sheet...');
    try {
      const meta = await fetchSpreadsheetMetadata(token, id);
      await saveWorkspaceSyncConfig({
        spreadsheetId: meta.spreadsheetId,
        spreadsheetUrl: meta.spreadsheetUrl,
        spreadsheetTitle: meta.title,
        lastSyncedAt: syncConfig?.lastSyncedAt,
        lastBackupFileId: syncConfig?.lastBackupFileId,
        lastBackupAt: syncConfig?.lastBackupAt,
      });
      setSheetLinkInput('');
      showToast('success', `Linked Google Sheet "${meta.title}".`);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to link Google Sheet.');
    } finally {
      setBusyMessage(null);
    }
  };

  const executeConfirmedAction = async () => {
    if (!pendingConfirm) return;
    setConfirmBusy(true);
    try {
      if (pendingConfirm.type === 'delete-member') {
        await removeMember(pendingConfirm.member.id);
        showToast('success', `Removed ${pendingConfirm.member.fullName} from registry.`);
      } else if (pendingConfirm.type === 'sync-sheet') {
        const token = getWorkspaceAccessToken();
        if (!token) throw new Error('Workspace authorization expired. Please reconnect Google.');
        const info = await syncToGoogleSheet(
          token,
          pendingConfirm.spreadsheetId,
          members,
          payments,
          selectedYear
        );
        await saveWorkspaceSyncConfig({
          spreadsheetId: info.spreadsheetId,
          spreadsheetUrl: info.spreadsheetUrl,
          spreadsheetTitle: info.title,
          lastSyncedAt: new Date().toISOString(),
          lastBackupFileId: syncConfig?.lastBackupFileId,
          lastBackupAt: syncConfig?.lastBackupAt,
        });
        showToast('success', `Synced ${members.length} members & ${selectedYear} payments to Google Sheets.`);
      } else if (pendingConfirm.type === 'upload-drive') {
        const token = getWorkspaceAccessToken();
        if (!token) throw new Error('Workspace authorization expired. Please reconnect Google.');
        const uploaded = await uploadExcelBackupToDrive(token, members, payments, selectedYear);
        if (syncConfig) {
          await saveWorkspaceSyncConfig({
            ...syncConfig,
            lastBackupFileId: uploaded.fileId,
            lastBackupAt: new Date().toISOString(),
          });
        }
        showToast('success', `Uploaded "${uploaded.fileName}" to your Google Drive.`);
      }
      setPendingConfirm(null);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setConfirmBusy(false);
    }
  };

  const activeDrawerMember = useMemo(() => {
    if (!drawerMember) return null;
    return members.find((m) => m.id === drawerMember.id) || null;
  }, [drawerMember, members]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row pb-20 lg:pb-0">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200">
        <div className="h-16 px-6 border-b border-slate-200 flex items-center">
          <span className="text-lg font-bold tracking-tight text-slate-900 font-display">
            MemberLedger
          </span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors cursor-pointer ${
              activeTab === 'members'
                ? 'bg-blue-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>Members ({members.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dues')}
            className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors cursor-pointer ${
              activeTab === 'dues'
                ? 'bg-blue-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Wallet className="w-4 h-4 shrink-0" />
            <span>Monthly Dues</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('workspace')}
            className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors cursor-pointer ${
              activeTab === 'workspace'
                ? 'bg-blue-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Drive & Sheets</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('apk')}
            className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-3 transition-colors cursor-pointer ${
              activeTab === 'apk'
                ? 'bg-blue-900 text-white'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-4 h-4 shrink-0" />
            <span>Android APK Guide</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="text-xs text-slate-500 truncate">{adminEmail}</div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-bold text-slate-900 lg:hidden font-display">MemberLedger</span>
              <span className="text-slate-300 lg:hidden">/</span>
              <span className="font-medium text-slate-700">
                {activeTab === 'members'
                  ? 'Admin / Members Directory'
                  : activeTab === 'dues'
                  ? 'Admin / Monthly Dues'
                  : activeTab === 'workspace'
                  ? 'Admin / Google Drive & Sheets'
                  : 'Admin / Android APK Guide'}
              </span>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setEditingMember(null);
                  setFormOpen(true);
                }}
                disabled={members.length >= MAX_MEMBERS_CAPACITY}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-900 text-white text-xs sm:text-sm font-medium hover:bg-blue-800 transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                <span>Add Member</span>
              </button>
              <button
                type="button"
                onClick={onLogout}
                aria-label="Sign out"
                className="lg:hidden min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* Toast Feedback */}
          {(toast || busyMessage) && (
            <div
              className={`px-4 py-3 rounded-xl border text-xs sm:text-sm flex items-center justify-between gap-3 ${
                busyMessage
                  ? 'bg-blue-50 border-blue-200 text-blue-900'
                  : toast?.kind === 'error'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              <span>{busyMessage || toast?.text}</span>
            </div>
          )}

          {/* 4-Column KPI Strip */}
          <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
              <p className="text-xs text-slate-500">Registered Members</p>
              <p className="text-2xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
                {members.length} / {MAX_MEMBERS_CAPACITY}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
              <p className="text-xs text-slate-500">Collected ({formatMonthShort(selectedMonth)})</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1 font-mono tabular-nums">
                {formatCurrencyINR(monthStats.collectedAmount)}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
              <p className="text-xs text-slate-500">Pending Dues ({formatMonthShort(selectedMonth)})</p>
              <p className="text-2xl font-bold text-amber-700 mt-1 font-mono tabular-nums">
                {formatCurrencyINR(monthStats.pendingAmount)}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                {monthStats.pendingMembers} member(s) pending
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
              <p className="text-xs text-slate-500">Google Sheet Sync</p>
              <p className="text-sm font-semibold text-slate-900 mt-1.5 truncate">
                {syncConfig ? syncConfig.spreadsheetTitle : 'Not linked yet'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 truncate font-mono">
                {syncConfig?.lastSyncedAt ? `Synced ${syncConfig.lastSyncedAt.slice(0, 10)}` : 'Manual sync'}
              </p>
            </div>
          </section>

          {/* TAB 1: MEMBERS DIRECTORY */}
          {activeTab === 'members' && (
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, code, email, Aadhaar, PAN, Voter ID..."
                    className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadSampleTemplate}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Sample Excel
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.csv"
                    onChange={handleFileImport}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Bulk Import (.xlsx/.csv)
                  </button>
                </div>
              </div>

              {filteredMembers.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <p className="text-sm font-medium text-slate-900">
                    {members.length === 0 ? 'No members added yet' : 'No matching members found'}
                  </p>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {members.length === 0
                      ? 'Add your first member or bulk import up to 100 members from an Excel/CSV sheet.'
                      : 'Try clearing or adjusting your search query.'}
                  </p>
                  {members.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMember(null);
                        setFormOpen(true);
                      }}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-900 text-white text-xs font-medium hover:bg-blue-800 cursor-pointer"
                    >
                      Add First Member
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                        <th className="py-3 px-4 whitespace-nowrap">Code</th>
                        <th className="py-3 px-4 whitespace-nowrap">Member & Email</th>
                        <th className="py-3 px-4 whitespace-nowrap">Aadhaar ID</th>
                        <th className="py-3 px-4 whitespace-nowrap">PAN / Voter ID</th>
                        <th className="py-3 px-4 whitespace-nowrap">Joined</th>
                        <th className="py-3 px-4 whitespace-nowrap text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredMembers.map((m) => (
                        <tr
                          key={m.id}
                          onClick={() => setDrawerMember(m)}
                          className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                        >
                          <td className="py-3 px-4 font-mono text-xs font-medium text-slate-900 whitespace-nowrap">
                            {m.memberCode}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-900 leading-snug">{m.fullName}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {m.email} · {m.phone}
                            </p>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                            {maskAadhaar(m.aadhaarNumber, false)}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-700 whitespace-nowrap">
                            {m.panNumber} · {m.voterId}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-600 whitespace-nowrap">
                            {m.joinedMonth}
                          </td>
                          <td
                            className="py-3 px-4 text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                title="Edit member"
                                onClick={() => {
                                  setEditingMember(m);
                                  setFormOpen(true);
                                }}
                                className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                title="Delete member"
                                onClick={() => setPendingConfirm({ type: 'delete-member', member: m })}
                                className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* TAB 2: MONTHLY DUES TRACKER */}
          {activeTab === 'dues' && (
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Billing Month
                    </label>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-200 text-sm font-mono bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">
                      Payment Mode
                    </label>
                    <select
                      value={quickPaymentMode}
                      onChange={(e) => setQuickPaymentMode(e.target.value as PaymentMode)}
                      className="min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-200 text-sm bg-white"
                    >
                      <option value="UPI">UPI</option>
                      <option value="Cash">Cash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Online">Online</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start lg:self-end">
                  {(['all', 'pending', 'paid'] as DuesFilter[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setDuesFilter(f)}
                      className={`min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer capitalize ${
                        duesFilter === f
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {f === 'all'
                        ? `All (${monthStats.dueMembers})`
                        : f === 'pending'
                        ? `Pending (${monthStats.pendingMembers})`
                        : `Paid (${monthStats.paidMembers})`}
                    </button>
                  ))}
                </div>
              </div>

              {duesRows.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No members match this filter for {formatMonthShort(selectedMonth)}.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {duesRows.map(({ member, record, isPaid }) => (
                    <div
                      key={member.id}
                      className="px-4 sm:px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70"
                    >
                      <div
                        className="min-w-0 cursor-pointer"
                        onClick={() => setDrawerMember(member)}
                      >
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono font-medium text-slate-700">{member.memberCode}</span>
                          <span aria-hidden="true">·</span>
                          <span>{member.email}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-900 mt-0.5">{member.fullName}</p>
                        {isPaid && record?.receiptNumber && (
                          <p className="text-xs font-mono text-slate-500 mt-0.5">
                            {record.receiptNumber} · {record.paymentMode || 'UPI'} · {record.paidAt?.slice(0, 10)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            downloadMemberSummaryReceiptPdf(
                              member,
                              payments.filter((p) => p.memberId === member.id),
                              selectedYear
                            )
                          }
                          className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Receipt
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleToggleMonthPayment(
                              member,
                              selectedMonth,
                              isPaid ? 'pending' : 'paid',
                              quickPaymentMode
                            )
                          }
                          className={`min-h-[40px] px-4 py-1.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                            isPaid
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-blue-900 text-white hover:bg-blue-800'
                          }`}
                        >
                          {isPaid ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Paid ₹100
                            </>
                          ) : (
                            <>
                              <Clock className="w-3.5 h-3.5" />
                              Mark ₹100 Paid
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* TAB 3: GOOGLE DRIVE & SHEETS SYNC */}
          {activeTab === 'workspace' && (
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Google Sheets & Drive Sync (Admin Only)
                  </h2>
                  <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                    Maintain all 100 members&apos; personal KYC details and monthly ₹100 payment records in your Google Sheet and Drive Excel backups.
                  </p>
                </div>

                {!hasWorkspaceToken && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                    <p className="text-xs text-amber-900 leading-relaxed">
                      Google Sheets & Drive session permission is not active yet (tokens stay strictly in memory for security). Sign in with Google to authorize spreadsheet updates and Drive backups.
                    </p>
                    <button
                      type="button"
                      onClick={handleReconnectWorkspace}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-900 text-white text-xs font-medium hover:bg-blue-800 cursor-pointer"
                    >
                      Connect Google Sheets & Drive
                    </button>
                  </div>
                )}

                {syncConfig ? (
                  <div className="border border-slate-200 rounded-xl p-4 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">Linked Master Spreadsheet</p>
                        <p className="text-base font-semibold text-slate-900 truncate">
                          {syncConfig.spreadsheetTitle}
                        </p>
                        <p className="text-xs font-mono text-slate-500 mt-0.5 truncate">
                          ID: {syncConfig.spreadsheetId}
                        </p>
                      </div>
                      <a
                        href={syncConfig.spreadsheetUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 shrink-0"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open Sheet
                      </a>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        disabled={!hasWorkspaceToken}
                        onClick={() =>
                          setPendingConfirm({
                            type: 'sync-sheet',
                            spreadsheetId: syncConfig.spreadsheetId,
                            spreadsheetTitle: syncConfig.spreadsheetTitle,
                          })
                        }
                        className="min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Sync Members & {selectedYear} Payments Now
                      </button>

                      <button
                        type="button"
                        disabled={!hasWorkspaceToken}
                        onClick={() => setPendingConfirm({ type: 'upload-drive' })}
                        className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <HardDriveUpload className="w-4 h-4" />
                        Save .xlsx Backup to Drive
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl border border-slate-200 space-y-3">
                      <label className="block text-xs font-semibold text-slate-800">
                        Option 1: Create a New Master Google Sheet
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <input
                          type="text"
                          value={newSheetTitle}
                          onChange={(e) => setNewSheetTitle(e.target.value)}
                          placeholder="MemberLedger Registry 2026"
                          className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                        />
                        <button
                          type="button"
                          disabled={!hasWorkspaceToken}
                          onClick={handleCreateMasterSheet}
                          className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          Create Google Sheet
                        </button>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-200 space-y-3">
                      <label className="block text-xs font-semibold text-slate-800">
                        Option 2: Link an Existing Google Sheet URL or ID
                      </label>
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <input
                          type="text"
                          value={sheetLinkInput}
                          onChange={(e) => setSheetLinkInput(e.target.value)}
                          placeholder="https://docs.google.com/spreadsheets/d/..."
                          className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 text-sm"
                        />
                        <button
                          type="button"
                          disabled={!hasWorkspaceToken}
                          onClick={handleLinkExistingSheet}
                          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-medium hover:bg-slate-50 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          Link Sheet
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    Need an offline Excel copy right now?
                  </p>
                  <button
                    type="button"
                    onClick={() => downloadLocalExcel(members, payments, selectedYear)}
                    className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Local .xlsx ({selectedYear})
                  </button>
                </div>
              </div>

              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
                <h3 className="text-base font-semibold text-slate-900">What Gets Synced</h3>
                <ul className="space-y-3 text-xs text-slate-600 leading-relaxed">
                  <li>
                    <strong className="text-slate-900">Tab 1 (Members_KYC):</strong> Member Code, Full Name, Email ID, Phone, Aadhaar ID, PAN Card, Voter ID, Address, Joined Month, Status.
                  </li>
                  <li>
                    <strong className="text-slate-900">Tab 2 (Monthly_Payments_{selectedYear}):</strong> Member Code, Name, Email, Jan through Dec columns showing Paid (₹100) or Pending, plus Total Paid and Pending Dues totals.
                  </li>
                  <li>
                    <strong className="text-slate-900">Google Drive Backup:</strong> Exports a timestamped multi-tab Excel (.xlsx) file directly to your Google Drive.
                  </li>
                </ul>
              </div>
            </section>
          )}

          {/* TAB 4: ANDROID APK PACKAGING GUIDE */}
          {activeTab === 'apk' && (
            <section className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 max-w-4xl space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Packaging MemberLedger as an Android APK
                </h2>
                <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                  This project already includes <span className="font-mono text-slate-700">capacitor.config.json</span> and a mobile-ready layout. Run these steps locally with Android Studio installed to generate your installable <span className="font-mono text-slate-700">.apk</span> file.
                </p>
              </div>

              <ol className="space-y-4 text-sm text-slate-700">
                <li className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <p className="font-semibold text-slate-900">1. Install Capacitor & Build Web Bundle</p>
                  <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto">
{`npm install
npm install @capacitor/core @capacitor/cli @capacitor/android
npm run build`}
                  </pre>
                </li>
                <li className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <p className="font-semibold text-slate-900">2. Add Android Native Project & Sync</p>
                  <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto">
{`npx cap add android
npx cap sync android
npx cap open android`}
                  </pre>
                </li>
                <li className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <p className="font-semibold text-slate-900">3. Register Android SHA-1 & Build APK</p>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    In Android Studio, register your debug/release SHA-1 certificate fingerprint in Firebase Console for Google Sign-In inside the APK, then select{' '}
                    <span className="font-medium text-slate-900">Build → Build Bundle(s) / APK(s) → Build APK(s)</span>.
                  </p>
                </li>
              </ol>
            </section>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
        aria-label="Admin navigation"
      >
        <div className="grid grid-cols-4 h-16">
          <button
            type="button"
            onClick={() => setActiveTab('members')}
            className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium cursor-pointer ${
              activeTab === 'members' ? 'text-blue-900' : 'text-slate-500'
            }`}
          >
            <Users className="w-5 h-5" />
            <span>Members</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dues')}
            className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium cursor-pointer ${
              activeTab === 'dues' ? 'text-blue-900' : 'text-slate-500'
            }`}
          >
            <Wallet className="w-5 h-5" />
            <span>Dues</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('workspace')}
            className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium cursor-pointer ${
              activeTab === 'workspace' ? 'text-blue-900' : 'text-slate-500'
            }`}
          >
            <FileSpreadsheet className="w-5 h-5" />
            <span>Sheets</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('apk')}
            className={`flex flex-col items-center justify-center gap-1 text-[10px] font-medium cursor-pointer ${
              activeTab === 'apk' ? 'text-blue-900' : 'text-slate-500'
            }`}
          >
            <Smartphone className="w-5 h-5" />
            <span>APK</span>
          </button>
        </div>
      </nav>

      {/* Modals & Drawers */}
      <MemberFormModal
        key={editingMember ? editingMember.id : formOpen ? 'new' : 'closed'}
        open={formOpen}
        editingMember={editingMember}
        nextMemberCode={nextMemberCode}
        onSave={handleSaveMember}
        onClose={() => setFormOpen(false)}
      />

      <MemberDetailDrawer
        member={activeDrawerMember}
        payments={payments}
        onClose={() => setDrawerMember(null)}
        onTogglePayment={handleToggleMonthPayment}
      />

      <ConfirmModal
        open={pendingConfirm !== null}
        title={
          pendingConfirm?.type === 'delete-member'
            ? `Remove ${pendingConfirm.member.fullName}?`
            : pendingConfirm?.type === 'sync-sheet'
            ? 'Update Google Sheet Data?'
            : 'Upload Excel Backup to Google Drive?'
        }
        description={
          pendingConfirm?.type === 'delete-member'
            ? 'This permanently removes the member profile from your Firestore registry. Existing Google Sheet rows remain untouched until your next sync.'
            : pendingConfirm?.type === 'sync-sheet'
            ? `This will overwrite the Members_KYC and Monthly_Payments_${selectedYear} tabs inside "${pendingConfirm.spreadsheetTitle}".`
            : `This will create a new Excel (.xlsx) backup file in your Google Drive for year ${selectedYear}.`
        }
        details={
          pendingConfirm?.type === 'sync-sheet'
            ? [
                `• ${members.length} member KYC record(s) will be written to Members_KYC`,
                `• ${payments.length} payment record(s) will be reflected in Monthly_Payments_${selectedYear}`,
              ]
            : pendingConfirm?.type === 'upload-drive'
            ? [
                `• ${members.length} member(s) included in Members_KYC worksheet`,
                `• 12-month payment summary matrix for ${selectedYear}`,
              ]
            : undefined
        }
        confirmLabel={
          pendingConfirm?.type === 'delete-member'
            ? 'Remove Member'
            : pendingConfirm?.type === 'sync-sheet'
            ? 'Confirm Sync'
            : 'Upload Backup'
        }
        destructive={pendingConfirm?.type === 'delete-member'}
        busy={confirmBusy}
        onConfirm={executeConfirmedAction}
        onCancel={() => !confirmBusy && setPendingConfirm(null)}
      />
    </div>
  );
}
