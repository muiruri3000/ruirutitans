import React, { useState } from 'react';

/**
 * PasswordInput component with an interactive eye toggle icon.
 * Allows the user to view or hide their password in plain text.
 * Toggles between an open eye and a closed/slashed eye.
 * Works both uncontrolled (self-managed toggle) and controlled.
 */
export default function PasswordInput({
  value = '',
  onChange,
  placeholder = 'Enter password…',
  required = false,
  autoFocus = false,
  className = 'form-input',
  style = {},
  wrapperStyle = {},
  id,
  name,
  autoComplete,
  disabled = false,
  onKeyDown,
  showPassword: controlledShow,
  onToggleShow,
  ...rest
}) {
  const [internalShow, setInternalShow] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isControlled = typeof controlledShow === 'boolean';
  const isVisible = isControlled ? controlledShow : internalShow;

  const handleToggle = () => {
    if (onToggleShow) {
      onToggleShow(!isVisible);
    }
    if (!isControlled) {
      setInternalShow((prev) => !prev);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        ...wrapperStyle,
      }}
    >
      <input
        type={isVisible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        disabled={disabled}
        id={id}
        name={name}
        autoComplete={autoComplete}
        onKeyDown={onKeyDown}
        className={className}
        style={{
          width: '100%',
          paddingRight: '38px',
          boxSizing: 'border-box',
          ...style,
        }}
        {...rest}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={handleToggle}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={isVisible ? 'Hide password' : 'Show password'}
        aria-label={isVisible ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: '8px',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'transparent',
          border: 'none',
          padding: '4px',
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: isVisible ? '#C9A227' : isHovered ? '#F4F2EA' : '#8FA89B',
          borderRadius: '4px',
          transition: 'color 0.15s ease, transform 0.15s ease',
        }}
      >
        {isVisible ? (
          /* Open Eye: viewing in plain text */
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          /* Closed / Slashed Eye: masked password */
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        )}
      </button>
    </div>
  );
}
