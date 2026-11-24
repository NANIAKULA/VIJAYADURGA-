import {
  AADHAAR_REGEX,
  EMAIL_REGEX,
  MEMBER_CODE_REGEX,
  MONTH_REGEX,
  PAN_REGEX,
  VOTER_REGEX,
  type MemberInput,
  type ValidationResult,
} from '../types';

export function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function getCurrentYear(): string {
  return String(new Date().getFullYear());
}

export function getYearMonths(year: string): string[] {
  return Array.from({ length: 12 }, (_, idx) => `${year}-${String(idx + 1).padStart(2, '0')}`);
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatMonthShort(monthKey: string): string {
  const [y, m] = monthKey.split('-');
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11) return monthKey;
  return `${SHORT_MONTHS[idx]} ${y}`;
}

export function formatMonthNameOnly(monthKey: string): string {
  const [, m] = monthKey.split('-');
  const idx = Number(m) - 1;
  if (idx < 0 || idx > 11) return monthKey;
  return FULL_MONTHS[idx];
}

export function formatCurrencyINR(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function maskAadhaar(aadhaar: string, reveal = false): string {
  const clean = aadhaar.replace(/\D/g, '');
  if (clean.length !== 12) return aadhaar;
  if (reveal) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 8)} ${clean.slice(8, 12)}`;
  }
  return `XXXX XXXX ${clean.slice(8, 12)}`;
}

export function maskPan(pan: string, reveal = false): string {
  const clean = pan.trim().toUpperCase();
  if (clean.length !== 10 || reveal) return clean;
  return `${clean.slice(0, 2)}XXXX${clean.slice(6)}`;
}

export function generateReceiptNumber(memberCode: string, month: string): string {
  const cleanMonth = month.replace('-', '');
  const cleanCode = memberCode.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const suffix = String(Date.now()).slice(-4);
  return `ML-${cleanMonth}-${cleanCode}-${suffix}`;
}

export function sanitizeMemberInput(raw: MemberInput): MemberInput {
  return {
    memberCode: raw.memberCode.trim().toUpperCase().slice(0, 20),
    fullName: raw.fullName.trim().slice(0, 120),
    email: raw.email.trim().toLowerCase().slice(0, 160),
    phone: raw.phone.trim().slice(0, 20),
    aadhaarNumber: raw.aadhaarNumber.replace(/\D/g, '').slice(0, 12),
    panNumber: raw.panNumber.trim().toUpperCase().slice(0, 10),
    voterId: raw.voterId.replace(/\s+/g, '').toUpperCase().slice(0, 20),
    address: raw.address ? raw.address.trim().slice(0, 300) : '',
    joinedMonth: raw.joinedMonth.trim().slice(0, 7),
    status: raw.status === 'inactive' ? 'inactive' : 'active',
  };
}

export function validateMemberInput(input: MemberInput): ValidationResult {
  const clean = sanitizeMemberInput(input);
  const errors: Record<string, string> = {};

  if (clean.memberCode.length < 3 || !MEMBER_CODE_REGEX.test(clean.memberCode)) {
    errors.memberCode = 'Use 3–20 uppercase letters, digits, or hyphens (e.g. MEM-001).';
  }
  if (clean.fullName.length < 2) {
    errors.fullName = 'Full name must be at least 2 characters.';
  }
  if (!EMAIL_REGEX.test(clean.email)) {
    errors.email = 'Enter a valid email address.';
  }
  if (clean.phone.length < 8 || clean.phone.length > 20) {
    errors.phone = 'Enter a valid phone number (8–20 characters).';
  }
  if (!AADHAAR_REGEX.test(clean.aadhaarNumber)) {
    errors.aadhaarNumber = 'Aadhaar ID must be exactly 12 digits.';
  }
  if (!PAN_REGEX.test(clean.panNumber)) {
    errors.panNumber = 'PAN must match format ABCDE1234F.';
  }
  if (!VOTER_REGEX.test(clean.voterId)) {
    errors.voterId = 'Voter ID must be 6–20 alphanumeric characters.';
  }
  if (!MONTH_REGEX.test(clean.joinedMonth)) {
    errors.joinedMonth = 'Joined month must be YYYY-MM.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function slugifyMemberDocId(memberCode: string): string {
  const clean = memberCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  return `mem_${clean || Date.now()}`;
}

export function isMonthDueForMember(joinedMonth: string, targetMonth: string): boolean {
  if (!MONTH_REGEX.test(joinedMonth) || !MONTH_REGEX.test(targetMonth)) return true;
  return targetMonth >= joinedMonth;
}
