import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './lib/theme';
import { AuthProvider } from './contexts/AuthContext';
import { LocationProvider } from './contexts/LocationContext';
import { CustomerGate, AdminGate } from './app/Guards';
import AuroraBackground from './components/premium/AuroraBackground';
import { ensureDemoOps, ensureDemoSeeded } from './lib/demoStore';

// Customer (product-first) pages — Home eager, rest lazy for fast first paint
import Home from './pages/customer/Home';
import Welcome from './pages/customer/Welcome';
import Verify from './pages/Verify';
const Explore = lazy(() => import('./pages/customer/Explore'));
const BusinessDetail = lazy(() => import('./pages/customer/BusinessDetail'));
const Appointments = lazy(() => import('./pages/customer/Appointments'));
const Notifications = lazy(() => import('./pages/customer/Notifications'));
const Profile = lazy(() => import('./pages/customer/Profile'));
const Settings = lazy(() => import('./pages/customer/Settings'));

// Admin pages — lazy (separate bundle)
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminAppointments = lazy(() => import('./pages/admin/AdminAppointments'));
const AdminBusinesses = lazy(() => import('./pages/admin/AdminBusinesses'));
const AdminServices = lazy(() => import('./pages/admin/AdminServices'));
const AdminStaff = lazy(() => import('./pages/admin/AdminStaff'));
const AdminCustomers = lazy(() => import('./pages/admin/AdminCustomers'));
const AdminEmails = lazy(() => import('./pages/admin/AdminEmails'));
const Audit = lazy(() => import('./pages/Audit'));

// NOTE: Google sign-in is intentionally INERT in the UI (the "Continue with
// Google" button is a visual/hover-only affordance). The OAuth helpers remain
// in src/lib/googleAuth.ts, unwired, ready to be re-enabled deliberately —
// `handleGoogleRedirect()` is therefore not called here so no URL parameter can
// silently start a Google session.

// Seed the isolated demo tenant (showcase businesses, services, staff and the
// sample operating dataset) at MODULE SCOPE — i.e. before the first render and
// before any page effect runs. Seeding inside an effect would run AFTER the
// child pages' data loads (React runs child effects first), leaving the very
// first dashboard/customer paint empty until something else triggered a reload.
try { ensureDemoSeeded(); ensureDemoOps(); } catch { /* non-fatal (private mode) */ }

function Fallback() {
  return <div className="min-h-[60vh] grid place-items-center"><div className="h-8 w-8 rounded-full border-2 border-[var(--color-brand-indigo)] border-t-transparent animate-spin" /></div>;
}
const S = (el: React.ReactNode) => <Suspense fallback={<Fallback />}>{el}</Suspense>;
const C = (el: React.ReactNode) => <CustomerGate>{S(el)}</CustomerGate>;
const A = (el: React.ReactNode) => <AdminGate>{S(el)}</AdminGate>;

// Reset scroll on every route change so navigations always start at the top.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  // Signal the boot watchdog (index.html) that first render committed.
  useEffect(() => {
    // Signal the boot watchdog (index.html) that first render committed.
    try { window.__veloraBooted = true; } catch { /* ignore */ }
  }, []);
  return (
    <ThemeProvider>
      <AuroraBackground />
      <AuthProvider>
        <LocationProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/verify/:token" element={<Verify />} />

            {/* Customer product — opens directly into the experience */}
            <Route path="/" element={<CustomerGate><Home /></CustomerGate>} />
            <Route path="/search" element={C(<Explore />)} />
            <Route path="/explore" element={C(<Explore />)} />
            <Route path="/business/:id" element={C(<BusinessDetail />)} />
            <Route path="/appointments" element={C(<Appointments />)} />
            <Route path="/notifications" element={C(<Notifications />)} />
            <Route path="/profile" element={C(<Profile />)} />
            <Route path="/settings" element={C(<Settings />)} />

            {/* Secure admin panel */}
            <Route path="/admin" element={A(<AdminDashboard />)} />
            <Route path="/admin/appointments" element={A(<AdminAppointments />)} />
            <Route path="/admin/businesses" element={A(<AdminBusinesses />)} />
            <Route path="/admin/services" element={A(<AdminServices />)} />
            <Route path="/admin/staff" element={A(<AdminStaff />)} />
            <Route path="/admin/customers" element={A(<AdminCustomers />)} />
            <Route path="/admin/emails" element={A(<AdminEmails />)} />
            <Route path="/admin/audit" element={A(<Audit />)} />

            {/* Catch-all — never dead-end */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </LocationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
