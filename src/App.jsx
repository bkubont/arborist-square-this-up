import { Toaster } from "@/components/ui/toaster"
import ApiErrors from '@/components/ApiErrors';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter, HashRouter, Route, Routes, Navigate } from 'react-router-dom';

const viteEnv = /** @type {{ env?: Record<string, string> }} */ (import.meta).env || {};
const Router = viteEnv.VITE_DESKTOP === 'true' ? HashRouter : BrowserRouter;
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';

import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import AppLayout from '@/components/AppLayout';
import Dashboard from '@/pages/Dashboard';
import Clients from '@/pages/Clients';
import ClientDetail from '@/pages/ClientDetail';
import JobDetail from '@/pages/JobDetail';
import AllJobs from '@/pages/AllJobs';
import ArchiveJobs from '@/pages/ArchiveJobs';
import ActiveJobs from '@/pages/ActiveJobs';
import Outstanding from '@/pages/Outstanding';
import ActionItems from '@/pages/ActionItems';
import JobBoard from '@/pages/JobBoard';
import CompanySettings from '@/pages/CompanySettings';
import Team from '@/pages/Team';
import Estimates from '@/pages/Estimates';
import ReadyToSchedule from '@/pages/ReadyToSchedule';
import { SchedulePage, ExpensesPage, ReceiptsPage, ReportsPage } from '@/pages/ShellPlaceholders';
import SignEstimate from '@/pages/SignEstimate';
import Privacy from '@/pages/Privacy';
import Support from '@/pages/Support';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

const AuthenticatedApp = () => {
  const { isLoadingAuth, authError, checkUserAuth } = useAuth();

  if (isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) return <div className="p-8 text-center"><p>{authError}</p><button className="underline" onClick={checkUserAuth}>Try again</button></div>;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/support" element={<Support />} />
      <Route path="/sign/:token" element={<SignEstimate />} />
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/jobs/active" element={<ActiveJobs />} />
          <Route path="/jobs/outstanding" element={<Outstanding />} />
          <Route path="/jobs/action-items" element={<ActionItems />} />
          <Route path="/jobs/board" element={<JobBoard />} />
          <Route path="/jobs/ready-to-schedule" element={<ReadyToSchedule />} />
          <Route path="/jobs/archive" element={<ArchiveJobs />} />
          <Route path="/jobs" element={<AllJobs />} />
          <Route path="/jobs/:id" element={<JobDetail />} />
          <Route path="/estimates" element={<Estimates />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/receipts" element={<ReceiptsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/team" element={<Team />} />
          <Route path="/settings" element={<CompanySettings />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  return (
    <AuthProvider>
      <ApiErrors />
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
