import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  MAX_MEMBERS_CAPACITY,
  MONTHLY_FEE_INR,
  PRIMARY_ADMIN_EMAIL,
  type Member,
  type MemberInput,
  type MonthlyPayment,
  type PaymentMode,
  type PaymentStatus,
  type WorkspaceSyncConfig,
} from '../types';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  generateReceiptNumber,
  sanitizeMemberInput,
  slugifyMemberDocId,
  validateMemberInput,
} from './utils';

export async function checkUserIsAdmin(uid: string, email: string | null | undefined): Promise<boolean> {
  if (email && email.toLowerCase() === PRIMARY_ADMIN_EMAIL) {
    return true;
  }
  const path = `admins/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function subscribeAllMembers(
  onData: (members: Member[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'members';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: Member[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Member, 'id'>),
      }));
      list.sort((a, b) => a.memberCode.localeCompare(b.memberCode));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export function subscribeMemberByEmail(
  email: string,
  onData: (member: Member | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'members';
  const normalized = email.trim().toLowerCase();
  const q = query(collection(db, path), where('email', '==', normalized));
  return onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        onData(null);
        return;
      }
      const d = snapshot.docs[0];
      onData({
        id: d.id,
        ...(d.data() as Omit<Member, 'id'>),
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export function subscribeAllPayments(
  onData: (payments: MonthlyPayment[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'payments';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list: MonthlyPayment[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MonthlyPayment, 'id'>),
      }));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export function subscribePaymentsByMemberEmail(
  email: string,
  onData: (payments: MonthlyPayment[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'payments';
  const normalized = email.trim().toLowerCase();
  const q = query(collection(db, path), where('memberEmail', '==', normalized));
  return onSnapshot(
    q,
    (snapshot) => {
      const list: MonthlyPayment[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<MonthlyPayment, 'id'>),
      }));
      list.sort((a, b) => a.month.localeCompare(b.month));
      onData(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export function subscribeSyncConfig(
  onData: (config: WorkspaceSyncConfig | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = 'settings/workspaceSync';
  return onSnapshot(
    doc(db, 'settings', 'workspaceSync'),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      onData(snapshot.data() as WorkspaceSyncConfig);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        if (onError && wrapped instanceof Error) onError(wrapped);
      }
    }
  );
}

export async function saveMember(
  rawInput: MemberInput,
  existingId?: string,
  currentTotalMembers = 0
): Promise<string> {
  const validation = validateMemberInput(rawInput);
  if (!validation.valid) {
    const firstMsg = Object.values(validation.errors)[0] || 'Invalid member details.';
    throw new Error(firstMsg);
  }

  const clean = sanitizeMemberInput(rawInput);

  if (!existingId && currentTotalMembers >= MAX_MEMBERS_CAPACITY) {
    throw new Error(`Member capacity limit of ${MAX_MEMBERS_CAPACITY} members reached.`);
  }

  const docId = existingId || slugifyMemberDocId(clean.memberCode);
  const path = `members/${docId}`;
  const ref = doc(db, 'members', docId);

  try {
    if (existingId) {
      await updateDoc(ref, {
        memberCode: clean.memberCode,
        fullName: clean.fullName,
        email: clean.email,
        phone: clean.phone,
        aadhaarNumber: clean.aadhaarNumber,
        panNumber: clean.panNumber,
        voterId: clean.voterId,
        address: clean.address || '',
        joinedMonth: clean.joinedMonth,
        status: clean.status,
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingSnap = await getDoc(ref);
      if (existingSnap.exists()) {
        throw new Error(`Member code ${clean.memberCode} already exists.`);
      }
      await setDoc(ref, {
        memberCode: clean.memberCode,
        fullName: clean.fullName,
        email: clean.email,
        phone: clean.phone,
        aadhaarNumber: clean.aadhaarNumber,
        panNumber: clean.panNumber,
        voterId: clean.voterId,
        address: clean.address || '',
        joinedMonth: clean.joinedMonth,
        status: clean.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return docId;
  } catch (error) {
    if (error instanceof Error && (error.message.includes('already exists') || error.message.includes('capacity limit'))) {
      throw error;
    }
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function removeMember(memberId: string): Promise<void> {
  const path = `members/${memberId}`;
  try {
    await deleteDoc(doc(db, 'members', memberId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function bulkImportMembers(
  rows: MemberInput[],
  existingMembers: Member[]
): Promise<{ imported: number; skipped: number }> {
  const existingCodes = new Set(existingMembers.map((m) => m.memberCode.toUpperCase()));
  const existingEmails = new Set(existingMembers.map((m) => m.email.toLowerCase()));
  const validRows: MemberInput[] = [];
  let skipped = 0;

  for (const row of rows) {
    if (existingMembers.length + validRows.length >= MAX_MEMBERS_CAPACITY) {
      skipped += 1;
      continue;
    }
    const clean = sanitizeMemberInput(row);
    const check = validateMemberInput(clean);
    if (!check.valid || existingCodes.has(clean.memberCode) || existingEmails.has(clean.email)) {
      skipped += 1;
      continue;
    }
    existingCodes.add(clean.memberCode);
    existingEmails.add(clean.email);
    validRows.push(clean);
  }

  if (validRows.length === 0) {
    return { imported: 0, skipped };
  }

  try {
    const batch = writeBatch(db);
    for (const item of validRows) {
      const docId = slugifyMemberDocId(item.memberCode);
      const ref = doc(db, 'members', docId);
      batch.set(ref, {
        memberCode: item.memberCode,
        fullName: item.fullName,
        email: item.email,
        phone: item.phone,
        aadhaarNumber: item.aadhaarNumber,
        panNumber: item.panNumber,
        voterId: item.voterId,
        address: item.address || '',
        joinedMonth: item.joinedMonth,
        status: item.status,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    return { imported: validRows.length, skipped };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'members');
  }
}

export async function markMonthlyPayment(
  member: Member,
  month: string,
  status: PaymentStatus,
  paymentMode: PaymentMode = 'UPI',
  notes?: string
): Promise<void> {
  const paymentId = `${member.id}_${month}`;
  const path = `payments/${paymentId}`;
  const ref = doc(db, 'payments', paymentId);

  try {
    const existingSnap = await getDoc(ref);
    if (status === 'paid') {
      const receiptNumber =
        existingSnap.exists() && existingSnap.data()?.receiptNumber
          ? String(existingSnap.data().receiptNumber)
          : generateReceiptNumber(member.memberCode, month);
      const paidAt = new Date().toISOString();

      const payload: Record<string, unknown> = {
        memberId: member.id,
        memberCode: member.memberCode,
        memberName: member.fullName,
        memberEmail: member.email.toLowerCase(),
        month,
        amount: MONTHLY_FEE_INR,
        status: 'paid',
        paymentMode,
        receiptNumber,
        paidAt,
        updatedAt: serverTimestamp(),
      };
      if (member.uid) payload.memberUid = member.uid;
      if (notes && notes.trim()) payload.notes = notes.trim().slice(0, 200);

      if (existingSnap.exists()) {
        await updateDoc(ref, payload);
      } else {
        await setDoc(ref, payload);
      }
    } else {
      if (existingSnap.exists()) {
        await updateDoc(ref, {
          memberCode: member.memberCode,
          memberName: member.fullName,
          memberEmail: member.email.toLowerCase(),
          amount: MONTHLY_FEE_INR,
          status: 'pending',
          paymentMode: deleteField(),
          receiptNumber: deleteField(),
          paidAt: deleteField(),
          notes: deleteField(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(ref, {
          memberId: member.id,
          memberCode: member.memberCode,
          memberName: member.fullName,
          memberEmail: member.email.toLowerCase(),
          month,
          amount: MONTHLY_FEE_INR,
          status: 'pending',
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveWorkspaceSyncConfig(config: WorkspaceSyncConfig): Promise<void> {
  const path = 'settings/workspaceSync';
  const ref = doc(db, 'settings', 'workspaceSync');
  try {
    const existingSnap = await getDoc(ref);
    const payload: Record<string, unknown> = {
      spreadsheetId: config.spreadsheetId.slice(0, 160),
      spreadsheetUrl: config.spreadsheetUrl.slice(0, 300),
      spreadsheetTitle: config.spreadsheetTitle.slice(0, 120),
      updatedAt: serverTimestamp(),
    };
    if (config.lastSyncedAt) payload.lastSyncedAt = config.lastSyncedAt.slice(0, 40);
    if (config.lastBackupFileId) payload.lastBackupFileId = config.lastBackupFileId.slice(0, 160);
    if (config.lastBackupAt) payload.lastBackupAt = config.lastBackupAt.slice(0, 40);

    if (existingSnap.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
