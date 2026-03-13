import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router-dom';
import { Provider } from 'react-redux';
import DashboardLayout from './components/layout/DashboardLayout';
import { ThemeModeProvider } from './context/ThemeContext';
import { CompareProvider } from './context/CompareContext';
import CompareWidget from './components/CompareWidget';
import { store } from './store';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage'));
const ComparePage = lazy(() => import('./pages/ComparePage'));

function RouteFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
      <span className="loader loader-dark" />
    </div>
  );
}

function LazyRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

function RootLayout() {
  return (
    <DashboardLayout>
      <ScrollRestoration />
      <Outlet />
      <CompareWidget />
    </DashboardLayout>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        path: '/',
        element: (
          <LazyRoute>
            <DashboardPage />
          </LazyRoute>
        ),
      },
      {
        path: 'settings',
        element: (
          <LazyRoute>
            <SettingsPage />
          </LazyRoute>
        ),
      },
      {
        path: 'product/:id',
        element: (
          <LazyRoute>
            <ProductDetailPage />
          </LazyRoute>
        ),
      },
      {
        path: 'compare',
        element: (
          <LazyRoute>
            <ComparePage />
          </LazyRoute>
        ),
      },
    ],
  },
]);

export default function App() {
  return (
    <Provider store={store}>
      <ThemeModeProvider>
        <CompareProvider>
          <RouterProvider router={router} />
        </CompareProvider>
      </ThemeModeProvider>
    </Provider>
  );
}
