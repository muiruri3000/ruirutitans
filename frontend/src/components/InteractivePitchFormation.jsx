import React, { useState, useEffect, useRef, useMemo } from 'react';

// Standard tactical formation presets by team size
export const FORMATION_PRESETS = {
  5: {
    '1-2-1': {
      name: '1-2-1 (Diamond Pivot)',
      slots: [
        { role: 'GK', label: 'Goalkeeper', x: 50, y: 88, icon: '🧤' },
        { role: 'CB', label: 'Center Back', x: 50, y: 66, icon: '🛡️' },
        { role: 'LM', label: 'Left Midfield', x: 25, y: 44, icon: '⚙️' },
        { role: 'RM', label: 'Right Midfield', x: 75, y: 44, icon: '⚙️' },
        { role: 'ST', label: 'Striker', x: 50, y: 18, icon: '🎯' },
      ],
    },
    '2-1-1': {
      name: '2-1-1 (Balanced Anchor)',
      slots: [
        { role: 'GK', label: 'Goalkeeper', x: 50, y: 88, icon: '🧤' },
        { role: 'LB', label: 'Left Defender', x: 28, y: 68, icon: '🛡️' },
        { role: 'RB', label: 'Right Defender', x: 72, y: 68, icon: '🛡️' },
        { role: 'CM', label: 'Central Pivot', x: 50, y: 44, icon: '⚙️' },
        { role: 'ST', label: 'Striker', x: 50, y: 18, icon: '🎯' },
      ],
    },
    '2-2': {
      name: '2-2 (Square Block)',
      slots: [
        { role: 'GK', label: 'Goalkeeper', x: 50, y: 88, icon: '🧤' },
        { role: 'LB', label: 'Left Defender', x: 28, y: 68, icon: '🛡️' },
        { role: 'RB', label: 'Right Defender', x: 72, y: 68, icon: '🛡️' },
        { role: 'LF', label: 'Left Forward', x: 32, y: 22, icon: '⚡' },
        { role: 'RF', label: 'Right Forward', x: 68, y: 22, icon: '⚡' },
      ],
    },
  },
  6: {
    '2-2-1': {
      name: '2-2-1 (Solid Anchor)',
      slots: [
        { role: 'GK', label: 'Goalkeeper', x: 50, y: 88, icon: '🧤' },
        { role: 'LB', label: 'Left Back', x: 28, y: 68, icon: '🛡️' },
        { role: 'RB', label: 'Right Back', x: 72, y: 68, icon: '🛡️' },
        { role: 'LM', label: 'Left Midfield', x: 28, y: 44, icon: '⚙️' },
        { role: 'RM', label: 'Right Midfield', x: 72, y: 44, icon: '⚙️' },
        { role: 'ST', label: 'Striker', x: 50, y: 18, icon: '🎯' },
      ],
    },
    '2-1-2': {
      name: '2-1-2 (Twin Strikers)',
      slots: [
        { role: 'GK', label: 'Goalkeeper', x: 50, y: 88, icon: '🧤' },
        { role: 'LB', label: 'Left Back', x: 28, y: 68, icon: '🛡️' },
        { role: 'RB', label: 'Right Back', x: 72, y: 68, icon: '🛡️' },
        { role: 'CM', label: 'Central Pivot', x: 50, y: 46, icon: '⚙️' },
        { role: 'LF', label: 'Left Striker', x: 32, y: 20, icon: '⚡' },
        { role: 'RF', label: 'Right Striker', x: 68, y: 20, icon: '🎯' },
      ],
    },
    '3-1-1': {
      name: '3-1-1 (The Fortress)',
      slots: [
        { role: 'GK', label: 'Goalkeeper', x: 50, y: 88, icon: '🧤' },
        { role: 'LB', label: 'Left Defender', x: 20, y: 68, icon: '🛡️' },
        { role: 'CB', label: 'Central Stopper', x: 50, y: 72, icon: '🛡️' },
        { role: 'RB', label: 'Right Defender', x: 80, y: 68, icon: '🛡️' },
        { role: 'CM', label: 'Central Anchor', x: 50, y: 44, icon: '⚙️' },
        { role: 'ST', label: 'Striker', x: 50, y: 18, icon: '🎯' },
      ],
    },
    '1-3-1': {
      name: '1-3-1 (Midfield Dominance)',
      slots: [
        { role: 'GK', label: 'Goalkeeper', x: 50, y: 88, icon: '🧤' },
        { role: 'CB', label: 'Center Back', x: 50, y: 70, icon: '🛡️' },
        { role: 'LM', label: 'Left Midfield', x: 20, y: 44, icon: '⚙️' },
        { role: 'CM', label: 'Central Midfield', x: 50, y: 46, icon: '⚙️' },
        { role: 'RM', label: 'Right Midfield', x: 80, y: 44, icon: '⚙️' },
        { role: 'ST', label: 'Striker', x: 50, y: 18, icon: '🎯' },
      ],
    },
    '1-2-2': {
      name: '1-2-2 (Wing Overload)',
      slots: [
        { role: 'GK', label: 'Goalkeeper', x: 50, y: 88, icon: '🧤' },
        { role: 'CB', label: 'Center Back', x: 50, y: 70, icon: '🛡️' },
        { role: 'LM', label: 'Left Midfield', x: 28, y: 46, icon: '⚙️' },
        { role: 'RM', label: 'Right Midfield', x: 72, y: 46, icon: '⚙️' },
        { role: 'LW', label: 'Left Wing/Forward', x: 30, y: 20, icon: '⚡' },
        { role: 'RW', label: 'Right Wing/Forward', x: 70, y: 20, icon: '⚡' },
      ],
    },
  },
  7: {
    '2-3-1': {
      name: '2-3-1 (Midfield Engine)',
      slots: [
        { role: 'GK', label: 'Goalkeeper', x: 50, y: 88, icon: '🧤' },
        { role: 'LB', label: 'Left Back', x: 28, y: 70, icon: '🛡️' },
        { role: 'RB', label: 'Right Back', x: 72, y: 70, icon: '🛡️' },
        { role: 'LM', label: 'Left Midfield', x: 20, y: 46, icon: '⚙️' },
        { role: 'CM', label: 'Center Midfield', x: 50, y: 48, icon: '⚙️' },
        { role: 'RM', label: 'Right Midfield', x: 80, y: 46, icon: '⚙️' },
        { role: 'ST', label: 'Striker', x: 50, y: 18, icon: '🎯' },
      ],
    },
    '3-2-1': {
      name: '3-2-1 (The Pyramid)',
      slots: [
        { role: 'GK', label: 'Goalkeeper', x: 50, y: 88, icon: '🧤' },
        { role: 'LB', label: 'Left Back', x: 22, y: 70, icon: '🛡️' },
        { role: 'CB', label: 'Center Back', x: 50, y: 72, icon: '🛡️' },
        { role: 'RB', label: 'Right Back', x: 78, y: 70, icon: '🛡️' },
        { role: 'LCM', label: 'Left Midfield', x: 35, y: 46, icon: '⚙️' },
        { role: 'RCM', label: 'Right Midfield', x: 65, y: 46, icon: '⚙️' },
        { role: 'ST', label: 'Striker', x: 50, y: 18, icon: '🎯' },
      ],
    },
    '2-2-2': {
      name: '2-2-2 (Dual Balance)',
      slots: [
        { role: 'GK', label: 'Goalkeeper', x: 50, y: 88, icon: '🧤' },
        { role: 'LB', label: 'Left Back', x: 28, y: 70, icon: '🛡️' },
        { role: 'RB', label: 'Right Back', x: 72, y: 70, icon: '🛡️' },
        { role: 'LM', label: 'Left Midfield', x: 28, y: 46, icon: '⚙️' },
        { role: 'RM', label: 'Right Midfield', x: 72, y: 46, icon: '⚙️' },
        { role: 'LF', label: 'Left Forward', x: 32, y: 20, icon: '⚡' },
        { role: 'RF', label: 'Right Forward', x: 68, y: 20, icon: '🎯' },
      ],
    },
  },
  8: {
    '2-4-1': {
      name: '2-4-1 (Midfield Overload)',
      slots: [
        { role: 'GK', label: 'Goalkeeper', x: 50, y: 88, icon: '🧤' },
        { role: 'LB', label: 'Left Defender', x: 30, y: 72, icon: '🛡️' },
        { role: 'RB', label: 'Right Defender', x: 70, y: 72, icon: '🛡️' },
        { role: 'LM', label: 'Left Midfield', x: 18, y: 46, icon: '⚙️' },
        { role: 'LCM', label: 'Left Central Mid', x: 38, y: 48, icon: '⚙️' },
        { role: 'RCM', label: 'Right Central Mid', x: 62, y: 48, icon: '⚙️' },
        { role: 'RM', label: 'Right Midfield', x: 82, y: 46, icon: '⚙️' },
        { role: 'ST', label: 'Striker', x: 50, y: 18, icon: '🎯' },
      ],
    },
    '3-3-1': {
      name: '3-3-1 (Solid Spine)',
      slots: [
        { role: 'GK', label: 'Goalkeeper', x: 50, y: 88, icon: '🧤' },
        { role: 'LB', label: 'Left Back', x: 22, y: 72, icon: '🛡️' },
        { role: 'CB', label: 'Center Back', x: 50, y: 74, icon: '🛡️' },
        { role: 'RB', label: 'Right Back', x: 78, y: 72, icon: '🛡️' },
        { role: 'LM', label: 'Left Midfield', x: 22, y: 46, icon: '⚙️' },
        { role: 'CM', label: 'Central Midfield', x: 50, y: 48, icon: '⚙️' },
        { role: 'RM', label: 'Right Midfield', x: 78, y: 46, icon: '⚙️' },
        { role: 'ST', label: 'Striker', x: 50, y: 18, icon: '🎯' },
      ],
    },
  },
  11: {
    '4-3-3': {
      name: '4-3-3 (Attacking Trio)',
      slots: [
        { role: 'GK', label: 'Goalkeeper', x: 50, y: 91, icon: '🧤' },
        { role: 'LB', label: 'Left Back', x: 16, y: 74, icon: '🛡️' },
        { role: 'LCB', label: 'Left Center Back', x: 38, y: 76, icon: '🛡️' },
        { role: 'RCB', label: 'Right Center Back', x: 62, y: 76, icon: '🛡️' },
        { role: 'RB', label: 'Right Back', x: 84, y: 74, icon: '🛡️' },
        { role: 'CDM', label: 'Defensive Mid', x: 50, y: 56, icon: '⚙️' },
        { role: 'LCM', label: 'Left Mid', x: 30, y: 44, icon: '⚙️' },
        { role: 'RCM', label: 'Right Mid', x: 70, y: 44, icon: '⚙️' },
        { role: 'LW', label: 'Left Winger', x: 20, y: 22, icon: '⚡' },
        { role: 'ST', label: 'Center Forward', x: 50, y: 16, icon: '🎯' },
        { role: 'RW', label: 'Right Winger', x: 80, y: 22, icon: '⚡' },
      ],
    },
    '4-4-2': {
      name: '4-4-2 (Classic Flat)',
      slots: [
        { role: 'GK', label: 'Goalkeeper', x: 50, y: 91, icon: '🧤' },
        { role: 'LB', label: 'Left Back', x: 16, y: 74, icon: '🛡️' },
        { role: 'LCB', label: 'Left Center Back', x: 38, y: 76, icon: '🛡️' },
        { role: 'RCB', label: 'Right Center Back', x: 62, y: 76, icon: '🛡️' },
        { role: 'RB', label: 'Right Back', x: 84, y: 74, icon: '🛡️' },
        { role: 'LM', label: 'Left Midfield', x: 18, y: 46, icon: '⚙️' },
        { role: 'LCM', label: 'Left Central Mid', x: 38, y: 48, icon: '⚙️' },
        { role: 'RCM', label: 'Right Central Mid', x: 62, y: 48, icon: '⚙️' },
        { role: 'RM', label: 'Right Midfield', x: 82, y: 46, icon: '⚙️' },
        { role: 'LF', label: 'Left Striker', x: 35, y: 18, icon: '🎯' },
        { role: 'RF', label: 'Right Striker', x: 65, y: 18, icon: '🎯' },
      ],
    },
    '3-5-2': {
      name: '3-5-2 (Wingbacks Engine)',
      slots: [
        { role: 'GK', label: 'Goalkeeper', x: 50, y: 91, icon: '🧤' },
        { role: 'LCB', label: 'Left Center Back', x: 26, y: 76, icon: '🛡️' },
        { role: 'CB', label: 'Center Back', x: 50, y: 78, icon: '🛡️' },
        { role: 'RCB', label: 'Right Center Back', x: 74, y: 76, icon: '🛡️' },
        { role: 'LWB', label: 'Left Wingback', x: 14, y: 52, icon: '⚙️' },
        { role: 'LCM', label: 'Left Mid', x: 34, y: 48, icon: '⚙️' },
        { role: 'CM', label: 'Center Mid', x: 50, y: 52, icon: '⚙️' },
        { role: 'RCM', label: 'Right Mid', x: 66, y: 48, icon: '⚙️' },
        { role: 'RWB', label: 'Right Wingback', x: 86, y: 52, icon: '⚙️' },
        { role: 'LF', label: 'Left Striker', x: 35, y: 18, icon: '🎯' },
        { role: 'RF', label: 'Right Striker', x: 65, y: 18, icon: '🎯' },
      ],
    },
  },
};

const POSITION_ROLES = [
  { key: 'GK', label: 'Goalkeeper', icon: '🧤', line: 'GK' },
  { key: 'LB', label: 'Left Back', icon: '🛡️', line: 'DEF' },
  { key: 'CB', label: 'Center Back', icon: '🛡️', line: 'DEF' },
  { key: 'RB', label: 'Right Back', icon: '🛡️', line: 'DEF' },
  { key: 'DEF', label: 'Defender', icon: '🛡️', line: 'DEF' },
  { key: 'CDM', label: 'Defensive Mid', icon: '⚙️', line: 'MID' },
  { key: 'CM', label: 'Central Mid', icon: '⚙️', line: 'MID' },
  { key: 'CAM', label: 'Attacking Mid', icon: '⚙️', line: 'MID' },
  { key: 'MID', label: 'Midfielder', icon: '⚙️', line: 'MID' },
  { key: 'LW', label: 'Left Winger', icon: '⚡', line: 'ATT' },
  { key: 'RW', label: 'Right Winger', icon: '⚡', line: 'ATT' },
  { key: 'WING', label: 'Winger', icon: '⚡', line: 'ATT' },
  { key: 'ST', label: 'Striker', icon: '🎯', line: 'ATT' },
];

export default function InteractivePitchFormation({
  lineup = [],
  formation = '',
  teamSize = 6,
  includeGk = true,
  isAdmin = false,
  allCandidates = [],
  onSaveFormation,
  onResetLineup,
  target = 'totw', // 'totw' | 'tott'
  roundTitle = 'Team Lineup',
}) {
  const pitchRef = useRef(null);

  // Available presets for this team size
  const presetsForSize = FORMATION_PRESETS[teamSize] || FORMATION_PRESETS[6] || {};
  const defaultPresetKey = Object.keys(presetsForSize)[0] || '2-2-1';

  // Active formation name
  const [selectedFormation, setSelectedFormation] = useState(
    formation || defaultPresetKey
  );

  // Local editable lineup state
  const [pitchNodes, setPitchNodes] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState(null);

  // Dragging state
  const [draggingIdx, setDraggingIdx] = useState(null);
  const dragStartRef = useRef({ startX: 0, startY: 0, nodeX: 50, nodeY: 50, moved: false });

  // Swap & Position picker modal state
  const [swapSourceIdx, setSwapSourceIdx] = useState(null);
  const [editingPosIdx, setEditingPosIdx] = useState(null);
  const [replacingPlayerIdx, setReplacingPlayerIdx] = useState(null);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');

  // Synchronize incoming lineup into pitchNodes
  useEffect(() => {
    if (!lineup || lineup.length === 0) return;

    const size = Number(teamSize) || 6;
    const filtered = (includeGk ? lineup : lineup.filter((p) => p.position !== 'GK')).slice(0, size);

    // Get preset slots if formation exists
    const preset = presetsForSize[formation] || presetsForSize[selectedFormation] || Object.values(presetsForSize)[0];
    const defaultSlots = preset ? preset.slots : [];

    const nodes = filtered.map((player, idx) => {
      const slotDef = defaultSlots[idx] || null;
      // Use existing x/y or slot preset or dynamic coordinates
      let x = typeof player.x === 'number' ? player.x : (slotDef ? slotDef.x : 20 + (idx % 3) * 30);
      let y = typeof player.y === 'number' ? player.y : (slotDef ? slotDef.y : 20 + Math.floor(idx / 3) * 35);
      const pos = player.position || (slotDef ? slotDef.role : 'CM');

      return {
        ...player,
        id: player.player_id || `slot_${idx}`,
        position: pos,
        slot_label: player.slot_label || pos,
        x: Math.max(8, Math.min(92, x)),
        y: Math.max(8, Math.min(92, y)),
      };
    });

    setPitchNodes(nodes);
    if (formation) {
      setSelectedFormation(formation);
    }
  }, [lineup, formation, teamSize, includeGk]);

  const showStatus = (msg, isErr = false) => {
    setNotice({ text: msg, isErr });
    setTimeout(() => {
      setNotice(null);
    }, 4000);
  };

  // Change formation preset
  const handleSelectFormation = (formKey) => {
    setSelectedFormation(formKey);
    setIsDirty(true);

    if (formKey === 'custom') return;

    const preset = presetsForSize[formKey];
    if (!preset) return;

    const newNodes = pitchNodes.map((node, idx) => {
      const slot = preset.slots[idx];
      if (!slot) return node;

      // When snapping to formation, adapt position if slot role differs
      const newPos = (node.position === 'Pending' || !node.player_id) ? slot.role : node.position;

      return {
        ...node,
        x: slot.x,
        y: slot.y,
        position: newPos,
        slot_label: `${newPos} • ${slot.label || newPos}`,
      };
    });

    setPitchNodes(newNodes);
    showStatus(`↺ Snapped to ${preset.name} formation!`);
  };

  // Drag interaction handlers
  const handlePointerDown = (e, index) => {
    if (!isAdmin) return;
    if (swapSourceIdx !== null) return; // In swap mode
    if (e.target.closest('button') || e.target.closest('select')) return;

    e.preventDefault();
    setDraggingIdx(index);
    const clientX = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
    const clientY = e.clientY || (e.touches && e.touches[0]?.clientY) || 0;

    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      nodeX: pitchNodes[index].x,
      nodeY: pitchNodes[index].y,
      moved: false,
    };
  };

  useEffect(() => {
    if (draggingIdx === null) return;

    const handlePointerMove = (e) => {
      if (!pitchRef.current) return;
      const clientX = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
      const clientY = e.clientY || (e.touches && e.touches[0]?.clientY) || 0;

      const rect = pitchRef.current.getBoundingClientRect();
      const deltaX = clientX - dragStartRef.current.startX;
      const deltaY = clientY - dragStartRef.current.startY;

      if (Math.hypot(deltaX, deltaY) > 5) {
        dragStartRef.current.moved = true;
      }

      const deltaPctX = (deltaX / rect.width) * 100;
      const deltaPctY = (deltaY / rect.height) * 100;

      const nextX = Math.max(8, Math.min(92, Math.round((dragStartRef.current.nodeX + deltaPctX) * 10) / 10));
      const nextY = Math.max(8, Math.min(92, Math.round((dragStartRef.current.nodeY + deltaPctY) * 10) / 10));

      setPitchNodes((prev) =>
        prev.map((n, i) => (i === draggingIdx ? { ...n, x: nextX, y: nextY } : n))
      );
      setIsDirty(true);
      setSelectedFormation('Custom');
    };

    const handlePointerUp = () => {
      if (dragStartRef.current.moved) {
        // Check if dropped near another player to trigger swap
        const draggedNode = pitchNodes[draggingIdx];
        if (draggedNode) {
          const hoveredTarget = pitchNodes.findIndex(
            (other, i) => i !== draggingIdx && Math.hypot(other.x - draggedNode.x, other.y - draggedNode.y) < 7.5
          );
          if (hoveredTarget !== -1) {
            handleSwapTwoPlayers(draggingIdx, hoveredTarget);
          }
        }
      }
      setDraggingIdx(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [draggingIdx, pitchNodes]);

  // Swap two player positions
  const handleSwapTwoPlayers = (idx1, idx2) => {
    if (idx1 === idx2) {
      setSwapSourceIdx(null);
      return;
    }
    const updated = [...pitchNodes];
    const node1 = { ...updated[idx1] };
    const node2 = { ...updated[idx2] };

    // Swap their coordinates and position roles
    const tempX = node1.x;
    const tempY = node1.y;
    node1.x = node2.x;
    node1.y = node2.y;
    node2.x = tempX;
    node2.y = tempY;

    updated[idx1] = node2;
    updated[idx2] = node1;

    setPitchNodes(updated);
    setIsDirty(true);
    setSwapSourceIdx(null);
    showStatus(`⇄ Swapped ${node1.player_name || 'Slot'} and ${node2.player_name || 'Slot'}!`);
  };

  // Change position role for a slot
  const handleChangePositionRole = (index, newRole) => {
    const roleDef = POSITION_ROLES.find((r) => r.key === newRole) || { label: newRole };
    const updated = pitchNodes.map((n, i) => {
      if (i === index) {
        return {
          ...n,
          position: newRole,
          slot_label: `${newRole} • ${roleDef.label}`,
        };
      }
      return n;
    });
    setPitchNodes(updated);
    setIsDirty(true);
    setEditingPosIdx(null);
    showStatus(`✅ Position updated to ${newRole} for ${updated[index].player_name || 'Player'}`);
  };

  // Replace player in slot with another candidate
  const handleSelectReplacementPlayer = (slotIndex, candidate) => {
    const updated = pitchNodes.map((n, i) => {
      if (i === slotIndex) {
        return {
          ...n,
          player_id: candidate.player_id || candidate.id,
          player_name: candidate.name,
          team_id: candidate.team_id,
          team_name: candidate.team_name,
          team_color: candidate.team_color || '#FF9500',
          position: n.position || candidate.position || 'CM',
        };
      }
      return n;
    });
    setPitchNodes(updated);
    setIsDirty(true);
    setReplacingPlayerIdx(null);
    setPlayerSearchQuery('');
    showStatus(`✅ Replaced slot with ${candidate.name} (${candidate.team_name})`);
  };

  // Save formation and lineup to backend
  const handleSave = async () => {
    if (!onSaveFormation) return;
    setIsSaving(true);
    try {
      await onSaveFormation(selectedFormation, pitchNodes);
      setIsDirty(false);
      showStatus(`🎉 ${target === 'totw' ? 'Team of the Week' : 'Team of the Season'} formation and positions saved!`);
    } catch (err) {
      showStatus(`❌ Save failed: ${err.message}`, true);
    } finally {
      setIsSaving(false);
    }
  };

  // Reset lineup back to automatic vote winners
  const handleReset = async () => {
    if (!window.confirm(`Reset ${target === 'totw' ? 'Team of the Week' : 'Team of the Season'} back to automatic vote winners?`)) {
      return;
    }
    if (onResetLineup) {
      setIsSaving(true);
      try {
        await onResetLineup();
        setIsDirty(false);
        showStatus('↺ Lineup and formation reset to automatic vote results.');
      } catch (err) {
        showStatus(`❌ Reset failed: ${err.message}`, true);
      } finally {
        setIsSaving(false);
      }
    }
  };

  // Filtered replacement candidates
  const filteredCandidates = useMemo(() => {
    if (!allCandidates || allCandidates.length === 0) return [];
    if (!playerSearchQuery.trim()) return allCandidates.slice(0, 30);
    const q = playerSearchQuery.toLowerCase();
    return allCandidates.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.team_name && c.team_name.toLowerCase().includes(q)) ||
        (c.position && c.position.toLowerCase().includes(q))
    ).slice(0, 30);
  }, [allCandidates, playerSearchQuery]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Notice Banner */}
      {notice && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: '8px',
            background: notice.isErr ? 'rgba(255, 69, 58, 0.15)' : 'rgba(48, 209, 88, 0.15)',
            border: `1px solid ${notice.isErr ? '#FF453A' : '#30D158'}`,
            color: notice.isErr ? '#FF453A' : '#30D158',
            fontSize: '13px',
            fontWeight: 700,
            textAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {notice.text}
        </div>
      )}

      {/* Admin Formation & Tactical Controls Bar */}
      {isAdmin && (
        <div
          style={{
            background: '#161618',
            border: isDirty ? '2px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            boxShadow: '0 4px 18px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '18px' }}>⚙️</span>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.04em' }}>
                  ADMIN FORMATION &amp; POSITION CONTROLLER
                </div>
                <div style={{ fontSize: '11px', color: '#8E8E93' }}>
                  Drag any player to reposition • Change tactical roles • Persists for all visitors
                </div>
              </div>
            </div>

            {/* Save / Reset Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleReset}
                disabled={isSaving}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#8E8E93',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                title="Reset to automatic vote results"
              >
                ↺ Reset to Auto Votes
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || !isDirty}
                style={{
                  background: isDirty ? '#FF9500' : 'rgba(255, 149, 0, 0.3)',
                  color: isDirty ? '#16201B' : '#8E8E93',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '6px 16px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: isDirty ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: isDirty ? '0 2px 10px rgba(255, 149, 0, 0.4)' : 'none',
                  transition: 'all 0.2s ease',
                }}
              >
                {isSaving ? '⏳ Saving...' : isDirty ? '💾 Save Changes' : '✓ Formation Saved'}
              </button>
            </div>
          </div>

          {/* Formation Select & Tip */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#FF9500' }}>
                TACTICAL FORMATION:
              </label>
              <select
                value={selectedFormation}
                onChange={(e) => handleSelectFormation(e.target.value)}
                style={{
                  background: '#242426',
                  color: '#FFFFFF',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {Object.entries(presetsForSize).map(([key, preset]) => (
                  <option key={key} value={key}>
                    {preset.name}
                  </option>
                ))}
                <option value="Custom">Custom (Manual Placement)</option>
              </select>

              <button
                type="button"
                onClick={() => handleSelectFormation(selectedFormation === 'Custom' ? defaultPresetKey : selectedFormation)}
                style={{
                  background: 'rgba(255, 149, 0, 0.12)',
                  color: '#FF9500',
                  border: '1px solid rgba(255, 149, 0, 0.3)',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                title="Snap coordinates back to formation preset"
              >
                ↺ Snap to Preset
              </button>
            </div>

            {swapSourceIdx !== null && (
              <div
                style={{
                  background: 'rgba(255, 149, 0, 0.2)',
                  border: '1px solid #FF9500',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '11.5px',
                  color: '#FF9500',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span>Click another player to swap with {pitchNodes[swapSourceIdx]?.player_name}</span>
                <button
                  type="button"
                  onClick={() => setSwapSourceIdx(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#FFFFFF',
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Virtual Football Pitch Board */}
      <div
        ref={pitchRef}
        style={{
          position: 'relative',
          width: '100%',
          minHeight: '620px',
          height: '660px',
          background: 'linear-gradient(180deg, #0A291F 0%, #082119 50%, #061913 100%)',
          borderRadius: '16px',
          border: '2px solid rgba(255, 255, 255, 0.14)',
          overflow: 'hidden',
          boxShadow: 'inset 0 0 50px rgba(0, 0, 0, 0.6), 0 8px 30px rgba(0, 0, 0, 0.5)',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        {/* Subtle Pitch Grass Stripes (Vertical lawn stripes) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            pointerEvents: 'none',
            opacity: 0.18,
          }}
        >
          {Array.from({ length: 10 }).map((_, idx) => (
            <div
              key={idx}
              style={{
                flex: 1,
                background: idx % 2 === 0 ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              }}
            />
          ))}
        </div>

        {/* Pitch Boundary Markings SVG */}
        <svg
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Outer Boundary Box */}
          <rect
            x="3%"
            y="3%"
            width="94%"
            height="94%"
            fill="none"
            stroke="rgba(255, 255, 255, 0.18)"
            strokeWidth="2"
            rx="8"
          />

          {/* Halfway Line */}
          <line
            x1="3%"
            y1="50%"
            x2="97%"
            y2="50%"
            stroke="rgba(255, 255, 255, 0.18)"
            strokeWidth="2"
          />

          {/* Center Circle */}
          <circle
            cx="50%"
            cy="50%"
            r="65"
            fill="none"
            stroke="rgba(255, 255, 255, 0.18)"
            strokeWidth="2"
          />
          {/* Center Spot */}
          <circle cx="50%" cy="50%" r="4" fill="rgba(255, 255, 255, 0.25)" />

          {/* Attacking / Top Penalty Box */}
          <rect
            x="30%"
            y="3%"
            width="40%"
            height="18%"
            fill="none"
            stroke="rgba(255, 255, 255, 0.16)"
            strokeWidth="1.8"
          />
          <rect
            x="40%"
            y="3%"
            width="20%"
            height="7%"
            fill="none"
            stroke="rgba(255, 255, 255, 0.14)"
            strokeWidth="1.5"
          />
          <circle cx="50%" cy="14%" r="3" fill="rgba(255, 255, 255, 0.22)" />
          {/* Top Penalty Arc */}
          <path
            d="M 44% 21% A 35 35 0 0 0 56% 21%"
            fill="none"
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="1.5"
          />

          {/* Defending / Bottom Penalty Box */}
          <rect
            x="30%"
            y="79%"
            width="40%"
            height="18%"
            fill="none"
            stroke="rgba(255, 255, 255, 0.16)"
            strokeWidth="1.8"
          />
          <rect
            x="40%"
            y="90%"
            width="20%"
            height="7%"
            fill="none"
            stroke="rgba(255, 255, 255, 0.14)"
            strokeWidth="1.5"
          />
          <circle cx="50%" cy="86%" r="3" fill="rgba(255, 255, 255, 0.22)" />
          {/* Bottom Penalty Arc */}
          <path
            d="M 44% 79% A 35 35 0 0 1 56% 79%"
            fill="none"
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth="1.5"
          />

          {/* Corner Arcs */}
          <path d="M 3% 6% A 20 20 0 0 0 6% 3%" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
          <path d="M 94% 3% A 20 20 0 0 0 97% 6%" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
          <path d="M 3% 94% A 20 20 0 0 1 6% 97%" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
          <path d="M 94% 97% A 20 20 0 0 1 97% 94%" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
        </svg>

        {/* Pitch Direction Watermark / Indicator */}
        <div
          style={{
            position: 'absolute',
            top: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '0.15em',
            color: 'rgba(255, 255, 255, 0.2)',
            textTransform: 'uppercase',
            pointerEvents: 'none',
          }}
        >
          ▲ ATTACKING DIRECTION ▲
        </div>

        {/* Draggable Player Cards on Pitch */}
        {pitchNodes.map((playerNode, index) => {
          const isDragging = draggingIdx === index;
          const isSwapSelected = swapSourceIdx === index;
          const hasPlayer = Boolean(playerNode.player_id);

          const roleDef = POSITION_ROLES.find((r) => r.key === playerNode.position) || {
            icon: playerNode.position === 'ST' ? '🎯' : playerNode.position === 'GK' ? '🧤' : '⚙️',
          };

          return (
            <div
              key={playerNode.id || index}
              onPointerDown={(e) => handlePointerDown(e, index)}
              onClick={() => {
                if (swapSourceIdx !== null && swapSourceIdx !== index) {
                  handleSwapTwoPlayers(swapSourceIdx, index);
                }
              }}
              style={{
                position: 'absolute',
                left: `${playerNode.x}%`,
                top: `${playerNode.y}%`,
                transform: `translate(-50%, -50%) ${isDragging ? 'scale(1.08)' : ''}`,
                cursor: isAdmin ? (swapSourceIdx !== null ? 'pointer' : isDragging ? 'grabbing' : 'grab') : 'default',
                zIndex: isDragging ? 50 : isSwapSelected ? 40 : 10,
                width: '160px',
                background: isSwapSelected
                  ? 'rgba(255, 149, 0, 0.25)'
                  : hasPlayer
                  ? '#121214'
                  : 'rgba(20, 20, 22, 0.85)',
                border: isSwapSelected
                  ? '2px solid #FF9500'
                  : isDragging
                  ? '2px solid #FFD60A'
                  : hasPlayer
                  ? '1.5px solid rgba(255, 149, 0, 0.8)'
                  : '1.5px dashed rgba(255, 255, 255, 0.2)',
                borderRadius: '10px',
                padding: '8px 10px',
                textAlign: 'center',
                boxShadow: isDragging
                  ? '0 12px 30px rgba(0, 0, 0, 0.8), 0 0 20px rgba(255, 214, 10, 0.4)'
                  : '0 4px 14px rgba(0, 0, 0, 0.6)',
                transition: isDragging ? 'none' : 'box-shadow 0.2s ease, transform 0.2s ease',
              }}
            >
              {/* Header: Position Badge + Role Editor Dropdown Trigger */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px' }}>{roleDef.icon}</span>

                {isAdmin ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingPosIdx(editingPosIdx === index ? null : index);
                    }}
                    style={{
                      background: 'rgba(255, 149, 0, 0.16)',
                      border: '1px solid #FF9500',
                      color: '#FF9500',
                      fontSize: '10px',
                      fontWeight: 800,
                      borderRadius: '4px',
                      padding: '2px 6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                    }}
                    title="Change position role"
                  >
                    <span>{playerNode.position || 'POS'}</span>
                    <span style={{ fontSize: '9px' }}>▾</span>
                  </button>
                ) : (
                  <span
                    style={{
                      background: 'rgba(255, 149, 0, 0.16)',
                      border: '1px solid rgba(255, 149, 0, 0.4)',
                      color: '#FF9500',
                      fontSize: '10px',
                      fontWeight: 800,
                      borderRadius: '4px',
                      padding: '2px 6px',
                    }}
                  >
                    {playerNode.position || 'POS'}
                  </span>
                )}
              </div>

              {/* Player Name */}
              <div
                className="scoreboard"
                style={{
                  fontSize: '13px',
                  color: hasPlayer ? '#FFFFFF' : '#8E8E93',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  margin: '2px 0',
                }}
                title={playerNode.player_name || 'Pending'}
              >
                {playerNode.player_name || 'Pending Votes'}
              </div>

              {/* Team Info & Tally */}
              {hasPlayer ? (
                <div style={{ marginTop: '2px' }}>
                  <div
                    style={{
                      fontSize: '10px',
                      color: '#8E8E93',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: playerNode.team_color || '#2E5A8F',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {playerNode.team_name}
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: '4px',
                      background: '#1C1C1E',
                      padding: '1px 6px',
                      borderRadius: '999px',
                      fontSize: '9.5px',
                      fontWeight: 700,
                      color: '#FF9500',
                      display: 'inline-block',
                    }}
                  >
                    {playerNode.average_votes !== undefined
                      ? `⭐ ${playerNode.average_votes} avg`
                      : `⭐ ${playerNode.votes || 0} Votes`}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '10px', color: '#636366', marginTop: '2px' }}>
                  Awaiting Ballots
                </div>
              )}

              {/* Quick Admin Actions (Swap / Change Player) */}
              {isAdmin && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    marginTop: '6px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    paddingTop: '4px',
                  }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSwapSourceIdx(swapSourceIdx === index ? null : index);
                    }}
                    style={{
                      background: swapSourceIdx === index ? '#FF9500' : 'rgba(255, 255, 255, 0.08)',
                      color: swapSourceIdx === index ? '#16201B' : '#EBEBF5',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '2px 5px',
                      fontSize: '9px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    title="Swap with another player"
                  >
                    ⇄ Swap
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setReplacingPlayerIdx(index);
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#EBEBF5',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '2px 5px',
                      fontSize: '9px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                    title="Change player in slot"
                  >
                    👤 Pick
                  </button>
                </div>
              )}

              {/* Inline Position Change Dropdown */}
              {editingPosIdx === index && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginTop: '6px',
                    background: '#1C1C1E',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    borderRadius: '8px',
                    padding: '8px',
                    zIndex: 100,
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.9)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '4px',
                    width: '180px',
                  }}
                >
                  <div
                    style={{
                      gridColumn: 'span 3',
                      fontSize: '10px',
                      fontWeight: 800,
                      color: '#FF9500',
                      marginBottom: '2px',
                    }}
                  >
                    SELECT POSITION:
                  </div>
                  {POSITION_ROLES.filter((r) => includeGk || r.key !== 'GK').map((role) => (
                    <button
                      key={role.key}
                      type="button"
                      onClick={() => handleChangePositionRole(index, role.key)}
                      style={{
                        background: playerNode.position === role.key ? '#FF9500' : 'rgba(255, 255, 255, 0.08)',
                        color: playerNode.position === role.key ? '#16201B' : '#FFFFFF',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 2px',
                        fontSize: '9.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {role.key}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setEditingPosIdx(null)}
                    style={{
                      gridColumn: 'span 3',
                      marginTop: '4px',
                      background: 'transparent',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#8E8E93',
                      borderRadius: '4px',
                      padding: '3px',
                      fontSize: '9px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Candidate Player Picker Modal */}
      {replacingPlayerIdx !== null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => setReplacingPlayerIdx(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#161618',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '14px',
              padding: '20px',
              maxWidth: '460px',
              width: '100%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#FFFFFF' }}>
                  Select Player for Slot {replacingPlayerIdx + 1} ({pitchNodes[replacingPlayerIdx]?.position})
                </div>
                <div style={{ fontSize: '11px', color: '#8E8E93' }}>
                  Choose any registered player from this tournament
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplacingPlayerIdx(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#8E8E93',
                  fontSize: '18px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <input
              type="text"
              placeholder="Search player by name, team, position..."
              value={playerSearchQuery}
              onChange={(e) => setPlayerSearchQuery(e.target.value)}
              style={{
                background: '#242426',
                color: '#FFFFFF',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '13px',
                outline: 'none',
              }}
              autoFocus
            />

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                overflowY: 'auto',
                maxHeight: '360px',
                paddingRight: '4px',
              }}
            >
              {filteredCandidates.map((cand) => (
                <div
                  key={cand.id || cand.player_id}
                  onClick={() => handleSelectReplacementPlayer(replacingPlayerIdx, cand)}
                  style={{
                    background: '#242426',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#FF9500')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)')}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
                      {cand.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#8E8E93', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: cand.team_color || '#FF9500',
                        }}
                      />
                      <span>{cand.team_name}</span>
                    </div>
                  </div>
                  <span
                    style={{
                      background: 'rgba(255, 149, 0, 0.12)',
                      color: '#FF9500',
                      border: '1px solid rgba(255, 149, 0, 0.3)',
                      borderRadius: '4px',
                      padding: '2px 8px',
                      fontSize: '10px',
                      fontWeight: 800,
                    }}
                  >
                    {cand.position || 'PLAYER'}
                  </span>
                </div>
              ))}

              {filteredCandidates.length === 0 && (
                <div style={{ textAlign: 'center', color: '#8E8E93', fontSize: '12px', padding: '24px 0' }}>
                  No matching players found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
