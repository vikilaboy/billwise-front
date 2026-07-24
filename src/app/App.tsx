import {lazy, Suspense, type ComponentType} from "react";
import {Navigate, Route, Routes} from "react-router";
import {Spinner} from "@heroui/react";
import {session} from "../lib/api";
import {AppShell} from "../components/AppShell";
import {LoginPage} from "../pages/LoginPage";
import {SignupPage} from "../pages/SignupPage";
import {ForgotPasswordPage} from "../pages/ForgotPasswordPage";
import {ResetPasswordPage} from "../pages/ResetPasswordPage";
import {VerifyEmailPendingPage} from "../pages/VerifyEmailPendingPage";
import {AccountActivationPage} from "../pages/AccountActivationPage";
import {CompanyOnboardingPage} from "../pages/CompanyOnboardingPage";

// Route-level code splitting: each page (and its heavy deps — charts, timeline,
// data-grid) loads on navigation, keeping the initial bundle small.
const lazyNamed = (loader: () => Promise<Record<string, unknown>>, key: string) =>
  lazy(() => loader().then((m) => ({default: m[key] as ComponentType})));
const DashboardPage = lazyNamed(() => import("../pages/DashboardPage"), "DashboardPage");
const InvoicesPage = lazyNamed(() => import("../pages/InvoicesPage"), "InvoicesPage");
const InvoiceDetailPage = lazyNamed(() => import("../pages/InvoiceDetailPage"), "InvoiceDetailPage");
const NewInvoicePage = lazyNamed(() => import("../pages/NewInvoicePage"), "NewInvoicePage");
const RecurringPage = lazyNamed(() => import("../pages/RecurringPage"), "RecurringPage");
const CustomersPage = lazyNamed(() => import("../pages/CustomersPage"), "CustomersPage");
const BankAccountsPage = lazyNamed(() => import("../pages/BankAccountsPage"), "BankAccountsPage");
const InvoiceSeriesPage = lazyNamed(() => import("../pages/InvoiceSeriesPage"), "InvoiceSeriesPage");
const SettingsPage = lazyNamed(() => import("../pages/SettingsPage"), "SettingsPage");

const Protected = () => (session.token() ? <AppShell /> : <Navigate to="/login" replace />);

const PageFallback = () => (
  <div className="flex justify-center py-16 text-[var(--text-muted)]">
    <Spinner />
  </div>
);

export function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/inregistrare" element={<SignupPage />} />
        <Route path="/recuperare-parola" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        <Route path="/verifica-email" element={<VerifyEmailPendingPage />} />
        <Route path="/activare-cont" element={<AccountActivationPage />} />
        <Route element={<Protected />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/onboarding/firma" element={<CompanyOnboardingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/facturi" element={<InvoicesPage />} />
          <Route path="/facturi/noi" element={<NewInvoicePage />} />
          <Route path="/facturi/:id" element={<InvoiceDetailPage />} />
          <Route path="/recurente" element={<RecurringPage />} />
          <Route path="/clienti" element={<CustomersPage />} />
          <Route path="/conturi" element={<BankAccountsPage />} />
          <Route path="/serii" element={<InvoiceSeriesPage />} />
          <Route path="/setari" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
