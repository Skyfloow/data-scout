import React, { useMemo, useState } from 'react';
import { Globe, LayoutDashboard, Menu, Search, Settings, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge } from '../ui/badge';
import ScrapWidgetModal from '../ScrapWidgetModal';

const drawerWidth = 264;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrapModalOpen, setScrapModalOpen] = useState(false);
  const location = useLocation();
  const { t } = useTranslation();

  const menuItems = useMemo(
    () => [{ text: t('layout.marketIntelligence'), icon: <LayoutDashboard size={18} />, path: '/' }],
    [t]
  );

  const nav = (
    <div style={{ display: 'flex', height: '100%', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 12px 6px' }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'color-mix(in oklab, var(--primary) 18%, transparent)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--primary)',
          }}
        >
          <Globe size={18} />
        </div>
        <div>
          <div style={{ fontWeight: 800, letterSpacing: '-0.02em' }}>{t('layout.appTitle')}</div>
          <div className="muted" style={{ fontSize: '0.72rem' }}>
            Ecommerce Intelligence
          </div>
        </div>
      </div>

      <div style={{ padding: '0 10px' }}>
        <div className="separator separator-horizontal" />
      </div>

      <div style={{ padding: '4px 10px 0', display: 'grid', gap: 6 }}>
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              style={{
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minHeight: 42,
                padding: '0 12px',
                borderRadius: 11,
                border: '1px solid transparent',
                color: isActive ? 'var(--fg)' : 'var(--fg-muted)',
                background: isActive ? 'color-mix(in oklab, var(--primary) 14%, transparent)' : 'transparent',
                borderColor: isActive ? 'color-mix(in oklab, var(--primary) 35%, var(--border))' : 'transparent',
                fontWeight: 700,
              }}
            >
              {item.icon}
              <span style={{ fontSize: '0.9rem' }}>{item.text}</span>
            </Link>
          );
        })}
      </div>

      <div style={{ marginTop: 'auto', padding: '10px', display: 'grid', gap: 8 }}>
        <Link
          to="/settings"
          onClick={() => setMobileOpen(false)}
          style={{
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 42,
            padding: '0 12px',
            borderRadius: 11,
            border: '1px solid',
            borderColor: location.pathname === '/settings' ? 'color-mix(in oklab, var(--primary) 36%, var(--border))' : 'var(--border)',
            color: location.pathname === '/settings' ? 'var(--fg)' : 'var(--fg-muted)',
            background: location.pathname === '/settings' ? 'color-mix(in oklab, var(--primary) 14%, transparent)' : 'transparent',
            fontWeight: 700,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Settings size={16} />
            {t('layout.settings')}
          </span>
          <Badge variant="secondary">UI</Badge>
        </Link>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <button
        className="icon-btn mobile-nav-toggle"
        onClick={() => setMobileOpen((v) => !v)}
        aria-label="Toggle navigation"
        style={{
          position: 'fixed',
          top: 12,
          left: 12,
          zIndex: 65,
        }}
      >
        {mobileOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      {mobileOpen ? (
        <>
          <div onClick={() => setMobileOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(3, 8, 18, 0.45)', zIndex: 40 }} />
          <aside
            style={{
              position: 'fixed',
              inset: '0 auto 0 0',
              width: 'min(84vw, 312px)',
              background: 'var(--bg-elevated)',
              borderRight: '1px solid var(--border)',
              zIndex: 50,
              boxShadow: 'var(--shadow-md)',
              paddingTop: 52,
            }}
          >
            {nav}
          </aside>
        </>
      ) : null}

      <aside
        className="desktop-sidebar"
        style={{
          width: drawerWidth,
          borderRight: '1px solid var(--border)',
          background: 'color-mix(in oklab, var(--bg-elevated) 88%, var(--bg-soft) 12%)',
          position: 'sticky',
          top: 0,
          alignSelf: 'flex-start',
          height: '100vh',
        }}
      >
        {nav}
      </aside>

      <main className="dashboard-main" style={{ flex: 1, minWidth: 0, padding: '64px 4vw 88px' }}>
        <div style={{ width: '100%', maxWidth: 2000, margin: '0 auto' }}>{children}</div>
      </main>

      <button
        className="fab-container"
        style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 70, border: 'none', background: 'transparent', padding: 0 }}
        onClick={() => setScrapModalOpen(true)}
        aria-label={t('layout.singleUrlScan')}
      >
        <div
          style={{
            height: 48,
            width: 48,
            borderRadius: 24,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            background: 'var(--primary)',
            color: 'var(--bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Search size={22} />
        </div>
      </button>

      <ScrapWidgetModal open={scrapModalOpen} onClose={() => setScrapModalOpen(false)} />
    </div>
  );
}
