export const PRIMARY_ADMIN_EMAIL = 'naniakulaat16@gmail.com';
export const MONTHLY_FEE_INR = 100;
export const MAX_MEMBERS_CAPACITY = 100;

export const MEMBER_CODE_REGEX = /^[A-Z0-9-]+$/;
export const AADHAAR_REGEX = /^[0-9]{12}$/;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const VOTER_REGEX = /^[A-Z0-9]{6,20}$/;
export const MONTH_REGEX = /^[0-9]{4}-[0-9]{2}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type UserRole = 'admin' | 'member' | 'unregistered';
export type MemberStatus = 'active' | 'inactive';
export type PaymentStatus = 'paid' | 'pending';
export type PaymentMode = 'UPI' | 'Cash' | 'Bank Transfer' | 'Online';

export interface Member {
  id: string;
  memberCode: string;
  fullName: string;
  email: string;
  phone: string;
  aadhaarNumber: string;
  panNumber: string;
  voterId: string;
  address?: string;
  joinedMonth: string; // YYYY-MM
  status: MemberStatus;
  uid?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MemberInput {
  memberCode: string;
  fullName: string;
  email: string;
  phone: string;
  aadhaarNumber: string;
  panNumber: string;
  voterId: string;
  address?: string;
  joinedMonth: string;
  status: MemberStatus;
}

export interface MonthlyPayment {
  id: string; // `${memberId}_${month}`
  memberId: string;
  memberCode: string;
  memberName: string;
  memberEmail: string;
  memberUid?: string;
  month: string; // YYYY-MM
  amount: number;
  status: PaymentStatus;
  paymentMode?: PaymentMode;
  receiptNumber?: string;
  notes?: string;
  paidAt?: string;
  updatedAt?: unknown;
}

export interface WorkspaceSyncConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
  spreadsheetTitle: string;
  lastSyncedAt?: string;
  lastBackupFileId?: string;
  lastBackupAt?: string;
  updatedAt?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}
