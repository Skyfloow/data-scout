import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';

import React, { lazy, Suspense, useMemo } from 'react';
import { createBrowserRouter, RouterProvider, ScrollRestoration, Outlet } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Box, CircularProgress } from '@mui/material';
import { Provider } from 'react-redux';
import { store } from './store';
import { ThemeModeProvider, useThemeMode } from './context/ThemeContext';
import DashboardLayout from './components/layout/DashboardLayout';
import { createAppTheme } from './theme';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const MonitoringPage = lazy(() => import('./pages/MonitoringPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ProductDetailPage = lazy(() => import('./pages/ProductDetailPage'));

function RouteFallback() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
      <CircularProgress size={28} />
    </Box>
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
    </DashboardLayout>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        path: "/",
        element: (
          <LazyRoute>
            <DashboardPage />
          </LazyRoute>
        ),
      },
      {
        path: "monitoring",
        element: (
          <LazyRoute>
            <MonitoringPage />
          </LazyRoute>
        ),
      },
      {
        path: "settings",
        element: (
          <LazyRoute>
            <SettingsPage />
          </LazyRoute>
        ),
      },
      {
        path: "product/:id",
        element: (
          <LazyRoute>
            <ProductDetailPage />
          </LazyRoute>
        ),
      },
    ],
  }
]);

function ThemedApp() {
  const { mode } = useThemeMode();

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}

function App() {
  return (
    <Provider store={store}>
      <ThemeModeProvider>
        <ThemedApp />
      </ThemeModeProvider>
    </Provider>
  );
}

export default App;
