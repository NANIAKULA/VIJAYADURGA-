import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  LogOut,
  Receipt,
  User as UserIcon,
} from 'lucide-react';
import { MONTHLY_FEE_INR, type Member, type MonthlyPayment } from '../types';
import { downloadMemberSummaryReceiptPdf } from '../lib/receiptPdf';
import {
  formatCurrencyINR,
  formatMonthNameOnly,
  getCurrentYear,
  getYearMonths,
  isMonthDueForMember,
  maskAadhaar,
  maskPan,
} from '../lib/utils';

interface MemberDashboardProps {
  member: Member;
  payments: MonthlyPayment[];
  userEmail: string;
  onLogout: () => Promise<void>;
}

export function MemberDashboard({
  member,
  payments,
  userEmail,
  onLogout,
}: MemberDashboardProps) {
  const currentYear = getCurrentYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [revealKyc, setRevealKyc] = useState(false);
  const [mobileTab, setMobileTab] = useState<'payments' | 'profile'>('payments');

  const years = useMemo(() => {
    const startYear = Number(member.joinedMonth.slice(0, 4)) || Number(currentYear);
    const curr = Number(currentYear);
    const set = new Set<string>([currentYear]);
    for (let y = startYear; y <= curr + 1; y++) {
      set.add(String(y));
    }
    return Array.from(set).sort();
  }, [member.joinedMonth, currentYear]);

  const yearMonths = useMemo(() => getYearMonths(selectedYear), [selectedYear]);

  const paymentMap = useMemo(() => {
    const map = new Map<string, MonthlyPayment>();
    for (const p of payments) {
      map.set(p.month, p);
    }
    return map;
  }, [payments]);

  const stats = useMemo(() => {
    let paidMonths = 0;
    let pendingMonths = 0;
    for (const m of yearMonths) {
      if (!isMonthDueForMember(member.joinedMonth, m)) continue;
      const rec = paymentMap.get(m);
      if (rec && rec.status === 'paid') {
        paidMonths += 1;
      } else {
        pendingMonths += 1;
      }
    }
    return {
      paidMonths,
      pendingMonths,
      totalPaid: paidMonths * MONTHLY_FEE_INR,
      totalPending: pendingMonths * MONTHLY_FEE_INR,
    };
  }, [yearMonths, member.joinedMonth, paymentMap]);

  const handleDownloadReceipt = () => {
    downloadMemberSummaryReceiptPdf(member, payments, selectedYear);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 lg:pb-12">
      {/* Top Bar Contract: 3 zones */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-8">
          <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display">
            MemberLedger
          </span>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a href="#payment-history" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              Payment History
            </a>
            <a href="#personal-profile" className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0">
              My KYC Profile
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-xs text-slate-500 truncate max-w-[180px]">
              {userEmail}
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50 transition-colors cursor-pointer inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-6">
        {/* Member Header & Receipt CTA */}
        <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono">{member.memberCode}</span>
              <span aria-hidden="true">·</span>
              <span>Joined {member.joinedMonth}</span>
              <span aria-hidden="true">·</span>
              <span>{member.status === 'active' ? 'Active Member' : 'Inactive'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1 text-balance">
              {member.fullName}
            </h1>
          </div>

          <button
            type="button"
            onClick={handleDownloadReceipt}
            className="min-h-[46px] px-5 py-2.5 rounded-xl bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 transition-colors cursor-pointer inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            Download Summary Receipt (PDF)
          </button>
        </section>

        {/* 4-Column KPI Summary Strip */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <p className="text-xs text-slate-500">Monthly Contribution</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
              {formatCurrencyINR(MONTHLY_FEE_INR)}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <p className="text-xs text-slate-500">Paid Months ({selectedYear})</p>
            <p className="text-xl sm:text-2xl font-bold text-emerald-700 mt-1 font-mono tabular-nums">
              {stats.paidMonths} / {stats.paidMonths + stats.pendingMonths}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <p className="text-xs text-slate-500">Total Paid ({selectedYear})</p>
            <p className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 font-mono tabular-nums">
              {formatCurrencyINR(stats.totalPaid)}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
            <p className="text-xs text-slate-500">Pending Dues ({selectedYear})</p>
            <p
              className={`text-xl sm:text-2xl font-bold mt-1 font-mono tabular-nums ${
                stats.totalPending > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {formatCurrencyINR(stats.totalPending)}
            </p>
          </div>
        </section>

        {/* Main 2-Column Content (Responsive to Mobile Tabs) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Payment History Ledger */}
          <section
            id="payment-history"
            className={`lg:col-span-7 bg-white border border-slate-200 rounded-2xl overflow-hidden ${
              mobileTab === 'payments' ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Monthly Payment History</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Check which months are paid and verify your receipt numbers.
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
                {years.map((y) => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => setSelectedYear(y)}
                    className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer font-mono tabular-nums ${
                      selectedYear === y
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {yearMonths.map((monthKey) => {
                const isDue = isMonthDueForMember(member.joinedMonth, monthKey);
                const rec = paymentMap.get(monthKey);
                const isPaid = rec?.status === 'paid';

                return (
                  <div
                    key={monthKey}
                    className="px-5 sm:px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {formatMonthNameOnly(monthKey)} {selectedYear}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                        {!isDue ? (
                          <span>Prior to joining ({member.joinedMonth})</span>
                        ) : isPaid ? (
                          <>
                            <span className="font-mono">{rec?.receiptNumber || 'Receipt Issued'}</span>
                            <span aria-hidden="true">·</span>
                            <span>{rec?.paymentMode || 'UPI'}</span>
                            {rec?.paidAt && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">{rec.paidAt.slice(0, 10)}</span>
                              </>
                            )}
                          </>
                        ) : (
                          <span>Monthly due of {formatCurrencyINR(MONTHLY_FEE_INR)}</span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {!isDue ? (
                        <span className="text-xs text-slate-400">Not enrolled</span>
                      ) : isPaid ? (
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Paid · {formatCurrencyINR(MONTHLY_FEE_INR)}</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                          <Clock className="w-4 h-4 shrink-0" />
                          <span>Pending · {formatCurrencyINR(MONTHLY_FEE_INR)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Personal KYC Profile (Strictly Owner-Only) */}
          <section
            id="personal-profile"
            className={`lg:col-span-5 bg-white border border-slate-200 rounded-2xl overflow-hidden ${
              mobileTab === 'profile' ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Personal KYC Details</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Visible only to you and the group admin.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRevealKyc((v) => !v)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {revealKyc ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {revealKyc ? 'Mask IDs' : 'Reveal IDs'}
              </button>
            </div>

            <dl className="divide-y divide-slate-100 text-sm">
              <div className="px-5 sm:px-6 py-3.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500">Member Code</dt>
                <dd className="font-mono font-medium text-slate-900">{member.memberCode}</dd>
              </div>
              <div className="px-5 sm:px-6 py-3.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500">Email ID</dt>
                <dd className="text-slate-900 truncate max-w-[220px]">{member.email}</dd>
              </div>
              <div className="px-5 sm:px-6 py-3.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500">Phone</dt>
                <dd className="font-mono tabular-nums text-slate-900">{member.phone}</dd>
              </div>
              <div className="px-5 sm:px-6 py-3.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500">Aadhaar ID</dt>
                <dd className="font-mono tabular-nums text-slate-900">
                  {maskAadhaar(member.aadhaarNumber, revealKyc)}
                </dd>
              </div>
              <div className="px-5 sm:px-6 py-3.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500">PAN Card</dt>
                <dd className="font-mono text-slate-900">
                  {maskPan(member.panNumber, revealKyc)}
                </dd>
              </div>
              <div className="px-5 sm:px-6 py-3.5 flex items-center justify-between gap-4">
                <dt className="text-slate-500">Voter ID</dt>
                <dd className="font-mono text-slate-900">{member.voterId}</dd>
              </div>
              {member.address && (
                <div className="px-5 sm:px-6 py-3.5 space-y-1">
                  <dt className="text-slate-500 text-xs">Address</dt>
                  <dd className="text-slate-800 text-sm leading-relaxed">{member.address}</dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar (<= 15% height, >=44px touch targets) */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
        aria-label="Member navigation"
      >
        <div className="grid grid-cols-2 h-16">
          <button
            type="button"
            onClick={() => setMobileTab('payments')}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium cursor-pointer ${
              mobileTab === 'payments' ? 'text-blue-900' : 'text-slate-500'
            }`}
          >
            <Receipt className="w-5 h-5" />
            <span>Payment History</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('profile')}
            className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium cursor-pointer ${
              mobileTab === 'profile' ? 'text-blue-900' : 'text-slate-500'
            }`}
          >
            <UserIcon className="w-5 h-5" />
            <span>My KYC Profile</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
