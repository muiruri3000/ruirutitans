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
  // Active Subtab: 'roles' (Group Roles) or 'users' (Staff User Accounts)
  const [activeTab, setActiveTab] = useState('roles');

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

  // ==========================================
  // GROUP ROLES & PLAYER ASSIGNMENT STATE
  // ==========================================
  const [groupRoles, setGroupRoles] = useState([]);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [selectedPlayerByRole, setSelectedPlayerByRole] = useState({});
  const [loadingRoles, setLoadingRoles] = useState(false);

  // Create Group Role Form State
  const [showCreateRoleForm, setShowCreateRoleForm] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRolePerms, setNewRolePerms] = useState({});
  const [creatingRole, setCreatingRole] = useState(false);

  // Edit Group Role Inline State
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRoleDesc, setEditRoleDesc] = useState('');
  const [editRolePerms, setEditRolePerms] = useState({});
  const [savingRoleEdit, setSavingRoleEdit] = useState(false);

  // Member Action Loading
  const [addingMemberRole, setAddingMemberRole] = useState(null);
  const [removingMemberKey, setRemovingMemberKey] = useState(null);

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

  const loadGroupRoles = async () => {
    try {
      setLoadingRoles(true);
      const res = await api.getGroupRoles();
      setGroupRoles(res.group_roles || []);
      setAvailablePlayers(res.available_players || []);
      if (res.permission_definitions && permDefs.length === 0) {
        setPermDefs(res.permission_definitions);
      }
    } catch (e) {
      setErr(e.message || 'Failed to load group roles.');
    } finally {
      setLoadingRoles(false);
    }
  };

  useEffect(() => {
    loadUsers();
    loadGroupRoles();
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

  // ==========================================
  // GROUP ROLE ACTIONS
  // ==========================================
  const handleApplyPresetToNewRole = (presetKey) => {
    const updated = {};
    (permDefs || []).forEach((p) => {
      updated[p.key] = false;
    });

    if (presetKey === 'tactics') {
      updated.manage_tactics = true;
    } else if (presetKey === 'fixtures') {
      updated.manage_fixtures = true;
    } else if (presetKey === 'duty') {
      updated.manage_duty_roster = true;
    } else if (presetKey === 'all') {
      (permDefs || []).forEach((p) => {
        if (!ADMIN_CONTROL_KEYS.has(p.key) || actorIsSuperadmin) {
          updated[p.key] = true;
        }
      });
    }
    setNewRolePerms(updated);
  };

  const handleCreateGroupRole = async (e) => {
    e.preventDefault();
    if (!newRoleName.trim()) {
      setErr('Please enter a role name.');
      return;
    }
    setMsg(null);
    setErr(null);
    try {
      setCreatingRole(true);
      const res = await api.createGroupRole({
        name: newRoleName.trim(),
        description: newRoleDesc.trim(),
        permissions: newRolePerms,
      });
      setMsg(res.message || `Created group role "${newRoleName.trim()}".`);
      setNewRoleName('');
      setNewRoleDesc('');
      setNewRolePerms({});
      setShowCreateRoleForm(false);
      await loadGroupRoles();
    } catch (e2) {
      setErr(e2.message || 'Failed to create group role.');
    } finally {
      setCreatingRole(false);
    }
  };

  const startEditGroupRole = (role) => {
    setEditingRoleId(role.id);
    setEditRoleName(role.name || '');
    setEditRoleDesc(role.description || '');
    setEditRolePerms({ ...(role.permissions || {}) });
    setMsg(null);
    setErr(null);
  };

  const handleSaveGroupRoleEdit = async (roleId) => {
    setMsg(null);
    setErr(null);
    try {
      setSavingRoleEdit(true);
      const res = await api.updateGroupRole(roleId, {
        name: editRoleName.trim(),
        description: editRoleDesc.trim(),
        permissions: editRolePerms,
      });
      setMsg(res.message || 'Group role updated successfully.');
      setEditingRoleId(null);
      await loadGroupRoles();
    } catch (e2) {
      setErr(e2.message || 'Failed to update group role.');
    } finally {
      setSavingRoleEdit(false);
    }
  };

  const handleDeleteGroupRole = async (role) => {
    if (!window.confirm(`Delete group role "${role.name}"? This will revoke all its powers from assigned players.`)) return;
    setMsg(null);
    setErr(null);
    try {
      const res = await api.deleteGroupRole(role.id);
      setMsg(res.message || `Deleted group role "${role.name}".`);
      if (editingRoleId === role.id) setEditingRoleId(null);
      await loadGroupRoles();
    } catch (e2) {
      setErr(e2.message || 'Failed to delete group role.');
    }
  };

  const handleAddPlayerToRole = async (roleId) => {
    const selectedPlayerId = selectedPlayerByRole[roleId];
    if (!selectedPlayerId) {
      setErr('Please select a player from the dropdown to add.');
      return;
    }
    setMsg(null);
    setErr(null);
    try {
      setAddingMemberRole(roleId);
      const res = await api.addGroupRoleMember(roleId, selectedPlayerId);
      setMsg(res.message || 'Player added to group role successfully.');
      setSelectedPlayerByRole((prev) => ({ ...prev, [roleId]: '' }));
      await loadGroupRoles();
    } catch (e2) {
      setErr(e2.message || 'Failed to add player to group role.');
    } finally {
      setAddingMemberRole(null);
    }
  };

  const handleRemovePlayerFromRole = async (roleId, playerId, playerName) => {
    if (!window.confirm(`Remove ${playerName} from this group role? Their inherited functions will be revoked.`)) return;
    setMsg(null);
    setErr(null);
    const key = `${roleId}-${playerId}`;
    try {
      setRemovingMemberKey(key);
      const res = await api.removeGroupRoleMember(roleId, playerId);
      setMsg(res.message || `Removed ${playerName} from group role.`);
      await loadGroupRoles();
    } catch (e2) {
      setErr(e2.message || 'Failed to remove player from group role.');
    } finally {
      setRemovingMemberKey(null);
    }
  };

  if (!canManageUsers) {
    return null;
  }

  return (
    <div style={{ marginTop: '28px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '24px' }}>
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
        <div>
          <div className="scoreboard" style={{ color: '#FF9500', fontSize: '18px' }}>
            👥 ROLES, GROUP POWERS &amp; USER PERMISSIONS
          </div>
          <div style={{ fontSize: '12px', color: '#8E8E93', marginTop: '4px' }}>
            Create group roles, attach operational powers/functions, and add club players from the dropdown so they inherently assume those functions.
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

      {/* FEEDBACK BANNERS */}
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

      {/* SUBTABS SWITCHER */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          background: '#121212',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '10px',
          padding: '6px',
          marginBottom: '20px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('roles')}
          style={{
            flex: 1,
            padding: '9px 14px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'roles' ? '#FF9500' : 'transparent',
            color: activeTab === 'roles' ? '#16201B' : '#AEAEB2',
            fontWeight: 800,
            fontSize: '12.5px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <span>🛡️</span> Group Roles &amp; Inherited Player Powers ({groupRoles.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          style={{
            flex: 1,
            padding: '9px 14px',
            borderRadius: '8px',
            border: 'none',
            background: activeTab === 'users' ? '#FF9500' : 'transparent',
            color: activeTab === 'users' ? '#16201B' : '#AEAEB2',
            fontWeight: 800,
            fontSize: '12.5px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <span>👤</span> Platform Staff Accounts ({users.length})
        </button>
      </div>

      {/* =========================================================
          TAB 1: GROUP ROLES & INHERITED PLAYER FUNCTIONS
         ========================================================= */}
      {activeTab === 'roles' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF' }}>
              Active Group Roles ({groupRoles.length})
            </div>
            <button
              type="button"
              onClick={() => setShowCreateRoleForm((prev) => !prev)}
              style={{
                background: showCreateRoleForm ? 'rgba(255, 255, 255, 0.12)' : '#FF9500',
                color: showCreateRoleForm ? '#FFFFFF' : '#16201B',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {showCreateRoleForm ? '✖ Cancel' : '➕ Create New Group Role'}
            </button>
          </div>

          {/* CREATE GROUP ROLE FORM */}
          {showCreateRoleForm && (
            <form
              onSubmit={handleCreateGroupRole}
              style={{
                background: '#1C1C1E',
                border: '1px solid rgba(255, 149, 0, 0.35)',
                borderRadius: '12px',
                padding: '18px',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#FF9500', marginBottom: '12px' }}>
                ➕ Create Group Role &amp; Attach Powers
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ fontSize: '11.5px', color: '#AEAEB2', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                    Group Role Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Team Captains, Match Officials, Duty Marshals"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#121212', border: '1px solid rgba(255,255,255,0.14)', color: '#FFFFFF', fontSize: '12.5px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11.5px', color: '#AEAEB2', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                    Description &amp; Purpose
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Authorized to record fixture results and edit tactical lineups"
                    value={newRoleDesc}
                    onChange={(e) => setNewRoleDesc(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', background: '#121212', border: '1px solid rgba(255,255,255,0.14)', color: '#FFFFFF', fontSize: '12.5px', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {/* FUNCTION PRESETS */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11.5px', color: '#AEAEB2', fontWeight: 700, marginBottom: '6px' }}>
                  Quick Function Presets:
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => handleApplyPresetToNewRole('tactics')}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#EBEBF5', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    ⚽ Tactics Board Only
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPresetToNewRole('fixtures')}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#EBEBF5', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    📰 Match Reporter (Scores/Reports)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPresetToNewRole('duty')}
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#EBEBF5', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    🧹 Duty Marshal (Duty Roster)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPresetToNewRole('all')}
                    style={{ background: 'rgba(255, 149, 0, 0.14)', border: '1px solid rgba(255, 149, 0, 0.35)', color: '#FF9F0A', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: 700 }}
                  >
                    🛡️ Full Operational Powers
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRolePerms({})}
                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#8E8E93', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* ATTACH POWERS CHECKBOXES */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '11.5px', color: '#AEAEB2', fontWeight: 700, marginBottom: '8px' }}>
                  Powers &amp; functions attached to this group (players in this group assume all ticked functions):
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '8px' }}>
                  {permDefs.map((p) => {
                    const isAdminCtrl = ADMIN_CONTROL_KEYS.has(p.key);
                    const disabled = isAdminCtrl && !actorIsSuperadmin;
                    const checked = Boolean(newRolePerms[p.key]);
                    return (
                      <label
                        key={p.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '7px 10px',
                          borderRadius: '8px',
                          background: checked ? 'rgba(255, 149, 0, 0.1)' : 'rgba(255,255,255,0.02)',
                          border: checked ? '1px solid rgba(255, 149, 0, 0.4)' : '1px solid rgba(255,255,255,0.06)',
                          fontSize: '12px',
                          color: disabled ? '#6E6E73' : '#EBEBF5',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={(e) => setNewRolePerms((prev) => ({ ...prev, [p.key]: e.target.checked }))}
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
                disabled={creatingRole}
                style={{
                  background: '#FF9500',
                  color: '#16201B',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 18px',
                  fontSize: '12.5px',
                  fontWeight: 800,
                  cursor: creatingRole ? 'not-allowed' : 'pointer',
                }}
              >
                {creatingRole ? 'Creating Group Role…' : '💾 Save & Create Group Role'}
              </button>
            </form>
          )}

          {/* LIST OF GROUP ROLES */}
          {loadingRoles && groupRoles.length === 0 && (
            <div style={{ fontSize: '12.5px', color: '#8E8E93', padding: '16px 0', textAlign: 'center' }}>
              Loading group roles…
            </div>
          )}

          {!loadingRoles && groupRoles.length === 0 && !showCreateRoleForm && (
            <div
              style={{
                background: '#1C1C1E',
                border: '1px dashed rgba(255, 255, 255, 0.16)',
                borderRadius: '12px',
                padding: '36px 20px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>🛡️</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', marginBottom: '6px' }}>
                No Group Roles Created Yet
              </div>
              <div style={{ fontSize: '12.5px', color: '#8E8E93', maxWidth: '420px', margin: '0 auto 16px' }}>
                Group roles allow attaching management functions (like Tactics, Scores, Duty Roster) and assigning club players so they inherently assume those functions.
              </div>
              <button
                type="button"
                onClick={() => setShowCreateRoleForm(true)}
                style={{
                  background: '#FF9500',
                  color: '#16201B',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                ➕ Create First Group Role
              </button>
            </div>
          )}

          {groupRoles.map((role) => {
            const isEditing = editingRoleId === role.id;
            const attachedPerms = Object.entries(role.permissions || {}).filter(([_, v]) => Boolean(v));
            const members = role.members || [];
            const memberIds = new Set(members.map((m) => String(m.id || m.player_id)));
            // Available players not yet in this group
            const selectablePlayers = availablePlayers.filter(
              (p) => !memberIds.has(String(p.id)) && !memberIds.has(String(p.player_id))
            );

            return (
              <div
                key={role.id}
                style={{
                  background: '#1C1C1E',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                {/* ROLE HEADER */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: '15px', color: '#FFFFFF' }}>
                        🛡️ {role.name}
                      </span>
                      <span
                        style={{
                          padding: '3px 9px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 800,
                          background: 'rgba(255, 149, 0, 0.16)',
                          color: '#FF9F0A',
                          border: '1px solid rgba(255, 149, 0, 0.3)',
                        }}
                      >
                        {members.length} {members.length === 1 ? 'Player' : 'Players'}
                      </span>
                      <span
                        style={{
                          padding: '3px 9px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: 'rgba(48, 209, 88, 0.14)',
                          color: '#30D158',
                        }}
                      >
                        {attachedPerms.length} {attachedPerms.length === 1 ? 'Power' : 'Powers'} Attached
                      </span>
                    </div>
                    {role.description && (
                      <div style={{ fontSize: '12px', color: '#8E8E93', marginTop: '4px' }}>
                        {role.description}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => (isEditing ? setEditingRoleId(null) : startEditGroupRole(role))}
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
                      {isEditing ? 'Close' : '✏️ Edit Powers'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteGroupRole(role)}
                      style={{
                        background: 'rgba(255, 69, 58, 0.14)',
                        color: '#FF6961',
                        border: '1px solid rgba(255, 69, 58, 0.3)',
                        borderRadius: '7px',
                        padding: '6px 11px',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      🗑️ Delete Role
                    </button>
                  </div>
                </div>

                {/* EDIT ROLE INLINE FORM */}
                {isEditing && (
                  <div
                    style={{
                      background: '#121212',
                      border: '1px solid rgba(255, 149, 0, 0.3)',
                      borderRadius: '10px',
                      padding: '14px',
                    }}
                  >
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#FF9500', marginBottom: '10px' }}>
                      Edit Role &amp; Attached Powers: {role.name}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ fontSize: '11px', color: '#AEAEB2', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
                          Role Name
                        </label>
                        <input
                          type="text"
                          value={editRoleName}
                          onChange={(e) => setEditRoleName(e.target.value)}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', background: '#1C1C1E', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '12px', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: '#AEAEB2', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
                          Description
                        </label>
                        <input
                          type="text"
                          value={editRoleDesc}
                          onChange={(e) => setEditRoleDesc(e.target.value)}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', background: '#1C1C1E', border: '1px solid rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '12px', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>

                    <div style={{ fontSize: '11px', color: '#AEAEB2', fontWeight: 700, marginBottom: '6px' }}>
                      Attached Powers (tick to grant, untick to revoke):
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px', marginBottom: '12px' }}>
                      {permDefs.map((p) => {
                        const checked = Boolean(editRolePerms[p.key]);
                        return (
                          <label
                            key={p.key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '5px 8px',
                              borderRadius: '6px',
                              background: checked ? 'rgba(255, 149, 0, 0.1)' : 'rgba(255,255,255,0.02)',
                              border: checked ? '1px solid rgba(255, 149, 0, 0.35)' : '1px solid rgba(255,255,255,0.06)',
                              fontSize: '11.5px',
                              color: '#EBEBF5',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => setEditRolePerms((prev) => ({ ...prev, [p.key]: e.target.checked }))}
                              style={{ accentColor: '#FF9500', width: '14px', height: '14px' }}
                            />
                            <span>{p.label}</span>
                          </label>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        disabled={savingRoleEdit}
                        onClick={() => handleSaveGroupRoleEdit(role.id)}
                        style={{
                          background: '#FF9500',
                          color: '#16201B',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '7px 14px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: savingRoleEdit ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {savingRoleEdit ? 'Saving…' : '💾 Save Changes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingRoleId(null)}
                        style={{
                          background: 'rgba(255,255,255,0.08)',
                          color: '#EBEBF5',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '7px 14px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* ATTACHED POWERS PILLS */}
                <div>
                  <div style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                    Inherited Functions / Powers:
                  </div>
                  {attachedPerms.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#6E6E73', fontStyle: 'italic' }}>
                      No functions attached yet. Click "Edit Powers" to attach capabilities.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {attachedPerms.map(([k]) => {
                        const def = permDefs.find((p) => p.key === k);
                        return (
                          <span
                            key={k}
                            style={{
                              padding: '3px 9px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: 'rgba(108, 229, 160, 0.12)',
                              color: '#6CE5A0',
                              border: '1px solid rgba(108, 229, 160, 0.3)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <span>✓</span> {def?.label || k}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* =========================================================
                    ASSIGN PLAYERS TO GROUP ROLE (DROPDOWN + ADD BUTTON)
                   ========================================================= */}
                <div
                  style={{
                    background: '#141416',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '10px',
                    padding: '12px',
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#EBEBF5', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>👤 Assigned Club Players ({members.length})</span>
                    <span style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 400 }}>
                      Players in this group assume its functions inherently
                    </span>
                  </div>

                  {/* DROP DOWN SELECTOR FOR PLAYERS */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <select
                      value={selectedPlayerByRole[role.id] || ''}
                      onChange={(e) =>
                        setSelectedPlayerByRole((prev) => ({ ...prev, [role.id]: e.target.value }))
                      }
                      style={{
                        flex: 1,
                        minWidth: '220px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: '#1C1C1E',
                        border: '1px solid rgba(255, 255, 255, 0.14)',
                        color: '#FFFFFF',
                        fontSize: '12.5px',
                        cursor: 'pointer',
                      }}
                    >
                      <option value="">
                        -- Select a player to add to {role.name} ({selectablePlayers.length} available) --
                      </option>
                      {selectablePlayers.map((p) => {
                        const jersey = p.jersey_number ? `#${p.jersey_number} ` : '';
                        const team = p.team_name ? `[${p.team_name}] ` : '';
                        const pos = p.position ? `(${p.position}) ` : '';
                        return (
                          <option key={p.id} value={p.id}>
                            {team}{p.name} {jersey}{pos}- ID: {p.player_id}
                          </option>
                        );
                      })}
                    </select>

                    <button
                      type="button"
                      disabled={addingMemberRole === role.id || !selectedPlayerByRole[role.id]}
                      onClick={() => handleAddPlayerToRole(role.id)}
                      style={{
                        background: selectedPlayerByRole[role.id] ? '#FF9500' : 'rgba(255, 149, 0, 0.3)',
                        color: '#16201B',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px 16px',
                        fontSize: '12px',
                        fontWeight: 800,
                        cursor: selectedPlayerByRole[role.id] && addingMemberRole !== role.id ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {addingMemberRole === role.id ? 'Adding…' : '➕ Add Player to Group'}
                    </button>
                  </div>

                  {/* CURRENT MEMBERS CHIPS */}
                  {members.length === 0 ? (
                    <div style={{ fontSize: '11.5px', color: '#6E6E73', fontStyle: 'italic', padding: '4px 0' }}>
                      No players currently assigned. Use the dropdown above to add players to {role.name}.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
                      {members.map((m) => {
                        const isRemoving = removingMemberKey === `${role.id}-${m.id || m.player_id}`;
                        return (
                          <div
                            key={m.id || m.player_id}
                            style={{
                              background: '#1C1C1E',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: '8px',
                              padding: '8px 10px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                              <div
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  background: m.team_color || '#3F7A4E',
                                  color: '#FFFFFF',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 800,
                                  fontSize: '11px',
                                  flexShrink: 0,
                                }}
                              >
                                {m.jersey_number || m.name?.charAt(0) || '⚽'}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {m.name}
                                </div>
                                <div style={{ fontSize: '10.5px', color: '#8E8E93', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  <span>{m.team_name || 'Free Agent'}</span>
                                  {m.position && <span>• {m.position}</span>}
                                  <span>• ID: {m.player_id}</span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={isRemoving}
                              onClick={() => handleRemovePlayerFromRole(role.id, m.id || m.player_id, m.name)}
                              title="Remove player and revoke inherited powers"
                              style={{
                                background: 'rgba(255, 69, 58, 0.12)',
                                color: '#FF6961',
                                border: '1px solid rgba(255, 69, 58, 0.25)',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '11px',
                                fontWeight: 700,
                                cursor: isRemoving ? 'not-allowed' : 'pointer',
                                flexShrink: 0,
                              }}
                            >
                              {isRemoving ? '…' : '❌ Remove'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =========================================================
          TAB 2: STAFF & MANAGER USER ACCOUNTS
         ========================================================= */}
      {activeTab === 'users' && (
        <div>
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
              ➕ Add New Staff Account
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
                            border: '1px solid rgba(255, 69, 58, 0.3)',
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

                  {/* INLINE EDIT FORM */}
                  {isEditing && (
                    <div
                      style={{
                        marginTop: '14px',
                        paddingTop: '14px',
                        borderTop: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                        <div>
                          <label style={{ fontSize: '11px', color: '#AEAEB2', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
                            User Type
                          </label>
                          <select
                            value={editType}
                            onChange={(e) => handleSelectEditType(e.target.value)}
                            style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', background: '#121212', border: '1px solid rgba(255,255,255,0.14)', color: '#FFFFFF', fontSize: '12px' }}
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
                          <label style={{ fontSize: '11px', color: '#AEAEB2', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
                            Reset Password (Optional)
                          </label>
                          <input
                            type="password"
                            placeholder="Leave blank to keep unchanged"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', background: '#121212', border: '1px solid rgba(255,255,255,0.14)', color: '#FFFFFF', fontSize: '12px' }}
                          />
                        </div>
                      </div>

                      {/* CAPABILITY CHECKBOXES FOR EDIT */}
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '11px', color: '#AEAEB2', fontWeight: 700, marginBottom: '6px' }}>
                          Capabilities:
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px' }}>
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
                                  gap: '6px',
                                  padding: '5px 8px',
                                  borderRadius: '6px',
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
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          disabled={savingEdit}
                          onClick={() => handleSaveEdit(u)}
                          style={{
                            background: '#FF9500',
                            color: '#16201B',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '7px 14px',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: savingEdit ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {savingEdit ? 'Saving…' : '💾 Save Changes'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingUserId(null)}
                          style={{
                            background: 'rgba(255,255,255,0.08)',
                            color: '#EBEBF5',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '7px 14px',
                            fontSize: '12px',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
