import { useMemo, useState } from 'react';
import { CheckCircle2, Clock, Download, Eye, EyeOff, X } from 'lucide-react';
import { MONTHLY_FEE_INR, type Member, type MonthlyPayment, type PaymentMode } from '../types';
import { downloadMemberSummaryReceiptPdf } from '../lib/receiptPdf';
import {
  formatCurrencyINR,
  formatMonthNameOnly,
  getCurrentYear,
  getYearMonths,
  isMonthDueForMember,
  maskAadhaar,
} from '../lib/utils';

interface MemberDetailDrawerProps {
  member: Member | null;
  payments: MonthlyPayment[];
  onClose: () => void;
  onTogglePayment: (
    member: Member,
    month: string,
    nextStatus: 'paid' | 'pending',
    mode: PaymentMode
  ) => Promise<void>;
}

export function MemberDetailDrawer({
  member,
  payments,
  onClose,
  onTogglePayment,
}: MemberDetailDrawerProps) {
  const [selectedYear, setSelectedYear] = useState(getCurrentYear());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('UPI');
  const [revealAadhaar, setRevealAadhaar] = useState(false);
  const [busyMonth, setBusyMonth] = useState<string | null>(null);

  const memberPayments = useMemo(() => {
    if (!member) return [];
    return payments.filter((p) => p.memberId === member.id);
  }, [member, payments]);

  const paymentMap = useMemo(() => {
    const map = new Map<string, MonthlyPayment>();
    for (const p of memberPayments) {
      map.set(p.month, p);
    }
    return map;
  }, [memberPayments]);

  const months = useMemo(() => getYearMonths(selectedYear), [selectedYear]);

  if (!member) return null;

  const handleToggle = async (monthKey: string, currentlyPaid: boolean) => {
    setBusyMonth(monthKey);
    try {
      await onTogglePayment(member, monthKey, currentlyPaid ? 'pending' : 'paid', paymentMode);
    } finally {
      setBusyMonth(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl bg-white h-full flex flex-col border-l border-slate-200 shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-mono text-slate-500">{member.memberCode}</p>
            <h3 className="text-lg font-semibold text-slate-900 truncate">{member.fullName}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close member details"
            className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* KYC Summary */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">KYC & Contact Information</span>
              <button
                type="button"
                onClick={() => setRevealAadhaar((v) => !v)}
                className="text-xs font-medium text-blue-900 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                {revealAadhaar ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {revealAadhaar ? 'Mask Aadhaar' : 'Show Full Aadhaar'}
              </button>
            </div>
            <dl className="divide-y divide-slate-100 text-xs">
              <div className="px-4 py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Email</dt>
                <dd className="text-slate-900 font-medium">{member.email}</dd>
              </div>
              <div className="px-4 py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Phone</dt>
                <dd className="font-mono text-slate-900">{member.phone}</dd>
              </div>
              <div className="px-4 py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Aadhaar ID</dt>
                <dd className="font-mono tabular-nums text-slate-900">
                  {maskAadhaar(member.aadhaarNumber, revealAadhaar)}
                </dd>
              </div>
              <div className="px-4 py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">PAN Card</dt>
                <dd className="font-mono text-slate-900">{member.panNumber}</dd>
              </div>
              <div className="px-4 py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Voter ID</dt>
                <dd className="font-mono text-slate-900">{member.voterId}</dd>
              </div>
              <div className="px-4 py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500">Joined Month</dt>
                <dd className="font-mono text-slate-900">{member.joinedMonth}</dd>
              </div>
            </dl>
          </div>

          {/* Payment Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600">Year</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-mono bg-white"
              >
                {[Number(getCurrentYear()) - 1, Number(getCurrentYear()), Number(getCurrentYear()) + 1].map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>

              <label className="text-xs font-medium text-slate-600 ml-2">Mode</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-white"
              >
                <option value="UPI">UPI</option>
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Online">Online</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => downloadMemberSummaryReceiptPdf(member, memberPayments, selectedYear)}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              Download PDF Receipt
            </button>
          </div>

          {/* 12-Month Payment Rows */}
          <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
            {months.map((monthKey) => {
              const isDue = isMonthDueForMember(member.joinedMonth, monthKey);
              const rec = paymentMap.get(monthKey);
              const isPaid = rec?.status === 'paid';
              const isBusy = busyMonth === monthKey;

              return (
                <div
                  key={monthKey}
                  className="px-4 py-3 flex items-center justify-between gap-3 bg-white"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {formatMonthNameOnly(monthKey)} {selectedYear}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">
                      {isPaid
                        ? `${rec?.receiptNumber || 'Paid'} · ${rec?.paymentMode || 'UPI'}`
                        : isDue
                        ? `Due ${formatCurrencyINR(MONTHLY_FEE_INR)}`
                        : 'Before join date'}
                    </p>
                  </div>

                  {!isDue ? (
                    <span className="text-xs text-slate-400">N/A</span>
                  ) : (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleToggle(monthKey, isPaid)}
                      className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                        isPaid
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                          : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                      }`}
                    >
                      {isPaid ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{isBusy ? 'Updating...' : 'Paid ₹100'}</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5" />
                          <span>{isBusy ? 'Saving...' : 'Mark Paid ₹100'}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
