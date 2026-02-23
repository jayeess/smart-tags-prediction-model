import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import PageSkeleton from "./components/PageSkeleton";
import ToastProvider from "./components/ToastProvider";

/* ── Lazy-loaded pages (code splitting) ─────────────────── */
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const AnalyzePage = lazy(() => import("./pages/AnalyzePage"));
const TableViewPage = lazy(() => import("./pages/TableViewPage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route
              index
              element={
                <SuspenseWrapper>
                  <DashboardPage />
                </SuspenseWrapper>
              }
            />
            <Route
              path="analyze"
              element={
                <SuspenseWrapper>
                  <AnalyzePage />
                </SuspenseWrapper>
              }
            />
            <Route
              path="tables"
              element={
                <SuspenseWrapper>
                  <TableViewPage />
                </SuspenseWrapper>
              }
            />
            <Route
              path="history"
              element={
                <SuspenseWrapper>
                  <HistoryPage />
                </SuspenseWrapper>
              }
            />
            <Route
              path="settings"
              element={
                <SuspenseWrapper>
                  <SettingsPage />
                </SuspenseWrapper>
              }
            />
          </Route>
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
