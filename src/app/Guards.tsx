import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CustomerShell from './CustomerShell';
import AdminShell from './AdminShell';
import PageTransition from '../components/premium/PageTransition';
import { LogoMark } from '../components/Logo';

function Loading() {
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-2xl grad-btn opacity-20 blur-lg animate-pulse" />
          <LogoMark size={48} className="relative" />
        </div>
        <div className="h-6 w-6 rounded-full border-2 border-[var(--color-brand-indigo)] border-t-transparent animate-spin" />
      </div>
    </div>
  );
}

// Customer area — opens directly into the product. Guests can browse; booking
// actions prompt sign-in inside the pages. Only a CONFIRMED admin (user present
// AND role admin) is redirected to the console — this prevents redirect loops
// caused by transient/optimistic state.
export function CustomerGate({ children }: { children: React.ReactNode }) {
  const { user, loading, role } = useAuth();
  if (loading) return <Loading />;
  if (user && role === 'admin') return <Navigate to="/admin" replace />;
  return <CustomerShell><PageTransition>{children}</PageTransition></CustomerShell>;
}

// Admin area — admins only. Wait for a settled state before deciding.
export function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, loading, role } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/welcome" replace />;
  if (role !== 'admin') return <Navigate to="/" replace />;
  return <AdminShell><PageTransition>{children}</PageTransition></AdminShell>;
}
