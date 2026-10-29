import React from 'react';

/**
 * Apple HIG Floating Appearance Mode Toggle
 * Lets users switch between Dark Mode (default) and Light Mode.
 */
export default function ThemeFloatingToggle({ theme = 'dark', onToggle }) {
  const isDark = theme === 'dark';

  return (
    <aside
      className="theme-floating-container"
      aria-label="Appearance Mode Controls"
      style={{
        position: 'fixed',
        bottom: 'max(20px, calc(env(safe-area-inset-bottom, 0px) + 16px))',
        right: 'max(20px, calc(env(safe-area-inset-right, 0px) + 16px))',
        zIndex: 950,
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div
        className="theme-toggle-pill"
        role="group"
        aria-label="Appearance Mode Switch"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '4px',
          borderRadius: '9999px',
          background: isDark ? 'rgba(28, 28, 30, 0.85)' : 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          border: isDark ? '1px solid rgba(255, 255, 255, 0.16)' : '1px solid rgba(0, 0, 0, 0.12)',
          boxShadow: isDark
            ? '0 8px 32px rgba(0, 0, 0, 0.45), 0 2px 6px rgba(0, 0, 0, 0.25)'
            : '0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06)',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          gap: '3px',
        }}
      >
        {/* Dark Mode Button */}
        <button
          type="button"
          onClick={() => {
            if (!isDark && onToggle) onToggle('dark');
          }}
          className={`theme-mode-btn ${isDark ? 'active' : ''}`}
          aria-pressed={isDark}
          title="Switch to Dark Mode (Current default)"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '7px 12px',
            borderRadius: '9999px',
            border: 'none',
            outline: 'none',
            cursor: isDark ? 'default' : 'pointer',
            background: isDark ? 'rgba(255, 149, 0, 0.2)' : 'transparent',
            color: isDark ? '#FF9500' : isDark ? '#8E8E93' : '#6C6C70',
            fontWeight: isDark ? 800 : 600,
            fontSize: '12px',
            letterSpacing: '0.2px',
            minHeight: '36px',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            boxShadow: isDark ? 'inset 0 0 0 1px #FF9500' : 'none',
          }}
        >
          <span style={{ fontSize: '14px', lineHeight: 1 }}>🌙</span>
          <span className="theme-btn-label">Dark</span>
        </button>

        {/* Light Mode Button */}
        <button
          type="button"
          onClick={() => {
            if (isDark && onToggle) onToggle('light');
          }}
          className={`theme-mode-btn ${!isDark ? 'active' : ''}`}
          aria-pressed={!isDark}
          title="Switch to Light Mode"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '7px 12px',
            borderRadius: '9999px',
            border: 'none',
            outline: 'none',
            cursor: !isDark ? 'default' : 'pointer',
            background: !isDark ? '#FF9500' : 'transparent',
            color: !isDark ? '#FFFFFF' : '#8E8E93',
            fontWeight: !isDark ? 800 : 600,
            fontSize: '12px',
            letterSpacing: '0.2px',
            minHeight: '36px',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            boxShadow: !isDark ? '0 2px 8px rgba(255, 149, 0, 0.35)' : 'none',
          }}
        >
          <span style={{ fontSize: '14px', lineHeight: 1 }}>☀️</span>
          <span className="theme-btn-label">Light</span>
        </button>
      </div>
    </aside>
  );
}
