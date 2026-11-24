import writeXlsxFile, { type Row } from 'write-excel-file/browser';
import { MONTHLY_FEE_INR, type Member, type MonthlyPayment } from '../types';
import { formatMonthNameOnly, getYearMonths, isMonthDueForMember } from './utils';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

export interface SpreadsheetInfo {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  sheetTitles: string[];
}

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  return trimmed;
}

export async function fetchSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string
): Promise<SpreadsheetInfo> {
  const res = await fetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties.title`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Could not access Google Sheet (${res.status}): ${text}`);
  }
  const data = await res.json();
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
    title: data.properties?.title || 'MemberLedger Registry',
    sheetTitles: (data.sheets || []).map((s: { properties?: { title?: string } }) => s.properties?.title || ''),
  };
}

export async function createMasterSpreadsheet(
  accessToken: string,
  title: string,
  year: string
): Promise<SpreadsheetInfo> {
  const paymentsTab = `Monthly_Payments_${year}`;
  const res = await fetch(SHEETS_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [
        { properties: { title: 'Members_KYC' } },
        { properties: { title: paymentsTab } },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create Google Sheet (${res.status}): ${text}`);
  }
  const data = await res.json();
  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetUrl: data.spreadsheetUrl,
    title: data.properties?.title || title,
    sheetTitles: ['Members_KYC', paymentsTab],
  };
}

async function ensureTabsExist(
  accessToken: string,
  spreadsheetId: string,
  requiredTabs: string[]
): Promise<void> {
  const meta = await fetchSpreadsheetMetadata(accessToken, spreadsheetId);
  const missing = requiredTabs.filter((tab) => !meta.sheetTitles.includes(tab));
  if (missing.length === 0) return;

  const res = await fetch(`${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: missing.map((title) => ({
        addSheet: { properties: { title } },
      })),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to add worksheet tabs (${res.status}): ${text}`);
  }
}

export function buildKycRows(members: Member[]): (string | number)[][] {
  const header = [
    'Member Code',
    'Full Name',
    'Email ID',
    'Phone Number',
    'Aadhaar ID',
    'PAN Card',
    'Voter ID',
    'Address',
    'Joined Month',
    'Status',
  ];
  const rows = members.map((m) => [
    m.memberCode,
    m.fullName,
    m.email,
    m.phone,
    m.aadhaarNumber,
    m.panNumber,
    m.voterId,
    m.address || '',
    m.joinedMonth,
    m.status.toUpperCase(),
  ]);
  return [header, ...rows];
}

export function buildPaymentsMatrixRows(
  members: Member[],
  payments: MonthlyPayment[],
  year: string
): (string | number)[][] {
  const months = getYearMonths(year);
  const paymentMap = new Map<string, MonthlyPayment>();
  for (const p of payments) {
    paymentMap.set(`${p.memberId}_${p.month}`, p);
  }

  const header = [
    'Member Code',
    'Full Name',
    'Email ID',
    ...months.map((m) => `${formatMonthNameOnly(m)} ${year}`),
    'Total Paid (INR)',
    'Pending Dues (INR)',
  ];

  const rows = members.map((m) => {
    let totalPaid = 0;
    let totalPending = 0;
    const monthCells = months.map((monthKey) => {
      if (!isMonthDueForMember(m.joinedMonth, monthKey)) {
        return 'N/A';
      }
      const rec = paymentMap.get(`${m.id}_${monthKey}`);
      if (rec && rec.status === 'paid') {
        totalPaid += MONTHLY_FEE_INR;
        return `Paid (${MONTHLY_FEE_INR})`;
      }
      totalPending += MONTHLY_FEE_INR;
      return 'Pending';
    });

    return [
      m.memberCode,
      m.fullName,
      m.email,
      ...monthCells,
      totalPaid,
      totalPending,
    ];
  });

  return [header, ...rows];
}

async function clearAndWriteSheet(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  values: (string | number)[][]
): Promise<void> {
  const clearRes = await fetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(tabName)}:clear`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!clearRes.ok) {
    const text = await clearRes.text();
    throw new Error(`Failed clearing tab "${tabName}" (${clearRes.status}): ${text}`);
  }

  const updateRes = await fetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(`${tabName}!A1`)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `${tabName}!A1`,
        majorDimension: 'ROWS',
        values,
      }),
    }
  );
  if (!updateRes.ok) {
    const text = await updateRes.text();
    throw new Error(`Failed updating tab "${tabName}" (${updateRes.status}): ${text}`);
  }
}

export async function syncToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  members: Member[],
  payments: MonthlyPayment[],
  year: string
): Promise<SpreadsheetInfo> {
  const kycTab = 'Members_KYC';
  const paymentsTab = `Monthly_Payments_${year}`;
  await ensureTabsExist(accessToken, spreadsheetId, [kycTab, paymentsTab]);

  const kycRows = buildKycRows(members);
  const paymentRows = buildPaymentsMatrixRows(members, payments, year);

  await clearAndWriteSheet(accessToken, spreadsheetId, kycTab, kycRows);
  await clearAndWriteSheet(accessToken, spreadsheetId, paymentsTab, paymentRows);

  return fetchSpreadsheetMetadata(accessToken, spreadsheetId);
}

function toWriteExcelRows(matrix: (string | number)[][]): Row[] {
  return matrix.map((row, rowIdx) =>
    row.map((val) => ({
      value: val,
      fontWeight: rowIdx === 0 ? ('bold' as const) : undefined,
      type: typeof val === 'number' ? Number : String,
    }))
  );
}

export async function downloadLocalExcel(
  members: Member[],
  payments: MonthlyPayment[],
  year: string
): Promise<void> {
  const kycData = toWriteExcelRows(buildKycRows(members));
  const payData = toWriteExcelRows(buildPaymentsMatrixRows(members, payments, year));
  const fileName = `MemberLedger_${year}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  await writeXlsxFile([
    { sheet: 'Members_KYC', data: kycData },
    { sheet: `Payments_${year}`, data: payData },
  ]).toFile(fileName);
}

export async function uploadExcelBackupToDrive(
  accessToken: string,
  members: Member[],
  payments: MonthlyPayment[],
  year: string
): Promise<{ fileId: string; fileName: string }> {
  const kycData = toWriteExcelRows(buildKycRows(members));
  const payData = toWriteExcelRows(buildPaymentsMatrixRows(members, payments, year));
  const blob = await writeXlsxFile([
    { sheet: 'Members_KYC', data: kycData },
    { sheet: `Payments_${year}`, data: payData },
  ]).toBlob();

  const arrayBuffer = await blob.arrayBuffer();
  const fileName = `MemberLedger_Backup_${year}_${new Date().toISOString().slice(0, 10)}.xlsx`;

  const metadata = {
    name: fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };

  const boundary = '-------memberledger_multipart_boundary_98234';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart =
    `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const mediaHeader =
    `${delimiter}Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`;

  const encoder = new TextEncoder();
  const part1 = encoder.encode(metadataPart + mediaHeader);
  const part2 = new Uint8Array(arrayBuffer);
  const part3 = encoder.encode(closeDelimiter);

  const combined = new Uint8Array(part1.length + part2.length + part3.length);
  combined.set(part1, 0);
  combined.set(part2, part1.length);
  combined.set(part3, part1.length + part2.length);

  const res = await fetch(DRIVE_UPLOAD_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary="${boundary}"`,
    },
    body: combined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Drive upload failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    fileId: data.id,
    fileName: data.name || fileName,
  };
}
