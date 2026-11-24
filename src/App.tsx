import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { Copy, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import {
  type Member,
  type MonthlyPayment,
  type UserRole,
  type WorkspaceSyncConfig,
} from './types';
import { logout, subscribeAuth } from './lib/firebase';
import {
  checkUserIsAdmin,
  subscribeAllMembers,
  subscribeAllPayments,
  subscribeMemberByEmail,
  subscribePaymentsByMemberEmail,
  subscribeSyncConfig,
} from './lib/firestoreService';
import { AdminDashboard } from './components/AdminDashboard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginView } from './components/LoginView';
import { MemberDashboard } from './components/MemberDashboard';

function AppShell() {
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  // Admin state
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [allPayments, setAllPayments] = useState<MonthlyPayment[]>([]);
  const [syncConfig, setSyncConfig] = useState<WorkspaceSyncConfig | null>(null);

  // Member state
  const [memberProfile, setMemberProfile] = useState<Member | null>(null);
  const [memberLoaded, setMemberLoaded] = useState(false);
  const [memberPayments, setMemberPayments] = useState<MonthlyPayment[]>([]);

  const [dataError, setDataError] = useState<Error | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  if (dataError) {
    throw dataError;
  }

  useEffect(() => {
    const unsub = subscribeAuth((currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      if (!currentUser) {
        setRole(null);
        setAllMembers([]);
        setAllPayments([]);
        setSyncConfig(null);
        setMemberProfile(null);
        setMemberLoaded(false);
        setMemberPayments([]);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;
    setRoleLoading(true);
    setMemberLoaded(false);

    checkUserIsAdmin(user.uid, user.email)
      .then((isAdmin) => {
        if (cancelled) return;
        setRole(isAdmin ? 'admin' : 'member');
      })
      .catch((err) => {
        if (cancelled) return;
        setDataError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setRoleLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  useEffect(() => {
    if (!authReady || !user || !role) return;

    if (role === 'admin') {
      const unsubMembers = subscribeAllMembers(setAllMembers, setDataError);
      const unsubPayments = subscribeAllPayments(setAllPayments, setDataError);
      const unsubSync = subscribeSyncConfig(setSyncConfig, setDataError);
      return () => {
        unsubMembers();
        unsubPayments();
        unsubSync();
      };
    }

    if (role === 'member' && user.email) {
      const unsubMember = subscribeMemberByEmail(
        user.email,
        (profile) => {
          setMemberProfile(profile);
          setMemberLoaded(true);
        },
        setDataError
      );
      const unsubPayments = subscribePaymentsByMemberEmail(
        user.email,
        setMemberPayments,
        setDataError
      );
      return () => {
        unsubMember();
        unsubPayments();
      };
    }
  }, [authReady, user, role]);

  const handleLogout = async () => {
    await logout();
  };

  if (!authReady || (user && roleLoading)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-900" />
          <span>Loading your workspace...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginView onLoginSuccess={() => {}} />;
  }

  if (role === 'admin') {
    return (
      <AdminDashboard
        members={allMembers}
        payments={allPayments}
        syncConfig={syncConfig}
        adminEmail={user.email || ''}
        onLogout={handleLogout}
      />
    );
  }

  if (!memberLoaded) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-900" />
          <span>Fetching your member profile...</span>
        </div>
      </div>
    );
  }

  if (!memberProfile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-5">
          <div className="flex items-center gap-3 text-amber-700">
            <ShieldAlert className="w-6 h-6 shrink-0" />
            <h1 className="text-lg font-semibold text-slate-900">Member Profile Not Found</h1>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            You are signed in as{' '}
            <span className="font-mono font-medium text-slate-900">{user.email}</span>, but your email is not registered in the 100-member directory yet. Ask your group Admin to add this exact email address to your profile.
          </p>
          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => {
                if (user.email) {
                  navigator.clipboard.writeText(user.email);
                  setCopiedEmail(true);
                  setTimeout(() => setCopiedEmail(false), 2000);
                }
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedEmail ? 'Copied Email' : 'Copy My Email'}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-900 text-white text-xs font-medium hover:bg-blue-800 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MemberDashboard
      member={memberProfile}
      payments={memberPayments}
      userEmail={user.email || ''}
      onLogout={handleLogout}
    />
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
