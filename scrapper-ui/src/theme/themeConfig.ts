import { theme as antdTheme, ThemeConfig } from 'antd';

export const lightVars: Record<string, string> = {
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

export const darkVars: Record<string, string> = {
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

export function getAntdThemeConfig(mode: 'light' | 'dark'): ThemeConfig {
  return {
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
  };
}
