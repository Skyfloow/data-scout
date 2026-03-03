import React, { useState } from 'react';
import { 
  Box, Drawer, Toolbar, List, Typography, Divider, 
  IconButton, ListItem, ListItemButton, ListItemIcon, ListItemText,
  SpeedDial, SpeedDialIcon, SpeedDialAction
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { 
  Menu as MenuIcon, Dashboard as DashboardIcon, 
  Timeline as TimelineIcon, Public as PublicIcon,
  Settings as SettingsIcon,
  Search as SearchIcon,
  PlaylistAdd as PlaylistAddIcon
} from '@mui/icons-material';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ScrapWidgetModal from '../ScrapWidgetModal';
import BulkTrackWidgetModal from '../BulkTrackWidgetModal';

const drawerWidth = 260;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrapModalOpen, setScrapModalOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [speedDialOpen, setSpeedDialOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width:599.95px)');
  const location = useLocation();
  const { t } = useTranslation();

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const closeSpeedDial = () => {
    setSpeedDialOpen(false);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const menuItems = [
    { text: t('layout.marketIntelligence'), icon: <DashboardIcon />, path: '/' },
    { text: t('layout.continuousMonitoring'), icon: <TimelineIcon />, path: '/monitoring' },
  ];

  const isSettingsActive = location.pathname === '/settings';

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar sx={{ my: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <PublicIcon color="primary" sx={{ fontSize: 28 }} />
        <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 700, letterSpacing: '-0.5px' }}>
          {t('layout.appTitle')}
        </Typography>
      </Toolbar>
      <Divider sx={{ mb: 2, mx: 2, borderStyle: 'dashed' }} />
      <List sx={{ px: 2 }}>
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton 
                component={Link} 
                to={item.path}
                selected={isActive}
                sx={{ 
                  borderRadius: '12px',
                  color: isActive ? 'secondary.main' : 'text.secondary',
                  '&:hover': { bgcolor: 'action.hover' },
                  '&.Mui-selected': {
                    bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.24 : 0.12),
                    '&:hover': {
                      bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.3 : 0.18),
                    },
                  }
                }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: isActive ? 'secondary.main' : 'inherit' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: isActive ? 600 : 500, fontSize: '0.95rem' }} />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
      <Box sx={{ flexGrow: 1 }} />
      <Divider sx={{ mx: 2, borderStyle: 'dashed' }} />
      <List sx={{ px: 2, py: 1.5 }}>
        <ListItem disablePadding>
          <ListItemButton 
            component={Link} 
            to="/settings"
            selected={isSettingsActive}
            sx={{ 
              borderRadius: '12px',
              color: isSettingsActive ? 'secondary.main' : 'text.secondary',
              '&:hover': { bgcolor: 'action.hover' },
              '&.Mui-selected': {
                bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.24 : 0.12),
                '&:hover': {
                  bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.3 : 0.18),
                },
              }
            }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: isSettingsActive ? 'secondary.main' : 'inherit' }}>
              <SettingsIcon />
            </ListItemIcon>
            <ListItemText primary={t('layout.settings')} primaryTypographyProps={{ fontWeight: isSettingsActive ? 600 : 500, fontSize: '0.95rem' }} />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '100vh',
        bgcolor: 'background.default',
        maxWidth: '100vw',
        overflowX: 'clip',
        position: 'relative',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: (theme) =>
            theme.palette.mode === 'dark'
              ? `radial-gradient(700px 340px at 85% -5%, ${alpha(theme.palette.secondary.main, 0.12)} 0%, transparent 70%)`
              : `radial-gradient(700px 340px at 85% -5%, ${alpha(theme.palette.secondary.main, 0.1)} 0%, transparent 70%)`,
        },
      }}
    >
      <IconButton
        aria-label="open drawer"
        onClick={handleDrawerToggle}
        sx={{
          position: 'fixed',
          top: 12,
          left: 12,
          zIndex: 1300,
          display: { xs: 'inline-flex', sm: 'none' },
          color: 'text.primary',
          bgcolor: 'background.paper',
          border: '1px solid',
          borderColor: 'divider',
          boxShadow: (theme) =>
            theme.palette.mode === 'dark'
              ? `0 8px 18px ${alpha('#000', 0.35)}`
              : `0 8px 18px ${alpha(theme.palette.primary.main, 0.2)}`,
          '&:hover': {
            bgcolor: 'action.hover',
          },
        }}
      >
        <MenuIcon />
      </IconButton>
      <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}>
        <Drawer variant="temporary" open={mobileOpen} onClose={handleDrawerToggle} ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'block', sm: 'none' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: 'min(86vw, 320px)', borderRight: 'none', bgcolor: 'background.paper' } }}>
          {drawer}
        </Drawer>
        <Drawer variant="permanent" open
          sx={{ display: { xs: 'none', sm: 'block' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, borderRight: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' } }}>
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          maxWidth: '100vw',
          overflowX: 'hidden',
          p: { xs: 1.5, sm: 2.5, md: 3.5 },
          pt: { xs: 8, sm: 2.5, md: 3.5 },
          pb: { xs: 10, sm: 3, md: 4 },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        {children}
      </Box>

      <SpeedDial
        ariaLabel={t('layout.dataActions')}
        open={speedDialOpen}
        onOpen={() => setSpeedDialOpen(true)}
        onClose={closeSpeedDial}
        sx={{ 
          position: 'fixed', 
          bottom: { xs: 16, sm: 24, md: 32 }, 
          right: { xs: 16, sm: 24, md: 32 }, 
          zIndex: 1200,
          '& .MuiFab-primary': {
            boxShadow: (theme) =>
              theme.palette.mode === 'dark'
                ? `0 10px 24px ${alpha('#000', 0.45)}`
                : `0 10px 24px ${alpha(theme.palette.primary.main, 0.28)}`,
          },
          '& .MuiSpeedDialAction-fab': {
            bgcolor: 'background.paper',
            color: 'text.primary',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: (theme) =>
              theme.palette.mode === 'dark'
                ? `0 8px 18px ${alpha('#000', 0.42)}`
                : `0 8px 18px ${alpha(theme.palette.primary.main, 0.15)}`,
          },
          '& .MuiSpeedDialAction-fab:hover': {
            bgcolor: 'action.hover',
          },
        }}
        icon={<SpeedDialIcon />}
      >
        <SpeedDialAction
          icon={<PlaylistAddIcon />}
          tooltipTitle={t('layout.bulkAddTrackers')}
          tooltipOpen={!isMobile}
          onClick={() => {
            closeSpeedDial();
            setBulkModalOpen(true);
          }}
          sx={{
            '& .MuiSpeedDialAction-staticTooltipLabel': {
              whiteSpace: 'nowrap',
              bgcolor: 'background.paper',
              color: 'text.primary',
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: (theme) =>
                theme.palette.mode === 'dark'
                  ? `0 8px 18px ${alpha('#000', 0.4)}`
                  : `0 8px 18px ${alpha(theme.palette.primary.main, 0.14)}`,
            },
          }}
        />
        <SpeedDialAction
          icon={<SearchIcon />}
          tooltipTitle={t('layout.singleUrlScan')}
          tooltipOpen={!isMobile}
          onClick={() => {
            closeSpeedDial();
            setScrapModalOpen(true);
          }}
          sx={{
            '& .MuiSpeedDialAction-staticTooltipLabel': {
              whiteSpace: 'nowrap',
              bgcolor: 'background.paper',
              color: 'text.primary',
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: (theme) =>
                theme.palette.mode === 'dark'
                  ? `0 8px 18px ${alpha('#000', 0.4)}`
                  : `0 8px 18px ${alpha(theme.palette.primary.main, 0.14)}`,
            },
          }}
        />
      </SpeedDial>
      
      <ScrapWidgetModal 
        open={scrapModalOpen} 
        onClose={() => {
          setScrapModalOpen(false);
          closeSpeedDial();
        }} 
      />

      <BulkTrackWidgetModal 
        open={bulkModalOpen} 
        onClose={() => {
          setBulkModalOpen(false);
          closeSpeedDial();
        }} 
      />
    </Box>
  );
}
