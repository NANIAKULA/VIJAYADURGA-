import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { type Member, type MemberInput } from '../types';
import { getCurrentMonth, sanitizeMemberInput, validateMemberInput } from '../lib/utils';

interface MemberFormModalProps {
  open: boolean;
  editingMember: Member | null;
  nextMemberCode: string;
  onSave: (input: MemberInput, existingId?: string) => Promise<void>;
  onClose: () => void;
}

export function MemberFormModal({
  open,
  editingMember,
  nextMemberCode,
  onSave,
  onClose,
}: MemberFormModalProps) {
  const [form, setForm] = useState<MemberInput>(() =>
    editingMember
      ? {
          memberCode: editingMember.memberCode,
          fullName: editingMember.fullName,
          email: editingMember.email,
          phone: editingMember.phone,
          aadhaarNumber: editingMember.aadhaarNumber,
          panNumber: editingMember.panNumber,
          voterId: editingMember.voterId,
          address: editingMember.address || '',
          joinedMonth: editingMember.joinedMonth,
          status: editingMember.status,
        }
      : {
          memberCode: nextMemberCode,
          fullName: '',
          email: '',
          phone: '',
          aadhaarNumber: '',
          panNumber: '',
          voterId: '',
          address: '',
          joinedMonth: getCurrentMonth(),
          status: 'active',
        }
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const check = validateMemberInput(form);
    if (!check.valid) {
      setErrors(check.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await onSave(sanitizeMemberInput(form), editingMember?.id);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save member.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full sm:max-w-2xl bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {editingMember ? `Edit Member · ${editingMember.memberCode}` : 'Add New Member'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close form"
            className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {submitError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800">
              {submitError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Member Code *</label>
              <input
                type="text"
                value={form.memberCode}
                onChange={(e) => setForm({ ...form, memberCode: e.target.value.toUpperCase() })}
                placeholder="MEM-001"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
              {errors.memberCode && <p className="text-xs text-red-600 mt-1">{errors.memberCode}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Ravi Kumar"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
              {errors.fullName && <p className="text-xs text-red-600 mt-1">{errors.fullName}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Email ID *</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="ravi@example.com"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
              {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number *</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+91 9876543210"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
              {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Aadhaar ID (12 digits) *</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={12}
                value={form.aadhaarNumber}
                onChange={(e) =>
                  setForm({ ...form, aadhaarNumber: e.target.value.replace(/\D/g, '').slice(0, 12) })
                }
                placeholder="123456789012"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
              {errors.aadhaarNumber && <p className="text-xs text-red-600 mt-1">{errors.aadhaarNumber}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">PAN Card *</label>
              <input
                type="text"
                maxLength={10}
                value={form.panNumber}
                onChange={(e) => setForm({ ...form, panNumber: e.target.value.toUpperCase().slice(0, 10) })}
                placeholder="ABCDE1234F"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
              {errors.panNumber && <p className="text-xs text-red-600 mt-1">{errors.panNumber}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Voter ID (EPIC) *</label>
              <input
                type="text"
                maxLength={20}
                value={form.voterId}
                onChange={(e) =>
                  setForm({ ...form, voterId: e.target.value.replace(/\s+/g, '').toUpperCase() })
                }
                placeholder="ABC1234567"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
              {errors.voterId && <p className="text-xs text-red-600 mt-1">{errors.voterId}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Joined Month (YYYY-MM) *</label>
              <input
                type="month"
                value={form.joinedMonth}
                onChange={(e) => setForm({ ...form, joinedMonth: e.target.value })}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
              {errors.joinedMonth && <p className="text-xs text-red-600 mt-1">{errors.joinedMonth}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Residential Address</label>
              <input
                type="text"
                maxLength={300}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="Street, City, State, PIN"
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Membership Status</label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value === 'inactive' ? 'inactive' : 'active' })
                }
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 cursor-pointer disabled:opacity-60"
            >
              {saving ? 'Saving...' : editingMember ? 'Save Changes' : 'Add Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
