import React, { useState, useEffect } from 'react';
import TeamBalancerView from './TeamBalancerView';
import { api } from '../api/client';
import PasswordInput from './PasswordInput';

const POSITIONS = [
  { value: '', label: '-- Unassigned (Assign Later) --' },
  { value: 'GK', label: 'GK (Goalkeeper)' },
  { value: 'LB', label: 'LB (Left Back)' },
  { value: 'CB', label: 'CB (Center Back)' },
  { value: 'RB', label: 'RB (Right Back)' },
  { value: 'CDM', label: 'CDM (Defensive Midfielder)' },
  { value: 'CM', label: 'CM (Central Midfielder)' },
  { value: 'LW', label: 'LW (Left Winger)' },
  { value: 'RW', label: 'RW (Right Winger)' },
  { value: 'ST', label: 'ST (Striker)' },
];

const JERSEY_GROUPS = [
  { key: 'u13', label: 'U13 Jersey Photos' },
  { key: 'u15', label: 'U15 Jersey Photos' },
  { key: 'u17', label: 'U17 Jersey Photos' },
  { key: 'wazae', label: 'Wazae Jersey Photos' },
];

const FIXTURE_CATEGORY_OPTIONS = [
  { value: 'internal', label: 'Internal' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'league', label: 'League' },
  { value: 'cup', label: 'Cup' },
];

const LEAGUE_PALETTE = [
  '#B23A2E', '#FF9500', '#2E5A8F', '#3F7A4E', '#7A3F8F', '#FF9500',
  '#1F6E5C', '#8F2E5A', '#4E4E4E', '#2E7A7A', '#A2451F', '#3F5A2E',
  '#0284C7', '#7C3AED', '#DB2777', '#059669',
];

export default function ManageView({
  cat,
  categories = {},
  deletedCategories = {},
  activeCategoryKey,
  homepageData,
  onUpdateHomepage,
  onUpdateVotingConfig,
  onAddTeam,
  onCreateLeagueTeam = null,
  onReorganizeUnplayedFixtures = null,
  onAddPlayers,
  onRemovePlayer,
  onUpdatePlayerPosition,
  onTogglePlayerStatus,
  onReleasePlayerJersey,
  onAddReferee,
  onRemoveReferee,
  onRandomizeReferees,
  onDeleteCategory,
  onRestoreCategory,
  onPermanentDeleteCategory,
  onResetRealSeason,
  onGenerateFixtures,
  onApplyBalancedTeamsToCategory,
  onCreateCategoryWithBalancedTeams,
  onNavigateToCompetitionView,
  onSelectTeam,
  onMovePlayer,
  onIntelligentlyAddPlayer,
  onOpenEditCategory,
  cmsUser = null,
  onUpdateCmsUser = null,
  initialSection = 'players',
}) {
  const [adminSection, setAdminSection] = useState(initialSection || 'players'); // 'players' | 'balancer' | 'homepage' | 'voting' | 'teams' | 'security'

  useEffect(() => {
    if (initialSection) setAdminSection(initialSection);
  }, [initialSection]);

  // Quick Player Transfer state
  const [quickTransferSourceTeam, setQuickTransferSourceTeam] = useState('');
  const [quickTransferPlayerId, setQuickTransferPlayerId] = useState('');
  const [quickTransferTargetTeam, setQuickTransferTargetTeam] = useState('');

  // Teams & Roster state
  const [newTeamName, setNewTeamName] = useState('');
  const [showAddTeamModal, setShowAddTeamModal] = useState(false);
  const [newTeamTitle, setNewTeamTitle] = useState('');
  const [newTeamCodeInput, setNewTeamCodeInput] = useState('');
  const [newTeamColorInput, setNewTeamColorInput] = useState('#2E7A7A');
  const [squadMethod, setSquadMethod] = useState('direct'); // 'direct' | 'transfer' | 'autobalance'
  const [directPlayerRows, setDirectPlayerRows] = useState([
    { name: '', position: 'GK', jerseyNumber: '1' },
    { name: '', position: 'CB', jerseyNumber: '4' },
    { name: '', position: 'LB', jerseyNumber: '3' },
    { name: '', position: 'RB', jerseyNumber: '2' },
    { name: '', position: 'CDM', jerseyNumber: '6' },
    { name: '', position: 'CM', jerseyNumber: '8' },
    { name: '', position: 'RW', jerseyNumber: '7' },
    { name: '', position: 'LW', jerseyNumber: '11' },
    { name: '', position: 'ST', jerseyNumber: '9' },
  ]);
  const [directPasteNames, setDirectPasteNames] = useState('');
  const [selectedTransfers, setSelectedTransfers] = useState([]);
  const [transferFilterTeam, setTransferFilterTeam] = useState('all');
  const [enableIntelligentPull, setEnableIntelligentPull] = useState(false);
  const [intelligentPullCount, setIntelligentPullCount] = useState(6);
  const [autoGenFixtures, setAutoGenFixtures] = useState(true);
  const [fixtureFormatChoice, setFixtureFormatChoice] = useState('double');
  const [teamCreationMsg, setTeamCreationMsg] = useState(null);
  const [openTeamIds, setOpenTeamIds] = useState({});
  const [newPlayerNames, setNewPlayerNames] = useState({});
  const [newPlayerPositions, setNewPlayerPositions] = useState({});
  const [newPlayerUsernames, setNewPlayerUsernames] = useState({});
  const [newPlayerPasswords, setNewPlayerPasswords] = useState({});
  const [newRefName, setNewRefName] = useState('');
  const [refTargetCategoryKey, setRefTargetCategoryKey] = useState(activeCategoryKey || 'open');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Carousel upload state
  const [slideTitle, setSlideTitle] = useState('');
  const [slideSubtitle, setSlideSubtitle] = useState('');
  const [slideTag, setSlideTag] = useState('CLUB GALLERY');
  const [slideImage, setSlideImage] = useState('');

  // Jersey upload state
  const [selectedJerseyGroup, setSelectedJerseyGroup] = useState('u13');
  const [jerseyTitle, setJerseyTitle] = useState('');
  const [jerseySubtitle, setJerseySubtitle] = useState('');
  const [jerseyBadge, setJerseyBadge] = useState('HOME KIT');
  const [jerseyImage, setJerseyImage] = useState('');

  // Sidebar Fixture state
  const [fixCategory, setFixCategory] = useState('friendly');
  const [fixTitle, setFixTitle] = useState('');
  const [fixHome, setFixHome] = useState('Ruiru Titans FC');
  const [fixAway, setFixAway] = useState('');
  const [fixDate, setFixDate] = useState('');
  const [fixVenue, setFixVenue] = useState('Thoome Pri.');

  // Voting config state
  const votingCfg = cat?.votingConfig || { team_size: 6, max_picks_per_position: 2, include_gk: true };
  const [teamSize, setTeamSize] = useState(votingCfg.team_size ?? 6);
  const [maxPicks, setMaxPicks] = useState(votingCfg.max_picks_per_position ?? 2);
  const [includeGk, setIncludeGk] = useState(votingCfg.include_gk !== false);
  const [statusBanner, setStatusBanner] = useState(null);

  // Voting Round & Window Toggle state
  const [votingRoundData, setVotingRoundData] = useState(null);
  const [allVotingRounds, setAllVotingRounds] = useState([]);
  const [votingToggleLoading, setVotingToggleLoading] = useState(false);

  const loadVotingRoundData = async () => {
    if (!activeCategoryKey) return;
    try {
      const data = await api.getVotingData(activeCategoryKey);
      if (data) {
        if (data.round) setVotingRoundData(data.round);
        if (Array.isArray(data.all_rounds)) setAllVotingRounds(data.all_rounds);
      }
    } catch (err) {
      console.warn('Failed to load voting round:', err);
    }
  };

  useEffect(() => {
    loadVotingRoundData();
  }, [activeCategoryKey, adminSection]);

  const handleToggleVotingWindow = async (nextIsOpen) => {
    if (!activeCategoryKey) return;
    setVotingToggleLoading(true);
    try {
      const res = await api.toggleVotingRound(activeCategoryKey, {
        round_id: votingRoundData?.id,
        is_open: nextIsOpen,
      });
      if (res && res.round) {
        setVotingRoundData(res.round);
      }
      if (res && res.all_rounds) {
        setAllVotingRounds(res.all_rounds);
      }
      setStatusBanner(
        nextIsOpen
          ? `🔓 Voting window successfully opened for ${res?.round?.title || 'this week'}! Players can now vote.`
          : `🔒 Voting window successfully turned OFF for ${res?.round?.title || 'this week'}. Player voting is now disabled.`
      );
    } catch (err) {
      setStatusBanner(`❌ Failed to toggle voting: ${err.message}`);
    } finally {
      setVotingToggleLoading(false);
    }
  };

  const handleCreateNewVotingRound = async () => {
    if (!activeCategoryKey) return;
    const confirmCreate = window.confirm("Start next week's voting round? This will close the previous round and open the new week for voting.");
    if (!confirmCreate) return;
    setVotingToggleLoading(true);
    try {
      const res = await api.toggleVotingRound(activeCategoryKey, {
        create_new: true,
      });
      if (res && res.round) {
        setVotingRoundData(res.round);
      }
      if (res && res.all_rounds) {
        setAllVotingRounds(res.all_rounds);
      }
      setStatusBanner(`🎉 Created new voting round: ${res?.round?.title || 'Next Week'} (Voting is OPEN)!`);
    } catch (err) {
      setStatusBanner(`❌ Failed to create new voting round: ${err.message}`);
    } finally {
      setVotingToggleLoading(false);
    }
  };

  // Player Registration & Password Reset state
  const [regPlayerName, setRegPlayerName] = useState('');
  const [regPlayerUsername, setRegPlayerUsername] = useState('');
  const [regPlayerTeamId, setRegPlayerTeamId] = useState('');
  const [regPlayerPosition, setRegPlayerPosition] = useState('');
  const [regPlayerJersey, setRegPlayerJersey] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState(null);
  const [regError, setRegError] = useState(null);

  const [resetUsername, setResetUsername] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(null);
  const [resetError, setResetError] = useState(null);
  const [resetSearchQuery, setResetSearchQuery] = useState('');
  const [resetSearchResults, setResetSearchResults] = useState([]);
  const [resetSearchLoading, setResetSearchLoading] = useState(false);

  // Manager Password Change state
  const [cmsCurrentPassword, setCmsCurrentPassword] = useState('');
  const [cmsNewPassword, setCmsNewPassword] = useState('');
  const [cmsConfirmPassword, setCmsConfirmPassword] = useState('');
  const [cmsShowPasswords, setCmsShowPasswords] = useState(false);
  const [cmsPassLoading, setCmsPassLoading] = useState(false);
  const [cmsPassSuccess, setCmsPassSuccess] = useState(null);
  const [cmsPassError, setCmsPassError] = useState(null);

  const handleChangeCmsPassword = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setCmsPassError(null);
    setCmsPassSuccess(null);

    const cur = (cmsCurrentPassword || '').trim();
    const next = (cmsNewPassword || '').trim();
    const conf = (cmsConfirmPassword || '').trim();

    if (!cur) {
      setCmsPassError('Please enter your current manager password.');
      return;
    }
    if (!next) {
      setCmsPassError('Please enter a new manager password.');
      return;
    }
    if (next.length < 8) {
      setCmsPassError('New password must be at least 8 characters long.');
      return;
    }
    if (next !== conf) {
      setCmsPassError('New password and confirmation do not match.');
      return;
    }

    try {
      setCmsPassLoading(true);
      const res = await api.changeCmsPassword({
        current_password: cur,
        new_password: next,
        confirm_password: conf,
      });
      setCmsPassSuccess(res.message || 'Manager password changed successfully!');
      setCmsCurrentPassword('');
      setCmsNewPassword('');
      setCmsConfirmPassword('');
      if (res.cms_user && onUpdateCmsUser) {
        onUpdateCmsUser(res.cms_user);
      }
      setStatusBanner('🔐 Manager password changed successfully!');
    } catch (err) {
      setCmsPassError(err.message || 'Failed to update manager password.');
    } finally {
      setCmsPassLoading(false);
    }
  };

  const handleSearchResetPlayer = async (q) => {
    setResetSearchQuery(q);
    if (!q.trim()) {
      setResetSearchResults([]);
      return;
    }
    setResetSearchLoading(true);
    try {
      const res = await api.lookupPlayerUsername(q.trim(), activeCategoryKey);
      setResetSearchResults(res || []);
    } catch {
      setResetSearchResults([]);
    } finally {
      setResetSearchLoading(false);
    }
  };

  const handleAdminRegisterPlayer = async (e) => {
    e.preventDefault();
    if (!regPlayerName.trim()) {
      setRegError('Please provide player full name.');
      return;
    }
    const cleanJersey = String(regPlayerJersey || '').trim().replace(/^#/, '');
    if (!cleanJersey) {
      setRegError('Player jersey number is mandatory for registration.');
      return;
    }
    const jNum = parseInt(cleanJersey, 10);
    if (isNaN(jNum) || jNum <= 0) {
      setRegError('Please enter a valid positive jersey number (e.g. 10).');
      return;
    }

    let targetTeamId = regPlayerTeamId;
    if (!targetTeamId || targetTeamId === '__auto__') {
      const teams = (cat?.teams || []).filter((t) => t.id);
      if (!teams.length) {
        setRegError('Please create at least one team first.');
        return;
      }
      const sorted = [...teams].sort((a, b) => (a.players?.length || 0) - (b.players?.length || 0));
      targetTeamId = sorted[0].id;
    }
    setRegLoading(true);
    setRegError(null);
    setRegSuccess(null);
    try {
      const res = await api.registerPlayerAdmin({
        category_key: activeCategoryKey,
        team_id: targetTeamId,
        name: regPlayerName.trim(),
        username: regPlayerUsername.trim(),
        position: regPlayerPosition,
        jersey_number: jNum,
      });
      setRegSuccess(res);
      setRegPlayerName('');
      setRegPlayerUsername('');
      setRegPlayerJersey('');
      if (onAddPlayers && res.player) {
        const cleanPos = typeof res.player.position === 'string' ? res.player.position : (Array.isArray(res.player.position) ? res.player.position[0] : '');
        const cleanUname = typeof res.player.username === 'string' ? res.player.username : (Array.isArray(res.player.username) ? res.player.username[0] : '');
        onAddPlayers(
          targetTeamId,
          [res.player.name],
          cleanPos,
          cleanUname,
          '',
          activeCategoryKey,
          res.player.id || res.player.player_id,
          res.player.jersey_number || jNum
        );
      }
    } catch (err) {
      setRegError(err.message || 'Failed to register player.');
    } finally {
      setRegLoading(false);
    }
  };

  const handleExecuteQuickTransfer = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!quickTransferSourceTeam || !quickTransferTargetTeam || !quickTransferPlayerId) {
      alert('Please select a source team, a player to transfer, and a destination team.');
      return;
    }
    if (quickTransferSourceTeam === quickTransferTargetTeam) {
      alert('Source and destination teams cannot be the same.');
      return;
    }
    if (onMovePlayer) {
      onMovePlayer(quickTransferSourceTeam, quickTransferTargetTeam, quickTransferPlayerId, activeCategoryKey);
      setStatusBanner('⇄ Player transferred successfully between teams!');
      setQuickTransferPlayerId('');
    }
  };

  const handleAdminResetPassword = async (e, directUsername = null) => {
    if (e && e.preventDefault) e.preventDefault();
    const uname = (directUsername || resetUsername || '').trim();
    if (!uname) {
      setResetError('Please enter a player username, ID, or jersey number.');
      return;
    }
    setResetLoading(true);
    setResetError(null);
    setResetSuccess(null);
    try {
      const res = await api.resetPlayerPasswordAdmin(uname, activeCategoryKey);
      setResetSuccess(res);
      setResetUsername(res.username || uname);
    } catch (err) {
      setResetError(err.message || 'Failed to reset password.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleTogglePlayerStatusAction = async (teamId, player) => {
    const isCurrentlyActive = player.isActive !== false && player.is_active !== false;
    const nextStatus = !isCurrentlyActive;
    const actionLabel = nextStatus ? 'enable' : 'disable';
    if (!window.confirm(`Are you sure you want to ${actionLabel} the account for ${player.name} (@${player.username || player.id})?`)) {
      return;
    }
    try {
      await api.togglePlayerStatus({
        player_id: player.id,
        username: player.username,
        is_active: nextStatus,
        team_id: teamId,
        category_key: activeCategoryKey,
      });
      if (onTogglePlayerStatus) {
        onTogglePlayerStatus(teamId, player.id, nextStatus);
      }
      setStatusBanner(`Player account for ${player.name} has been ${nextStatus ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      alert(err.message || 'Failed to update player account status.');
    }
  };

  const handleReleasePlayerJerseyAction = async (teamId, player) => {
    const curNum = player.jerseyNumber ?? player.jersey_number;
    if (curNum == null) return;
    if (!window.confirm(`Release jersey #${curNum} from ${player.name}? This number will become available for any player.`)) {
      return;
    }
    try {
      await api.releasePlayerNumber({
        player_id: player.id,
        username: player.username,
        team_id: teamId,
        category_key: activeCategoryKey,
      });
      if (onReleasePlayerJersey) {
        onReleasePlayerJersey(teamId, player.id);
      }
      setStatusBanner(`Jersey #${curNum} successfully released from ${player.name}.`);
    } catch (err) {
      alert(err.message || 'Failed to release player jersey number.');
    }
  };

  const handleFileUploadToDataUrl = (file, callback) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (ev.target?.result) {
        callback(ev.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Carousel handlers
  const handleAddCarouselSlide = (e) => {
    e.preventDefault();
    if (!slideImage.trim()) {
      alert('Please upload an image file or provide an image URL for the carousel slide.');
      return;
    }
    const currentCarousel = homepageData?.carousel || [];
    const newSlide = {
      id: `slide-${Date.now()}`,
      title: slideTitle.trim() || 'RUIRU TITANS FC OFFICIAL GALLERY',
      subtitle: slideSubtitle.trim() || 'Pride of Ruiru Football Club',
      tag: slideTag.trim() || 'CLUB GALLERY',
      image: slideImage.trim(),
    };
    onUpdateHomepage({
      ...homepageData,
      carousel: [newSlide, ...currentCarousel],
    });
    setSlideTitle('');
    setSlideSubtitle('');
    setSlideImage('');
    setStatusBanner('📸 Carousel picture added to Homepage!');
  };

  const handleRemoveCarouselSlide = (slideId) => {
    const currentCarousel = homepageData?.carousel || [];
    onUpdateHomepage({
      ...homepageData,
      carousel: currentCarousel.filter((s) => s.id !== slideId),
    });
  };

  // Jersey photo handlers
  const handleAddJerseyPhoto = (e) => {
    e.preventDefault();
    if (!jerseyImage.trim()) {
      alert('Please upload a jersey photo file or enter an image URL.');
      return;
    }
    const currentJerseys = homepageData?.jerseys || {};
    const groupList = currentJerseys[selectedJerseyGroup] || [];
    const newPhoto = {
      id: `${selectedJerseyGroup}-${Date.now()}`,
      title: jerseyTitle.trim() || `${selectedJerseyGroup.toUpperCase()} Official Jersey`,
      subtitle: jerseySubtitle.trim() || '2026 Ruiru Titans Season Kit',
      badge: jerseyBadge.trim() || 'OFFICIAL KIT',
      image: jerseyImage.trim(),
    };
    onUpdateHomepage({
      ...homepageData,
      jerseys: {
        ...currentJerseys,
        [selectedJerseyGroup]: [...groupList, newPhoto],
      },
    });
    setJerseyTitle('');
    setJerseySubtitle('');
    setJerseyImage('');
    setStatusBanner(`👕 Added jersey photo to ${selectedJerseyGroup.toUpperCase()} row!`);
  };

  const handleRemoveJerseyPhoto = (groupKey, photoId) => {
    const currentJerseys = homepageData?.jerseys || {};
    const groupList = currentJerseys[groupKey] || [];
    onUpdateHomepage({
      ...homepageData,
      jerseys: {
        ...currentJerseys,
        [groupKey]: groupList.filter((p) => p.id !== photoId),
      },
    });
  };

  // Upcoming fixture handlers
  const handleAddUpcomingFixture = (e) => {
    e.preventDefault();
    if (!fixHome.trim() || !fixAway.trim()) {
      alert('Please enter both Home and Away team names.');
      return;
    }
    const currentFixtures = homepageData?.upcoming_fixtures || [];
    const newFix = {
      id: `CLB-FIX-${Date.now()}`,
      category: fixCategory,
      title: fixTitle.trim() || `${fixCategory.toUpperCase()} Fixture`,
      home: fixHome.trim(),
      away: fixAway.trim(),
      date: fixDate.trim() || 'Sat · 15:00',
      venue: fixVenue.trim() || 'Thoome Pri.',
    };
    onUpdateHomepage({
      ...homepageData,
      upcoming_fixtures: [newFix, ...currentFixtures],
    });
    setFixTitle('');
    setFixAway('');
    setFixDate('');
    setStatusBanner(`🗓️ Added upcoming ${fixCategory.toUpperCase()} fixture to Homepage right sidebar!`);
  };

  const handleRemoveUpcomingFixture = (fixId) => {
    const currentFixtures = homepageData?.upcoming_fixtures || [];
    onUpdateHomepage({
      ...homepageData,
      upcoming_fixtures: currentFixtures.filter((f) => f.id !== fixId),
    });
  };

  // Voting config handler
  const handleSaveVotingConfig = (e) => {
    e.preventDefault();
    if (onUpdateVotingConfig) {
      onUpdateVotingConfig({
        team_size: Math.max(1, Number(teamSize) || 6),
        max_picks_per_position: Math.max(1, Number(maxPicks) || 2),
        include_gk: Boolean(includeGk),
      });
      setStatusBanner(
        `⚙️ Voting settings saved: ${teamSize} players in TOTW/Season, max ${maxPicks} pick(s) per position, GK ${
          includeGk ? 'INCLUDED' : 'EXCLUDED'
        }!`
      );
    }
  };

  const toggleTeam = (tId) => {
    setOpenTeamIds((prev) => ({ ...prev, [tId]: !prev[tId] }));
  };

  const handleAddTeam = (e) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    onAddTeam(newTeamName.trim());
    setNewTeamName('');
  };

  const handleAddPlayer = (teamId) => {
    const raw = (newPlayerNames[teamId] || '').trim();
    if (!raw) return;
    const names = raw.split(',').map((s) => s.trim()).filter(Boolean);
    const pos = newPlayerPositions[teamId] || '';
    const customUname = (newPlayerUsernames[teamId] || '').trim();
    const customPass = (newPlayerPasswords[teamId] || '').trim();
    onAddPlayers(teamId, names, pos, customUname, customPass);
    setNewPlayerNames((prev) => ({ ...prev, [teamId]: '' }));
    setNewPlayerUsernames((prev) => ({ ...prev, [teamId]: '' }));
    setNewPlayerPasswords((prev) => ({ ...prev, [teamId]: '' }));
    setStatusBanner(`✅ Created ${names.length} player(s) with permanent system ID!`);
  };

  const addDirectPlayerRow = () => {
    setDirectPlayerRows((prev) => [
      ...prev,
      { name: '', position: 'CM', jerseyNumber: `${prev.length + 1}` },
    ]);
  };

  const updateDirectPlayerRow = (index, field, value) => {
    setDirectPlayerRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const removeDirectPlayerRow = (index) => {
    setDirectPlayerRows((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleTransferPlayer = (fromTeamId, player) => {
    setSelectedTransfers((prev) => {
      const exists = prev.some((x) => x.fromTeamId === fromTeamId && x.playerId === player.id);
      if (exists) {
        return prev.filter((x) => !(x.fromTeamId === fromTeamId && x.playerId === player.id));
      } else {
        return [
          ...prev,
          {
            fromTeamId,
            playerId: player.id,
            playerName: player.name,
            position: player.position || '',
            jerseyNumber: player.jerseyNumber,
          },
        ];
      }
    });
  };

  const handleConfirmCreateLeagueTeam = (e) => {
    e?.preventDefault();
    const cleanName = newTeamTitle.trim();
    if (!cleanName) {
      alert('Please enter a team name');
      return;
    }

    // Direct players
    const initialPlayers = directPlayerRows
      .filter((r) => r.name && r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        position: r.position || '',
        jerseyNumber: r.jerseyNumber ? parseInt(r.jerseyNumber, 10) : null,
      }));

    if (directPasteNames.trim()) {
      const parts = directPasteNames.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
      parts.forEach((pStr) => {
        let pos = '';
        let clean = pStr;
        const m = pStr.match(/^(.*?)\s*\((GK|LB|CB|RB|CDM|CM|LW|RW|ST|DEF|MID|FWD)\)$/i);
        if (m) {
          clean = m[1].trim();
          pos = m[2].toUpperCase();
        }
        initialPlayers.push({ name: clean, position: pos, jerseyNumber: null });
      });
    }

    const payload = {
      teamName: cleanName,
      teamCode: (newTeamCodeInput || cleanName.slice(0, 3)).trim().toUpperCase().replace(/[^A-Z0-9]/g, ''),
      teamColor: newTeamColorInput,
      initialPlayers,
      transferredPlayerIds: selectedTransfers.map((t) => ({ fromTeamId: t.fromTeamId, playerId: t.playerId })),
      autoBalanceCount: enableIntelligentPull ? parseInt(intelligentPullCount, 10) : 0,
      generateFixtures: autoGenFixtures,
      fixtureFormat: fixtureFormatChoice,
      targetCategoryKey: activeCategoryKey,
    };

    let summary = null;
    if (onCreateLeagueTeam) {
      summary = onCreateLeagueTeam(payload);
    } else if (onAddTeam) {
      onAddTeam(cleanName);
    }

    setShowAddTeamModal(false);
    const totalSquad = initialPlayers.length + selectedTransfers.length + (enableIntelligentPull ? parseInt(intelligentPullCount, 10) : 0);
    setTeamCreationMsg({
      name: cleanName,
      code: payload.teamCode,
      playersCount: totalSquad,
      fixturesCount: summary?.fixtureCount || (cat?.teams?.length ? cat.teams.length * (fixtureFormatChoice === 'double' ? 2 : 1) : 0),
    });
    setStatusBanner(`✅ Team "${cleanName}" (${payload.teamCode}) created and added to the league!`);

    // Reset inputs
    setNewTeamTitle('');
    setNewTeamCodeInput('');
    setDirectPlayerRows([
      { name: '', position: 'GK', jerseyNumber: '1' },
      { name: '', position: 'CB', jerseyNumber: '4' },
      { name: '', position: 'LB', jerseyNumber: '3' },
      { name: '', position: 'RB', jerseyNumber: '2' },
      { name: '', position: 'CDM', jerseyNumber: '6' },
      { name: '', position: 'CM', jerseyNumber: '8' },
      { name: '', position: 'RW', jerseyNumber: '7' },
      { name: '', position: 'LW', jerseyNumber: '11' },
      { name: '', position: 'ST', jerseyNumber: '9' },
    ]);
    setSelectedTransfers([]);
    setDirectPasteNames('');
    setEnableIntelligentPull(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Admin Section Switcher */}
      <div
        style={{
          background: '#121212',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '10px',
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setAdminSection('players')}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '8px',
            border: 'none',
            background: adminSection === 'players' ? '#FF9500' : '#1C1C1E',
            color: adminSection === 'players' ? '#16201B' : '#EBEBF5',
            fontWeight: 800,
            fontSize: '12.5px',
            cursor: 'pointer',
          }}
        >
          📝 Player Registration &amp; 4-Digit Code
        </button>
        <button
          type="button"
          onClick={() => setAdminSection('balancer')}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '8px',
            border: 'none',
            background: adminSection === 'balancer' ? '#FF9500' : '#1C1C1E',
            color: adminSection === 'balancer' ? '#16201B' : '#EBEBF5',
            fontWeight: 800,
            fontSize: '12.5px',
            cursor: 'pointer',
          }}
        >
          ⚖️ Team Balancer (Excel / CSV / Google Sheet)
        </button>
        <button
          type="button"
          onClick={() => setAdminSection('homepage')}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '8px',
            border: 'none',
            background: adminSection === 'homepage' ? '#FF9500' : '#1C1C1E',
            color: adminSection === 'homepage' ? '#16201B' : '#EBEBF5',
            fontWeight: 800,
            fontSize: '12.5px',
            cursor: 'pointer',
          }}
        >
          🖼️ Homepage Carousel, Jerseys &amp; Fixtures
        </button>
        <button
          type="button"
          onClick={() => setAdminSection('voting')}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '8px',
            border: 'none',
            background: adminSection === 'voting' ? '#FF9500' : '#1C1C1E',
            color: adminSection === 'voting' ? '#16201B' : '#EBEBF5',
            fontWeight: 800,
            fontSize: '12.5px',
            cursor: 'pointer',
          }}
        >
          ⭐ Weekly Voting Toggle &amp; TOTW Settings
        </button>
        <button
          type="button"
          onClick={() => setAdminSection('teams')}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '8px',
            border: 'none',
            background: adminSection === 'teams' ? '#FF9500' : '#1C1C1E',
            color: adminSection === 'teams' ? '#16201B' : '#EBEBF5',
            fontWeight: 800,
            fontSize: '12.5px',
            cursor: 'pointer',
          }}
        >
          ⚽ Championship Teams, Squad Rosters &amp; Referees
        </button>
        <button
          type="button"
          onClick={() => setAdminSection('security')}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: '8px',
            border: 'none',
            background: adminSection === 'security' ? '#FF9500' : '#1C1C1E',
            color: adminSection === 'security' ? '#16201B' : '#EBEBF5',
            fontWeight: 800,
            fontSize: '12.5px',
            cursor: 'pointer',
          }}
        >
          🔐 Manager Password &amp; Security
        </button>
      </div>

      {statusBanner && (
        <div
          style={{
            background: '#123D2E',
            border: '1px solid #2F7D5C',
            color: '#6CE5A0',
            padding: '12px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 700,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{statusBanner}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            style={{ background: 'none', border: 'none', color: '#6CE5A0', cursor: 'pointer', fontWeight: 800 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ALWAYS-ACCESSIBLE REFEREES FORM (ANY COMPETITION) & SOFT-DELETE / RESTORE BAR */}
      <div
        style={{
          background: '#121212',
          border: '1px solid #2A5A46',
          borderRadius: '12px',
          padding: '16px 18px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Left Column: Referees Form for Any Competition */}
        <div
          style={{
            background: '#121212',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#FF9500', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                🧑‍⚖️ Referees Form &amp; Randomizer (Any Competition)
              </div>
              <div style={{ fontSize: '11px', color: '#8E8E93' }}>
                Add referees for any League/Cup/Tournament and randomize across unplayed fixtures.
              </div>
            </div>
            <select
              className="form-input"
              value={categories[refTargetCategoryKey] ? refTargetCategoryKey : activeCategoryKey}
              onChange={(e) => setRefTargetCategoryKey(e.target.value)}
              style={{ fontWeight: 700, fontSize: '12px', padding: '5px 10px', minWidth: '170px' }}
            >
              {Object.entries(categories).map(([k, c]) => (
                <option key={k} value={k}>
                  {c.mode === 'cup' ? '🏆 Cup: ' : '📊 League: '}
                  {c.label} ({(c.referees || []).length} refs)
                </option>
              ))}
            </select>
          </div>

          {(() => {
            const targetKey = categories[refTargetCategoryKey] ? refTargetCategoryKey : activeCategoryKey;
            const targetCat = categories[targetKey] || cat;
            const targetRefs = targetCat?.referees || [];
            return (
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newRefName.trim() || !onAddReferee) return;
                    onAddReferee(newRefName.trim(), targetKey);
                    setNewRefName('');
                    setStatusBanner(
                      `🧑‍⚖️ Added referee(s) to "${targetCat?.label}" and randomized unplayed fixture assignments!`
                    );
                  }}
                  style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
                >
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter referee name(s) — e.g. Ref Kamau, Ref Otieno"
                    value={newRefName}
                    onChange={(e) => setNewRefName(e.target.value)}
                    style={{ flex: '1 1 200px', fontSize: '12.5px' }}
                  />
                  <button
                    type="submit"
                    className="stat-btn"
                    style={{ background: '#FF9500', color: '#16201B', fontWeight: 800, padding: '8px 14px' }}
                  >
                    + Add Referee(s)
                  </button>
                  {onRandomizeReferees && (
                    <button
                      type="button"
                      className="stat-btn"
                      disabled={targetRefs.length === 0}
                      onClick={() => {
                        const count = onRandomizeReferees(targetKey);
                        setStatusBanner(
                          `🎲 Randomized ${targetRefs.length} referee(s) across ${count ?? 'all'} unplayed fixture(s) in "${targetCat?.label}"!`
                        );
                      }}
                      style={{
                        background: '#1C1C1E',
                        color: '#6CE5A0',
                        border: '1px solid #2F7D5C',
                        fontWeight: 800,
                        padding: '8px 12px',
                      }}
                    >
                      🎲 Randomize Unplayed
                    </button>
                  )}
                </form>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {targetRefs.length === 0 ? (
                    <span style={{ fontSize: '11px', color: '#8E8E93' }}>
                      No referees added to &ldquo;{targetCat?.label}&rdquo; yet.
                    </span>
                  ) : (
                    targetRefs.map((r, idx) => (
                      <span
                        key={`${r}-${idx}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: '#133529',
                          border: '1px solid #2A5A46',
                          borderRadius: '999px',
                          padding: '3px 10px',
                          fontSize: '11.5px',
                          color: '#FFFFFF',
                          fontWeight: 600,
                        }}
                      >
                        🧑‍⚖️ {r}
                        <span
                          onClick={() => onRemoveReferee && onRemoveReferee(r, targetKey)}
                          style={{ cursor: 'pointer', color: '#FF7A70', fontWeight: 800 }}
                          title={`Remove ${r}`}
                        >
                          ✕
                        </span>
                      </span>
                    ))
                  )}
                </div>
              </>
            );
          })()}
        </div>

        {/* Right Column: Soft Delete & Trash / Archive Restore */}
        <div
          style={{
            background: '#121212',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                🗑️ Soft Delete &amp; Archived Competitions ({Object.keys(deletedCategories || {}).length})
              </div>
              <div style={{ fontSize: '11px', color: '#8E8E93' }}>
                Soft-deleting hides a League, Cup, or Tournament while preserving all teams, fixtures &amp; votes so you can restore it anytime.
              </div>
            </div>

            {!confirmDelete ? (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                style={{
                  background: 'rgba(226, 74, 59, 0.16)',
                  color: '#FF9990',
                  border: '1px solid #E24A3B',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '11.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                🗑️ Soft Delete &ldquo;{cat?.label}&rdquo;
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11.5px', color: '#FF9990', fontWeight: 700 }}>
                  Archive &ldquo;{cat?.label}&rdquo;?
                </span>
                <button
                  type="button"
                  className="stat-btn"
                  style={{ background: '#E24A3B', color: '#FFF', padding: '5px 10px', fontSize: '11.5px' }}
                  onClick={() => {
                    onDeleteCategory(activeCategoryKey);
                    setConfirmDelete(false);
                    setStatusBanner(`🗑️ Soft-deleted "${cat?.label}". You can restore it anytime from Archived Competitions.`);
                  }}
                >
                  Yes, Soft Delete
                </button>
                <button
                  type="button"
                  className="stat-btn"
                  style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#FFF', padding: '5px 10px', fontSize: '11.5px' }}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {Object.keys(deletedCategories || {}).length === 0 ? (
            <div style={{ fontSize: '11.5px', color: '#8E8E93', padding: '6px 0' }}>
              ✓ No soft-deleted competitions in the archive.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' }}>
              {Object.entries(deletedCategories).map(([delKey, delCat]) => (
                <div
                  key={delKey}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#121212',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '7px 10px',
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#FFFFFF' }}>
                      {delCat.mode === 'cup' ? '🏆 ' : '📊 '}
                      {delCat.label || delKey}
                    </span>
                    <span style={{ fontSize: '11px', color: '#8E8E93', marginLeft: '6px' }}>
                      ({(delCat.teams || []).length} teams)
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {onRestoreCategory && (
                      <button
                        type="button"
                        onClick={() => {
                          onRestoreCategory(delKey);
                          setStatusBanner(`♻️ Restored competition "${delCat.label || delKey}"!`);
                        }}
                        style={{
                          background: '#2E8B57',
                          color: '#FFFFFF',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        ♻️ Restore
                      </button>
                    )}
                    {onPermanentDeleteCategory && (
                      <button
                        type="button"
                        onClick={() => {
                          onPermanentDeleteCategory(delKey);
                          setStatusBanner(`✕ Permanently removed "${delCat.label || delKey}" from archive.`);
                        }}
                        style={{
                          background: 'rgba(226, 74, 59, 0.2)',
                          color: '#FF7A70',
                          border: '1px solid #B23A2E',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        title="Permanently delete"
                      >
                        ✕ Delete Forever
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 0: TEAM BALANCER (EXCEL / CSV / TABLE / GOOGLE SHEET) */}
      {adminSection === 'balancer' && (
        <TeamBalancerView
          categories={categories}
          activeCategoryKey={activeCategoryKey}
          activeCategoryLabel={cat?.label || 'Open League'}
          onApplyBalancedTeamsToCategory={onApplyBalancedTeamsToCategory}
          onCreateCategoryWithBalancedTeams={onCreateCategoryWithBalancedTeams}
          onNavigateToCompetitionView={onNavigateToCompetitionView}
        />
      )}

      {/* SECTION 1: HOMEPAGE CAROUSEL, JERSEY PHOTOS & UPCOMING FIXTURES */}
      {adminSection === 'homepage' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 1A. Carousel Pictures Upload */}
          <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '18px' }}>
            <div className="scoreboard" style={{ color: '#FF9500', fontSize: '22px', marginBottom: '4px' }}>
              📸 HOMEPAGE CAROUSEL PICTURES UPLOAD
            </div>
            <p style={{ fontSize: '12px', color: '#8E8E93', margin: '0 0 14px' }}>
              Upload pictures from your device or paste an image URL to display in the main Homepage hero carousel.
            </p>

            <form
              onSubmit={handleAddCarouselSlide}
              style={{
                background: '#121212',
                border: '1px solid #1C1C1E',
                borderRadius: '10px',
                padding: '14px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '10px',
                marginBottom: '16px',
              }}
            >
              <div>
                <label style={{ fontSize: '11px', color: '#8E8E93', display: 'block', marginBottom: '4px' }}>
                  Slide Headline / Title
                </label>
                <input
                  className="form-input"
                  placeholder="e.g. RUIRU TITANS DERBY DAY"
                  value={slideTitle}
                  onChange={(e) => setSlideTitle(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#8E8E93', display: 'block', marginBottom: '4px' }}>
                  Subtitle / Caption
                </label>
                <input
                  className="form-input"
                  placeholder="e.g. Matchday highlights at Ruiru Stadium"
                  value={slideSubtitle}
                  onChange={(e) => setSlideSubtitle(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#8E8E93', display: 'block', marginBottom: '4px' }}>
                  Badge Tag
                </label>
                <input
                  className="form-input"
                  placeholder="e.g. CLUB GALLERY"
                  value={slideTag}
                  onChange={(e) => setSlideTag(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#FF9500', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                  Upload Picture File (JPG/PNG/SVG/WebP)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUploadToDataUrl(e.target.files?.[0], setSlideImage)}
                  style={{ fontSize: '11.5px', color: '#EBEBF5', width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#8E8E93', display: 'block', marginBottom: '4px' }}>
                  Or Paste Image URL
                </label>
                <input
                  className="form-input"
                  placeholder="https://... or data:image/..."
                  value={slideImage}
                  onChange={(e) => setSlideImage(e.target.value)}
                />
              </div>

              {slideImage && (
                <div style={{ gridColumn: '1 / -1', background: '#051611', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img
                    src={slideImage}
                    alt="Preview"
                    style={{ width: '120px', height: '70px', objectFit: 'contain', background: '#121212', borderRadius: '6px' }}
                  />
                  <div style={{ fontSize: '11.5px', color: '#6CE5A0' }}>
                    ✓ Image bounded and ready to add ({slideTitle || 'Slide'})
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  type="submit"
                  className="stat-btn"
                  style={{
                    width: '100%',
                    background: '#FF9500',
                    color: '#16201B',
                    fontWeight: 800,
                    padding: '10px 14px',
                  }}
                >
                  + Add Picture to Carousel
                </button>
              </div>
            </form>

            {/* Current Carousel Slides List */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
              {(homepageData?.carousel || []).map((slide) => (
                <div
                  key={slide.id}
                  style={{
                    background: '#121212',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '10px',
                    overflow: 'hidden',
                  }}
                >
                  <img
                    src={slide.image}
                    alt={slide.title}
                    style={{ width: '100%', height: '110px', objectFit: 'cover', display: 'block' }}
                  />
                  <div style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {slide.title}
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#8E8E93' }}>{slide.tag}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCarouselSlide(slide.id)}
                      style={{
                        background: 'rgba(226, 74, 59, 0.2)',
                        color: '#FF7A70',
                        border: '1px solid #B23A2E',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 1B. Jersey Photos Upload (U13, U15, U17, Wazae) */}
          <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '18px' }}>
            <div className="scoreboard" style={{ color: '#FF9500', fontSize: '22px', marginBottom: '4px' }}>
              👕 JERSEY PHOTOS MANAGER (U13 • U15 • U17 • WAZAE)
            </div>
            <p style={{ fontSize: '12px', color: '#8E8E93', margin: '0 0 14px' }}>
              Upload jersey photos for each squad row on the Homepage: U13, U15, U17, and Wazae.
            </p>

            {/* Squad Row Selector */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
              {JERSEY_GROUPS.map((grp) => (
                <button
                  key={grp.key}
                  type="button"
                  onClick={() => setSelectedJerseyGroup(grp.key)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: selectedJerseyGroup === grp.key ? '1px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: selectedJerseyGroup === grp.key ? '#FF9500' : '#1C1C1E',
                    color: selectedJerseyGroup === grp.key ? '#16201B' : '#FFFFFF',
                    fontWeight: 800,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  👕 {grp.label} ({(homepageData?.jerseys?.[grp.key] || []).length})
                </button>
              ))}
            </div>

            <form
              onSubmit={handleAddJerseyPhoto}
              style={{
                background: '#121212',
                border: '1px solid #1C1C1E',
                borderRadius: '10px',
                padding: '14px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '10px',
                marginBottom: '16px',
              }}
            >
              <div>
                <label style={{ fontSize: '11px', color: '#8E8E93', display: 'block', marginBottom: '4px' }}>
                  Jersey Title ({selectedJerseyGroup.toUpperCase()})
                </label>
                <input
                  className="form-input"
                  placeholder={`e.g. ${selectedJerseyGroup.toUpperCase()} Home Jersey 2026`}
                  value={jerseyTitle}
                  onChange={(e) => setJerseyTitle(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#8E8E93', display: 'block', marginBottom: '4px' }}>
                  Kit Description / Subtitle
                </label>
                <input
                  className="form-input"
                  placeholder="e.g. Emerald Green & Titans Gold"
                  value={jerseySubtitle}
                  onChange={(e) => setJerseySubtitle(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#8E8E93', display: 'block', marginBottom: '4px' }}>
                  Kit Type Badge
                </label>
                <input
                  className="form-input"
                  placeholder="e.g. HOME KIT / AWAY KIT"
                  value={jerseyBadge}
                  onChange={(e) => setJerseyBadge(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#FF9500', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                  Upload Jersey Photo File
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUploadToDataUrl(e.target.files?.[0], setJerseyImage)}
                  style={{ fontSize: '11.5px', color: '#EBEBF5', width: '100%' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#8E8E93', display: 'block', marginBottom: '4px' }}>
                  Or Paste Jersey Image URL
                </label>
                <input
                  className="form-input"
                  placeholder="https://... or data:image/..."
                  value={jerseyImage}
                  onChange={(e) => setJerseyImage(e.target.value)}
                />
              </div>

              {jerseyImage && (
                <div style={{ gridColumn: '1 / -1', background: '#051611', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img
                    src={jerseyImage}
                    alt="Jersey Preview"
                    style={{ width: '80px', height: '80px', objectFit: 'contain', background: '#121212', borderRadius: '6px' }}
                  />
                  <div style={{ fontSize: '11.5px', color: '#6CE5A0' }}>
                    ✓ Jersey image bounded and ready to add ({jerseyTitle || 'Jersey'})
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  type="submit"
                  className="stat-btn"
                  style={{
                    width: '100%',
                    background: '#FF9500',
                    color: '#16201B',
                    fontWeight: 800,
                    padding: '10px 14px',
                  }}
                >
                  + Add to {selectedJerseyGroup.toUpperCase()} Row
                </button>
              </div>
            </form>

            {/* Current Group Jersey Photos */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
              {(homepageData?.jerseys?.[selectedJerseyGroup] || []).map((photo) => (
                <div
                  key={photo.id}
                  style={{
                    background: '#121212',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '10px',
                    overflow: 'hidden',
                  }}
                >
                  <img
                    src={photo.image}
                    alt={photo.title}
                    style={{ width: '100%', height: '140px', objectFit: 'contain', background: '#051611', display: 'block' }}
                  />
                  <div style={{ padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {photo.title}
                      </div>
                      <div style={{ fontSize: '10px', color: '#FF9500' }}>{photo.badge}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveJerseyPhoto(selectedJerseyGroup, photo.id)}
                      style={{
                        background: 'rgba(226, 74, 59, 0.2)',
                        color: '#FF7A70',
                        border: '1px solid #B23A2E',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 1C. Right Sidebar Upcoming Fixtures Manager */}
          <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '18px' }}>
            <div className="scoreboard" style={{ color: '#FF9500', fontSize: '22px', marginBottom: '4px' }}>
              🗓️ HOMEPAGE RIGHT SIDEBAR UPCOMING FIXTURES
            </div>
            <p style={{ fontSize: '12px', color: '#8E8E93', margin: '0 0 14px' }}>
              Schedule upcoming fixtures across categories (Internal, Friendly, Tournament, League, Cup) for quick viewing in the Homepage right sidebar.
            </p>

            <form
              onSubmit={handleAddUpcomingFixture}
              style={{
                background: '#121212',
                border: '1px solid #1C1C1E',
                borderRadius: '10px',
                padding: '14px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '10px',
                marginBottom: '16px',
              }}
            >
              <div>
                <label style={{ fontSize: '11px', color: '#FF9500', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                  Fixture Category
                </label>
                <select
                  value={fixCategory}
                  onChange={(e) => setFixCategory(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#121212',
                    color: '#FFFFFF',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    fontSize: '12px',
                    fontWeight: 700,
                  }}
                >
                  {FIXTURE_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#8E8E93', display: 'block', marginBottom: '4px' }}>
                  Match Title / Competition
                </label>
                <input
                  className="form-input"
                  placeholder="e.g. Pre-Season Friendly"
                  value={fixTitle}
                  onChange={(e) => setFixTitle(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#8E8E93', display: 'block', marginBottom: '4px' }}>
                  Home Team
                </label>
                <input
                  className="form-input"
                  placeholder="e.g. Ruiru Titans FC"
                  value={fixHome}
                  onChange={(e) => setFixHome(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#8E8E93', display: 'block', marginBottom: '4px' }}>
                  Away Team
                </label>
                <input
                  className="form-input"
                  placeholder="e.g. Thika United"
                  value={fixAway}
                  onChange={(e) => setFixAway(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#8E8E93', display: 'block', marginBottom: '4px' }}>
                  Date &amp; Kickoff Time
                </label>
                <input
                  className="form-input"
                  placeholder="e.g. Sat, Oct 24 · 15:00"
                  value={fixDate}
                  onChange={(e) => setFixDate(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#8E8E93', display: 'block', marginBottom: '4px' }}>
                  Venue
                </label>
                <input
                  className="form-input"
                  placeholder="e.g. Thoome Pri."
                  value={fixVenue}
                  onChange={(e) => setFixVenue(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  type="submit"
                  className="stat-btn"
                  style={{
                    width: '100%',
                    background: '#FF9500',
                    color: '#16201B',
                    fontWeight: 800,
                    padding: '10px 14px',
                  }}
                >
                  + Add Sidebar Fixture
                </button>
              </div>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(homepageData?.upcoming_fixtures || []).map((f) => (
                <div
                  key={f.id}
                  style={{
                    background: '#121212',
                    border: '1px solid #1C1C1E',
                    borderRadius: '8px',
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: 'rgba(255, 149, 0,0.16)',
                        color: '#FF9500',
                      }}
                    >
                      {f.category}
                    </span>
                    <strong style={{ color: '#FFFFFF', fontSize: '13px' }}>
                      {f.home} vs {f.away}
                    </strong>
                    <span style={{ color: '#8E8E93', fontSize: '12px' }}>
                      • {f.date} ({f.venue})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveUpcomingFixture(f.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#FF7A70',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    ✕ Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: VOTING SETTINGS (WINDOW TOGGLE, NUMBER OF PLAYERS & GOALKEEPER TOGGLE) */}
      {adminSection === 'voting' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Master Toggle Card for Voting Window (ON / OFF) */}
          <div
            style={{
              background: '#121212',
              border: votingRoundData?.is_open ? '2px solid #3F7A4E' : '2px solid #B23A2E',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px' }}>{votingRoundData?.is_open ? '🟢' : '🔴'}</span>
                  <div className="scoreboard" style={{ color: '#FF9500', fontSize: '22px' }}>
                    WEEKLY VOTING WINDOW STATUS ({cat?.label || 'COMPETITION'})
                  </div>
                </div>
                <p style={{ fontSize: '13px', color: '#8E8E93', margin: '4px 0 0' }}>
                  Toggle player voting for the week ON or OFF. When OFF, voting is disabled and players cannot vote or submit ballots.
                </p>
              </div>

              {/* Status Badge */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '999px',
                  fontSize: '13px',
                  fontWeight: 900,
                  letterSpacing: '0.04em',
                  background: votingRoundData?.is_open ? 'rgba(63, 122, 78, 0.35)' : 'rgba(178, 58, 46, 0.3)',
                  color: votingRoundData?.is_open ? '#6CE5A0' : '#FF8080',
                  border: votingRoundData?.is_open ? '1px solid #3F7A4E' : '1px solid #B23A2E',
                }}
              >
                <span>{votingRoundData?.is_open ? '● VOTING IS ON (PLAYERS CAN VOTE)' : '🔒 VOTING IS OFF (VOTING DISABLED)'}</span>
              </div>
            </div>

            {/* Current Round Details and Actions */}
            <div
              style={{
                background: '#121212',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#FF9500', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Active Competition Round
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', margin: '2px 0' }}>
                  {votingRoundData?.title || 'Week 1'}
                </div>
                <div style={{ fontSize: '12.5px', color: '#8E8E93' }}>
                  {votingRoundData?.is_open
                    ? '✅ Voting is open! Registered players in this competition can select candidates and cast ballots.'
                    : '⛔ Voting is turned OFF. Player ballot submission is completely blocked and disabled.'}
                </div>
              </div>

              {/* Toggle Buttons */}
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {votingRoundData?.is_open ? (
                  <button
                    type="button"
                    disabled={votingToggleLoading}
                    onClick={() => handleToggleVotingWindow(false)}
                    style={{
                      background: '#B23A2E',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '12px 22px',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(178,58,46,0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span>🔒</span>
                    <span>{votingToggleLoading ? 'Updating…' : 'Turn Voting OFF (Disable Voting)'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={votingToggleLoading}
                    onClick={() => handleToggleVotingWindow(true)}
                    style={{
                      background: '#3F7A4E',
                      color: '#FFF',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '12px 22px',
                      fontSize: '13px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(63,122,78,0.3)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span>🔓</span>
                    <span>{votingToggleLoading ? 'Updating…' : 'Turn Voting ON (Enable Player Voting)'}</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={votingToggleLoading}
                  onClick={handleCreateNewVotingRound}
                  style={{
                    background: '#1C1C1E',
                    color: '#FF9500',
                    border: '1px solid #FF9500',
                    borderRadius: '8px',
                    padding: '12px 18px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>➕</span>
                  <span>Start Next Week Round</span>
                </button>
              </div>
            </div>
          </div>

          {/* Configuration Card: Team Size, Max Picks, Include GK */}
          <div style={{ background: '#121212', border: '1px solid #FF9500', borderRadius: '12px', padding: '20px' }}>
            <div className="scoreboard" style={{ color: '#FF9500', fontSize: '22px', marginBottom: '6px' }}>
              ⚙️ ADMIN VOTING CONFIGURATION — TOTW &amp; TEAM OF THE SEASON (TOTT)
            </div>
            <p style={{ fontSize: '12.5px', color: '#8E8E93', margin: '0 0 18px' }}>
              Configure how many players are voted for and displayed in the Team of the Week (TOTW) and Team of the Season (TOTT), and toggle whether the Goalkeeper (GK) position is included. When GK is toggled OFF, GK is excluded from the voting ballot, TOTW, and TOTT.
            </p>

            <form
              onSubmit={handleSaveVotingConfig}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '16px',
                alignItems: 'end',
              }}
            >
              <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', padding: '14px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#FFFFFF', display: 'block', marginBottom: '4px' }}>
                  Number of Players in TOTW &amp; Season Lineup
                </label>
                <div style={{ fontSize: '11px', color: '#8E8E93', marginBottom: '8px' }}>
                  Reflected directly in Team of the Week and Team of the Tournament/Season (e.g. 5, 6, 7, 11)
                </div>
                <input
                  type="number"
                  min={1}
                  max={22}
                  value={teamSize}
                  onChange={(e) => setTeamSize(e.target.value)}
                  className="form-input"
                  style={{ fontWeight: 800, fontSize: '15px', color: '#FF9500' }}
                />
              </div>

              <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', padding: '14px' }}>
                <label style={{ fontSize: '12.5px', fontWeight: 800, color: '#FFFFFF', display: 'block', marginBottom: '4px' }}>
                  Max Players Voted Per Outfield Position
                </label>
                <div style={{ fontSize: '11px', color: '#8E8E93', marginBottom: '8px' }}>
                  How many players a voter can pick per position on their ballot (1–5)
                </div>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={maxPicks}
                  onChange={(e) => setMaxPicks(e.target.value)}
                  className="form-input"
                  style={{ fontWeight: 800, fontSize: '15px', color: '#FF9500' }}
                />
              </div>

              <div
                style={{
                  background: '#121212',
                  border: includeGk ? '1px solid #3F7A4E' : '1px solid #B23A2E',
                  borderRadius: '10px',
                  padding: '14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#FFFFFF' }}>
                    🧤 Include Goalkeeper (GK)
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      background: includeGk ? 'rgba(63,122,78,0.25)' : 'rgba(178,58,46,0.25)',
                      color: includeGk ? '#6CE5A0' : '#FF8080',
                    }}
                  >
                    {includeGk ? 'INCLUDED' : 'EXCLUDED'}
                  </span>
                </div>
                <div style={{ fontSize: '11px', color: '#8E8E93', marginBottom: '10px' }}>
                  {includeGk
                    ? 'Goalkeeper is included in ballot voting, TOTW, and TOTT.'
                    : 'Goalkeeper is excluded from ballot voting, TOTW, and TOTT.'}
                </div>
                <button
                  type="button"
                  onClick={() => setIncludeGk(!includeGk)}
                  style={{
                    width: '100%',
                    background: includeGk ? '#B23A2E' : '#3F7A4E',
                    color: '#FFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {includeGk ? '🚫 Toggle OFF Goalkeeper (Exclude GK)' : '🧤 Toggle ON Goalkeeper (Include GK)'}
                </button>
              </div>

              <div>
                <button
                  type="submit"
                  className="stat-btn"
                  style={{
                    width: '100%',
                    background: '#FF9500',
                    color: '#16201B',
                    fontWeight: 800,
                    padding: '12px 18px',
                    fontSize: '13px',
                  }}
                >
                  💾 Apply &amp; Save Voting Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SECTION 3: CHAMPIONSHIP TEAMS, SQUAD POSITIONS & OFFICIALS */}
      {(adminSection === 'teams' || adminSection === 'players') && (
        <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div className="scoreboard" style={{ color: '#FF9500', fontSize: '20px' }}>
              CATEGORY SETTINGS &amp; TEAMS ({cat.label})
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setShowAddTeamModal(true)}
                style={{
                  background: '#1C1C1E',
                  color: '#6CE5A0',
                  border: '1px solid #2F7D5C',
                  borderRadius: '6px',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                ➕ Add League Team &amp; Fixtures
              </button>
              {onOpenEditCategory && (
                <button
                  type="button"
                  onClick={onOpenEditCategory}
                  style={{
                    background: '#FF9500',
                    color: '#16201B',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '7px 14px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  ✏️ Edit League Settings &amp; Start Date
                </button>
              )}
              {cat.mode !== 'cup' && onReorganizeUnplayedFixtures && (
                <button
                  type="button"
                  onClick={() => {
                    const count = onReorganizeUnplayedFixtures(activeCategoryKey);
                    setStatusBanner(`⚖️ Reorganized ${count ?? 'all'} unplayed fixture(s) in "${cat.label}"! Catch-up matches moved to the front so no team plays an extra game before newer teams.`);
                  }}
                  style={{
                    background: '#1F4D3C',
                    color: '#6CE5A0',
                    border: '1px solid #2F7D5C',
                    borderRadius: '6px',
                    padding: '7px 14px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  title="Reorganize unplayed fixtures so trailing or new teams play catch-up matches first without any team jumping ahead"
                >
                  ⚖️ Reorganize &amp; Balance Fixtures
                </button>
              )}
            </div>
          </div>

          {/* New Team Creation Success Banner */}
          {teamCreationMsg && (
            <div
              style={{
                background: 'rgba(108, 229, 160, 0.14)',
                border: '1px solid #3F7A4E',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontWeight: 800, color: '#6CE5A0', fontSize: '13px' }}>
                  🎉 New League Team Added Successfully: {teamCreationMsg.name} ({teamCreationMsg.code})
                </div>
                <div style={{ fontSize: '11.5px', color: '#EBEBF5', marginTop: '2px' }}>
                  Squad seeded with {teamCreationMsg.playersCount} player(s) · Generated {teamCreationMsg.fixturesCount || 'league'} match fixture(s) with automatic referee rotations. Standings, fixtures, and roster have been updated seamlessly!
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTeamCreationMsg(null)}
                style={{
                  background: '#1C1C1E',
                  color: '#8E8E93',
                  border: '1px solid #2F7D5C',
                  borderRadius: '6px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Dismiss ✕
              </button>
            </div>
          )}

          {/* PLAYER REGISTRATION & PASSWORD RESET PORTAL (4-DIGIT CODE ACTIVATION) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            {/* CARD 1: Admin Register New Player */}
            <div
              style={{
                background: '#121212',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#FF9500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  📝 Register New Player (4-Digit Activation Code)
                </div>
                <div style={{ fontSize: '11px', color: '#8E8E93', marginTop: '2px', lineHeight: 1.4 }}>
                  Registers a player and generates a 4-digit code. Hand the code to the player; upon first login, they are required to change password before accessing their dashboard.
                </div>
              </div>

              {regSuccess && (
                <div
                  style={{
                    background: 'rgba(108, 229, 160, 0.12)',
                    border: '1px solid #3F7A4E',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '12px',
                    color: '#FFFFFF',
                  }}
                >
                  <div style={{ fontWeight: 800, color: '#6CE5A0', marginBottom: '4px' }}>
                    ✅ Player Registered Successfully!
                  </div>
                  <div><strong>Player:</strong> {regSuccess.player?.name} (@{regSuccess.player?.username})</div>
                  <div><strong>Position:</strong> {regSuccess.player?.position} · <strong>Team:</strong> {regSuccess.player?.team_name || 'Assigned'}</div>
                  <div style={{ marginTop: '8px', padding: '8px', background: '#051913', borderRadius: '6px', border: '1px dashed #FF9500' }}>
                    <div style={{ fontSize: '11px', color: '#FF9500', fontWeight: 800, textTransform: 'uppercase' }}>
                      🔑 4-Digit Activation Code for Manager:
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: '#FFFFFF', letterSpacing: '4px', margin: '4px 0' }}>
                      {regSuccess.code}
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#8E8E93' }}>
                      Give this 4-digit code to {regSuccess.player?.name}. When they sign in with this code, they will be required to change their password to access their Player Dashboard.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(
                          `Ruiru Titans Player Login\nUsername: ${regSuccess.player?.username}\n4-Digit Activation Code: ${regSuccess.code}`
                        );
                        alert('Copied player credentials & activation code to clipboard!');
                      }}
                      style={{
                        background: '#1C1C1E',
                        color: '#6CE5A0',
                        border: '1px solid #2F7D5C',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      📋 Copy Info
                    </button>
                    <button
                      type="button"
                      onClick={() => setRegSuccess(null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#8E8E93',
                        fontSize: '11px',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {regError && (
                <div style={{ background: 'rgba(226, 74, 59, 0.15)', border: '1px solid #B23A2E', borderRadius: '6px', padding: '8px 10px', color: '#FF9990', fontSize: '11.5px' }}>
                  {regError}
                </div>
              )}

              <form onSubmit={handleAdminRegisterPlayer} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    Player Full Name *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Samuel Kibe"
                    value={regPlayerName}
                    onChange={(e) => setRegPlayerName(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                      Assign to Team *
                    </label>
                    <select
                      className="form-input"
                      value={regPlayerTeamId || '__auto__'}
                      onChange={(e) => setRegPlayerTeamId(e.target.value)}
                    >
                      <option value="__auto__">⚡ Intelligently Auto-Assign (Balance)</option>
                      {(cat?.teams || []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                      Position *
                    </label>
                    <select
                      className="form-input"
                      value={regPlayerPosition}
                      onChange={(e) => setRegPlayerPosition(e.target.value)}
                    >
                      {POSITIONS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                      Username (Optional)
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Auto if blank"
                      value={regPlayerUsername}
                      onChange={(e) => setRegPlayerUsername(e.target.value)}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: '#6CE5A0', fontWeight: 800, display: 'block', marginBottom: '2px' }}>
                      Squad / Jersey No. * (Mandatory)
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="e.g. 10 (Mandatory)"
                      value={regPlayerJersey}
                      onChange={(e) => setRegPlayerJersey(e.target.value)}
                      required
                      min="1"
                      max="999"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={regLoading}
                  className="stat-btn"
                  style={{
                    background: '#FF9500',
                    color: '#16201B',
                    fontWeight: 800,
                    padding: '9px 14px',
                    fontSize: '12px',
                    marginTop: '4px',
                  }}
                >
                  {regLoading ? 'Registering & Generating Code…' : '+ Register Player & Generate 4-Digit Code'}
                </button>
              </form>
            </div>

            {/* CARD 2: Admin Reset Player Password by Username */}
            <div
              style={{
                background: '#121212',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#F59E0B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  🔑 Reset Player Password by Username
                </div>
                <div style={{ fontSize: '11px', color: '#8E8E93', marginTop: '2px', lineHeight: 1.4 }}>
                  Generates a new 4-digit code for an existing player. When the player signs in with this code, they are required to choose a new password before accessing their dashboard.
                </div>
              </div>

              {resetSuccess && (
                <div
                  style={{
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid #D97706',
                    borderRadius: '8px',
                    padding: '12px',
                    fontSize: '12px',
                    color: '#FFFFFF',
                  }}
                >
                  <div style={{ fontWeight: 800, color: '#F59E0B', marginBottom: '4px' }}>
                    ✅ Password Reset Successfully!
                  </div>
                  <div><strong>Player:</strong> {resetSuccess.player?.name} (@{resetSuccess.player?.username})</div>
                  <div><strong>Team:</strong> {resetSuccess.player?.team_name || 'N/A'}</div>
                  <div style={{ marginTop: '8px', padding: '8px', background: '#051913', borderRadius: '6px', border: '1px dashed #F59E0B' }}>
                    <div style={{ fontSize: '11px', color: '#F59E0B', fontWeight: 800, textTransform: 'uppercase' }}>
                      🔑 New 4-Digit Reset Code:
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: '#FFFFFF', letterSpacing: '4px', margin: '4px 0' }}>
                      {resetSuccess.code}
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#8E8E93' }}>
                      Give this 4-digit code to the player. Upon entering it at sign-in, they will be prompted to set a new permanent password.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(
                          `Ruiru Titans Password Reset\nUsername: ${resetSuccess.player?.username}\n4-Digit Reset Code: ${resetSuccess.code}`
                        );
                        alert('Copied reset code to clipboard!');
                      }}
                      style={{
                        background: '#1C1C1E',
                        color: '#6CE5A0',
                        border: '1px solid #2F7D5C',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      📋 Copy Info
                    </button>
                    <button
                      type="button"
                      onClick={() => setResetSuccess(null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#8E8E93',
                        fontSize: '11px',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {resetError && (
                <div style={{ background: 'rgba(226, 74, 59, 0.15)', border: '1px solid #B23A2E', borderRadius: '6px', padding: '8px 10px', color: '#FF9990', fontSize: '11.5px' }}>
                  {resetError}
                </div>
              )}

              <form onSubmit={handleAdminResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Search player by name or jersey # to get their username */}
                <div style={{ background: '#051913', border: '1px dashed rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ fontSize: '11px', color: '#6CE5A0', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    🔍 Search Player by Name or Jersey #
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Type player name or jersey # (e.g. Kibe, #10, Caleb)…"
                      value={resetSearchQuery}
                      onChange={(e) => handleSearchResetPlayer(e.target.value)}
                      style={{ fontSize: '11.5px', padding: '6px 8px' }}
                    />
                    {resetSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setResetSearchQuery('');
                          setResetSearchResults([]);
                        }}
                        style={{
                          background: '#121212',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: '#8E8E93',
                          borderRadius: '6px',
                          padding: '0 8px',
                          fontSize: '11px',
                          cursor: 'pointer',
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {resetSearchLoading && (
                    <div style={{ fontSize: '10.5px', color: '#8E8E93', marginTop: '4px' }}>
                      Searching players…
                    </div>
                  )}
                  {resetSearchResults.length > 0 && (
                    <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
                      {resetSearchResults.map((p) => (
                        <div
                          key={`${p.team_id || ''}-${p.id}-${p.username}`}
                          onClick={() => {
                            setResetUsername(p.username);
                            setResetSearchResults([]);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#0e2b20',
                            border: '1px solid #235841',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: '11px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 800, color: '#FFFFFF' }}>{p.name}</span>
                            {p.jersey_number != null && (
                              <span style={{ background: '#0B2920', border: '1px solid #FF9500', color: '#FF9500', borderRadius: '4px', padding: '0 4px', fontSize: '9.5px', fontWeight: 800 }}>
                                #{p.jersey_number}
                              </span>
                            )}
                            {p.is_active === false && (
                              <span style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid #EF4444', color: '#FCA5A5', borderRadius: '4px', padding: '0 4px', fontSize: '9px', fontWeight: 800 }}>
                                DISABLED
                              </span>
                            )}
                            <span style={{ color: '#8E8E93', fontSize: '10px' }}>({p.team_name || 'Team'})</span>
                          </div>
                          <span style={{ color: '#FF9500', fontWeight: 800, fontFamily: 'monospace' }}>
                            @{p.username} ↵
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    Player Username, ID, or Jersey Number *
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. samuel_kibe, OXF-P1, or #10"
                    value={resetUsername}
                    onChange={(e) => setResetUsername(e.target.value)}
                    required
                  />
                </div>

                <div style={{ fontSize: '10.5px', color: '#8E8E93' }}>
                  💡 Tip: Enter player's username, permanent ID, or squad jersey number (#10) to generate their 4-digit reset code.
                </div>

                <button
                  type="submit"
                  disabled={resetLoading}
                  className="stat-btn"
                  style={{
                    background: '#F59E0B',
                    color: '#16201B',
                    fontWeight: 800,
                    padding: '9px 14px',
                    fontSize: '12px',
                    marginTop: 'auto',
                  }}
                >
                  {resetLoading ? 'Generating Reset Code…' : '🔑 Generate 4-Digit Reset Code'}
                </button>
              </form>
            </div>

            {/* CARD 3: Manager Account Password Change */}
            <div
              style={{
                background: '#121212',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#FF9500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  🔐 Change Manager Password
                </div>
                <div style={{ fontSize: '11px', color: '#8E8E93', marginTop: '2px', lineHeight: 1.4 }}>
                  Update your Manager / Admin password. Signed in as <strong>@{cmsUser?.username || 'admin'}</strong>.
                </div>
              </div>

              {cmsPassSuccess && (
                <div
                  style={{
                    background: 'rgba(108, 229, 160, 0.12)',
                    border: '1px solid #3F7A4E',
                    borderRadius: '8px',
                    padding: '10px',
                    fontSize: '11.5px',
                    color: '#6CE5A0',
                    fontWeight: 700,
                  }}
                >
                  ✅ {cmsPassSuccess}
                </div>
              )}

              {cmsPassError && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid #EF4444',
                    borderRadius: '8px',
                    padding: '10px',
                    fontSize: '11.5px',
                    color: '#FCA5A5',
                    fontWeight: 600,
                  }}
                >
                  ⚠️ {cmsPassError}
                </div>
              )}

              <form onSubmit={handleChangeCmsPassword} style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    Current Manager Password *
                  </label>
                  <PasswordInput
                    placeholder="Current password"
                    value={cmsCurrentPassword}
                    onChange={(e) => setCmsCurrentPassword(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    New Password (min. 4 chars) *
                  </label>
                  <PasswordInput
                    placeholder="New manager password"
                    value={cmsNewPassword}
                    onChange={(e) => setCmsNewPassword(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    Confirm New Password *
                  </label>
                  <PasswordInput
                    placeholder="Confirm new password"
                    value={cmsConfirmPassword}
                    onChange={(e) => setCmsConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={cmsPassLoading}
                  className="stat-btn"
                  style={{
                    background: '#FF9500',
                    color: '#16201B',
                    fontWeight: 800,
                    padding: '9px 14px',
                    fontSize: '12px',
                    marginTop: 'auto',
                  }}
                >
                  {cmsPassLoading ? 'Updating…' : '🔐 Update Manager Password'}
                </button>
              </form>
            </div>

            {/* CARD 4: Quick Player Transfer Between Teams */}
            <div
              style={{
                background: '#121212',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#FF9500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ⇄ Quick Player Transfer
                </div>
                <div style={{ fontSize: '11px', color: '#8E8E93', marginTop: '2px', lineHeight: 1.4 }}>
                  Instantly move a player from one team to another. All individual player stats, cards, and login credentials are automatically preserved.
                </div>
              </div>

              <form onSubmit={handleExecuteQuickTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    1. Source Team (Current)
                  </label>
                  <select
                    className="form-input"
                    value={quickTransferSourceTeam}
                    onChange={(e) => {
                      setQuickTransferSourceTeam(e.target.value);
                      setQuickTransferPlayerId('');
                    }}
                  >
                    <option value="">-- Select Source Team --</option>
                    {(cat?.teams || []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({(t.players || []).filter((p) => !p.unknown).length} players)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    2. Select Player to Move
                  </label>
                  <select
                    className="form-input"
                    value={quickTransferPlayerId}
                    onChange={(e) => setQuickTransferPlayerId(e.target.value)}
                    disabled={!quickTransferSourceTeam}
                  >
                    <option value="">-- Choose Player --</option>
                    {(
                      (cat?.teams || []).find((t) => t.id === quickTransferSourceTeam)?.players || []
                    )
                      .filter((p) => !p.unknown)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.position ? `(${p.position})` : ''} · ID: {p.id}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                    3. Destination Team
                  </label>
                  <select
                    className="form-input"
                    value={quickTransferTargetTeam}
                    onChange={(e) => setQuickTransferTargetTeam(e.target.value)}
                  >
                    <option value="">-- Select Target Team --</option>
                    {(cat?.teams || [])
                      .filter((t) => t.id !== quickTransferSourceTeam)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({(t.players || []).filter((p) => !p.unknown).length} players)
                        </option>
                      ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={!quickTransferSourceTeam || !quickTransferPlayerId || !quickTransferTargetTeam}
                  className="stat-btn"
                  style={{
                    background:
                      !quickTransferSourceTeam || !quickTransferPlayerId || !quickTransferTargetTeam
                        ? '#1C1C1E'
                        : '#FF9500',
                    color:
                      !quickTransferSourceTeam || !quickTransferPlayerId || !quickTransferTargetTeam
                        ? '#8E8E93'
                        : '#16201B',
                    fontWeight: 800,
                    padding: '9px 14px',
                    fontSize: '12px',
                    marginTop: 'auto',
                    cursor:
                      !quickTransferSourceTeam || !quickTransferPlayerId || !quickTransferTargetTeam
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  ⇄ Execute Transfer
                </button>
              </form>
            </div>
          </div>

          {/* Teams & Squad Management */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF', marginBottom: '10px' }}>
              Teams ({cat.teams.length})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
              {cat.teams.map((t) => {
                const isOpen = !!openTeamIds[t.id];
                return (
                  <div
                    key={t.id}
                    style={{
                      background: '#121212',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ width: '10px', height: '10px', borderRadius: '5px', background: t.color }} />
                        {onSelectTeam ? (
                          <button
                            type="button"
                            className="team-link-btn"
                            onClick={() => onSelectTeam(t.id, activeCategoryKey)}
                            style={{ fontWeight: 700, color: '#FFFFFF', fontSize: '13.5px' }}
                            title={`Click to view ${t.name} performance profile & analytics`}
                          >
                            {t.name}
                          </button>
                        ) : (
                          <span style={{ fontWeight: 700, color: '#FFFFFF', fontSize: '13.5px' }}>{t.name}</span>
                        )}
                        <span style={{ fontSize: '11px', color: '#8E8E93' }}>
                          ({t.players.filter((p) => !p.unknown).length} players)
                        </span>
                        {onSelectTeam && (
                          <button
                            type="button"
                            className="btn-pill-action"
                            onClick={() => onSelectTeam(t.id, activeCategoryKey)}
                            style={{ fontSize: '10.5px', padding: '1px 6px' }}
                            title="View predictive odds, form and match history"
                          >
                            📊 Odds &amp; Profile
                          </button>
                        )}
                      </div>
                      <button
                        onClick={() => toggleTeam(t.id)}
                        style={{ background: 'none', border: 'none', color: '#8E8E93', fontSize: '12px', cursor: 'pointer' }}
                      >
                        {isOpen ? 'Close roster ▲' : 'Manage roster ▾'}
                      </button>
                    </div>

                    {isOpen && (
                      <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #1C1C1E' }}>
                        {/* Players list */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                          {t.players
                            .filter((p) => !p.unknown)
                            .map((p) => {
                              const uname = p.username || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
                              return (
                                <span
                                  key={p.id}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: '#1C1C1E',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontSize: '11.5px',
                                    color: '#EBEBF5',
                                    border: '1px solid #224B3B',
                                  }}
                                >
                                  <span style={{ fontWeight: 700, color: '#FFFFFF' }}>{p.name}</span>
                                  <span
                                    title="System-assigned permanent Player ID (used for voting & unique identification)"
                                    style={{
                                      fontSize: '9.5px',
                                      fontWeight: 800,
                                      background: '#121212',
                                      color: '#6CE5A0',
                                      border: '1px solid rgba(255, 255, 255, 0.1)',
                                      borderRadius: '4px',
                                      padding: '1px 5px',
                                    }}
                                  >
                                    ID: {p.id}
                                  </span>
                                  <span
                                    title="Player Login Username"
                                    style={{
                                      fontSize: '10px',
                                      color: '#8E8E93',
                                    }}
                                  >
                                    @{uname}
                                  </span>

                                  {/* Jersey Number & Release Button */}
                                  {(p.jerseyNumber != null || p.jersey_number != null) ? (
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                        background: '#0B2920',
                                        border: '1px solid #FF9500',
                                        borderRadius: '4px',
                                        padding: '1px 5px',
                                        fontSize: '9.5px',
                                        fontWeight: 800,
                                        color: '#FF9500',
                                      }}
                                    >
                                      #{p.jerseyNumber ?? p.jersey_number}
                                      <button
                                        type="button"
                                        onClick={() => handleReleasePlayerJerseyAction(t.id, p)}
                                        title={`Release jersey #${p.jerseyNumber ?? p.jersey_number} from ${p.name}`}
                                        style={{
                                          background: 'none',
                                          border: 'none',
                                          color: '#FF9990',
                                          cursor: 'pointer',
                                          padding: '0 2px',
                                          fontSize: '9px',
                                          fontWeight: 800,
                                        }}
                                      >
                                        ✕ Release
                                      </button>
                                    </span>
                                  ) : (
                                    <span
                                      style={{
                                        fontSize: '9px',
                                        color: '#8E8E93',
                                        border: '1px dashed rgba(255, 255, 255, 0.1)',
                                        borderRadius: '4px',
                                        padding: '1px 4px',
                                      }}
                                    >
                                      No #
                                    </span>
                                  )}

                                  {/* Account Status & Disable/Enable toggle */}
                                  {(p.isActive === false || p.is_active === false) ? (
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                        background: 'rgba(239, 68, 68, 0.2)',
                                        border: '1px solid #EF4444',
                                        borderRadius: '4px',
                                        padding: '1px 5px',
                                        fontSize: '9px',
                                        fontWeight: 800,
                                        color: '#FCA5A5',
                                      }}
                                    >
                                      ⛔ Disabled
                                      <button
                                        type="button"
                                        onClick={() => handleTogglePlayerStatusAction(t.id, p)}
                                        title="Re-enable this player account"
                                        style={{
                                          background: '#166534',
                                          border: 'none',
                                          color: '#FFFFFF',
                                          borderRadius: '3px',
                                          padding: '1px 4px',
                                          fontSize: '8.5px',
                                          cursor: 'pointer',
                                          fontWeight: 800,
                                        }}
                                      >
                                        Enable
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleTogglePlayerStatusAction(t.id, p)}
                                      title="Disable this player account (prevents login & access)"
                                      style={{
                                        background: 'rgba(239, 68, 68, 0.12)',
                                        border: '1px solid #7F1D1D',
                                        color: '#F87171',
                                        borderRadius: '4px',
                                        padding: '1px 5px',
                                        fontSize: '9px',
                                        cursor: 'pointer',
                                        fontWeight: 700,
                                      }}
                                    >
                                      ⛔ Disable
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => handleAdminResetPassword(null, uname)}
                                    title={`Reset password for @${uname} (generates a 4-digit code)`}
                                    style={{
                                      background: 'rgba(245, 158, 11, 0.18)',
                                      border: '1px solid #D97706',
                                      color: '#F59E0B',
                                      borderRadius: '4px',
                                      fontSize: '9.5px',
                                      fontWeight: 800,
                                      padding: '1px 5px',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    🔑 Reset
                                  </button>
                                  <select
                                    value={p.position || ''}
                                    onChange={(e) => onUpdatePlayerPosition && onUpdatePlayerPosition(t.id, p.id, e.target.value)}
                                    title={p.position ? `Assigned position: ${p.position} (click to change)` : 'No position assigned (click to assign manually)'}
                                    style={{
                                      background: p.position ? '#121212' : '#1F2937',
                                      color: p.position ? '#FF9500' : '#9CA3AF',
                                      border: p.position ? '1px solid rgba(255, 255, 255, 0.1)' : '1px dashed #6B7280',
                                      borderRadius: '3px',
                                      fontSize: '10px',
                                      padding: '1px 3px',
                                      cursor: 'pointer',
                                      fontWeight: 700,
                                    }}
                                  >
                                    {POSITIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.value || '-- Unassigned --'}
                                      </option>
                                    ))}
                                  </select>
                                  {onMovePlayer && (cat?.teams || []).length > 1 && (
                                    <select
                                      value=""
                                      onChange={(e) => {
                                        const targetTeamId = e.target.value;
                                        if (targetTeamId && targetTeamId !== t.id) {
                                          onMovePlayer(t.id, targetTeamId, p.id, activeCategoryKey);
                                        }
                                      }}
                                      title={`Transfer ${p.name} to another team`}
                                      style={{
                                        background: '#0B2920',
                                        color: '#6CE5A0',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '3px',
                                        fontSize: '9.5px',
                                        padding: '1px 3px',
                                        cursor: 'pointer',
                                        fontWeight: 700,
                                      }}
                                    >
                                      <option value="" disabled>⇄ Move...</option>
                                      {(cat?.teams || [])
                                        .filter((other) => other.id !== t.id)
                                        .map((other) => (
                                          <option key={other.id} value={other.id}>
                                            → {other.name}
                                          </option>
                                        ))}
                                    </select>
                                  )}
                                  <span
                                    onClick={() => onRemovePlayer(t.id, p.id)}
                                    style={{ cursor: 'pointer', color: '#FF7A70', fontWeight: 700, marginLeft: '2px' }}
                                    title="Remove player"
                                  >
                                    ✕
                                  </span>
                                </span>
                              );
                            })}
                        </div>

                        {/* Add Player Input (Auto-assigns permanent ID + optional username/password) */}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <input
                            className="form-input"
                            style={{ flex: '2 1 180px' }}
                            placeholder="Player name (or comma-separated: John, Peter)"
                            value={newPlayerNames[t.id] || ''}
                            onChange={(e) => setNewPlayerNames({ ...newPlayerNames, [t.id]: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleAddPlayer(t.id);
                            }}
                          />
                          <input
                            className="form-input"
                            style={{ flex: '1 1 120px' }}
                            placeholder="Username (auto if blank)"
                            value={newPlayerUsernames[t.id] || ''}
                            onChange={(e) => setNewPlayerUsernames({ ...newPlayerUsernames, [t.id]: e.target.value })}
                          />
                          <PasswordInput
                            wrapperStyle={{ flex: '1 1 140px' }}
                            placeholder="Initial password (or use 4-digit activation)"
                            value={newPlayerPasswords[t.id] || ''}
                            onChange={(e) => setNewPlayerPasswords({ ...newPlayerPasswords, [t.id]: e.target.value })}
                          />
                          <select
                            value={newPlayerPositions[t.id] || ''}
                            onChange={(e) => setNewPlayerPositions({ ...newPlayerPositions, [t.id]: e.target.value })}
                            style={{
                              background: '#121212',
                              color: '#FF9500',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '6px',
                              fontSize: '12px',
                              padding: '0 10px',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {POSITIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                          <button
                            className="stat-btn"
                            style={{ background: '#FF9500', color: '#16201B', fontWeight: 700, padding: '0 14px' }}
                            onClick={() => handleAddPlayer(t.id)}
                          >
                            + Add Player
                          </button>
                        </div>
                        <div style={{ fontSize: '10.5px', color: '#8E8E93', marginTop: '6px' }}>
                          💡 System automatically assigns a permanent unique Player ID (e.g. <code>{t.id}-P…</code>) used for voting and all player records.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add League Team & Quick Add */}
            <div
              style={{
                background: '#0D261E',
                border: '1px solid #1F4D3C',
                borderRadius: '10px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <div style={{ fontWeight: 800, color: '#FFFFFF', fontSize: '14px' }}>
                    ➕ Add Another Team to {cat.label}
                  </div>
                  <div style={{ fontSize: '12px', color: '#8E8E93', marginTop: '2px' }}>
                    Configure squad roster, transfer players, auto-balance across existing teams, and automatically generate league fixtures.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddTeamModal(true)}
                  style={{
                    background: '#FF9500',
                    color: '#16201B',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '9px 18px',
                    fontWeight: 800,
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  🚀 Add League Team &amp; Fixtures Wizard
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '11px', color: '#6A8A7C', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Or Quick Add Empty Team:
                </div>
                <form onSubmit={handleAddTeam} style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '240px' }}>
                  <input
                    className="form-input"
                    style={{ flex: 1 }}
                    placeholder="Quick team name (e.g. Kasabuni FC)…"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="stat-btn"
                    style={{ background: '#1C1C1E', color: '#6CE5A0', border: '1px solid #2F7D5C', fontWeight: 700, padding: '0 14px' }}
                  >
                    + Quick Add
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Referees Management */}
          <div style={{ marginBottom: '24px', borderTop: '1px solid #1C1C1E', paddingTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
                Match Officials / Referees ({cat.referees?.length || 0})
              </div>
              {onRandomizeReferees && (
                <button
                  type="button"
                  className="stat-btn"
                  disabled={!cat.referees || cat.referees.length === 0}
                  onClick={() => {
                    const count = onRandomizeReferees(activeCategoryKey);
                    setStatusBanner(`🎲 Randomized referees across ${count ?? 'all'} unplayed fixture(s) in "${cat.label}"!`);
                  }}
                  style={{ background: '#1C1C1E', color: '#6CE5A0', border: '1px solid #2F7D5C', fontWeight: 800, padding: '6px 12px' }}
                >
                  🎲 Randomize Referees Across Unplayed Fixtures
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
              {(cat.referees || []).map((r, i) => (
                <span
                  key={i}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#1C1C1E',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#EBEBF5',
                  }}
                >
                  <span>🧑‍⚖️ {r}</span>
                  <span
                    onClick={() => onRemoveReferee(r, activeCategoryKey)}
                    style={{ cursor: 'pointer', color: '#8E8E93', fontWeight: 700 }}
                  >
                    ✕
                  </span>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                className="form-input"
                placeholder="Referee name(s) — e.g. Ref Kamau, Ref Otieno…"
                value={newRefName}
                onChange={(e) => setNewRefName(e.target.value)}
              />
              <button
                className="stat-btn"
                style={{ background: '#FF9500', color: '#16201B', fontWeight: 700, padding: '0 14px' }}
                onClick={() => {
                  if (newRefName.trim()) {
                    onAddReferee(newRefName.trim(), activeCategoryKey);
                    setNewRefName('');
                    setStatusBanner(`🧑‍⚖️ Added referee(s) to "${cat.label}"!`);
                  }
                }}
              >
                + Add Ref
              </button>
            </div>
          </div>

          {/* Database Quick Actions */}
          <div style={{ borderTop: '1px solid #1C1C1E', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#FFFFFF' }}>
              Tournament Actions
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {onGenerateFixtures && (
                <button
                  type="button"
                  className="stat-btn"
                  onClick={() => {
                    onGenerateFixtures(activeCategoryKey);
                    setStatusBanner(`⚡ Generated fixtures with randomized referees for "${cat.label}"!`);
                  }}
                  style={{ background: '#FF9500', color: '#16201B', fontWeight: 800, padding: '8px 14px' }}
                >
                  ⚡ Generate / Regenerate Fixtures for &ldquo;{cat.label}&rdquo;
                </button>
              )}
              {cat.mode !== 'cup' && onReorganizeUnplayedFixtures && (
                <button
                  type="button"
                  className="stat-btn"
                  onClick={() => {
                    const count = onReorganizeUnplayedFixtures(activeCategoryKey);
                    setStatusBanner(`⚖️ Reorganized ${count ?? 'all'} unplayed fixture(s) in "${cat.label}"! Catch-up matches moved to the front so no team plays an extra game before newer teams.`);
                  }}
                  style={{ background: '#1F4D3C', color: '#6CE5A0', border: '1px solid #2F7D5C', fontWeight: 800, padding: '8px 14px' }}
                >
                  ⚖️ Reorganize &amp; Balance Unplayed Fixtures
                </button>
              )}
              <button
                className="stat-btn"
                onClick={onResetRealSeason}
                style={{ background: '#1C1C1E', color: '#EBEBF5', border: '1px solid rgba(255, 255, 255, 0.1)', padding: '8px 14px' }}
              >
                🔄 Restore 2026 Ruiru Titans Real Season Data
              </button>
            </div>

            {/* Soft Delete Category */}
            <div style={{ marginTop: '12px' }}>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{ background: 'none', border: 'none', color: '#E24A3B', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}
                >
                  🗑️ Soft Delete this competition ({cat.label}) — Move to Archive
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', color: '#E24A3B' }}>
                    Soft-delete &ldquo;{cat.label}&rdquo;? (All teams, fixtures &amp; votes are preserved and can be restored anytime)
                  </span>
                  <button
                    className="stat-btn"
                    style={{ background: '#E24A3B', color: '#FFF' }}
                    onClick={() => {
                      onDeleteCategory(activeCategoryKey);
                      setConfirmDelete(false);
                    }}
                  >
                    Yes, Soft Delete
                  </button>
                  <button
                    className="stat-btn"
                    style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#FFF' }}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 5: MANAGER ACCOUNT & SECURITY */}
      {adminSection === 'security' && (
        <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
            <div>
              <div className="scoreboard" style={{ color: '#FF9500', fontSize: '20px' }}>
                🔐 MANAGER ACCOUNT &amp; PASSWORD SECURITY
              </div>
              <div style={{ fontSize: '12px', color: '#8E8E93', marginTop: '4px' }}>
                Manage and update your platform manager password. Your active session will automatically renew with the updated credentials.
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ background: '#1C1C1E', border: '1px solid #2F7D5C', color: '#6CE5A0', padding: '5px 12px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 700 }}>
                ● Active Manager: @{cmsUser?.username || 'admin'}
              </span>
            </div>
          </div>

          <div style={{ maxWidth: '540px', margin: '0 auto', background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '24px' }}>
            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(255, 149, 0, 0.15)', border: '1px solid #FF9500', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                🔑
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#FFFFFF' }}>
                  Update Administrator Password
                </div>
                <div style={{ fontSize: '11px', color: '#8E8E93' }}>
                  Requires verifying your current password before saving new credentials.
                </div>
              </div>
            </div>

            {cmsPassSuccess && (
              <div
                style={{
                  background: 'rgba(108, 229, 160, 0.12)',
                  border: '1px solid #3F7A4E',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  fontSize: '12px',
                  color: '#6CE5A0',
                  fontWeight: 700,
                  marginBottom: '16px',
                }}
              >
                ✅ {cmsPassSuccess}
              </div>
            )}

            {cmsPassError && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid #EF4444',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  fontSize: '12px',
                  color: '#FCA5A5',
                  fontWeight: 600,
                  marginBottom: '16px',
                }}
              >
                ⚠️ {cmsPassError}
              </div>
            )}

            <form onSubmit={handleChangeCmsPassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#FFFFFF', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                  Current Manager Password *
                </label>
                <PasswordInput
                  placeholder="Enter your current password"
                  value={cmsCurrentPassword}
                  onChange={(e) => setCmsCurrentPassword(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#FFFFFF', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                  New Password (min. 4 characters) *
                </label>
                <PasswordInput
                  placeholder="Enter new password"
                  value={cmsNewPassword}
                  onChange={(e) => setCmsNewPassword(e.target.value)}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#FFFFFF', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                  Confirm New Password *
                </label>
                <PasswordInput
                  placeholder="Confirm new password"
                  value={cmsConfirmPassword}
                  onChange={(e) => setCmsConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={cmsPassLoading}
                className="stat-btn"
                style={{
                  background: '#FF9500',
                  color: '#16201B',
                  fontWeight: 800,
                  padding: '12px 18px',
                  fontSize: '13px',
                  marginTop: '8px',
                  cursor: cmsPassLoading ? 'not-allowed' : 'pointer',
                  borderRadius: '8px',
                }}
              >
                {cmsPassLoading ? 'Updating Manager Password…' : '🔐 Update Manager Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ADD LEAGUE TEAM MODAL */}
      {showAddTeamModal && (
        <div
          className="h2h-overlay"
          onClick={(e) => {
            if (e.target.classList.contains('h2h-overlay')) setShowAddTeamModal(false);
          }}
        >
          <div className="h2h-modal" style={{ maxWidth: '820px', padding: '24px', background: '#121212', border: '1px solid #285444' }}>
            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                paddingBottom: '14px',
                marginBottom: '18px',
              }}
            >
              <div>
                <div className="scoreboard" style={{ color: '#FF9500', fontSize: '20px' }}>
                  🏆 Add New League Team &amp; Fixtures
                </div>
                <div style={{ fontSize: '12px', color: '#8E8E93', marginTop: '4px' }}>
                  Category: <strong>{cat.label}</strong> · Add a club, configure standard positions, transfer or auto-draft players, and generate league matches.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddTeamModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8E8E93',
                  fontSize: '22px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: '0 6px',
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmCreateLeagueTeam} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Step 1: Team Details & Identity */}
              <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: '#FF9500', color: '#16201B', borderRadius: '50%', width: '20px', height: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900 }}>1</span>
                  Team Identity &amp; Colors
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ fontSize: '11.5px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                      Team Full Name *
                    </label>
                    <input
                      className="form-input"
                      placeholder="e.g. Kasabuni FC, Ruiru Legends"
                      value={newTeamTitle}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewTeamTitle(val);
                        if (!newTeamCodeInput || newTeamCodeInput.length <= 3) {
                          const code = val.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase();
                          if (code) setNewTeamCodeInput(code);
                        }
                      }}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11.5px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                      Team Code (3 Letters) *
                    </label>
                    <input
                      className="form-input"
                      placeholder="e.g. KAS"
                      maxLength={4}
                      value={newTeamCodeInput}
                      onChange={(e) => setNewTeamCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                      required
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11.5px', color: '#8E8E93', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                      Team Primary Color
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="color"
                        value={newTeamColorInput}
                        onChange={(e) => setNewTeamColorInput(e.target.value)}
                        style={{
                          width: '38px',
                          height: '38px',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          background: 'transparent',
                        }}
                      />
                      <input
                        className="form-input"
                        style={{ flex: 1, fontFamily: 'monospace' }}
                        value={newTeamColorInput}
                        onChange={(e) => setNewTeamColorInput(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Color swatches */}
                <div>
                  <div style={{ fontSize: '11px', color: '#6A8A7C', marginBottom: '6px' }}>
                    Quick Palette Presets:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {LEAGUE_PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewTeamColorInput(c)}
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '4px',
                          background: c,
                          border: newTeamColorInput.toLowerCase() === c.toLowerCase() ? '2px solid #FFF' : '1px solid rgba(255,255,255,0.2)',
                          cursor: 'pointer',
                          transform: newTeamColorInput.toLowerCase() === c.toLowerCase() ? 'scale(1.15)' : 'none',
                          transition: 'transform 0.15s ease',
                        }}
                        title={c}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Step 2: Squad Building & Roster Options */}
              <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ background: '#FF9500', color: '#16201B', borderRadius: '50%', width: '20px', height: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900 }}>2</span>
                    Build Squad Roster
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#8E8E93' }}>
                    You can combine direct players, transfers, and auto-balance.
                  </div>
                </div>

                {/* Squad Method Tabs */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setSquadMethod('direct')}
                    style={{
                      background: squadMethod === 'direct' ? '#FF9500' : '#1C1C1E',
                      color: squadMethod === 'direct' ? '#16201B' : '#EBEBF5',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '7px 14px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    📋 Direct Player Entry ({directPlayerRows.filter((r) => r.name.trim()).length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSquadMethod('transfer')}
                    style={{
                      background: squadMethod === 'transfer' ? '#FF9500' : '#1C1C1E',
                      color: squadMethod === 'transfer' ? '#16201B' : '#EBEBF5',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '7px 14px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    🔄 Transfer from Other Teams ({selectedTransfers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSquadMethod('autobalance')}
                    style={{
                      background: squadMethod === 'autobalance' ? '#FF9500' : '#1C1C1E',
                      color: squadMethod === 'autobalance' ? '#16201B' : '#EBEBF5',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '7px 14px',
                      fontSize: '12px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    ⚖️ Intelligent Auto-Balance ({enableIntelligentPull ? intelligentPullCount : 'Off'})
                  </button>
                </div>

                {/* Tab A: Direct Entry */}
                {squadMethod === 'direct' && (
                  <div>
                    <div style={{ fontSize: '11.5px', color: '#8E8E93', marginBottom: '10px' }}>
                      Assign starting positions and squad depth. Each registered player gets a permanent system ID, login credentials, and tracking.
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto', paddingRight: '4px', marginBottom: '12px' }}>
                      {directPlayerRows.map((row, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: '#6A8A7C', width: '20px', textAlign: 'right' }}>
                            {idx + 1}.
                          </span>
                          <select
                            value={row.position}
                            onChange={(e) => updateDirectPlayerRow(idx, 'position', e.target.value)}
                            style={{
                              background: '#121212',
                              color: '#FF9500',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '6px',
                              fontSize: '11.5px',
                              padding: '6px 8px',
                              fontWeight: 700,
                              width: '130px',
                            }}
                          >
                            {POSITIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.value ? opt.value : 'No Pos'}
                              </option>
                            ))}
                          </select>
                          <input
                            className="form-input"
                            style={{ flex: 2, padding: '6px 10px', fontSize: '12px' }}
                            placeholder={`Player Name (e.g. Player ${idx + 1})`}
                            value={row.name}
                            onChange={(e) => updateDirectPlayerRow(idx, 'name', e.target.value)}
                          />
                          <input
                            className="form-input"
                            style={{ width: '60px', padding: '6px 8px', fontSize: '12px', textAlign: 'center' }}
                            placeholder="No."
                            value={row.jerseyNumber}
                            onChange={(e) => updateDirectPlayerRow(idx, 'jerseyNumber', e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => removeDirectPlayerRow(idx)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#FF7A70',
                              cursor: 'pointer',
                              fontWeight: 700,
                              fontSize: '14px',
                              padding: '4px 6px',
                            }}
                            title="Remove row"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={addDirectPlayerRow}
                        style={{
                          background: '#1C1C1E',
                          color: '#6CE5A0',
                          border: '1px solid #2F7D5C',
                          borderRadius: '6px',
                          padding: '6px 12px',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        + Add Position Row
                      </button>
                    </div>

                    <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '10px' }}>
                      <label style={{ fontSize: '11px', color: '#8E8E93', display: 'block', marginBottom: '4px' }}>
                        Or Paste Bulk Player Names (comma or newline separated, optional position in brackets like <code>John Doe (GK)</code>):
                      </label>
                      <textarea
                        className="form-input"
                        rows={2}
                        placeholder="Michael Owen (ST), Steven Gerrard (CM), Virgil van Dijk (CB)..."
                        value={directPasteNames}
                        onChange={(e) => setDirectPasteNames(e.target.value)}
                        style={{ fontSize: '11.5px', resize: 'vertical' }}
                      />
                    </div>
                  </div>
                )}

                {/* Tab B: Player Transfers */}
                {squadMethod === 'transfer' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ fontSize: '11.5px', color: '#8E8E93' }}>
                        Select players from other clubs to transfer into the new team. Permanent IDs, career statistics, and passwords are fully preserved.
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '11px', color: '#6A8A7C' }}>Filter Donor Club:</span>
                        <select
                          value={transferFilterTeam}
                          onChange={(e) => setTransferFilterTeam(e.target.value)}
                          style={{
                            background: '#121212',
                            color: '#FFFFFF',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                            padding: '4px 8px',
                          }}
                        >
                          <option value="all">All Teams</option>
                          {(cat.teams || []).map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title || t.name} ({t.id})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', paddingRight: '4px' }}>
                      {(cat.teams || [])
                        .filter((t) => transferFilterTeam === 'all' || t.id === transferFilterTeam)
                        .flatMap((t) =>
                          (t.players || [])
                            .filter((p) => p && !p.id?.endsWith('-UNK') && p.name !== 'Unknown')
                            .map((p) => {
                              const isSelected = selectedTransfers.some(
                                (x) => x.fromTeamId === t.id && x.playerId === p.id
                              );
                              return (
                                <div
                                  key={`${t.id}-${p.id}`}
                                  onClick={() => toggleTransferPlayer(t.id, p)}
                                  style={{
                                    background: isSelected ? 'rgba(255, 149, 0, 0.16)' : '#121212',
                                    border: isSelected ? '1px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
                                    borderRadius: '6px',
                                    padding: '8px 10px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    transition: 'all 0.15s ease',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    style={{ cursor: 'pointer', accentColor: '#FF9500' }}
                                  />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {p.name}
                                    </div>
                                    <div style={{ fontSize: '10.5px', color: '#8E8E93', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                      <span style={{ color: '#FF9500', fontWeight: 600 }}>{p.position || 'CM'}</span>
                                      <span>·</span>
                                      <span>{t.id}</span>
                                      {p.jerseyNumber && <span>#{p.jerseyNumber}</span>}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                        )}
                    </div>
                  </div>
                )}

                {/* Tab C: Intelligent Auto-Balance */}
                {squadMethod === 'autobalance' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', padding: '12px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={enableIntelligentPull}
                          onChange={(e) => setEnableIntelligentPull(e.target.checked)}
                          style={{ width: '18px', height: '18px', accentColor: '#FF9500' }}
                        />
                        <span style={{ fontWeight: 800, color: '#6CE5A0', fontSize: '13px' }}>
                          ⚡ Enable Competitive Auto-Balance Draft for this Team
                        </span>
                      </label>
                      <div style={{ fontSize: '11.5px', color: '#EBEBF5', marginTop: '6px', marginLeft: '28px' }}>
                        Automatically drafts players from other clubs across standard positional lines (1 GK, 2 DEF, 2 MID, 1 FWD) to seed an instantly competitive starting roster.
                      </div>
                    </div>

                    {enableIntelligentPull && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingLeft: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <label style={{ fontSize: '12px', color: '#FFFFFF', fontWeight: 700 }}>
                            Target Players to Draft:
                          </label>
                          <select
                            value={intelligentPullCount}
                            onChange={(e) => setIntelligentPullCount(e.target.value)}
                            style={{
                              background: '#121212',
                              color: '#FF9500',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '6px',
                              padding: '6px 12px',
                              fontWeight: 800,
                              fontSize: '13px',
                            }}
                          >
                            <option value="4">4 Players (Core Rotation)</option>
                            <option value="6">6 Players (Balanced 1GK-2DEF-2MID-1FWD)</option>
                            <option value="8">8 Players (Deep Squad)</option>
                            <option value="10">10 Players (Full Lineup)</option>
                          </select>
                        </div>

                        <div style={{ background: 'rgba(22, 62, 49, 0.5)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', padding: '10px' }}>
                          <div style={{ fontSize: '11px', color: '#8E8E93', fontWeight: 700, marginBottom: '6px' }}>
                            🛡️ Donor Protection Rules:
                          </div>
                          <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '11px', color: '#A0C2B0', lineHeight: 1.5 }}>
                            <li>Every donor club is guaranteed to retain at least 5 players to remain active and competitive.</li>
                            <li>Clubs with larger rosters contribute players first, evenly distributing the roster impact.</li>
                            <li>Players preserve their permanent IDs, credentials, and match stats.</li>
                          </ul>
                        </div>

                        {/* Donor clubs summary */}
                        <div>
                          <div style={{ fontSize: '11px', color: '#6A8A7C', marginBottom: '6px' }}>
                            Current Donor Club Capacity:
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {(cat.teams || []).map((t) => {
                              const validCount = (t.players || []).filter((p) => p && !p.id?.endsWith('-UNK')).length;
                              const surplus = Math.max(0, validCount - 5);
                              return (
                                <span
                                  key={t.id}
                                  style={{
                                    background: surplus > 0 ? '#1C1C1E' : '#162822',
                                    border: surplus > 0 ? '1px solid #2F7D5C' : '1px solid #1F362D',
                                    borderRadius: '4px',
                                    padding: '3px 8px',
                                    fontSize: '11px',
                                    color: surplus > 0 ? '#6CE5A0' : '#8E8E93',
                                  }}
                                >
                                  {t.title || t.name}: {validCount} players ({surplus > 0 ? `+${surplus} eligible` : 'safe'})
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 3: League Fixtures & Schedule Generation */}
              <div style={{ background: '#121212', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '10px', padding: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#FFFFFF', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: '#FF9500', color: '#16201B', borderRadius: '50%', width: '20px', height: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 900 }}>3</span>
                  Automated League Fixtures &amp; Scheduling
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={autoGenFixtures}
                      onChange={(e) => setAutoGenFixtures(e.target.checked)}
                      style={{ width: '18px', height: '18px', accentColor: '#FF9500' }}
                    />
                    <span style={{ fontWeight: 700, color: '#FFFFFF', fontSize: '12.5px' }}>
                      Automatically generate league fixtures against all {(cat.teams || []).length} existing clubs
                    </span>
                  </label>

                  {autoGenFixtures && (
                    <div style={{ paddingLeft: '28px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#EBEBF5', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="fixtureFormat"
                            value="double"
                            checked={fixtureFormatChoice === 'double'}
                            onChange={() => setFixtureFormatChoice('double')}
                            style={{ accentColor: '#FF9500' }}
                          />
                          <span>Home &amp; Away (Double Round-Robin) — <strong>{(cat.teams || []).length * 2} fixtures</strong></span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#EBEBF5', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="fixtureFormat"
                            value="single"
                            checked={fixtureFormatChoice === 'single'}
                            onChange={() => setFixtureFormatChoice('single')}
                            style={{ accentColor: '#FF9500' }}
                          />
                          <span>Single Leg (Single Round-Robin) — <strong>{(cat.teams || []).length} fixtures</strong></span>
                        </label>
                      </div>

                      <div style={{ fontSize: '11px', color: '#8E8E93', lineHeight: 1.5 }}>
                        ⚖️ <strong>Catch-Up Schedule Reorganization:</strong> Unplayed fixtures are automatically restructured so that the new team plays catch-up matches immediately at the front of the schedule. No team will play an additional game ahead of the new team.<br />
                        ⚡ <strong>Referee Rotation:</strong> Officials are automatically assigned and rotated from <em>{(cat.referees || []).join(', ') || 'League Referee Pool'}</em>.<br />
                        📅 <strong>Match Scheduling:</strong> Chronological match dates and times are generated seamlessly without overlapping.<br />
                        🔒 <strong>Integrity Guarantee:</strong> All played league fixtures and their player stats remain 100% intact.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Summary Bar & Actions */}
              <div
                style={{
                  background: '#121212',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                  padding: '14px 18px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: '#FFFFFF' }}>
                    Team Summary: {newTeamTitle ? `"${newTeamTitle}" (${newTeamCodeInput || 'CODE'})` : 'Enter Team Name'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#8E8E93', display: 'flex', gap: '10px', marginTop: '2px', flexWrap: 'wrap' }}>
                    <span>Direct: {directPlayerRows.filter((r) => r.name.trim()).length}</span>
                    <span>·</span>
                    <span>Transfers: {selectedTransfers.length}</span>
                    <span>·</span>
                    <span>Auto-Balance: {enableIntelligentPull ? intelligentPullCount : 0}</span>
                    <span>·</span>
                    <strong style={{ color: '#6CE5A0' }}>
                      Total Squad: {directPlayerRows.filter((r) => r.name.trim()).length + selectedTransfers.length + (enableIntelligentPull ? parseInt(intelligentPullCount, 10) : 0)} players
                    </strong>
                    {autoGenFixtures && (
                      <>
                        <span>·</span>
                        <strong style={{ color: '#FF9500' }}>
                          Fixtures: {(cat.teams || []).length * (fixtureFormatChoice === 'double' ? 2 : 1)} matches
                        </strong>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setShowAddTeamModal(false)}
                    style={{
                      background: '#1C1C1E',
                      color: '#EBEBF5',
                      border: '1px solid #2F7D5C',
                      borderRadius: '6px',
                      padding: '8px 16px',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newTeamTitle.trim()}
                    style={{
                      background: newTeamTitle.trim() ? '#FF9500' : '#4E4E4E',
                      color: newTeamTitle.trim() ? '#16201B' : '#8E8E93',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 20px',
                      fontWeight: 800,
                      fontSize: '12.5px',
                      cursor: newTeamTitle.trim() ? 'pointer' : 'not-allowed',
                      boxShadow: newTeamTitle.trim() ? '0 2px 8px rgba(255, 149, 0, 0.3)' : 'none',
                    }}
                  >
                    🚀 Confirm &amp; Add Team to League
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
