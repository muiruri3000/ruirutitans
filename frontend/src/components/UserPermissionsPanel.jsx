import React, { useState, useEffect } from 'react';
import { api } from '../api/client';

const USER_TYPE_LABELS = {
  superadmin: '👑 Superadmin',
  admin: '🛡️ Admin',
  match_reporter: '📰 Match Reporter',
  team_manager: '⚽ Team Manager',
  duty_coordinator: '🧹 Duty Coordinator',
  moderator: '💬 Moderator',
  custom: '⚙️ Custom User',
};

const ADMIN_CONTROL_KEYS = new Set(['downgrade_admin', 'delete_admin', 'block_admin']);

export default function UserPermissionsPanel({ cmsUser }) {
  const [users, setUsers] = useState([]);
  const [userTypes, setUserTypes] = useState([]);
  const [permDefs, setPermDefs] = useState([]);
  const [actorIsSuperadmin, setActorIsSuperadmin] = useState(Boolean(cmsUser?.is_superadmin || cmsUser?.user_type === 'superadmin'));
  const [actorPerms, setActorPerms] = useState(cmsUser?.permissions || {});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  // Add User Form
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newType, setNewType] = useState('admin');
  const [newPerms, setNewPerms] = useState({});
  const [creating, setCreating] = useState(false);

  // Edit User Inline State
  const [editingUserId, setEditingUserId] = useState(null);
  const [editType, setEditType] = useState('admin');
  const [editPerms, setEditPerms] = useState({});
  const [editPassword, setEditPassword] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const canManageUsers = actorIsSuperadmin || Boolean(actorPerms?.manage_users);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setErr(null);
      const res = await api.getCmsUsers();
      setUsers(res.users || []);
      setUserTypes(res.user_types || []);
      setPermDefs(res.permission_definitions || []);
      setActorIsSuperadmin(Boolean(res.actor_is_superadmin));
      setActorPerms(res.actor_permissions || {});

      // Initialize default checkboxes for 'admin' on first load
      const adminDef = (res.user_types || []).find((t) => t.key === 'admin');
      if (adminDef && Object.keys(newPerms).length === 0) {
        setNewPerms({ ...adminDef.default_permissions });
      }
    } catch (e) {
      setErr(e.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleSelectNewType = (typeKey) => {
    setNewType(typeKey);
    const found = userTypes.find((t) => t.key === typeKey);
    if (found?.default_permissions) {
      setNewPerms({ ...found.default_permissions });
    }
  };

  const handleSelectEditType = (typeKey) => {
    setEditType(typeKey);
    const found = userTypes.find((t) => t.key === typeKey);
    if (found?.default_permissions) {
      setEditPerms({ ...found.default_permissions });
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    try {
      setCreating(true);
      const res = await api.createCmsUser({
        username: newUsername.trim(),
        email: newEmail.trim(),
        password: newPassword,
        user_type: newType,
        permissions: newPerms,
      });
      setMsg(res.message || 'User created successfully.');
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      await loadUsers();
    } catch (e2) {
      setErr(e2.message || 'Failed to create user.');
    } finally {
      setCreating(false);
    }
  };

  const startEditUser = (u) => {
    setEditingUserId(u.id);
    setEditType(u.user_type || 'admin');
    setEditPerms({ ...(u.permissions || {}) });
    setEditPassword('');
    setMsg(null);
    setErr(null);
  };

  const handleSaveEdit = async (u) => {
    setMsg(null);
    setErr(null);
    try {
      setSavingEdit(true);
      const payload = {
        user_type: editType,
        permissions: editPerms,
      };
      if (editPassword.trim()) {
        payload.password = editPassword.trim();
      }
      const res = await api.updateCmsUser(u.id, payload);
      setMsg(res.message || `Updated ${u.username}.`);
      setEditingUserId(null);
      await loadUsers();
    } catch (e2) {
      setErr(e2.message || 'Failed to update user.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleBlock = async (u) => {
    setMsg(null);
    setErr(null);
    try {
      const res = await api.updateCmsUser(u.id, { is_blocked: !u.is_blocked });
      setMsg(res.message || `Updated status for ${u.username}.`);
      await loadUsers();
    } catch (e2) {
      setErr(e2.message || 'Failed to update block status.');
    }
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    setMsg(null);
    setErr(null);
    try {
      const res = await api.deleteCmsUser(u.id);
      setMsg(res.message || `Deleted ${u.username}.`);
      if (editingUserId === u.id) setEditingUserId(null);
      await loadUsers();
    } catch (e2) {
      setErr(e2.message || 'Failed to delete user.');
    }
  };

  if (!canManageUsers) {
    return null;
  }

  return (
    <div style={{ marginTop: '28px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
        <div>
          <div className="scoreboard" style={{ color: '#FF9500', fontSize: '18px' }}>
            👥 USER ACCOUNTS, ROLES &amp; PERMISSIONS
          </div>
          <div style={{ fontSize: '12px', color: '#8E8E93', marginTop: '4px' }}>
            Add Admins or custom user types and choose exactly what they can do.{' '}
            {actorIsSuperadmin
              ? 'As Superadmin, you have full control including downgrading, deleting, or blocking Admins.'
              : 'Admins have all standard permissions ticked except downgrading, deleting, or blocking other Admins.'}
          </div>
        </div>
        <span
          style={{
            background: actorIsSuperadmin ? 'rgba(255, 149, 0, 0.16)' : '#1C1C1E',
            border: actorIsSuperadmin ? '1px solid #FF9500' : '1px solid rgba(255,255,255,0.15)',
            color: actorIsSuperadmin ? '#FF9F0A' : '#EBEBF5',
            padding: '5px 12px',
            borderRadius: '20px',
            fontSize: '11.5px',
            fontWeight: 800,
          }}
        >
          {USER_TYPE_LABELS[cmsUser?.user_type] || (actorIsSuperadmin ? '👑 Superadmin' : '🛡️ Admin')}
        </span>
      </div>

      {msg && (
        <div style={{ background: 'rgba(108, 229, 160, 0.12)', border: '1px solid #3F7A4E', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#6CE5A0', fontWeight: 700, marginBottom: '14px' }}>
          ✅ {msg}
        </div>
      )}
      {err && (
        <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid #EF4444', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#FCA5A5', fontWeight: 600, marginBottom: '14px' }}>
          ⚠️ {err}
        </div>
      )}

      {/* ADD NEW USER FORM */}
      <form
        onSubmit={handleCreateUser}
        style={{
          background: '#1C1C1E',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '18px',
          marginBottom: '22px',
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF', marginBottom: '12px' }}>
          ➕ Add New User
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '14px' }}>
          <div>
            <label style={{ fontSize: '11.5px', color: '#AEAEB2', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
              Username *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. coach_john"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', background: '#121212', border: '1px solid rgba(255,255,255,0.14)', color: '#FFFFFF', fontSize: '12.5px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '11.5px', color: '#AEAEB2', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
              Email (Optional)
            </label>
            <input
              type="email"
              placeholder="user@ruirutitans.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', background: '#121212', border: '1px solid rgba(255,255,255,0.14)', color: '#FFFFFF', fontSize: '12.5px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '11.5px', color: '#AEAEB2', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
              Password (min 4 chars) *
            </label>
            <input
              type="password"
              required
              minLength={4}
              placeholder="Initial password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', background: '#121212', border: '1px solid rgba(255,255,255,0.14)', color: '#FFFFFF', fontSize: '12.5px', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '11.5px', color: '#AEAEB2', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
              User Type *
            </label>
            <select
              value={newType}
              onChange={(e) => handleSelectNewType(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', background: '#121212', border: '1px solid rgba(255,255,255,0.14)', color: '#FFFFFF', fontSize: '12.5px', boxSizing: 'border-box' }}
            >
              {userTypes
                .filter((t) => actorIsSuperadmin || t.key !== 'superadmin')
                .map((t) => (
                  <option key={t.key} value={t.key}>
                    {USER_TYPE_LABELS[t.key] || t.label}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* CAPABILITY CHECKBOXES */}
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '11.5px', color: '#AEAEB2', fontWeight: 700, marginBottom: '8px' }}>
            What this user can do (tick/untick capabilities):
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '8px' }}>
            {permDefs.map((p) => {
              const isAdminCtrl = ADMIN_CONTROL_KEYS.has(p.key);
              const disabled = newType === 'superadmin' || (isAdminCtrl && !actorIsSuperadmin);
              const checked = newType === 'superadmin' ? true : Boolean(newPerms[p.key]);
              return (
                <label
                  key={p.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    background: checked ? 'rgba(255, 149, 0, 0.08)' : 'rgba(255,255,255,0.02)',
                    border: checked ? '1px solid rgba(255, 149, 0, 0.35)' : '1px solid rgba(255,255,255,0.06)',
                    fontSize: '12px',
                    color: disabled ? '#6E6E73' : '#EBEBF5',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => setNewPerms((prev) => ({ ...prev, [p.key]: e.target.checked }))}
                    style={{ accentColor: '#FF9500', width: '15px', height: '15px' }}
                  />
                  <span>{p.label}</span>
                </label>
              );
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={creating}
          style={{
            background: '#FF9500',
            color: '#16201B',
            border: 'none',
            borderRadius: '8px',
            padding: '9px 18px',
            fontSize: '12.5px',
            fontWeight: 800,
            cursor: creating ? 'not-allowed' : 'pointer',
          }}
        >
          {creating ? 'Creating User…' : '➕ Create User'}
        </button>
      </form>

      {/* EXISTING USERS LIST */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', marginBottom: '2px' }}>
          Existing Platform Users ({users.length})
        </div>

        {loading && users.length === 0 && (
          <div style={{ fontSize: '12.5px', color: '#8E8E93', padding: '16px 0' }}>Loading users…</div>
        )}

        {users.map((u) => {
          const isSelf = u.username?.toLowerCase() === cmsUser?.username?.toLowerCase();
          const isTargetSuper = u.user_type === 'superadmin';
          const isTargetAdmin = u.user_type === 'admin';
          const canBlockThis = !isSelf && (!isTargetSuper && (!isTargetAdmin || actorIsSuperadmin || actorPerms?.block_admin));
          const canDeleteThis = !isSelf && (!isTargetSuper && (!isTargetAdmin || actorIsSuperadmin || actorPerms?.delete_admin));
          const canEditThis = !isTargetSuper || actorIsSuperadmin;
          const enabledCount = Object.values(u.permissions || {}).filter(Boolean).length;
          const isEditing = editingUserId === u.id;

          return (
            <div
              key={u.id}
              style={{
                background: '#1C1C1E',
                border: u.is_blocked ? '1px solid rgba(255, 69, 58, 0.45)' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: '12px',
                padding: '14px 16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 800, fontSize: '14px', color: '#FFFFFF' }}>
                    @{u.username}
                  </span>
                  <span
                    style={{
                      padding: '3px 9px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: 800,
                      background: isTargetSuper ? 'rgba(255, 149, 0, 0.18)' : 'rgba(255,255,255,0.08)',
                      color: isTargetSuper ? '#FF9F0A' : '#EBEBF5',
                      border: isTargetSuper ? '1px solid rgba(255, 149, 0, 0.4)' : 'none',
                    }}
                  >
                    {USER_TYPE_LABELS[u.user_type] || u.user_type}
                  </span>
                  {u.is_blocked ? (
                    <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 800, background: 'rgba(255, 69, 58, 0.18)', color: '#FF6961' }}>
                      🚫 Blocked
                    </span>
                  ) : (
                    <span style={{ padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700, background: 'rgba(48, 209, 88, 0.14)', color: '#30D158' }}>
                      ● Active
                    </span>
                  )}
                  <span style={{ fontSize: '11.5px', color: '#8E8E93' }}>
                    {enabledCount}/{permDefs.length} capabilities
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {canEditThis && (
                    <button
                      type="button"
                      onClick={() => (isEditing ? setEditingUserId(null) : startEditUser(u))}
                      style={{
                        background: isEditing ? '#FF9500' : 'rgba(255,255,255,0.08)',
                        color: isEditing ? '#16201B' : '#FFFFFF',
                        border: 'none',
                        borderRadius: '7px',
                        padding: '6px 11px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {isEditing ? 'Close' : '✏️ Edit Role / Perms'}
                    </button>
                  )}
                  {canBlockThis && (
                    <button
                      type="button"
                      onClick={() => handleToggleBlock(u)}
                      style={{
                        background: u.is_blocked ? 'rgba(48, 209, 88, 0.16)' : 'rgba(255, 159, 10, 0.14)',
                        color: u.is_blocked ? '#30D158' : '#FF9F0A',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '7px',
                        padding: '6px 11px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {u.is_blocked ? '🔓 Unblock' : '🚫 Block'}
                    </button>
                  )}
                  {canDeleteThis && (
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(u)}
                      style={{
                        background: 'rgba(255, 69, 58, 0.14)',
                        color: '#FF6961',
                        border: '1px solid rgba(255, 69, 58, 0.35)',
                        borderRadius: '7px',
                        padding: '6px 11px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      🗑️ Delete
                    </button>
                  )}
                </div>
              </div>

              {isEditing && (
                <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ fontSize: '11.5px', color: '#AEAEB2', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                        User Type
                      </label>
                      <select
                        value={editType}
                        disabled={isTargetAdmin && !actorIsSuperadmin && !actorPerms?.downgrade_admin}
                        onChange={(e) => handleSelectEditType(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', background: '#121212', border: '1px solid rgba(255,255,255,0.14)', color: '#FFFFFF', fontSize: '12px' }}
                      >
                        {userTypes
                          .filter((t) => actorIsSuperadmin || t.key !== 'superadmin')
                          .map((t) => (
                            <option key={t.key} value={t.key}>
                              {USER_TYPE_LABELS[t.key] || t.label}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '11.5px', color: '#AEAEB2', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                        Reset Password (Optional)
                      </label>
                      <input
                        type="password"
                        placeholder="Leave blank to keep current"
                        value={editPassword}
                        onChange={(e) => setEditPassword(e.target.value)}
                        style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', background: '#121212', border: '1px solid rgba(255,255,255,0.14)', color: '#FFFFFF', fontSize: '12px', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                    {permDefs.map((p) => {
                      const isAdminCtrl = ADMIN_CONTROL_KEYS.has(p.key);
                      const disabled = editType === 'superadmin' || (isAdminCtrl && !actorIsSuperadmin);
                      const checked = editType === 'superadmin' ? true : Boolean(editPerms[p.key]);
                      return (
                        <label
                          key={p.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            background: checked ? 'rgba(255, 149, 0, 0.08)' : 'rgba(255,255,255,0.02)',
                            border: checked ? '1px solid rgba(255, 149, 0, 0.3)' : '1px solid rgba(255,255,255,0.06)',
                            fontSize: '11.5px',
                            color: disabled ? '#6E6E73' : '#EBEBF5',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={(e) => setEditPerms((prev) => ({ ...prev, [p.key]: e.target.checked }))}
                            style={{ accentColor: '#FF9500', width: '14px', height: '14px' }}
                          />
                          <span>{p.label}</span>
                        </label>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={() => handleSaveEdit(u)}
                    style={{
                      background: '#30D158',
                      color: '#0D1B12',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: savingEdit ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {savingEdit ? 'Saving…' : '💾 Save User Changes'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
