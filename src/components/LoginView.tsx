import { useState, type FormEvent } from 'react';
import { FileSpreadsheet, Lock, Receipt, ShieldCheck, Users } from 'lucide-react';
import {
  signInMemberEmailPassword,
  signInWithGoogleForAdmin,
  signInWithGoogleForMember,
} from '../lib/firebase';

interface LoginViewProps {
  onLoginSuccess: () => void;
}

function GoogleLogo() {
  return (
    <svg
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      style={{ display: 'block' }}
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

export function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [portalMode, setPortalMode] = useState<'member' | 'admin'>('member');
  const [memberAuthTab, setMemberAuthTab] = useState<'google' | 'email'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleMemberSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogleForMember();
      onLoginSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in with Google.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAdminSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogleForAdmin();
      onLoginSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in as Admin.');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInMemberEmailPassword(email, password);
      onLoginSuccess();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed.';
      if (msg.includes('operation-not-allowed')) {
        setError(
          'Email/Password sign-in is not enabled in Firebase Authentication yet. Enable Email/Password in Firebase Console or use Sign in with Google.'
        );
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <span className="text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display">
            MemberLedger
          </span>
          <span className="text-xs sm:text-sm text-slate-500 whitespace-nowrap">
            Monthly Fee: ₹100 · 100-Member Registry
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Context Column */}
          <div className="lg:col-span-6 flex flex-col justify-between bg-blue-950 text-white rounded-2xl p-7 sm:p-9">
            <div className="space-y-6">
              <div className="space-y-3">
                <p className="text-xs font-medium text-blue-200 tracking-wide">
                  Role-Separated Community Portal
                </p>
                <h1 className="text-3xl sm:text-4xl font-bold leading-tight text-balance">
                  Track 100 members, ₹100 monthly dues, and KYC records in one place.
                </h1>
                <p className="text-sm sm:text-base text-blue-100/90 leading-relaxed">
                  Members view only their personal profile, monthly payment status, and downloadable PDF receipts. Admins manage the full directory and sync directly with Google Sheets and Drive.
                </p>
              </div>

              <div className="space-y-4 pt-2 border-t border-blue-900/80">
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-blue-300 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-white">Isolated Member Access</p>
                    <p className="text-xs text-blue-200/80 mt-0.5">
                      Each member accesses only their own Aadhaar, PAN, Voter ID, and payment months.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Receipt className="w-5 h-5 text-blue-300 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-white">Instant Summary Receipts</p>
                    <p className="text-xs text-blue-200/80 mt-0.5">
                      Download annual PDF receipts listing paid months, receipt numbers, and pending dues.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <FileSpreadsheet className="w-5 h-5 text-blue-300 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-white">Admin Google Sheets & Drive Sync</p>
                    <p className="text-xs text-blue-200/80 mt-0.5">
                      Only the Admin connects Google Sheets and Excel backups in Google Drive.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-8 text-xs text-blue-200/75">
              Android APK ready via Capacitor · Secured by Firebase Auth & Firestore Rules
            </div>
          </div>

          {/* Right Auth Card */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 flex flex-col justify-center">
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Sign in to your dashboard</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Select your portal to continue.
                </p>
              </div>

              {/* Portal Switcher */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setPortalMode('member');
                    setError(null);
                  }}
                  className={`min-h-[44px] px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    portalMode === 'member'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Member Portal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPortalMode('admin');
                    setError(null);
                  }}
                  className={`min-h-[44px] px-3 py-2 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                    portalMode === 'admin'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Admin Portal
                </button>
              </div>

              {error && (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 leading-relaxed">
                  {error}
                </div>
              )}

              {portalMode === 'member' ? (
                <div className="space-y-5">
                  <div className="flex items-center gap-4 border-b border-slate-200">
                    <button
                      type="button"
                      onClick={() => setMemberAuthTab('google')}
                      className={`pb-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                        memberAuthTab === 'google'
                          ? 'border-blue-900 text-blue-900'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Google Sign-In
                    </button>
                    <button
                      type="button"
                      onClick={() => setMemberAuthTab('email')}
                      className={`pb-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                        memberAuthTab === 'email'
                          ? 'border-blue-900 text-blue-900'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Email & Password
                    </button>
                  </div>

                  {memberAuthTab === 'google' ? (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-600 leading-relaxed">
                        Sign in with the email address registered by your group admin. No Google Drive permissions are requested for members.
                      </p>
                      <button
                        type="button"
                        onClick={handleGoogleMemberSignIn}
                        disabled={loading}
                        className="gsi-material-button"
                      >
                        <div className="gsi-material-button-content-wrapper">
                          <div className="gsi-material-button-icon">
                            <GoogleLogo />
                          </div>
                          <span className="gsi-material-button-contents">
                            {loading ? 'Signing in...' : 'Sign in with Google'}
                          </span>
                        </div>
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleEmailSignIn} className="space-y-4">
                      <div>
                        <label htmlFor="member-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                          Registered Email ID
                        </label>
                        <input
                          id="member-email"
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="member@example.com"
                          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                        />
                      </div>
                      <div>
                        <label htmlFor="member-password" className="block text-xs font-medium text-slate-700 mb-1.5">
                          Password
                        </label>
                        <input
                          id="member-password"
                          type="password"
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Enter your password"
                          className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-900 text-white text-sm font-medium hover:bg-blue-800 transition-colors cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2"
                      >
                        <Lock className="w-4 h-4" />
                        {loading ? 'Signing in...' : 'Sign in with Email'}
                      </button>
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Requires Email/Password sign-in enabled in Firebase Console → Authentication → Sign-in method.
                      </p>
                    </form>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-blue-900 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Admin sign-in verifies your administrator account and grants session-only permission to sync member details to Google Sheets and Excel backups in Google Drive.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleAdminSignIn}
                    disabled={loading}
                    className="gsi-material-button"
                  >
                    <div className="gsi-material-button-content-wrapper">
                      <div className="gsi-material-button-icon">
                        <GoogleLogo />
                      </div>
                      <span className="gsi-material-button-contents">
                        {loading ? 'Connecting Admin...' : 'Sign in with Google (Admin)'}
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
