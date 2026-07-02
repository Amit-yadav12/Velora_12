import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './lib/theme';
import { AuthProvider } from './contexts/AuthContext';
import { LocationProvider } from './contexts/LocationContext';
import { handleGoogleRedirect } from './lib/googleAuth';
import { CustomerGate, AdminGate } from './app/Guards';
import AuroraBackground from './components/premium/AuroraBackground';

// Customer (product-first) pages — Home eager, rest lazy for fast first paint
import Home from './pages/customer/Home';
import Welcome from './pages/customer/Welcome';
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

handleGoogleRedirect();

function Fallback() {
  return <div className="min-h-[60vh] grid place-items-center"><div className="h-8 w-8 rounded-full border-2 border-[var(--color-brand-indigo)] border-t-transparent animate-spin" /></div>;
}
const S = (el: React.ReactNode) => <Suspense fallback={<Fallback />}>{el}</Suspense>;
const C = (el: React.ReactNode) => <CustomerGate>{S(el)}</CustomerGate>;
const A = (el: React.ReactNode) => <AdminGate>{S(el)}</AdminGate>;

export default function App() {
  return (
    <ThemeProvider>
      <AuroraBackground />
      <AuthProvider>
        <LocationProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/welcome" element={<Welcome />} />

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
