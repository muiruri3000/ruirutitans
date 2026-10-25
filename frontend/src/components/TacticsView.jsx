import React, { useState, useEffect, useRef, useMemo } from 'react';

// ==============================================================================
// FORMATION DATABASE (5, 7, 8, and 11-a-side)
// ==============================================================================
export const FORMATION_PRESETS = {
  '5-aside': {
    formatName: '5-a-side (5 + 1)',
    playerCount: 6, // 5 outfield + 1 Goalkeeper (+1)
    outfieldCount: 5,
    formations: {
      '2-2-1': {
        name: '2-2-1 (Solid Anchor)',
        description: '5 outfielders (2 Defenders, 2 Midfielders, 1 Striker) + Goalkeeper (+1). Solid backline with high transition support.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 90 },
          { id: 'lcb', role: 'LCB', label: 'Left Defender', defaultX: 30, defaultY: 68 },
          { id: 'rcb', role: 'RCB', label: 'Right Defender', defaultX: 70, defaultY: 68 },
          { id: 'lm', role: 'LM', label: 'Left Midfield', defaultX: 25, defaultY: 44 },
          { id: 'rm', role: 'RM', label: 'Right Midfield', defaultX: 75, defaultY: 44 },
          { id: 'st', role: 'ST', label: 'Striker', defaultX: 50, defaultY: 18 },
        ],
      },
      '2-1-2': {
        name: '2-1-2 (Twin Attackers)',
        description: '5 outfielders (2 Defenders, 1 Central Engine, 2 Strikers) + Goalkeeper (+1). High-pressing frontline.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 90 },
          { id: 'lcb', role: 'LCB', label: 'Left Defender', defaultX: 30, defaultY: 68 },
          { id: 'rcb', role: 'RCB', label: 'Right Defender', defaultX: 70, defaultY: 68 },
          { id: 'cm', role: 'CM', label: 'Central Pivot', defaultX: 50, defaultY: 46 },
          { id: 'lf', role: 'LF', label: 'Left Forward', defaultX: 32, defaultY: 20 },
          { id: 'rf', role: 'RF', label: 'Right Forward', defaultX: 68, defaultY: 20 },
        ],
      },
      '1-3-1': {
        name: '1-3-1 (Midfield Dominance)',
        description: '5 outfielders (1 Sweeper, 3 Midfielders, 1 Target Man) + Goalkeeper (+1). Total midfield control.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 90 },
          { id: 'cb', role: 'CB', label: 'Center Back', defaultX: 50, defaultY: 70 },
          { id: 'lm', role: 'LM', label: 'Left Midfield', defaultX: 20, defaultY: 46 },
          { id: 'cm', role: 'CM', label: 'Central Midfield', defaultX: 50, defaultY: 44 },
          { id: 'rm', role: 'RM', label: 'Right Midfield', defaultX: 80, defaultY: 46 },
          { id: 'st', role: 'ST', label: 'Striker', defaultX: 50, defaultY: 18 },
        ],
      },
      '1-2-2': {
        name: '1-2-2 (Wing Overload)',
        description: '5 outfielders (1 Defender, 2 Wingers, 2 Strikers) + Goalkeeper (+1). Aggressive direct counter system.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 90 },
          { id: 'cb', role: 'CB', label: 'Center Back', defaultX: 50, defaultY: 70 },
          { id: 'lcm', role: 'LCM', label: 'Left Midfield', defaultX: 32, defaultY: 46 },
          { id: 'rcm', role: 'RCM', label: 'Right Midfield', defaultX: 68, defaultY: 46 },
          { id: 'lf', role: 'LF', label: 'Left Forward', defaultX: 32, defaultY: 20 },
          { id: 'rf', role: 'RF', label: 'Right Forward', defaultX: 68, defaultY: 20 },
        ],
      },
      '3-1-1': {
        name: '3-1-1 (The Wall)',
        description: '5 outfielders (3 Defenders, 1 Midfielder, 1 Striker) + Goalkeeper (+1). Ultra defensive structure.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 90 },
          { id: 'lb', role: 'LB', label: 'Left Defender', defaultX: 22, defaultY: 70 },
          { id: 'cb', role: 'CB', label: 'Central Stopper', defaultX: 50, defaultY: 72 },
          { id: 'rb', role: 'RB', label: 'Right Defender', defaultX: 78, defaultY: 70 },
          { id: 'cm', role: 'CM', label: 'Central Anchor', defaultX: 50, defaultY: 44 },
          { id: 'st', role: 'ST', label: 'Striker', defaultX: 50, defaultY: 18 },
        ],
      },
    },
  },

  '7-aside': {
    formatName: '7-a-side (7 + 1)',
    playerCount: 8, // 7 outfield + 1 Goalkeeper (+1)
    outfieldCount: 7,
    formations: {
      '2-4-1': {
        name: '2-4-1 (Midfield Engine)',
        description: '7 outfielders (2 Defenders, 4 Midfielders, 1 Striker) + Goalkeeper (+1). Wide 4-player midfield providing dominance.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 90 },
          { id: 'lcb', role: 'LCB', label: 'Left Defender', defaultX: 32, defaultY: 72 },
          { id: 'rcb', role: 'RCB', label: 'Right Defender', defaultX: 68, defaultY: 72 },
          { id: 'lm', role: 'LM', label: 'Left Midfield', defaultX: 18, defaultY: 46 },
          { id: 'lcm', role: 'LCM', label: 'Left Central Mid', defaultX: 38, defaultY: 48 },
          { id: 'rcm', role: 'RCM', label: 'Right Central Mid', defaultX: 62, defaultY: 48 },
          { id: 'rm', role: 'RM', label: 'Right Midfield', defaultX: 82, defaultY: 46 },
          { id: 'st', role: 'ST', label: 'Striker', defaultX: 50, defaultY: 18 },
        ],
      },
      '3-3-1': {
        name: '3-3-1 (The Fortress)',
        description: '7 outfielders (3 Defenders, 3 Midfielders, 1 Striker) + Goalkeeper (+1). Solid back 3 with central control.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 90 },
          { id: 'lb', role: 'LB', label: 'Left Back', defaultX: 22, defaultY: 72 },
          { id: 'cb', role: 'CB', label: 'Center Back', defaultX: 50, defaultY: 74 },
          { id: 'rb', role: 'RB', label: 'Right Back', defaultX: 78, defaultY: 72 },
          { id: 'lm', role: 'LM', label: 'Left Midfield', defaultX: 22, defaultY: 46 },
          { id: 'cm', role: 'CM', label: 'Central Midfield', defaultX: 50, defaultY: 48 },
          { id: 'rm', role: 'RM', label: 'Right Midfield', defaultX: 78, defaultY: 46 },
          { id: 'st', role: 'ST', label: 'Striker', defaultX: 50, defaultY: 18 },
        ],
      },
      '2-3-2': {
        name: '2-3-2 (Direct Attack)',
        description: '7 outfielders (2 Defenders, 3 Midfielders, 2 Strikers) + Goalkeeper (+1). Twin strikers linking with wingers.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 90 },
          { id: 'lcb', role: 'LCB', label: 'Left Defender', defaultX: 32, defaultY: 72 },
          { id: 'rcb', role: 'RCB', label: 'Right Defender', defaultX: 68, defaultY: 72 },
          { id: 'lm', role: 'LM', label: 'Left Midfield', defaultX: 22, defaultY: 46 },
          { id: 'cm', role: 'CM', label: 'Center Midfield', defaultX: 50, defaultY: 48 },
          { id: 'rm', role: 'RM', label: 'Right Midfield', defaultX: 78, defaultY: 46 },
          { id: 'lf', role: 'LF', label: 'Left Striker', defaultX: 34, defaultY: 20 },
          { id: 'rf', role: 'RF', label: 'Right Striker', defaultX: 66, defaultY: 20 },
        ],
      },
      '3-2-2': {
        name: '3-2-2 (Balanced Pairs)',
        description: '7 outfielders (3 Defenders, 2 Central Pivots, 2 Strikers) + Goalkeeper (+1). Symmetrical balance.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 90 },
          { id: 'lb', role: 'LB', label: 'Left Back', defaultX: 22, defaultY: 72 },
          { id: 'cb', role: 'CB', label: 'Center Back', defaultX: 50, defaultY: 74 },
          { id: 'rb', role: 'RB', label: 'Right Back', defaultX: 78, defaultY: 72 },
          { id: 'lcm', role: 'LCM', label: 'Left Pivot', defaultX: 34, defaultY: 46 },
          { id: 'rcm', role: 'RCM', label: 'Right Pivot', defaultX: 66, defaultY: 46 },
          { id: 'lf', role: 'LF', label: 'Left Forward', defaultX: 34, defaultY: 20 },
          { id: 'rf', role: 'RF', label: 'Right Forward', defaultX: 66, defaultY: 20 },
        ],
      },
      '2-2-3': {
        name: '2-2-3 (Attacking Trident)',
        description: '7 outfielders (2 Defenders, 2 Midfielders, 3 Attackers: LW, ST, RW) + Goalkeeper (+1). Constant 3v2 overloads.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 90 },
          { id: 'lcb', role: 'LCB', label: 'Left Defender', defaultX: 32, defaultY: 72 },
          { id: 'rcb', role: 'RCB', label: 'Right Defender', defaultX: 68, defaultY: 72 },
          { id: 'lcm', role: 'LCM', label: 'Left Midfield', defaultX: 34, defaultY: 48 },
          { id: 'rcm', role: 'RCM', label: 'Right Midfield', defaultX: 66, defaultY: 48 },
          { id: 'lw', role: 'LW', label: 'Left Winger', defaultX: 20, defaultY: 22 },
          { id: 'st', role: 'ST', label: 'Center Forward', defaultX: 50, defaultY: 18 },
          { id: 'rw', role: 'RW', label: 'Right Winger', defaultX: 80, defaultY: 22 },
        ],
      },
      '1-4-2': {
        name: '1-4-2 (Midfield Web)',
        description: '7 outfielders (1 Sweeper, 4 Midfielders, 2 Forwards) + Goalkeeper (+1). Packs midfield to suffocate opponents.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 90 },
          { id: 'cb', role: 'CB', label: 'Sweeper', defaultX: 50, defaultY: 74 },
          { id: 'lm', role: 'LM', label: 'Left Midfield', defaultX: 18, defaultY: 46 },
          { id: 'lcm', role: 'LCM', label: 'Left Inner Mid', defaultX: 38, defaultY: 48 },
          { id: 'rcm', role: 'RCM', label: 'Right Inner Mid', defaultX: 62, defaultY: 48 },
          { id: 'rm', role: 'RM', label: 'Right Midfield', defaultX: 82, defaultY: 46 },
          { id: 'lf', role: 'LF', label: 'Left Striker', defaultX: 34, defaultY: 20 },
          { id: 'rf', role: 'RF', label: 'Right Striker', defaultX: 66, defaultY: 20 },
        ],
      },
    },
  },

  '8-aside': {
    formatName: '8-a-side',
    playerCount: 8,
    formations: {
      '2-4-1': {
        name: '2-4-1 (Midfield Engine)',
        description: 'Wide 4-player midfield providing width, crossing lanes, and box-to-box dominance.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 90 },
          { id: 'lcb', role: 'LCB', label: 'Left Defender', defaultX: 32, defaultY: 74 },
          { id: 'rcb', role: 'RCB', label: 'Right Defender', defaultX: 68, defaultY: 74 },
          { id: 'lm', role: 'LM', label: 'Left Midfield', defaultX: 18, defaultY: 48 },
          { id: 'lcm', role: 'LCM', label: 'Left Center Mid', defaultX: 38, defaultY: 52 },
          { id: 'rcm', role: 'RCM', label: 'Right Center Mid', defaultX: 62, defaultY: 52 },
          { id: 'rm', role: 'RM', label: 'Right Midfield', defaultX: 82, defaultY: 48 },
          { id: 'st', role: 'ST', label: 'Striker', defaultX: 50, defaultY: 18 },
        ],
      },
      '3-3-1': {
        name: '3-3-1 (The Fortress)',
        description: 'Complete defensive coverage with 3 defenders, 3 midfielders, and a target man.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 90 },
          { id: 'lb', role: 'LB', label: 'Left Back', defaultX: 22, defaultY: 74 },
          { id: 'cb', role: 'CB', label: 'Center Back', defaultX: 50, defaultY: 76 },
          { id: 'rb', role: 'RB', label: 'Right Back', defaultX: 78, defaultY: 74 },
          { id: 'lm', role: 'LM', label: 'Left Midfield', defaultX: 22, defaultY: 48 },
          { id: 'cm', role: 'CM', label: 'Center Midfield', defaultX: 50, defaultY: 50 },
          { id: 'rm', role: 'RM', label: 'Right Midfield', defaultX: 78, defaultY: 48 },
          { id: 'st', role: 'ST', label: 'Striker', defaultX: 50, defaultY: 18 },
        ],
      },
      '2-3-2': {
        name: '2-3-2 (Direct Attack)',
        description: 'Twin strikers linking directly with wide wingers for high-scoring direct play.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 90 },
          { id: 'lcb', role: 'LCB', label: 'Left Defender', defaultX: 32, defaultY: 74 },
          { id: 'rcb', role: 'RCB', label: 'Right Defender', defaultX: 68, defaultY: 74 },
          { id: 'lm', role: 'LM', label: 'Left Midfield', defaultX: 22, defaultY: 48 },
          { id: 'cm', role: 'CM', label: 'Center Midfield', defaultX: 50, defaultY: 50 },
          { id: 'rm', role: 'RM', label: 'Right Midfield', defaultX: 78, defaultY: 48 },
          { id: 'lf', role: 'LF', label: 'Left Striker', defaultX: 34, defaultY: 20 },
          { id: 'rf', role: 'RF', label: 'Right Striker', defaultX: 66, defaultY: 20 },
        ],
      },
      '3-2-2': {
        name: '3-2-2 (Balanced Pairs)',
        description: 'High defensive security with paired pivots and paired strikers.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 90 },
          { id: 'lb', role: 'LB', label: 'Left Back', defaultX: 22, defaultY: 74 },
          { id: 'cb', role: 'CB', label: 'Center Back', defaultX: 50, defaultY: 76 },
          { id: 'rb', role: 'RB', label: 'Right Back', defaultX: 78, defaultY: 74 },
          { id: 'lcm', role: 'LCM', label: 'Left Pivot', defaultX: 34, defaultY: 48 },
          { id: 'rcm', role: 'RCM', label: 'Right Pivot', defaultX: 66, defaultY: 48 },
          { id: 'lf', role: 'LF', label: 'Left Forward', defaultX: 34, defaultY: 20 },
          { id: 'rf', role: 'RF', label: 'Right Forward', defaultX: 66, defaultY: 20 },
        ],
      },
      '2-2-3': {
        name: '2-2-3 (Attacking Trident)',
        description: 'Three front attackers (LW, ST, RW) creating constant 3v2 overloads in the final third.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 90 },
          { id: 'lcb', role: 'LCB', label: 'Left Defender', defaultX: 32, defaultY: 74 },
          { id: 'rcb', role: 'RCB', label: 'Right Defender', defaultX: 68, defaultY: 74 },
          { id: 'lcm', role: 'LCM', label: 'Left Midfield', defaultX: 34, defaultY: 50 },
          { id: 'rcm', role: 'RCM', label: 'Right Midfield', defaultX: 66, defaultY: 50 },
          { id: 'lw', role: 'LW', label: 'Left Winger', defaultX: 20, defaultY: 22 },
          { id: 'st', role: 'ST', label: 'Center Forward', defaultX: 50, defaultY: 18 },
          { id: 'rw', role: 'RW', label: 'Right Winger', defaultX: 80, defaultY: 22 },
        ],
      },
    },
  },

  '11-aside': {
    formatName: '11-a-side (Full Match)',
    playerCount: 11,
    formations: {
      '4-3-3': {
        name: '4-3-3 (Attacking Trio)',
        description: 'World-renowned attacking system with back 4, midfield triangle, and flying wingers.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 91 },
          { id: 'lb', role: 'LB', label: 'Left Back', defaultX: 16, defaultY: 74 },
          { id: 'lcb', role: 'LCB', label: 'Left Center Back', defaultX: 38, defaultY: 76 },
          { id: 'rcb', role: 'RCB', label: 'Right Center Back', defaultX: 62, defaultY: 76 },
          { id: 'rb', role: 'RB', label: 'Right Back', defaultX: 84, defaultY: 74 },
          { id: 'cdm', role: 'CDM', label: 'Defensive Midfield', defaultX: 50, defaultY: 58 },
          { id: 'lcm', role: 'LCM', label: 'Left Central Mid', defaultX: 32, defaultY: 44 },
          { id: 'rcm', role: 'RCM', label: 'Right Central Mid', defaultX: 68, defaultY: 44 },
          { id: 'lw', role: 'LW', label: 'Left Winger', defaultX: 20, defaultY: 20 },
          { id: 'st', role: 'ST', label: 'Striker', defaultX: 50, defaultY: 16 },
          { id: 'rw', role: 'RW', label: 'Right Winger', defaultX: 80, defaultY: 20 },
        ],
      },
      '4-2-3-1': {
        name: '4-2-3-1 (Double Pivot)',
        description: 'The tactical benchmark of modern elite football: dual CDMs protecting behind a lethal playmaker trio.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 91 },
          { id: 'lb', role: 'LB', label: 'Left Back', defaultX: 16, defaultY: 74 },
          { id: 'lcb', role: 'LCB', label: 'Left Center Back', defaultX: 38, defaultY: 76 },
          { id: 'rcb', role: 'RCB', label: 'Right Center Back', defaultX: 62, defaultY: 76 },
          { id: 'rb', role: 'RB', label: 'Right Back', defaultX: 84, defaultY: 74 },
          { id: 'ldm', role: 'LDM', label: 'Left Defensive Pivot', defaultX: 36, defaultY: 60 },
          { id: 'rdm', role: 'RDM', label: 'Right Defensive Pivot', defaultX: 64, defaultY: 60 },
          { id: 'lam', role: 'LAM', label: 'Left Attacking Mid', defaultX: 22, defaultY: 36 },
          { id: 'cam', role: 'CAM', label: 'Central Playmaker', defaultX: 50, defaultY: 34 },
          { id: 'ram', role: 'RAM', label: 'Right Attacking Mid', defaultX: 78, defaultY: 36 },
          { id: 'st', role: 'ST', label: 'Striker', defaultX: 50, defaultY: 16 },
        ],
      },
      '4-4-2': {
        name: '4-4-2 (Classic Flat)',
        description: 'Timeless traditional balance with dual bank-of-four and twin striking partnership.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 91 },
          { id: 'lb', role: 'LB', label: 'Left Back', defaultX: 16, defaultY: 74 },
          { id: 'lcb', role: 'LCB', label: 'Left Center Back', defaultX: 38, defaultY: 76 },
          { id: 'rcb', role: 'RCB', label: 'Right Center Back', defaultX: 62, defaultY: 76 },
          { id: 'rb', role: 'RB', label: 'Right Back', defaultX: 84, defaultY: 74 },
          { id: 'lm', role: 'LM', label: 'Left Midfield', defaultX: 18, defaultY: 48 },
          { id: 'lcm', role: 'LCM', label: 'Left Central Mid', defaultX: 38, defaultY: 52 },
          { id: 'rcm', role: 'RCM', label: 'Right Central Mid', defaultX: 62, defaultY: 52 },
          { id: 'rm', role: 'RM', label: 'Right Midfield', defaultX: 82, defaultY: 48 },
          { id: 'ls', role: 'LS', label: 'Left Striker', defaultX: 36, defaultY: 18 },
          { id: 'rs', role: 'RS', label: 'Right Striker', defaultX: 64, defaultY: 18 },
        ],
      },
      '3-5-2': {
        name: '3-5-2 (Wing-Back Dominance)',
        description: 'Dynamic 3-centerback foundation powered by tireless wing-backs and 3 central orchestrators.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 91 },
          { id: 'lcb', role: 'LCB', label: 'Left Center Back', defaultX: 28, defaultY: 76 },
          { id: 'cb', role: 'CB', label: 'Sweeper / Center Back', defaultX: 50, defaultY: 78 },
          { id: 'rcb', role: 'RCB', label: 'Right Center Back', defaultX: 72, defaultY: 76 },
          { id: 'lwb', role: 'LWB', label: 'Left Wing-Back', defaultX: 14, defaultY: 50 },
          { id: 'lcm', role: 'LCM', label: 'Left Central Mid', defaultX: 36, defaultY: 52 },
          { id: 'cm', role: 'CM', label: 'Central Playmaker', defaultX: 50, defaultY: 44 },
          { id: 'rcm', role: 'RCM', label: 'Right Central Mid', defaultX: 64, defaultY: 52 },
          { id: 'rwb', role: 'RWB', label: 'Right Wing-Back', defaultX: 86, defaultY: 50 },
          { id: 'ls', role: 'LS', label: 'Left Striker', defaultX: 36, defaultY: 18 },
          { id: 'rs', role: 'RS', label: 'Right Striker', defaultX: 64, defaultY: 18 },
        ],
      },
      '5-3-2': {
        name: '5-3-2 (Counter Fortress)',
        description: 'Impenetrable 5-man low block with quick diagonal transitions up to twin forwards.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 91 },
          { id: 'lwb', role: 'LWB', label: 'Left Wing-Back', defaultX: 14, defaultY: 68 },
          { id: 'lcb', role: 'LCB', label: 'Left Stopper', defaultX: 32, defaultY: 76 },
          { id: 'cb', role: 'CB', label: 'Central Stopper', defaultX: 50, defaultY: 78 },
          { id: 'rcb', role: 'RCB', label: 'Right Stopper', defaultX: 68, defaultY: 76 },
          { id: 'rwb', role: 'RWB', label: 'Right Wing-Back', defaultX: 86, defaultY: 68 },
          { id: 'lcm', role: 'LCM', label: 'Left Midfield', defaultX: 32, defaultY: 48 },
          { id: 'cm', role: 'CM', label: 'Central Anchor', defaultX: 50, defaultY: 44 },
          { id: 'rcm', role: 'RCM', label: 'Right Midfield', defaultX: 68, defaultY: 48 },
          { id: 'ls', role: 'LS', label: 'Left Striker', defaultX: 36, defaultY: 18 },
          { id: 'rs', role: 'RS', label: 'Right Striker', defaultX: 64, defaultY: 18 },
        ],
      },
      '3-4-3': {
        name: '3-4-3 (Cruyff Total Football)',
        description: 'Expansive attacking football with wide wing-backs and triple attacking options.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 91 },
          { id: 'lcb', role: 'LCB', label: 'Left Center Back', defaultX: 28, defaultY: 76 },
          { id: 'cb', role: 'CB', label: 'Center Back', defaultX: 50, defaultY: 78 },
          { id: 'rcb', role: 'RCB', label: 'Right Center Back', defaultX: 72, defaultY: 76 },
          { id: 'lm', role: 'LM', label: 'Left Wing-Back', defaultX: 18, defaultY: 48 },
          { id: 'lcm', role: 'LCM', label: 'Left Center Mid', defaultX: 38, defaultY: 52 },
          { id: 'rcm', role: 'RCM', label: 'Right Center Mid', defaultX: 62, defaultY: 52 },
          { id: 'rm', role: 'RM', label: 'Right Wing-Back', defaultX: 82, defaultY: 48 },
          { id: 'lw', role: 'LW', label: 'Left Winger', defaultX: 20, defaultY: 20 },
          { id: 'st', role: 'ST', label: 'Center Forward', defaultX: 50, defaultY: 16 },
          { id: 'rw', role: 'RW', label: 'Right Winger', defaultX: 80, defaultY: 20 },
        ],
      },
      '4-1-4-1': {
        name: '4-1-4-1 (Holding Shield)',
        description: 'Single holding pivot shielding the defensive line, freeing four advanced midfield runners.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 91 },
          { id: 'lb', role: 'LB', label: 'Left Back', defaultX: 16, defaultY: 74 },
          { id: 'lcb', role: 'LCB', label: 'Left Center Back', defaultX: 38, defaultY: 76 },
          { id: 'rcb', role: 'RCB', label: 'Right Center Back', defaultX: 62, defaultY: 76 },
          { id: 'rb', role: 'RB', label: 'Right Back', defaultX: 84, defaultY: 74 },
          { id: 'cdm', role: 'CDM', label: 'Holding Midfield', defaultX: 50, defaultY: 60 },
          { id: 'lm', role: 'LM', label: 'Left Midfield', defaultX: 18, defaultY: 40 },
          { id: 'lcm', role: 'LCM', label: 'Left Attacking Mid', defaultX: 38, defaultY: 42 },
          { id: 'rcm', role: 'RCM', label: 'Right Attacking Mid', defaultX: 62, defaultY: 42 },
          { id: 'rm', role: 'RM', label: 'Right Midfield', defaultX: 82, defaultY: 40 },
          { id: 'st', role: 'ST', label: 'Striker', defaultX: 50, defaultY: 16 },
        ],
      },
      '4-5-1': {
        name: '4-5-1 (Midfield Bastion)',
        description: 'Chokes the center of the park with 5 midfielders to frustrate possession-heavy opponents.',
        slots: [
          { id: 'gk', role: 'GK', label: 'Goalkeeper', defaultX: 50, defaultY: 91 },
          { id: 'lb', role: 'LB', label: 'Left Back', defaultX: 16, defaultY: 74 },
          { id: 'lcb', role: 'LCB', label: 'Left Center Back', defaultX: 38, defaultY: 76 },
          { id: 'rcb', role: 'RCB', label: 'Right Center Back', defaultX: 62, defaultY: 76 },
          { id: 'rb', role: 'RB', label: 'Right Back', defaultX: 84, defaultY: 74 },
          { id: 'lm', role: 'LM', label: 'Left Midfield', defaultX: 18, defaultY: 46 },
          { id: 'lcm', role: 'LCM', label: 'Left Central Mid', defaultX: 36, defaultY: 50 },
          { id: 'cm', role: 'CM', label: 'Central Anchor', defaultX: 50, defaultY: 44 },
          { id: 'rcm', role: 'RCM', label: 'Right Central Mid', defaultX: 64, defaultY: 50 },
          { id: 'rm', role: 'RM', label: 'Right Midfield', defaultX: 82, defaultY: 46 },
          { id: 'st', role: 'ST', label: 'Target Striker', defaultX: 50, defaultY: 18 },
        ],
      },
    },
  },
};

const STORAGE_KEY = 'ruiru_titans_tactics_board_v1';

export default function TacticsView({ categories = {}, activeCategoryKey = 'open', isCmsMode = false }) {
  // 1. Format & Formation Selection
  const [selectedFormat, setSelectedFormat] = useState('11-aside'); // '5-aside' | '7-aside' | '8-aside' | '11-aside'
  const [selectedFormationKey, setSelectedFormationKey] = useState('4-3-3');

  // 2. Goalkeeper Optional Toggle
  const [includeGoalkeeper, setIncludeGoalkeeper] = useState(true);

  // 3. Active Club / Cross-Team Selection ('all' = All Clubs / Cross-Team)
  const currentCategory = categories[activeCategoryKey] || Object.values(categories)[0];
  const teamsList = currentCategory?.teams || [];
  const [selectedTeamId, setSelectedTeamId] = useState('all');

  // Map of all teams for quick access to name and color
  const teamsMap = useMemo(() => {
    const map = {};
    teamsList.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [teamsList]);

  // All squad players compiled across all teams in this competition (Cross-Team)
  const allTeamsPlayers = useMemo(() => {
    const list = [];
    teamsList.forEach((t) => {
      (t.players || []).forEach((p) => {
        list.push({
          ...p,
          teamId: t.id,
          teamName: t.name,
          teamColor: t.color || '#C9A227',
        });
      });
    });
    return list;
  }, [teamsList]);

  // Filtered available players based on selectedTeamId
  const availablePlayers = useMemo(() => {
    if (selectedTeamId === 'all') {
      return allTeamsPlayers;
    }
    return allTeamsPlayers.filter((p) => p.teamId === selectedTeamId);
  }, [selectedTeamId, allTeamsPlayers]);

  // 4. Current Positions on Pitch (array of nodes with x, y, defaultX, defaultY, and assigned player)
  const [pitchNodes, setPitchNodes] = useState([]);

  // 5. Modal state for Player Picker
  const [activeSlotModal, setActiveSlotModal] = useState(null); // slot object or null
  const [modalFilterTeamId, setModalFilterTeamId] = useState('all');
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [customPlayerName, setCustomPlayerName] = useState('');
  const [customPlayerNumber, setCustomPlayerNumber] = useState('');

  // 6. Drag State (Dragging position nodes around pitch)
  const pitchRef = useRef(null);
  const [draggingSlotId, setDraggingSlotId] = useState(null);
  const dragStartPosRef = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0, moved: false });

  // 7. Drag-and-Drop from Bench directly onto Pitch
  const [isPitchDragOver, setIsPitchDragOver] = useState(false);

  // 8. Tactical Notes & Notice
  const [tacticalNote, setTacticalNote] = useState('High pressing trigger on opponent goal kicks. Fullbacks overlap when wingers tuck inside.');
  const [statusMessage, setStatusMessage] = useState('');

  // 9. Opponents State (Toggle ON / OFF)
  const [showOpponents, setShowOpponents] = useState(false);
  const [opponentNodes, setOpponentNodes] = useState([]);
  const [selectedOpponentTeamId, setSelectedOpponentTeamId] = useState('auto-red');

  // Opponent theme color
  const opponentThemeColor = useMemo(() => {
    if (selectedOpponentTeamId && selectedOpponentTeamId !== 'auto-red' && teamsMap[selectedOpponentTeamId]) {
      return teamsMap[selectedOpponentTeamId].color || '#E11D48';
    }
    return '#E11D48';
  }, [selectedOpponentTeamId, teamsMap]);

  // Filtered visible nodes on pitch based on whether Goalkeeper is toggled ON or OFF
  const visiblePitchNodes = useMemo(() => {
    return pitchNodes.filter((node) => includeGoalkeeper || node.role !== 'GK');
  }, [pitchNodes, includeGoalkeeper]);

  // Filtered visible opponent nodes (respects showOpponents toggle and includeGoalkeeper)
  const visibleOpponentNodes = useMemo(() => {
    if (!showOpponents) return [];
    return opponentNodes.filter((node) => includeGoalkeeper || node.role !== 'GK');
  }, [showOpponents, opponentNodes, includeGoalkeeper]);

  // 10. Pitch Orientation (false = Portrait 0deg, true = Landscape 90deg)
  const [isLandscape, setIsLandscape] = useState(false);

  // 11. Pitch Zoom / Content Scale (0.7 to 1.35)
  const [pitchScale, setPitchScale] = useState(1.0);

  // Load or Initialize Positions when formation or format changes
  useEffect(() => {
    const formatData = FORMATION_PRESETS[selectedFormat];
    if (!formatData) return;
    const formationData = formatData.formations[selectedFormationKey] || Object.values(formatData.formations)[0];

    // Try to load any previously saved positions for this format & formation from localStorage
    try {
      const cached = localStorage.getItem(`${STORAGE_KEY}_${selectedFormat}_${selectedFormationKey}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length === formationData.slots.length) {
          setPitchNodes(parsed);
          // Initialize opponent positions (180-deg mirrored on pitch)
          const initialOppNodes = formationData.slots.map((slot) => ({
            id: `opp_${slot.id}`,
            role: slot.role,
            label: slot.label,
            isOpponent: true,
            defaultX: Math.round((100 - slot.defaultX) * 10) / 10,
            defaultY: Math.round((100 - slot.defaultY) * 10) / 10,
            x: Math.round((100 - slot.defaultX) * 10) / 10,
            y: Math.round((100 - slot.defaultY) * 10) / 10,
            player: null,
          }));
          setOpponentNodes(initialOppNodes);
          return;
        }
      }
    } catch {}

    // Otherwise initialize with default positions
    const initialNodes = formationData.slots.map((slot) => ({
      ...slot,
      x: slot.defaultX,
      y: slot.defaultY,
      player: null,
    }));
    setPitchNodes(initialNodes);

    // Initialize opponent positions (180-deg mirrored on pitch)
    const initialOppNodes = formationData.slots.map((slot) => ({
      id: `opp_${slot.id}`,
      role: slot.role,
      label: slot.label,
      isOpponent: true,
      defaultX: Math.round((100 - slot.defaultX) * 10) / 10,
      defaultY: Math.round((100 - slot.defaultY) * 10) / 10,
      x: Math.round((100 - slot.defaultX) * 10) / 10,
      y: Math.round((100 - slot.defaultY) * 10) / 10,
      player: null,
    }));
    setOpponentNodes(initialOppNodes);
  }, [selectedFormat, selectedFormationKey]);

  // Save current pitch state to localStorage
  const saveCurrentLineup = (nodesToSave = pitchNodes) => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_${selectedFormat}_${selectedFormationKey}`, JSON.stringify(nodesToSave));
      showStatusNotice('💾 Tactical lineup saved to local storage!');
    } catch {}
  };

  const showStatusNotice = (msg) => {
    setStatusMessage(msg);
    setTimeout(() => {
      setStatusMessage('');
    }, 3200);
  };

  // Reset all positions back to canonical formation coordinates
  const handleResetPositions = () => {
    const formatData = FORMATION_PRESETS[selectedFormat];
    const formationData = formatData.formations[selectedFormationKey];
    if (!formationData) return;

    const defaultSlotsById = {};
    formationData.slots.forEach((s) => {
      defaultSlotsById[s.id] = s;
    });

    const resetNodes = pitchNodes.map((node) => {
      const def = defaultSlotsById[node.id];
      return {
        ...node,
        x: def ? def.defaultX : node.defaultX,
        y: def ? def.defaultY : node.defaultY,
      };
    });

    setPitchNodes(resetNodes);
    saveCurrentLineup(resetNodes);

    // Reset opponent nodes (mirrored on pitch)
    const resetOppNodes = opponentNodes.map((node) => {
      const origSlot = formationData.slots.find((s) => `opp_${s.id}` === node.id);
      return {
        ...node,
        x: origSlot ? Math.round((100 - origSlot.defaultX) * 10) / 10 : node.defaultX,
        y: origSlot ? Math.round((100 - origSlot.defaultY) * 10) / 10 : node.defaultY,
      };
    });
    setOpponentNodes(resetOppNodes);

    showStatusNotice('↺ All positions snapped back to standard formation!');
  };

  // Clear all player assignments
  const handleClearAllPlayers = () => {
    if (!window.confirm('Clear all player assignments from the pitch? Positions will remain in formation.')) return;
    const cleared = pitchNodes.map((n) => ({ ...n, player: null }));
    setPitchNodes(cleared);
    saveCurrentLineup(cleared);
    setOpponentNodes((prev) => prev.map((n) => ({ ...n, player: null })));
    showStatusNotice('🧹 All player assignments cleared.');
  };

  // Switch Format (5, 7, 8, 11)
  const handleFormatChange = (fmtKey) => {
    setSelectedFormat(fmtKey);
    const availableFormations = Object.keys(FORMATION_PRESETS[fmtKey].formations);
    setSelectedFormationKey(availableFormations[0]);
  };

  // Switch Formation
  const handleFormationChange = (formKey) => {
    setSelectedFormationKey(formKey);
  };

  // Handle Dragging Positions around the Pitch (friendly or opponent)
  const handlePointerDown = (e, slotId, isOpponent = false) => {
    e.stopPropagation();
    const sourceList = isOpponent ? opponentNodes : pitchNodes;
    const node = sourceList.find((n) => n.id === slotId);
    if (!node) return;

    setDraggingSlotId(slotId);
    dragStartPosRef.current = {
      startX: e.clientX || (e.touches && e.touches[0].clientX) || 0,
      startY: e.clientY || (e.touches && e.touches[0].clientY) || 0,
      nodeX: node.x,
      nodeY: node.y,
      moved: false,
      isOpponent: Boolean(isOpponent),
    };
  };

  useEffect(() => {
    if (!draggingSlotId) return;

    const handlePointerMove = (e) => {
      if (!pitchRef.current) return;
      const clientX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
      const clientY = e.clientY || (e.touches && e.touches[0].clientY) || 0;

      const rect = pitchRef.current.getBoundingClientRect();
      const deltaX = clientX - dragStartPosRef.current.startX;
      const deltaY = clientY - dragStartPosRef.current.startY;

      // Mark as moved if distance > 6px
      if (Math.hypot(deltaX, deltaY) > 6) {
        dragStartPosRef.current.moved = true;
      }

      // Convert delta to pitch percentage
      const deltaPercentX = (deltaX / rect.width) * 100;
      const deltaPercentY = (deltaY / rect.height) * 100;

      let nextX, nextY;
      if (isLandscape) {
        nextX = Math.max(6, Math.min(94, dragStartPosRef.current.nodeX + deltaPercentY));
        nextY = Math.max(6, Math.min(94, dragStartPosRef.current.nodeY - deltaPercentX));
      } else {
        nextX = Math.max(6, Math.min(94, dragStartPosRef.current.nodeX + deltaPercentX));
        nextY = Math.max(6, Math.min(94, dragStartPosRef.current.nodeY + deltaPercentY));
      }

      if (dragStartPosRef.current.isOpponent) {
        setOpponentNodes((prev) =>
          prev.map((n) => (n.id === draggingSlotId ? { ...n, x: Math.round(nextX * 10) / 10, y: Math.round(nextY * 10) / 10 } : n))
        );
      } else {
        setPitchNodes((prev) =>
          prev.map((n) => (n.id === draggingSlotId ? { ...n, x: Math.round(nextX * 10) / 10, y: Math.round(nextY * 10) / 10 } : n))
        );
      }
    };

    const handlePointerUp = () => {
      const moved = dragStartPosRef.current.moved;
      const slotId = draggingSlotId;
      const isOpp = dragStartPosRef.current.isOpponent;
      setDraggingSlotId(null);

      // If user clicked without dragging, open player selection modal!
      if (!moved) {
        const slotNode = (isOpp ? opponentNodes : pitchNodes).find((n) => n.id === slotId);
        if (slotNode) {
          setActiveSlotModal(slotNode);
          setModalFilterTeamId(isOpp && selectedOpponentTeamId !== 'auto-red' ? selectedOpponentTeamId : 'all');
          setPlayerSearchQuery('');
          setCustomPlayerName('');
          setCustomPlayerNumber('');
        }
      } else {
        if (!isOpp) {
          saveCurrentLineup(pitchNodes);
        }
      }
    };

    window.addEventListener('mousemove', handlePointerMove, { passive: false });
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [draggingSlotId, pitchNodes, opponentNodes, selectedOpponentTeamId, isLandscape]);

  // Assign Player to Slot
  const assignPlayerToSlot = (slotId, playerObj) => {
    if (slotId.startsWith('opp_') || activeSlotModal?.isOpponent) {
      const updatedOpp = opponentNodes.map((n) => {
        if (n.id === slotId) {
          return { ...n, player: playerObj };
        }
        if (playerObj && n.player && n.player.id === playerObj.id) {
          return { ...n, player: null };
        }
        return n;
      });
      setOpponentNodes(updatedOpp);
      if (activeSlotModal && activeSlotModal.id === slotId) {
        setActiveSlotModal(null);
      }
      showStatusNotice(`✅ Assigned ${playerObj.name} to Opponent ${activeSlotModal?.role || 'Slot'}`);
      return;
    }

    const updatedNodes = pitchNodes.map((n) => {
      if (n.id === slotId) {
        return { ...n, player: playerObj };
      }
      if (playerObj && n.player && n.player.id === playerObj.id) {
        // Clear previous slot to prevent duplicates
        return { ...n, player: null };
      }
      return n;
    });

    setPitchNodes(updatedNodes);
    saveCurrentLineup(updatedNodes);
    if (activeSlotModal && activeSlotModal.id === slotId) {
      setActiveSlotModal(null);
    }
    const slot = pitchNodes.find((n) => n.id === slotId);
    showStatusNotice(`✅ Assigned ${playerObj.name} (${playerObj.teamName || 'Custom'}) to ${slot?.role || 'slot'}!`);
  };

  // Remove Player from Slot
  const handleRemovePlayerFromSlot = (slotId) => {
    if (slotId.startsWith('opp_')) {
      setOpponentNodes((prev) => prev.map((n) => (n.id === slotId ? { ...n, player: null } : n)));
      if (activeSlotModal && activeSlotModal.id === slotId) {
        setActiveSlotModal(null);
      }
      showStatusNotice('Removed player from opponent position.');
      return;
    }
    const updated = pitchNodes.map((n) => (n.id === slotId ? { ...n, player: null } : n));
    setPitchNodes(updated);
    saveCurrentLineup(updated);
    if (activeSlotModal && activeSlotModal.id === slotId) {
      setActiveSlotModal(null);
    }
    showStatusNotice('Removed player from position.');
  };

  // Drop a player dragged from the bench onto the pitch or onto a slot
  const handlePitchDrop = (e, targetSlotId = null) => {
    e.preventDefault();
    e.stopPropagation();
    setIsPitchDragOver(false);

    try {
      const raw = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const playerObj = JSON.parse(raw);
      if (!playerObj || !playerObj.id) return;

      // 1. If dropped directly onto a position node
      if (targetSlotId) {
        assignPlayerToSlot(targetSlotId, playerObj);
        return;
      }

      // 2. If dropped anywhere on the pitch: find closest visible position slot (friendly or opponent)
      if (!pitchRef.current) return;
      const rect = pitchRef.current.getBoundingClientRect();
      const dropScreenX = Math.max(6, Math.min(94, ((e.clientX - rect.left) / rect.width) * 100));
      const dropScreenY = Math.max(6, Math.min(94, ((e.clientY - rect.top) / rect.height) * 100));

      const targetX = isLandscape ? dropScreenY : dropScreenX;
      const targetY = isLandscape ? 100 - dropScreenX : dropScreenY;

      let closestSlot = null;
      let minDistance = Infinity;

      const candidates = [...visiblePitchNodes, ...(showOpponents ? visibleOpponentNodes : [])];
      candidates.forEach((node) => {
        const dist = Math.hypot(node.x - targetX, node.y - targetY);
        if (dist < minDistance) {
          minDistance = dist;
          closestSlot = node;
        }
      });

      if (closestSlot) {
        assignPlayerToSlot(closestSlot.id, playerObj);
      }
    } catch (err) {
      console.warn('Drop error:', err);
    }
  };

  // Add Custom Player
  const handleAddCustomPlayer = (e) => {
    e.preventDefault();
    if (!customPlayerName.trim()) return;
    const custom = {
      id: `custom_${Date.now()}`,
      name: customPlayerName.trim(),
      jerseyNumber: customPlayerNumber.trim() || activeSlotModal.role,
      position: activeSlotModal.role,
      isCustom: true,
      teamId: 'custom',
      teamName: 'Custom Trialist',
      teamColor: '#C9A227',
    };
    assignPlayerToSlot(activeSlotModal.id, custom);
  };

  // Set of assigned player IDs across all nodes (friendly and opponent)
  const assignedPlayerIds = useMemo(() => {
    const ids = new Set();
    pitchNodes.forEach((n) => {
      if (n.player && n.player.id) ids.add(n.player.id);
    });
    opponentNodes.forEach((n) => {
      if (n.player && n.player.id) ids.add(n.player.id);
    });
    return ids;
  }, [pitchNodes, opponentNodes]);

  // Bench (unassigned players from available list)
  const benchPlayers = useMemo(() => {
    return availablePlayers.filter((p) => !assignedPlayerIds.has(p.id));
  }, [availablePlayers, assignedPlayerIds]);

  const activeFormatData = FORMATION_PRESETS[selectedFormat] || FORMATION_PRESETS['11-aside'];
  const activeFormation = activeFormatData.formations[selectedFormationKey] || Object.values(activeFormatData.formations)[0];

  // Effective max player count based on whether Goalkeeper is included
  const effectiveMaxPlayers = includeGoalkeeper ? activeFormatData.playerCount : activeFormatData.playerCount - 1;
  const currentAssignedCount = visiblePitchNodes.filter((n) => n.player).length;

  // Dynamic scale dimensions based on pitchScale (User adjustable size)
  const badgeDiameter = Math.max(22, Math.round(35 * pitchScale));
  const badgeFontSize = Math.max(7.5, Math.round(11 * pitchScale));
  const roleFontSize = Math.max(6.5, Math.round(9 * pitchScale));
  const pillMaxWidth = Math.max(60, Math.round(92 * pitchScale));
  const pillFontSize = Math.max(7, Math.round(9 * pitchScale));
  const pillOppFontSize = Math.max(6.5, Math.round(8.5 * pitchScale));
  const removeBtnSize = Math.max(11, Math.round(14 * pitchScale));

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '10px 14px 40px', color: '#F4F2EA' }}>
      {/* Page Title & Subheader */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px' }}>📋</span>
            <h1
              className="scoreboard"
              style={{
                fontSize: '24px',
                color: '#C9A227',
                letterSpacing: '0.04em',
                margin: 0,
              }}
            >
              TACTICS &amp; FORMATION BOARD
            </h1>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#8FA89B' }}>
            Configure game formats (5, 7, 8, 11-aside), drag players directly from the bench onto the pitch, mix players from different teams, toggle goalkeeper on/off, and reposition freely.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleResetPositions}
            style={{
              background: '#16352A',
              color: '#FCD34D',
              border: '1px solid #C9A227',
              borderRadius: '8px',
              padding: '8px 14px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s ease',
            }}
            title="Snap all player positions back to their canonical formation coordinates"
          >
            <span>↺</span> Snap to Formation
          </button>

          <button
            type="button"
            onClick={handleClearAllPlayers}
            style={{
              background: '#231518',
              color: '#FF8A8A',
              border: '1px solid #732228',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
            title="Clear all assigned players from the pitch"
          >
            🧹 Clear Players
          </button>
        </div>
      </div>

      {/* Floating Status Notification */}
      {statusMessage && (
        <div
          style={{
            background: '#0F4432',
            border: '1px solid #48BB78',
            color: '#A7F3D0',
            borderRadius: '8px',
            padding: '8px 14px',
            marginBottom: '14px',
            fontSize: '12px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          <span>ℹ️</span> {statusMessage}
        </div>
      )}

      {/* Top Controls Bar: Game Format, Formations, Goalkeeper Toggle, and Cross-Team Selection */}
      <div
        style={{
          background: '#0B281F',
          border: '1px solid #1E4636',
          borderRadius: '14px',
          padding: '12px 14px',
          marginBottom: '18px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        {/* 1. Game Format Selector (5, 7, 8, 11 aside) */}
        <div>
          <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase', marginBottom: '5px', letterSpacing: '0.06em' }}>
            ⚽ 1. Format:
          </label>
          <div style={{ display: 'flex', gap: '4px', background: '#071B15', padding: '3px', borderRadius: '8px', border: '1px solid #1A3E30' }}>
            {Object.keys(FORMATION_PRESETS).map((fmtKey) => {
              const active = selectedFormat === fmtKey;
              let label = fmtKey.replace('-aside', 's').toUpperCase();
              if (fmtKey === '5-aside' && includeGoalkeeper) label = '5+1';
              if (fmtKey === '7-aside' && includeGoalkeeper) label = '7+1';
              return (
                <button
                  key={fmtKey}
                  type="button"
                  onClick={() => handleFormatChange(fmtKey)}
                  style={{
                    flex: 1,
                    padding: '5px 3px',
                    borderRadius: '6px',
                    border: 'none',
                    background: active ? '#C9A227' : 'transparent',
                    color: active ? '#16201B' : '#9BB5A8',
                    fontWeight: 800,
                    fontSize: '11px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Formation Preset Dropdown */}
        <div>
          <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase', marginBottom: '5px', letterSpacing: '0.06em' }}>
            📐 2. Formation ({effectiveMaxPlayers} Players):
          </label>
          <select
            value={selectedFormationKey}
            onChange={(e) => handleFormationChange(e.target.value)}
            style={{
              width: '100%',
              background: '#071B15',
              border: '1px solid #2B5746',
              color: '#F4F2EA',
              borderRadius: '8px',
              padding: '7px 10px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {Object.entries(activeFormatData.formations).map(([formKey, f]) => (
              <option key={formKey} value={formKey}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {/* 3. Goalkeeper Optional Toggle */}
        <div>
          <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase', marginBottom: '5px', letterSpacing: '0.06em' }}>
            🧤 3. Goalkeeper (GK):
          </label>
          <button
            type="button"
            onClick={() => {
              const next = !includeGoalkeeper;
              setIncludeGoalkeeper(next);
              showStatusNotice(
                next
                  ? (selectedFormat === '5-aside' || selectedFormat === '7-aside'
                      ? '🧤 Goalkeeper included (+1 mode)'
                      : '🧤 Goalkeeper included on pitch')
                  : '🚫 Goalkeeper removed (outfield-only mode)'
              );
            }}
            style={{
              width: '100%',
              padding: '7px 10px',
              borderRadius: '8px',
              border: includeGoalkeeper ? '1px solid #2B5746' : '1px solid #732228',
              background: includeGoalkeeper ? '#14382B' : '#231518',
              color: includeGoalkeeper ? '#6CE5A0' : '#FF8A8A',
              fontWeight: 800,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.15s ease',
            }}
            title="Toggle Goalkeeper slot on or off the pitch"
          >
            <span>
              {includeGoalkeeper
                ? (selectedFormat === '5-aside' || selectedFormat === '7-aside' ? '🧤 GK: +1 Included (ON)' : '🧤 GK: Included (ON)')
                : '🚫 GK: Removed (OFF)'}
            </span>
          </button>
        </div>

        {/* 4. Club Squad Roster (Allows All Clubs / Different Teams) */}
        <div>
          <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase', marginBottom: '5px', letterSpacing: '0.06em' }}>
            🛡️ 4. Player Roster Source:
          </label>
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            style={{
              width: '100%',
              background: '#071B15',
              border: '1px solid #2B5746',
              color: '#F4F2EA',
              borderRadius: '8px',
              padding: '7px 10px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="all">🌟 All Clubs (Cross-Team All-Star)</option>
            {teamsList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({(t.players || []).length} players)
              </option>
            ))}
          </select>
        </div>

        {/* 5. Opponents On / Off Toggle */}
        <div>
          <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase', marginBottom: '5px', letterSpacing: '0.06em' }}>
            ⚔️ 5. Opponents:
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <button
              type="button"
              onClick={() => {
                const next = !showOpponents;
                setShowOpponents(next);
                showStatusNotice(next ? '⚔️ Opponent formation displayed on pitch' : '👥 Opponents hidden from pitch');
              }}
              style={{
                width: '100%',
                padding: '7px 10px',
                borderRadius: '8px',
                border: showOpponents ? '1px solid #E11D48' : '1px solid #2B5746',
                background: showOpponents ? '#3A0D15' : '#14382B',
                color: showOpponents ? '#FDA4AF' : '#88D4B0',
                fontWeight: 800,
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                transition: 'all 0.15s ease',
                boxShadow: showOpponents ? '0 0 12px rgba(225, 29, 72, 0.35)' : 'none',
              }}
              title="Toggle opponents on or off the pitch"
            >
              <span>{showOpponents ? '⚔️ Opponents: ON' : '👥 Opponents: OFF'}</span>
            </button>
            {showOpponents && (
              <select
                value={selectedOpponentTeamId}
                onChange={(e) => setSelectedOpponentTeamId(e.target.value)}
                style={{
                  width: '100%',
                  background: '#230B12',
                  border: '1px solid #E11D48',
                  color: '#FDA4AF',
                  borderRadius: '6px',
                  padding: '4px 6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="auto-red">🔴 Red Team (Default Opponent)</option>
                {teamsList.map((t) => (
                  <option key={t.id} value={t.id}>
                    🛡️ {t.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Main Tactical Pitch & Sidebar Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: isLandscape ? 'minmax(320px, 1fr) 280px' : 'minmax(280px, 1fr) 280px', gap: '18px', alignItems: 'start' }}>
        {/* =========================================================================
            TACTICAL SOCCER PITCH (User Scalable + 90deg Rotatable)
           ========================================================================= */}
        <div
          style={{
            background: '#0A241C',
            border: '2px solid #1E4636',
            borderRadius: '14px',
            padding: '12px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
            position: 'relative',
            maxWidth: isLandscape ? `${Math.round(760 * pitchScale)}px` : `${Math.round(540 * pitchScale)}px`,
            width: '100%',
            margin: '0 auto',
            transition: 'max-width 0.25s ease',
          }}
        >
          {/* Pitch Header info & Controls */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
              paddingBottom: '8px',
              borderBottom: '1px solid #16382B',
              gap: '8px',
            }}
          >
            {/* Formation & Status Tags */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#FCD34D' }}>
                {activeFormation.name}
              </span>
              <span style={{ fontSize: '11px', color: '#7AA392' }}>
                ({currentAssignedCount} / {effectiveMaxPlayers} Selected)
              </span>
              {includeGoalkeeper && (selectedFormat === '5-aside' || selectedFormat === '7-aside') && (
                <span style={{ fontSize: '10px', background: '#14382B', color: '#6CE5A0', border: '1px solid #2B5746', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
                  {selectedFormat === '5-aside' ? '5 + 1 (GK)' : '7 + 1 (GK)'}
                </span>
              )}
              {!includeGoalkeeper && (
                <span style={{ fontSize: '10px', background: '#732228', color: '#FFAAAA', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                  No GK ({activeFormatData.outfieldCount || effectiveMaxPlayers} Outfield)
                </span>
              )}
              {showOpponents && (
                <span style={{ fontSize: '10px', background: '#3A0D15', color: '#FDA4AF', border: '1px solid #E11D48', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
                  Opponents ({visibleOpponentNodes.length})
                </span>
              )}
            </div>

            {/* Tactical Pitch Controls: Rotate 90deg + Pitch Size Adjustment */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Rotate 90deg Button */}
              <button
                type="button"
                onClick={() => {
                  const next = !isLandscape;
                  setIsLandscape(next);
                  showStatusNotice(next ? '🔄 Pitch rotated 90° (Landscape View)' : '📱 Pitch rotated back to Portrait View');
                }}
                style={{
                  background: isLandscape ? '#C9A227' : '#14382B',
                  color: isLandscape ? '#16201B' : '#FCD34D',
                  border: '1px solid #2B5746',
                  borderRadius: '6px',
                  padding: '4px 9px',
                  fontSize: '11px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                }}
                title="Rotate pitch between Portrait (0°) and Landscape (90°)"
              >
                <span>🔄</span>
                <span>{isLandscape ? '90° Landscape' : 'Rotate 90°'}</span>
              </button>

              {/* Pitch & Content Size Adjuster */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#071B15',
                  border: '1px solid #1E4636',
                  borderRadius: '6px',
                  padding: '2px 6px',
                }}
              >
                <span style={{ fontSize: '10.5px', color: '#8FA89B', fontWeight: 700 }}>🔍</span>
                <button
                  type="button"
                  onClick={() => setPitchScale((prev) => Math.max(0.7, Math.round((prev - 0.05) * 100) / 100))}
                  disabled={pitchScale <= 0.7}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: pitchScale <= 0.7 ? '#4B5563' : '#FCD34D',
                    fontSize: '13px',
                    fontWeight: 900,
                    cursor: pitchScale <= 0.7 ? 'not-allowed' : 'pointer',
                    padding: '0 3px',
                    lineHeight: 1,
                  }}
                  title="Zoom Out Pitch & Contents"
                >
                  −
                </button>
                <input
                  type="range"
                  min="0.7"
                  max="1.35"
                  step="0.05"
                  value={pitchScale}
                  onChange={(e) => setPitchScale(parseFloat(e.target.value))}
                  style={{
                    width: '54px',
                    accentColor: '#C9A227',
                    cursor: 'pointer',
                  }}
                  title={`Pitch Size: ${Math.round(pitchScale * 100)}%`}
                />
                <button
                  type="button"
                  onClick={() => setPitchScale((prev) => Math.min(1.35, Math.round((prev + 0.05) * 100) / 100))}
                  disabled={pitchScale >= 1.35}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: pitchScale >= 1.35 ? '#4B5563' : '#FCD34D',
                    fontSize: '13px',
                    fontWeight: 900,
                    cursor: pitchScale >= 1.35 ? 'not-allowed' : 'pointer',
                    padding: '0 3px',
                    lineHeight: 1,
                  }}
                  title="Zoom In Pitch & Contents"
                >
                  +
                </button>
                <span
                  onClick={() => setPitchScale(1.0)}
                  style={{
                    fontSize: '10px',
                    color: '#9BB5A8',
                    fontWeight: 800,
                    cursor: 'pointer',
                    marginLeft: '2px',
                    minWidth: '32px',
                    textAlign: 'right',
                  }}
                  title="Click to reset size to 100%"
                >
                  {Math.round(pitchScale * 100)}%
                </span>
              </div>
            </div>
          </div>

          {/* Realistic Green Soccer Turf with Pitch Markings & Dropzone Support */}
          <div
            ref={pitchRef}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              setIsPitchDragOver(true);
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) {
                setIsPitchDragOver(false);
              }
            }}
            onDrop={(e) => handlePitchDrop(e)}
            style={{
              position: 'relative',
              width: '100%',
              paddingBottom: isLandscape ? '68%' : '117.3%',
              borderRadius: '10px',
              background: isLandscape
                ? 'repeating-linear-gradient(90deg, #114B36, #114B36 32px, #0F4431 32px, #0F4431 64px)'
                : 'repeating-linear-gradient(180deg, #114B36, #114B36 32px, #0F4431 32px, #0F4431 64px)',
              border: isPitchDragOver ? '3px dashed #FCD34D' : '2.5px solid #E2E8F0',
              overflow: 'hidden',
              boxShadow: isPitchDragOver
                ? '0 0 25px rgba(252, 211, 77, 0.5), inset 0 0 40px rgba(0,0,0,0.5)'
                : 'inset 0 0 35px rgba(0,0,0,0.4)',
              userSelect: 'none',
              touchAction: 'none',
              transition: 'padding-bottom 0.25s ease, border 0.2s ease, box-shadow 0.2s ease',
            }}
          >
            {/* Drop Overlay Hint */}
            {isPitchDragOver && (
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(201, 162, 39, 0.95)',
                  color: '#16201B',
                  fontWeight: 900,
                  fontSize: '11px',
                  padding: '4px 12px',
                  borderRadius: '999px',
                  zIndex: 80,
                  pointerEvents: 'none',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  letterSpacing: '0.04em',
                }}
              >
                🎯 DROP TO ASSIGN TO NEAREST POSITION
              </div>
            )}

            {/* SVG Vector Pitch Markings (Portrait 0deg or Landscape 90deg) */}
            {!isLandscape ? (
              <svg
                viewBox="0 0 100 117.3"
                preserveAspectRatio="none"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  opacity: 0.65,
                }}
              >
                {/* Halfway Line */}
                <line x1="0" y1="58.65" x2="100" y2="58.65" stroke="#E2E8F0" strokeWidth="0.6" />

                {/* Center Circle & Spot */}
                <circle cx="50" cy="58.65" r="13" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <circle cx="50" cy="58.65" r="0.75" fill="#E2E8F0" />

                {/* TOP (Opponent / Attacking Goal) */}
                <rect x="22" y="0" width="56" height="20.4" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <rect x="36" y="0" width="28" height="7.2" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <circle cx="50" cy="13.6" r="0.75" fill="#E2E8F0" />
                <path d="M 40 20.4 A 10 10 0 0 0 60 20.4" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <rect x="42" y="-1.5" width="16" height="2" fill="rgba(255,255,255,0.7)" stroke="#CBD5E1" strokeWidth="0.4" />

                {/* BOTTOM (Defending Goal) */}
                <rect x="22" y="96.9" width="56" height="20.4" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <rect x="36" y="110.1" width="28" height="7.2" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <circle cx="50" cy="103.7" r="0.75" fill="#E2E8F0" />
                <path d="M 40 96.9 A 10 10 0 0 1 60 96.9" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <rect x="42" y="116.8" width="16" height="2" fill="rgba(255,255,255,0.7)" stroke="#CBD5E1" strokeWidth="0.4" />

                {/* Corner Arcs */}
                <path d="M 0 3 A 3 3 0 0 0 3 0" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <path d="M 97 0 A 3 3 0 0 0 100 3" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <path d="M 0 114.3 A 3 3 0 0 1 3 117.3" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <path d="M 100 114.3 A 3 3 0 0 0 97 117.3" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />

                {/* Attacking Direction Arrow */}
                <text x="50" y="51" textAnchor="middle" fill="#E2E8F0" fontSize="2.4" fontWeight="bold" letterSpacing="0.2">
                  ▲ ATTACKING DIRECTION ▲
                </text>
              </svg>
            ) : (
              <svg
                viewBox="0 0 100 68"
                preserveAspectRatio="none"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  opacity: 0.65,
                }}
              >
                {/* Halfway Line (Vertical) */}
                <line x1="50" y1="0" x2="50" y2="68" stroke="#E2E8F0" strokeWidth="0.6" />

                {/* Center Circle & Spot */}
                <circle cx="50" cy="34" r="11" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <circle cx="50" cy="34" r="0.75" fill="#E2E8F0" />

                {/* LEFT (Defending Goal) */}
                <rect x="0" y="14" width="16" height="40" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <rect x="0" y="24" width="5.5" height="20" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <circle cx="11" cy="34" r="0.75" fill="#E2E8F0" />
                <path d="M 16 28 A 7 7 0 0 1 16 40" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <rect x="-1.5" y="29" width="1.5" height="10" fill="rgba(255,255,255,0.7)" stroke="#CBD5E1" strokeWidth="0.4" />

                {/* RIGHT (Opponent / Attacking Goal) */}
                <rect x="84" y="14" width="16" height="40" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <rect x="94.5" y="24" width="5.5" height="20" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <circle cx="89" cy="34" r="0.75" fill="#E2E8F0" />
                <path d="M 84 28 A 7 7 0 0 0 84 40" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <rect x="100" y="29" width="1.5" height="10" fill="rgba(255,255,255,0.7)" stroke="#CBD5E1" strokeWidth="0.4" />

                {/* Corner Arcs */}
                <path d="M 0 3 A 3 3 0 0 0 3 0" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <path d="M 97 0 A 3 3 0 0 0 100 3" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <path d="M 0 65 A 3 3 0 0 1 3 68" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />
                <path d="M 100 65 A 3 3 0 0 0 97 68" fill="none" stroke="#E2E8F0" strokeWidth="0.6" />

                {/* Attacking Direction Arrow */}
                <text x="50" y="63" textAnchor="middle" fill="#E2E8F0" fontSize="2.2" fontWeight="bold" letterSpacing="0.2">
                  ➔ ATTACKING DIRECTION ➔
                </text>
              </svg>
            )}

            {/* Draggable Position Nodes (Filtered for optional Goalkeeper) */}
            {visiblePitchNodes.map((node) => {
              const isAssigned = Boolean(node.player);
              const isDragging = draggingSlotId === node.id;
              const playerObj = node.player;

              // Use assigned player's own club color (or fallback to team color)
              const playerTeamColor = playerObj?.teamColor || (playerObj?.teamId && teamsMap[playerObj.teamId]?.color) || '#C9A227';
              const isGk = node.role === 'GK';

              const nodeLeft = isLandscape ? `${100 - node.y}%` : `${node.x}%`;
              const nodeTop = isLandscape ? `${node.x}%` : `${node.y}%`;

              return (
                <div
                  key={node.id}
                  onMouseDown={(e) => handlePointerDown(e, node.id)}
                  onTouchStart={(e) => handlePointerDown(e, node.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'copy';
                  }}
                  onDrop={(e) => {
                    e.stopPropagation();
                    handlePitchDrop(e, node.id);
                  }}
                  style={{
                    position: 'absolute',
                    left: nodeLeft,
                    top: nodeTop,
                    transform: `translate(-50%, -50%) scale(${isDragging ? 1.15 : 1})`,
                    zIndex: isDragging ? 100 : 10,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    touchAction: 'none',
                    transition: isDragging ? 'none' : 'transform 0.15s ease, left 0.3s ease, top 0.3s ease',
                  }}
                >
                  {/* Jersey Badge Circle (Dynamic scaling) */}
                  <div
                    style={{
                      width: `${badgeDiameter}px`,
                      height: `${badgeDiameter}px`,
                      borderRadius: '50%',
                      background: isAssigned
                        ? isGk
                          ? 'radial-gradient(circle, #EAB308 0%, #854D0E 100%)'
                          : `radial-gradient(circle, ${playerTeamColor} 0%, #0F172A 100%)`
                        : '#0D2B20',
                      border: isDragging
                        ? '2.5px solid #FCD34D'
                        : isAssigned
                        ? '2px solid #F8FAFC'
                        : '1.5px dashed #48BB78',
                      boxShadow: isDragging
                        ? '0 0 16px rgba(252, 211, 77, 0.8), 0 6px 14px rgba(0,0,0,0.6)'
                        : '0 3px 8px rgba(0,0,0,0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#F8FAFC',
                      fontWeight: 900,
                      fontSize: isAssigned ? `${badgeFontSize}px` : `${roleFontSize}px`,
                      letterSpacing: '0.03em',
                      position: 'relative',
                    }}
                  >
                    {isAssigned ? (
                      playerObj.jerseyNumber || playerObj.jersey_number ? `#${playerObj.jerseyNumber || playerObj.jersey_number}` : node.role
                    ) : (
                      <span style={{ color: '#48BB78', fontSize: `${roleFontSize}px` }}>{node.role}</span>
                    )}

                    {/* Quick remove button if assigned */}
                    {isAssigned && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePlayerFromSlot(node.id);
                        }}
                        style={{
                          position: 'absolute',
                          top: '-3px',
                          right: '-3px',
                          width: `${removeBtnSize}px`,
                          height: `${removeBtnSize}px`,
                          borderRadius: '50%',
                          background: '#EF4444',
                          border: '1px solid #FFFFFF',
                          color: '#FFFFFF',
                          fontSize: `${Math.round(removeBtnSize * 0.65)}px`,
                          fontWeight: 900,
                          lineHeight: '1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                        title="Unassign player"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Player Name Tag or Position Label (Cross-Team badge) */}
                  <div
                    style={{
                      marginTop: '2px',
                      background: isAssigned ? '#0B1D16' : 'rgba(11, 29, 22, 0.75)',
                      border: isAssigned ? `1px solid ${playerTeamColor}` : '1px solid #1E4636',
                      borderRadius: '4px',
                      padding: '1px 5px',
                      fontSize: `${pillFontSize}px`,
                      fontWeight: 800,
                      color: isAssigned ? '#FCD34D' : '#8FA89B',
                      whiteSpace: 'nowrap',
                      maxWidth: `${pillMaxWidth}px`,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      textAlign: 'center',
                      boxShadow: '0 2px 5px rgba(0,0,0,0.4)',
                    }}
                    title={isAssigned ? `${playerObj.name} (${playerObj.teamName || 'Squad'})` : node.label}
                  >
                    {isAssigned ? (
                      <span>
                        {playerObj.name}
                        {playerObj.teamName && (
                          <span style={{ opacity: 0.7, fontSize: `${Math.max(6.5, pillFontSize - 1)}px`, marginLeft: '3px' }}>
                            [{playerObj.teamName.slice(0, 3).toUpperCase()}]
                          </span>
                        )}
                      </span>
                    ) : (
                      `+ ${node.role}`
                    )}
                  </div>
                </div>
              );
            })}

            {/* Opponent Nodes on Pitch (Visible only when Opponents Toggle is ON) */}
            {showOpponents &&
              visibleOpponentNodes.map((node) => {
                const isAssigned = Boolean(node.player);
                const isDragging = draggingSlotId === node.id;
                const playerObj = node.player;
                const playerColor = playerObj?.teamColor || opponentThemeColor;
                const isGk = node.role === 'GK';

                const oppLeft = isLandscape ? `${100 - node.y}%` : `${node.x}%`;
                const oppTop = isLandscape ? `${node.x}%` : `${node.y}%`;

                return (
                  <div
                    key={node.id}
                    onMouseDown={(e) => handlePointerDown(e, node.id, true)}
                    onTouchStart={(e) => handlePointerDown(e, node.id, true)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = 'copy';
                    }}
                    onDrop={(e) => {
                      e.stopPropagation();
                      handlePitchDrop(e, node.id);
                    }}
                    style={{
                      position: 'absolute',
                      left: oppLeft,
                      top: oppTop,
                      transform: `translate(-50%, -50%) scale(${isDragging ? 1.15 : 1})`,
                      zIndex: isDragging ? 100 : 12,
                      cursor: isDragging ? 'grabbing' : 'grab',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      touchAction: 'none',
                      transition: isDragging ? 'none' : 'transform 0.15s ease, left 0.3s ease, top 0.3s ease',
                    }}
                  >
                    {/* Opponent Jersey Badge Circle (Dynamic scaling) */}
                    <div
                      style={{
                        width: `${badgeDiameter}px`,
                        height: `${badgeDiameter}px`,
                        borderRadius: '50%',
                        background: isAssigned
                          ? isGk
                            ? 'radial-gradient(circle, #F97316 0%, #7C2D12 100%)'
                            : `radial-gradient(circle, ${playerColor} 0%, #1E070B 100%)`
                          : isGk
                          ? 'radial-gradient(circle, #F97316 0%, #7C2D12 100%)'
                          : `radial-gradient(circle, ${opponentThemeColor} 0%, #350A14 100%)`,
                        border: isDragging
                          ? '2.5px solid #FDA4AF'
                          : isAssigned
                          ? '2px solid #FFFFFF'
                          : '1.5px solid #FDA4AF',
                        boxShadow: isDragging
                          ? '0 0 16px rgba(244, 63, 94, 0.9), 0 6px 14px rgba(0,0,0,0.6)'
                          : '0 3px 8px rgba(0,0,0,0.6), 0 0 8px rgba(225, 29, 72, 0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FFFFFF',
                        fontWeight: 900,
                        fontSize: isAssigned ? `${badgeFontSize}px` : `${roleFontSize}px`,
                        letterSpacing: '0.03em',
                        position: 'relative',
                      }}
                    >
                      {isAssigned ? (
                        playerObj.jerseyNumber || playerObj.jersey_number ? `#${playerObj.jerseyNumber || playerObj.jersey_number}` : node.role
                      ) : (
                        <span style={{ color: '#FFE4E6', fontSize: `${roleFontSize}px` }}>{node.role}</span>
                      )}

                      {/* Quick remove button */}
                      {isAssigned && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemovePlayerFromSlot(node.id);
                          }}
                          style={{
                            position: 'absolute',
                            top: '-3px',
                            right: '-3px',
                            width: `${removeBtnSize}px`,
                            height: `${removeBtnSize}px`,
                            borderRadius: '50%',
                            background: '#EF4444',
                            border: '1px solid #FFFFFF',
                            color: '#FFFFFF',
                            fontSize: `${Math.round(removeBtnSize * 0.65)}px`,
                            fontWeight: 900,
                            lineHeight: '1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                          title="Unassign opponent player"
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {/* Opponent Pill Tag */}
                    <div
                      style={{
                        marginTop: '2px',
                        background: '#230B12',
                        border: `1px solid ${opponentThemeColor}`,
                        borderRadius: '4px',
                        padding: '1px 5px',
                        color: '#FDA4AF',
                        fontSize: `${pillOppFontSize}px`,
                        fontWeight: 800,
                        maxWidth: `${pillMaxWidth}px`,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                        textAlign: 'center',
                      }}
                      title={isAssigned ? `${playerObj.name} (Opponent)` : `Opponent ${node.label || node.role}`}
                    >
                      <span style={{ color: '#F43F5E', marginRight: '3px', fontWeight: 900 }}>OPP</span>
                      {isAssigned ? playerObj.name : node.role}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Quick Pitch Footer */}
          <div
            style={{
              marginTop: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: '#8FA89B',
            }}
          >
            <span>🏟️ Thoome Pri. Ground · Tactical Blueprint</span>
            <span>{activeFormation.description}</span>
          </div>
        </div>

        {/* =========================================================================
            TACTICAL SIDEBAR: ROSTER & DRAGGABLE BENCH
           ========================================================================= */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Starting Lineup List */}
          <div
            style={{
              background: '#0B281F',
              border: '1px solid #1E4636',
              borderRadius: '14px',
              padding: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
                paddingBottom: '6px',
                borderBottom: '1px solid #16382B',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '12.5px', fontWeight: 800, color: '#C9A227', letterSpacing: '0.05em' }}>
                ⭐ STARTING SQUAD ({currentAssignedCount}/{effectiveMaxPlayers})
              </h3>
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: '#16352A',
                  color: '#6CE5A0',
                  fontWeight: 800,
                }}
              >
                {selectedTeamId === 'all' ? 'All Clubs' : (teamsMap[selectedTeamId]?.name || 'Club')}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '250px', overflowY: 'auto' }}>
              {visiblePitchNodes.map((node) => {
                const isAssigned = Boolean(node.player);
                const playerObj = node.player;
                const playerTeamColor = playerObj?.teamColor || (playerObj?.teamId && teamsMap[playerObj.teamId]?.color) || '#C9A227';

                return (
                  <div
                    key={node.id}
                    onClick={() => {
                      setActiveSlotModal(node);
                      setModalFilterTeamId('all');
                      setPlayerSearchQuery('');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '5px 8px',
                      borderRadius: '6px',
                      background: isAssigned ? '#071B15' : '#0B221B',
                      border: isAssigned ? `1px solid ${playerTeamColor}` : '1px dashed #1E4636',
                      cursor: 'pointer',
                      fontSize: '11.5px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          width: '26px',
                          height: '18px',
                          borderRadius: '4px',
                          background: '#16352A',
                          color: '#C9A227',
                          fontWeight: 800,
                          fontSize: '10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {node.role}
                      </span>
                      <span style={{ fontWeight: 700, color: isAssigned ? '#F4F2EA' : '#6E9080' }}>
                        {isAssigned ? (
                          <span>
                            {playerObj.name}{' '}
                            <span style={{ fontSize: '9.5px', color: playerTeamColor, fontWeight: 700 }}>
                              ({playerObj.teamName ? playerObj.teamName.slice(0, 3).toUpperCase() : 'Squad'})
                            </span>
                          </span>
                        ) : (
                          `(Empty ${node.label})`
                        )}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {isAssigned ? (
                        <span style={{ fontSize: '10px', color: '#48BB78', fontWeight: 700 }}>
                          {playerObj.jerseyNumber || playerObj.jersey_number ? `#${playerObj.jerseyNumber || playerObj.jersey_number}` : '✔'}
                        </span>
                      ) : (
                        <span style={{ fontSize: '10.5px', color: '#C9A227', fontWeight: 700 }}>
                          + Assign
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Draggable Substitutes / Reserves Bench */}
          <div
            style={{
              background: '#0B281F',
              border: '1px solid #1E4636',
              borderRadius: '14px',
              padding: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
                paddingBottom: '6px',
                borderBottom: '1px solid #16382B',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '12.5px', fontWeight: 800, color: '#8FA89B', letterSpacing: '0.05em' }}>
                🪑 BENCH / ROSTER ({benchPlayers.length})
              </h3>
              <span style={{ fontSize: '10px', color: '#6E9080', fontStyle: 'italic' }}>
                Drag player to pitch ⇲
              </span>
            </div>

            {benchPlayers.length === 0 ? (
              <div style={{ fontSize: '11px', color: '#6E9080', fontStyle: 'italic', padding: '8px 0', textAlign: 'center' }}>
                All available squad players are on the pitch.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '240px', overflowY: 'auto' }}>
                {benchPlayers.map((player) => {
                  const pTeamColor = player.teamColor || (player.teamId && teamsMap[player.teamId]?.color) || '#C9A227';
                  return (
                    <div
                      key={player.id}
                      draggable={true}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/json', JSON.stringify(player));
                        e.dataTransfer.setData('text/plain', JSON.stringify(player));
                        e.dataTransfer.effectAllowed = 'copy';
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '5px 8px',
                        borderRadius: '6px',
                        background: '#071B15',
                        border: '1px solid #1A3E30',
                        fontSize: '11px',
                        cursor: 'grab',
                        transition: 'background 0.15s ease, border-color 0.15s ease',
                      }}
                      title="Drag and drop directly onto any position on the pitch"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: '#6E9080', cursor: 'grab', fontSize: '11px' }}>⋮⋮</span>
                        <span
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            background: pTeamColor,
                            color: '#FFFFFF',
                            fontSize: '9.5px',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {player.jersey_number || player.jerseyNumber ? player.jersey_number || player.jerseyNumber : '•'}
                        </span>
                        <div>
                          <span style={{ color: '#DDE6DF', fontWeight: 600 }}>{player.name}</span>
                          <span style={{ fontSize: '9px', color: pTeamColor, marginLeft: '4px', fontWeight: 700 }}>
                            ({player.teamName ? player.teamName.slice(0, 3).toUpperCase() : 'Club'})
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const emptySlot = visiblePitchNodes.find((n) => !n.player);
                          if (emptySlot) {
                            assignPlayerToSlot(emptySlot.id, player);
                          } else {
                            setActiveSlotModal(visiblePitchNodes[0]);
                          }
                        }}
                        style={{
                          background: '#16352A',
                          color: '#6CE5A0',
                          border: '1px solid #2B5746',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        + Place
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tactical Instructions Note Card */}
          <div
            style={{
              background: '#0B281F',
              border: '1px solid #1E4636',
              borderRadius: '14px',
              padding: '12px',
            }}
          >
            <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase', marginBottom: '5px', letterSpacing: '0.06em' }}>
              📝 Matchday Tactical Notes:
            </label>
            <textarea
              rows="3"
              value={tacticalNote}
              onChange={(e) => setTacticalNote(e.target.value)}
              placeholder="e.g. Set-piece routines, press triggers, high-line instructions..."
              style={{
                width: '100%',
                background: '#071B15',
                border: '1px solid #2B5746',
                color: '#F4F2EA',
                borderRadius: '8px',
                padding: '6px 8px',
                fontSize: '11.5px',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
      </div>

      {/* =========================================================================
          PLAYER ASSIGNMENT MODAL (Cross-Team Selection Support)
         ========================================================================= */}
      {activeSlotModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => setActiveSlotModal(null)}
        >
          <div
            style={{
              background: '#0A241C',
              border: '2px solid #C9A227',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '460px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '18px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
              color: '#F4F2EA',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid #1E4636', paddingBottom: '8px' }}>
              <div>
                <span
                  style={{
                    background: '#C9A227',
                    color: '#16201B',
                    fontSize: '10.5px',
                    fontWeight: 900,
                    padding: '2px 7px',
                    borderRadius: '4px',
                    marginRight: '8px',
                  }}
                >
                  {activeSlotModal.role}
                </span>
                <span style={{ fontSize: '14.5px', fontWeight: 800 }}>
                  Assign {activeSlotModal.label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveSlotModal(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#9BB5A8',
                  fontSize: '20px',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
              >
                ×
              </button>
            </div>

            {/* Currently Assigned Banner */}
            {activeSlotModal.player && (
              <div
                style={{
                  background: '#071B15',
                  border: '1px solid #2B5746',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '10px', color: '#8FA89B' }}>Current Player:</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#FCD34D' }}>
                    {activeSlotModal.player.name}{' '}
                    {activeSlotModal.player.jerseyNumber || activeSlotModal.player.jersey_number ? `(#${activeSlotModal.player.jerseyNumber || activeSlotModal.player.jersey_number})` : ''}
                    {activeSlotModal.player.teamName && (
                      <span style={{ fontSize: '11px', color: '#6CE5A0', marginLeft: '6px' }}>
                        [{activeSlotModal.player.teamName}]
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemovePlayerFromSlot(activeSlotModal.id)}
                  style={{
                    background: '#231518',
                    color: '#FF8A8A',
                    border: '1px solid #732228',
                    borderRadius: '6px',
                    padding: '3px 8px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Clear Position
                </button>
              </div>
            )}

            {/* Team Filter & Search Box in Modal */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <select
                value={modalFilterTeamId}
                onChange={(e) => setModalFilterTeamId(e.target.value)}
                style={{
                  flex: 1,
                  background: '#071B15',
                  border: '1px solid #2B5746',
                  color: '#F4F2EA',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  outline: 'none',
                }}
              >
                <option value="all">🌟 All Clubs (Cross-Team)</option>
                {teamsList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={playerSearchQuery}
                onChange={(e) => setPlayerSearchQuery(e.target.value)}
                placeholder="🔍 Search name..."
                style={{
                  flex: 1.2,
                  background: '#071B15',
                  border: '1px solid #2B5746',
                  color: '#F4F2EA',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Cross-Team Squad Players List */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#C9A227', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>
                Select Squad Player:
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '220px', overflowY: 'auto' }}>
                {allTeamsPlayers
                  .filter((p) => {
                    if (modalFilterTeamId !== 'all' && p.teamId !== modalFilterTeamId) return false;
                    if (!playerSearchQuery.trim()) return true;
                    const q = playerSearchQuery.toLowerCase();
                    return (
                      p.name.toLowerCase().includes(q) ||
                      (p.position && p.position.toLowerCase().includes(q)) ||
                      (p.teamName && p.teamName.toLowerCase().includes(q))
                    );
                  })
                  .map((p) => {
                    const isAlreadyAssigned = assignedPlayerIds.has(p.id);
                    const isSelectedForThisSlot = activeSlotModal.player?.id === p.id;
                    const pTeamColor = p.teamColor || (p.teamId && teamsMap[p.teamId]?.color) || '#C9A227';

                    return (
                      <div
                        key={p.id}
                        onClick={() => assignPlayerToSlot(activeSlotModal.id, p)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          background: isSelectedForThisSlot ? 'rgba(201, 162, 39, 0.2)' : '#071B15',
                          border: isSelectedForThisSlot ? '1px solid #C9A227' : '1px solid #1E4636',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: pTeamColor,
                              color: '#FFFFFF',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 900,
                              fontSize: '10px',
                            }}
                          >
                            {p.jersey_number || p.jerseyNumber || '•'}
                          </span>
                          <div>
                            <div style={{ fontWeight: 800, fontSize: '12px', color: '#F4F2EA' }}>
                              {p.name}
                            </div>
                            <div style={{ fontSize: '10px', color: '#8FA89B' }}>
                              {p.position || 'Player'} · <strong style={{ color: pTeamColor }}>{p.teamName || 'Squad'}</strong>
                            </div>
                          </div>
                        </div>

                        <div>
                          {isSelectedForThisSlot ? (
                            <span style={{ fontSize: '10.5px', color: '#FCD34D', fontWeight: 800 }}>
                              Selected ✔
                            </span>
                          ) : isAlreadyAssigned ? (
                            <span style={{ fontSize: '10px', color: '#EAB308', fontWeight: 700 }}>
                              Swap ⇄
                            </span>
                          ) : (
                            <span style={{ fontSize: '10.5px', color: '#48BB78', fontWeight: 700 }}>
                              + Select
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Custom Player Option (Guest/Trialist) */}
            <div style={{ borderTop: '1px solid #1E4636', paddingTop: '10px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#8FA89B', textTransform: 'uppercase', marginBottom: '6px' }}>
                Or Add Custom / Guest Player:
              </div>
              <form onSubmit={handleAddCustomPlayer} style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  value={customPlayerName}
                  onChange={(e) => setCustomPlayerName(e.target.value)}
                  placeholder="Player name (e.g. Trialist A)"
                  style={{
                    flex: 2,
                    background: '#071B15',
                    border: '1px solid #2B5746',
                    color: '#F4F2EA',
                    borderRadius: '6px',
                    padding: '5px 8px',
                    fontSize: '11.5px',
                    outline: 'none',
                  }}
                />
                <input
                  type="text"
                  value={customPlayerNumber}
                  onChange={(e) => setCustomPlayerNumber(e.target.value)}
                  placeholder="No."
                  style={{
                    width: '45px',
                    background: '#071B15',
                    border: '1px solid #2B5746',
                    color: '#F4F2EA',
                    borderRadius: '6px',
                    padding: '5px 6px',
                    fontSize: '11.5px',
                    outline: 'none',
                    textAlign: 'center',
                  }}
                />
                <button
                  type="submit"
                  style={{
                    background: '#C9A227',
                    color: '#16201B',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '5px 10px',
                    fontSize: '11px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  Add
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
