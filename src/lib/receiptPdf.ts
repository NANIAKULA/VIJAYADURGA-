import { jsPDF } from 'jspdf';
import { MONTHLY_FEE_INR, type Member, type MonthlyPayment } from '../types';
import {
  formatMonthNameOnly,
  getYearMonths,
  isMonthDueForMember,
  maskAadhaar,
  maskPan,
} from './utils';

export function downloadMemberSummaryReceiptPdf(
  member: Member,
  payments: MonthlyPayment[],
  year: string
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const months = getYearMonths(year);
  const paymentMap = new Map<string, MonthlyPayment>();
  for (const p of payments) {
    paymentMap.set(p.month, p);
  }

  let paidCount = 0;
  let pendingCount = 0;
  const rows = months.map((monthKey) => {
    const isDue = isMonthDueForMember(member.joinedMonth, monthKey);
    const rec = paymentMap.get(monthKey);
    if (!isDue) {
      return {
        monthLabel: `${formatMonthNameOnly(monthKey)} ${year}`,
        fee: 'Rs. 0',
        status: 'NOT ENROLLED',
        mode: '-',
        receiptNo: '-',
        paidDate: '-',
      };
    }
    if (rec && rec.status === 'paid') {
      paidCount += 1;
      return {
        monthLabel: `${formatMonthNameOnly(monthKey)} ${year}`,
        fee: `Rs. ${MONTHLY_FEE_INR}`,
        status: 'PAID',
        mode: rec.paymentMode || 'UPI',
        receiptNo: rec.receiptNumber || '-',
        paidDate: rec.paidAt ? rec.paidAt.slice(0, 10) : '-',
      };
    }
    pendingCount += 1;
    return {
      monthLabel: `${formatMonthNameOnly(monthKey)} ${year}`,
      fee: `Rs. ${MONTHLY_FEE_INR}`,
      status: 'PENDING',
      mode: '-',
      receiptNo: '-',
      paidDate: '-',
    };
  });

  const totalPaid = paidCount * MONTHLY_FEE_INR;
  const totalPending = pendingCount * MONTHLY_FEE_INR;

  // Header Banner
  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, 210, 30, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('MemberLedger', 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Official Payment History & Summary Receipt (${year})`, 14, 21);

  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toISOString().slice(0, 10)}`, 196, 14, { align: 'right' });
  doc.text(`Member ID: ${member.memberCode}`, 196, 21, { align: 'right' });

  // Member Profile Block
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Member Profile', 14, 42);

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 44, 196, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const leftInfo = [
    `Full Name: ${member.fullName}`,
    `Email ID: ${member.email}`,
    `Phone: ${member.phone}`,
    `Joined Month: ${member.joinedMonth}`,
  ];
  const rightInfo = [
    `Member Code: ${member.memberCode}`,
    `Aadhaar ID: ${maskAadhaar(member.aadhaarNumber, false)}`,
    `PAN Card: ${maskPan(member.panNumber, false)}`,
    `Voter ID: ${member.voterId}`,
  ];

  leftInfo.forEach((line, idx) => doc.text(line, 14, 51 + idx * 6));
  rightInfo.forEach((line, idx) => doc.text(line, 112, 51 + idx * 6));

  // Financial Summary Boxes
  const summaryY = 80;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, summaryY, 58, 20, 2, 2, 'FD');
  doc.roundedRect(76, summaryY, 58, 20, 2, 2, 'FD');
  doc.roundedRect(138, summaryY, 58, 20, 2, 2, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('MONTHS PAID', 18, summaryY + 7);
  doc.text('TOTAL PAID', 80, summaryY + 7);
  doc.text('PENDING DUES', 142, summaryY + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(`${paidCount} / ${paidCount + pendingCount}`, 18, summaryY + 15);
  doc.setTextColor(21, 128, 61);
  doc.text(`Rs. ${totalPaid}`, 80, summaryY + 15);
  doc.setTextColor(pendingCount > 0 ? 180 : 21, pendingCount > 0 ? 83 : 128, pendingCount > 0 ? 9 : 61);
  doc.text(`Rs. ${totalPending}`, 142, summaryY + 15);

  // Payment History Table
  let y = 112;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`Monthly Contribution Ledger (${year})`, 14, y);
  y += 4;

  // Table header
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y, 182, 8, 'F');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Month', 17, y + 5.5);
  doc.text('Amount', 56, y + 5.5);
  doc.text('Status', 78, y + 5.5);
  doc.text('Mode', 105, y + 5.5);
  doc.text('Receipt Number', 128, y + 5.5);
  doc.text('Paid Date', 174, y + 5.5);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);

  rows.forEach((r, idx) => {
    if (idx % 2 === 1) {
      doc.setFillColor(250, 251, 253);
      doc.rect(14, y, 182, 8, 'F');
    }
    doc.setDrawColor(241, 245, 249);
    doc.line(14, y + 8, 196, y + 8);

    doc.setTextColor(15, 23, 42);
    doc.text(r.monthLabel, 17, y + 5.5);
    doc.text(r.fee, 56, y + 5.5);

    if (r.status === 'PAID') {
      doc.setTextColor(21, 128, 61);
    } else if (r.status === 'PENDING') {
      doc.setTextColor(180, 83, 9);
    } else {
      doc.setTextColor(148, 163, 184);
    }
    doc.text(r.status, 78, y + 5.5);

    doc.setTextColor(51, 65, 85);
    doc.text(r.mode, 105, y + 5.5);
    doc.text(r.receiptNo.slice(0, 24), 128, y + 5.5);
    doc.text(r.paidDate, 174, y + 5.5);
    y += 8;
  });

  // Footer
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text(
    'This is a system-generated summary receipt from MemberLedger. Monthly membership fee: Rs. 100.',
    14,
    280
  );

  doc.save(`MemberLedger_Receipt_${member.memberCode}_${year}.pdf`);
}
