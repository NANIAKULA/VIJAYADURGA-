# Security Specification — MemberLedger

## Data Invariants
1. **Strict Admin Isolation**: Only verified admin accounts (`naniakulaat16@gmail.com` or UIDs explicitly registered in `/admins/{uid}`) can create, update, or delete member KYC profiles, payment records, or Google Workspace sync configurations.
2. **Member PII Isolation**: Members can only read (`get` / `list`) their own `/members` document and their own `/payments` records where `email_verified == true` and `email` matches `request.auth.token.email`. Members cannot list or view any other member's Aadhaar, PAN, Voter ID, email, or payment history.
3. **Read-Only Member Financial Integrity**: Members cannot create, update, or delete `/payments` records or `/members` records (preventing self-marking ₹100 dues as paid or tampering with KYC details).
4. **Strict Timestamp & Schema Enforcement**: All writes enforce `request.time` for `createdAt`/`updatedAt`, strict `hasAll`/`hasOnly` key allowlists, string length bounds, and regex validation on `memberCode`, `aadhaarNumber`, `panNumber`, `voterId`, and `month`.

## Dirty Dozen Adversarial Payloads
1. **Unauthenticated Read on `/members`**: `auth = null` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoof**: `auth.token.email = "naniakulaat16@gmail.com"`, `email_verified = false` -> `PERMISSION_DENIED`.
3. **Cross-Member Profile Snooping**: Member A (`a@example.com`) reads Member B's document (`b@example.com`) -> `PERMISSION_DENIED`.
4. **Unscoped List Scraping**: Member A calls `getDocs(collection(db, 'members'))` without `where('email', '==', 'a@example.com')` -> `PERMISSION_DENIED`.
5. **Self-Payment Fraud**: Member A attempts `setDoc` or `updateDoc` on `/payments/MEM001_2026-11` to set `status: "paid"` -> `PERMISSION_DENIED`.
6. **Privilege Escalation**: Member A attempts `setDoc` on `/admins/{uid}` -> `PERMISSION_DENIED`.
7. **Shadow Field Injection**: Admin attempts to write extra unknown field `isSuperAdmin: true` to `/members/{id}` -> `PERMISSION_DENIED`.
8. **ID Poisoning**: Attempt to write `/members/` with a 500-char or invalid-char document ID -> `PERMISSION_DENIED`.
9. **Invalid Aadhaar/PAN Format**: Writing `aadhaarNumber: "123"` or `panNumber: "BADPAN"` -> `PERMISSION_DENIED`.
10. **Amount Tampering**: Writing `/payments` with `amount: -500` or `amount: "100"` -> `PERMISSION_DENIED`.
11. **Backdated Timestamp Spoofing**: Writing `createdAt: "2020-01-01T00:00:00Z"` instead of `serverTimestamp()` -> `PERMISSION_DENIED`.
12. **Settings Exfiltration**: Non-admin user attempts to read `/settings/workspaceSync` -> `PERMISSION_DENIED`.
