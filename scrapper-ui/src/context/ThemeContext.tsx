import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { App as AntApp, ConfigProvider, theme as antdTheme } from 'antd';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({ mode: 'light', toggleTheme: () => undefined });

const lightVars: Record<string, string> = {
  '--bg': '#ffffff',
  '--bg-elevated': '#ffffff',
  '--bg-soft': '#f4f4f5',
  '--fg': '#09090b',
  '--fg-muted': '#71717a',
  '--border': '#e4e4e7',
  '--primary': '#18181b', // Shadcn Primary: Zinc 900
  '--success': '#16a34a',
  '--warning': '#d97706',
  '--info': '#0ea5e9',
  '--danger': '#dc2626',
};

const darkVars: Record<string, string> = {
  '--bg': '#09090b',
  '--bg-elevated': '#18181b', // Shadcn Zinc 900 for elevated surfaces
  '--bg-soft': '#27272a',
  '--fg': '#fafafa',
  '--fg-muted': '#a1a1aa',
  '--border': '#27272a',
  '--primary': '#fafafa', // Shadcn Primary: Zinc 50
  '--success': '#22c55e',
  '--warning': '#f59e0b',
  '--info': '#38bdf8',
  '--danger': '#ef4444',
};

function applyCssVars(vars: Record<string, string>) {
  const root = document.documentElement;
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

export function useThemeMode() {
  return useContext(ThemeContext);
}

export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('theme-mode');
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', mode === 'dark');
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem('theme-mode', mode);
    applyCssVars(mode === 'dark' ? darkVars : lightVars);
  }, [mode]);

  const toggleTheme = useCallback(() => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const value = useMemo(() => ({ mode, toggleTheme }), [mode, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        theme={{
          algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
          token: {
            colorPrimary: mode === 'dark' ? '#fafafa' : '#18181b',
            colorTextLightSolid: mode === 'dark' ? '#09090b' : '#ffffff',
            borderRadius: 6,
            borderRadiusLG: 8,
            fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            colorText: mode === 'dark' ? '#fafafa' : '#09090b',
            colorTextSecondary: mode === 'dark' ? '#a1a1aa' : '#71717a',
            colorSuccess: mode === 'dark' ? '#22c55e' : '#16a34a',
            colorWarning: mode === 'dark' ? '#f59e0b' : '#d97706',
            colorError: mode === 'dark' ? '#ef4444' : '#dc2626',
            colorInfo: mode === 'dark' ? '#38bdf8' : '#0ea5e9',
            colorBgBase: mode === 'dark' ? '#09090b' : '#ffffff',
            colorBgContainer: mode === 'dark' ? '#09090b' : '#ffffff',
            colorBgElevated: mode === 'dark' ? '#18181b' : '#ffffff',
            colorBorderSecondary: mode === 'dark' ? '#27272a' : '#e4e4e7',
            colorBorder: mode === 'dark' ? '#3f3f46' : '#d4d4d8',
            controlItemBgHover: mode === 'dark' ? '#27272a' : '#f4f4f5',
            controlItemBgActive: mode === 'dark' ? '#27272a' : '#f4f4f5',
            controlHeight: 36,
            boxShadow: mode === 'dark' ? '0 10px 15px -3px rgba(0, 0, 0, 0.5)' : '0 10px 15px -3px rgba(0, 0, 0, 0.03), 0 4px 6px -4px rgba(0, 0, 0, 0.03)',
            boxShadowSecondary: mode === 'dark' ? '0 4px 6px -1px rgba(0, 0, 0, 0.5)' : '0 4px 6px -1px rgba(0, 0, 0, 0.03), 0 2px 4px -2px rgba(0, 0, 0, 0.02)',
          },
        }}
      >
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}
