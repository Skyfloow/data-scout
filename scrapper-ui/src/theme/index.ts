import { createTheme } from '@mui/material';
import { alpha } from '@mui/material/styles';

export function createAppTheme(mode: 'light' | 'dark') {
  const isLight = mode === 'light';

  const primaryMain = isLight ? '#2D6CFF' : '#5A95FF';
  const primaryDark = isLight ? '#1C50D8' : '#3F7EEA';
  const secondaryMain = isLight ? '#FFB020' : '#FFC857';
  const successMain = isLight ? '#16A34A' : '#4ADE80';
  const warningMain = isLight ? '#F59E0B' : '#FBBF24';
  const errorMain = isLight ? '#DC2626' : '#F87171';
  const infoMain = isLight ? '#0EA5E9' : '#38BDF8';

  const backgroundDefault = isLight ? '#F7FAF9' : '#06090F';
  const paperColor = isLight ? '#FFFFFF' : '#0E141F';
  const panelColor = isLight ? '#FDFEFE' : '#111A28';
  const borderColor = isLight ? alpha('#0F172A', 0.1) : alpha('#A6B2C8', 0.2);
  const hoverSurface = isLight ? alpha(primaryMain, 0.09) : alpha(primaryMain, 0.18);
  const shadowSoft = isLight ? alpha('#0B1323', 0.1) : alpha('#000000', 0.5);
  const shadowStrong = isLight ? alpha('#0B1323', 0.2) : alpha('#000000', 0.65);
  const glowPrimary = alpha(primaryMain, isLight ? 0.3 : 0.4);

  return createTheme({
    palette: {
      mode,
      primary: { main: primaryMain, dark: primaryDark },
      secondary: { main: secondaryMain },
      success: { main: successMain },
      warning: { main: warningMain },
      error: { main: errorMain },
      info: { main: infoMain },
      background: { default: backgroundDefault, paper: paperColor },
      text: {
        primary: isLight ? '#0E1A2B' : '#E6EEF9',
        secondary: isLight ? '#5A6B82' : '#A2B2CC',
        disabled: isLight ? '#8795AB' : '#7F8EA8',
      },
      divider: borderColor,
    },
    typography: {
      fontFamily: '"Sora", "Inter", "Segoe UI", sans-serif',
      h1: { fontWeight: 800, letterSpacing: '-1.25px' },
      h2: { fontWeight: 760, letterSpacing: '-0.95px' },
      h3: { fontWeight: 700, letterSpacing: '-0.6px' },
      h4: { fontWeight: 700, letterSpacing: '-0.45px' },
      h5: { fontWeight: 650 },
      h6: { fontWeight: 650 },
      body1: { lineHeight: 1.62 },
      body2: { lineHeight: 1.5 },
      button: { textTransform: 'none', fontWeight: 650, letterSpacing: '0.12px' },
    },
    shape: { borderRadius: 18 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: backgroundDefault,
            backgroundImage: isLight
              ? `radial-gradient(1200px 620px at -12% -8%, ${alpha('#9CC6FF', 0.38)} 0%, transparent 56%), radial-gradient(1000px 620px at 108% 10%, ${alpha('#FFE3A5', 0.34)} 0%, transparent 55%), linear-gradient(180deg, #FCFEFF 0%, #F7FAF9 100%)`
              : `radial-gradient(980px 560px at -8% -16%, ${alpha('#2E73FF', 0.34)} 0%, transparent 58%), radial-gradient(900px 520px at 108% 8%, ${alpha('#FFB84D', 0.24)} 0%, transparent 54%), linear-gradient(180deg, #06090F 0%, #0A0F18 100%)`,
            transition: 'background-color 260ms ease, color 260ms ease',
            overflowX: 'hidden',
          },
          '#root': {
            minHeight: '100vh',
            maxWidth: '100vw',
            overflowX: 'hidden',
          },
          '*': {
            scrollbarWidth: 'thin',
            scrollbarColor: `${alpha(isLight ? '#71839A' : '#5E708D', 0.9)} ${isLight ? '#EAF0F5' : '#0F1726'}`,
          },
          '*::-webkit-scrollbar': {
            width: 10,
            height: 10,
          },
          '*::-webkit-scrollbar-track': {
            background: isLight ? '#EAF0F5' : '#0F1726',
            borderRadius: 999,
          },
          '*::-webkit-scrollbar-thumb': {
            backgroundColor: isLight ? '#8495A9' : '#51627D',
            borderRadius: 999,
            border: `2px solid ${isLight ? '#EAF0F5' : '#0F1726'}`,
          },
          '*::-webkit-scrollbar-thumb:hover': {
            backgroundColor: isLight ? '#5F728C' : '#6B7C98',
          },
          '*::selection': {
            backgroundColor: alpha(primaryMain, 0.25),
          },
          '@keyframes floatUpFade': {
            from: {
              opacity: 0,
              transform: 'translateY(10px)',
            },
            to: {
              opacity: 1,
              transform: 'translateY(0px)',
            },
          },
          '@keyframes neonPulse': {
            '0%, 100%': {
              boxShadow: `0 12px 28px ${alpha(primaryMain, 0.28)}`,
            },
            '50%': {
              boxShadow: `0 16px 34px ${alpha(primaryMain, 0.4)}`,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: `1px solid ${borderColor}`,
            backgroundColor: paperColor,
            boxShadow: isLight ? `0 14px 34px ${shadowSoft}` : `0 16px 36px ${shadowSoft}`,
            transition: 'box-shadow 220ms ease, border-color 220ms ease, transform 220ms ease',
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            overflow: 'hidden',
            border: `1px solid ${borderColor}`,
            background: isLight
              ? `linear-gradient(165deg, ${alpha('#FFFFFF', 0.96)} 0%, ${alpha(panelColor, 0.95)} 100%)`
              : `linear-gradient(165deg, ${alpha(panelColor, 0.97)} 0%, ${alpha('#0A1322', 0.95)} 100%)`,
            boxShadow: isLight ? `0 16px 36px ${shadowSoft}` : `0 20px 42px ${shadowSoft}`,
            backdropFilter: 'blur(12px)',
            transition: 'box-shadow 220ms ease, border-color 220ms ease, transform 220ms ease',
            animation: 'floatUpFade 320ms ease',
            '&:hover': {
              transform: 'translateY(-3px)',
              borderColor: alpha(primaryMain, isLight ? 0.32 : 0.48),
              boxShadow: isLight ? `0 24px 48px ${shadowStrong}` : `0 28px 58px ${shadowStrong}`,
            },
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            borderRadius: 14,
            paddingInline: 18,
            transition: 'box-shadow 160ms ease, background-color 160ms ease, border-color 160ms ease, transform 160ms ease',
          },
          contained: {
            background: `linear-gradient(135deg, ${primaryMain} 0%, ${secondaryMain} 100%)`,
            color: '#ffffff',
            boxShadow: `0 12px 26px ${glowPrimary}`,
            '&:hover': {
              transform: 'translateY(-1px)',
              background: `linear-gradient(135deg, ${primaryDark} 0%, ${secondaryMain} 100%)`,
              boxShadow: `0 16px 30px ${alpha(primaryMain, isLight ? 0.34 : 0.45)}`,
            },
          },
          containedPrimary: {
            color: '#ffffff',
            '&:hover': {
              color: '#ffffff',
            },
          },
          outlined: {
            borderColor: alpha(primaryMain, isLight ? 0.26 : 0.45),
            color: isLight ? '#1C314F' : '#D0DDF2',
            backgroundColor: isLight ? alpha('#FFFFFF', 0.7) : alpha('#0B1322', 0.42),
            '&:hover': {
              borderColor: primaryMain,
              backgroundColor: hoverSurface,
            },
          },
          text: {
            color: isLight ? '#1C314F' : '#D0DDF2',
            '&:hover': {
              backgroundColor: hoverSurface,
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            backgroundColor: isLight ? alpha('#FFFFFF', 0.86) : alpha('#0C1526', 0.65),
            transition: 'box-shadow 180ms ease, border-color 180ms ease, transform 180ms ease',
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(primaryMain, isLight ? 0.2 : 0.34),
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(primaryMain, isLight ? 0.36 : 0.52),
            },
            '&.Mui-focused': {
              boxShadow: `0 0 0 3px ${alpha(primaryMain, 0.2)}`,
            },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            backgroundColor: isLight ? alpha('#F8FCFF', 0.8) : alpha('#0A111D', 0.76),
            backdropFilter: 'blur(16px)',
            borderBottom: `1px solid ${borderColor}`,
            boxShadow: isLight ? `0 10px 22px ${shadowSoft}` : `0 12px 24px ${shadowSoft}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            background: isLight
              ? `linear-gradient(180deg, ${alpha('#FFFFFF', 0.88)} 0%, ${alpha('#F6FAFD', 0.92)} 100%)`
              : `linear-gradient(180deg, ${alpha('#101929', 0.98)} 0%, ${alpha('#0A1220', 0.98)} 100%)`,
            backdropFilter: 'blur(16px)',
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 13,
            marginBlock: 2,
            transition: 'background-color 150ms ease, color 150ms ease, transform 150ms ease',
            '&:hover': {
              backgroundColor: hoverSurface,
              transform: 'translateX(1px)',
            },
            '&.Mui-selected': {
              backgroundColor: alpha(primaryMain, isLight ? 0.14 : 0.24),
              color: isLight ? '#16437A' : '#E7F8F3',
              '&:hover': {
                backgroundColor: alpha(primaryMain, isLight ? 0.2 : 0.3),
              },
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: 11,
            fontWeight: 650,
            border: `1px solid ${alpha(primaryMain, isLight ? 0.16 : 0.3)}`,
            backgroundColor: isLight ? alpha('#EAF9F4', 0.8) : alpha(primaryMain, 0.2),
            color: isLight ? '#1A4A48' : '#DCF5F0',
          },
        },
      },
      MuiTableContainer: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            border: `1px solid ${borderColor}`,
            boxShadow: isLight ? `0 14px 30px ${shadowSoft}` : `0 16px 34px ${shadowSoft}`,
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: {
            borderBottom: `1px solid ${alpha(primaryMain, isLight ? 0.1 : 0.18)}`,
            padding: '11px 14px',
          },
          head: {
            fontWeight: 700,
            fontSize: '0.72rem',
            textTransform: 'uppercase',
            letterSpacing: '0.62px',
            backgroundColor: isLight ? alpha('#E9F7F2', 0.85) : alpha('#122335', 0.82),
            color: isLight ? '#4A5E79' : '#C7D7EF',
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            transition: 'background-color 140ms ease',
            '&:hover': {
              backgroundColor: hoverSurface,
            },
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: {
            height: 3,
            borderRadius: 999,
            background: `linear-gradient(90deg, ${primaryMain} 0%, ${secondaryMain} 100%)`,
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 650,
            color: isLight ? '#60718A' : '#9BAECC',
            '&.Mui-selected': {
              color: isLight ? '#0D7560' : '#D6EFE7',
            },
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 18,
            border: `1px solid ${borderColor}`,
            boxShadow: isLight ? `0 26px 52px ${shadowStrong}` : `0 30px 62px ${shadowStrong}`,
            background: isLight
              ? `linear-gradient(175deg, ${alpha('#FFFFFF', 0.98)} 0%, ${alpha('#F5FAF9', 0.98)} 100%)`
              : `linear-gradient(175deg, ${alpha('#121C2D', 0.98)} 0%, ${alpha('#0A1322', 0.98)} 100%)`,
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            borderRadius: 10,
            backgroundColor: isLight ? alpha('#0C1928', 0.92) : alpha('#030711', 0.92),
            border: `1px solid ${alpha(primaryMain, 0.34)}`,
            boxShadow: `0 10px 20px ${alpha('#020617', 0.42)}`,
          },
        },
      },
      MuiFab: {
        styleOverrides: {
          primary: {
            background: `linear-gradient(135deg, ${primaryMain} 0%, ${secondaryMain} 100%)`,
            boxShadow: `0 14px 30px ${glowPrimary}`,
            animation: 'neonPulse 2.8s ease-in-out infinite',
            '&:hover': {
              background: `linear-gradient(135deg, ${primaryDark} 0%, ${secondaryMain} 100%)`,
              boxShadow: `0 18px 36px ${alpha(primaryMain, isLight ? 0.38 : 0.48)}`,
            },
          },
        },
      },
    },
  });
}
