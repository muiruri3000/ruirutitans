import React, { useState, useEffect } from 'react';
import { api } from '../api/client';

/**
 * Extracts a YouTube embed URL from any common YouTube URL format.
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 */
function getYouTubeEmbedUrl(url) {
  if (!url) return '';
  try {
    const trimmed = url.trim();
    if (trimmed.includes('/embed/')) {
      return trimmed;
    }
    // youtu.be/ID
    const shortMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch && shortMatch[1]) {
      return `https://www.youtube-nocookie.com/embed/${shortMatch[1]}?rel=0`;
    }
    // youtube.com/shorts/ID
    const shortsMatch = trimmed.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch && shortsMatch[1]) {
      return `https://www.youtube-nocookie.com/embed/${shortsMatch[1]}?rel=0`;
    }
    // youtube.com/watch?v=ID
    const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watchMatch && watchMatch[1]) {
      return `https://www.youtube-nocookie.com/embed/${watchMatch[1]}?rel=0`;
    }
    return trimmed;
  } catch {
    return url;
  }
}

export default function HighlightsView({
  categories = {},
  isCmsMode = false,
  cmsUser = null,
  onNavigateHome,
}) {
  const [highlights, setHighlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activePlayerVideo, setActivePlayerVideo] = useState(null);

  // Admin Upload Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');
  const [formVideoType, setFormVideoType] = useState('youtube'); // 'youtube' | 'upload' | 'external'
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    categoryKey: 'open',
    matchName: '',
    matchDate: 'Aug 2026',
    videoUrl: '',
    thumbnailUrl: '',
    duration: '',
  });
  const [uploadedFile, setUploadedFile] = useState(null);

  const fetchHighlights = async () => {
    setLoading(true);
    try {
      const list = await api.getHighlights();
      setHighlights(list || []);
      if (list && list.length > 0 && !activePlayerVideo) {
        setActivePlayerVideo(list[0]);
      }
    } catch (err) {
      console.warn('Error loading highlights:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHighlights();
  }, []);

  const handleOpenAddModal = () => {
    setModalError('');
    setFormData({
      title: '',
      description: '',
      categoryKey: Object.keys(categories)[0] || 'open',
      matchName: '',
      matchDate: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      videoUrl: '',
      thumbnailUrl: '',
      duration: '',
    });
    setUploadedFile(null);
    setFormVideoType('youtube');
    setShowAddModal(true);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setModalError('');
    if (!formData.title.trim()) {
      setModalError('Please enter a highlight title.');
      return;
    }
    if (formVideoType !== 'upload' && !formData.videoUrl.trim()) {
      setModalError('Please provide a valid video link.');
      return;
    }
    if (formVideoType === 'upload' && !uploadedFile) {
      setModalError('Please select a video file from your device.');
      return;
    }

    setSubmitting(true);
    try {
      if (formVideoType === 'upload' && uploadedFile) {
        const payload = new FormData();
        payload.append('title', formData.title);
        payload.append('description', formData.description);
        payload.append('categoryKey', formData.categoryKey);
        payload.append('matchName', formData.matchName);
        payload.append('matchDate', formData.matchDate);
        payload.append('videoType', 'upload');
        payload.append('video_file', uploadedFile);
        payload.append('thumbnailUrl', formData.thumbnailUrl);
        payload.append('duration', formData.duration);
        await api.createHighlight(payload);
      } else {
        await api.createHighlight({
          ...formData,
          videoType: formVideoType,
        });
      }
      setShowAddModal(false);
      await fetchHighlights();
    } catch (err) {
      setModalError(err.message || 'Failed to save highlight video.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete highlight "${title}"?`)) {
      return;
    }
    try {
      await api.deleteHighlight(id);
      if (activePlayerVideo?.id === id) {
        setActivePlayerVideo(null);
      }
      await fetchHighlights();
    } catch (err) {
      alert('Failed to delete highlight: ' + err.message);
    }
  };

  const filteredHighlights = highlights.filter((h) => {
    if (selectedCategory !== 'all' && h.categoryKey && h.categoryKey !== selectedCategory) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (h.title || '').toLowerCase().includes(q);
      const matchDesc = (h.description || '').toLowerCase().includes(q);
      const matchMatch = (h.matchName || '').toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchMatch) return false;
    }
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Top Header Card */}
      <div
        style={{
          background: 'linear-gradient(135deg, #121212 0%, #0F382B 100%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span
              style={{
                background: 'rgba(255, 149, 0, 0.2)',
                border: '1px solid #FF9500',
                color: '#FF9500',
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '0.06em',
              }}
            >
              🎥 MATCH HIGHLIGHTS &amp; REPLAYS
            </span>
            <span style={{ fontSize: '11px', color: '#8E8E93' }}>Ruiru Titans FC Official Channel</span>
          </div>
          <h1
            className="scoreboard"
            style={{
              margin: '0 0 6px',
              fontSize: '28px',
              color: '#FFFFFF',
              letterSpacing: '0.04em',
            }}
          >
            TITANS HIGHLIGHT REEL &amp; VIDEO VAULT
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#8E8E93', maxWidth: '640px' }}>
            Catch all the key goals, wonder strikes, goalkeeper saves, and pivotal tournament moments from Thoome Pri.
            Featuring match replays, YouTube uploads, and exclusive club recordings.
          </p>
        </div>

        {/* Admin Upload / Add Video Button */}
        {isCmsMode && cmsUser && (
          <button
            type="button"
            onClick={handleOpenAddModal}
            style={{
              background: '#FF9500',
              color: '#16201B',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(255, 149, 0, 0.3)',
            }}
          >
            ➕ Upload / Add Highlight
          </button>
        )}
      </div>

      {/* Featured Video Theater Section */}
      {activePlayerVideo && (
        <section
          style={{
            background: '#0B261D',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: '100%',
              paddingBottom: '56.25%', // 16:9 ratio
              background: '#05140F',
            }}
          >
            {activePlayerVideo.videoType === 'upload' || (!activePlayerVideo.videoUrl && activePlayerVideo.fileUrl) ? (
              <video
                controls
                autoPlay={false}
                playsInline
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
                src={activePlayerVideo.fileUrl || activePlayerVideo.videoUrl}
              >
                Your browser does not support the video tag.
              </video>
            ) : activePlayerVideo.videoType === 'youtube' || (activePlayerVideo.videoUrl && activePlayerVideo.videoUrl.includes('youtu')) ? (
              <iframe
                title={activePlayerVideo.title}
                src={getYouTubeEmbedUrl(activePlayerVideo.videoUrl)}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <iframe
                title={activePlayerVideo.title}
                src={activePlayerVideo.videoUrl}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
                allowFullScreen
              />
            )}
          </div>

          <div style={{ padding: '20px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span
                    style={{
                      background: '#1C1C1E',
                      color: '#4ADE80',
                      border: '1px solid #2F7D5C',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                  >
                    🏆 {categories[activePlayerVideo.categoryKey]?.label || activePlayerVideo.categoryKey || 'Titans Tournament'}
                  </span>
                  {activePlayerVideo.matchDate && (
                    <span style={{ fontSize: '11.5px', color: '#FF9500', fontWeight: 600 }}>
                      📅 {activePlayerVideo.matchDate}
                    </span>
                  )}
                  {activePlayerVideo.duration && (
                    <span style={{ fontSize: '11.5px', color: '#8E8E93' }}>
                      ⏱️ {activePlayerVideo.duration}
                    </span>
                  )}
                </div>
                <h2 style={{ margin: '0 0 8px', fontSize: '20px', color: '#FFFFFF', fontWeight: 800 }}>
                  {activePlayerVideo.title}
                </h2>
                {activePlayerVideo.description && (
                  <p style={{ margin: 0, fontSize: '13px', color: '#8E8E93', lineHeight: 1.5, maxWidth: '800px' }}>
                    {activePlayerVideo.description}
                  </p>
                )}
              </div>

              {isCmsMode && cmsUser && (
                <button
                  type="button"
                  onClick={() => handleDelete(activePlayerVideo.id, activePlayerVideo.title)}
                  style={{
                    background: 'rgba(178, 58, 46, 0.2)',
                    color: '#FF9990',
                    border: '1px solid #B23A2E',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  🗑️ Delete Video
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Filter and Search Bar */}
      <div
        style={{
          background: '#121212',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#FF9500', textTransform: 'uppercase' }}>
            Filter by:
          </span>
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            style={{
              padding: '6px 12px',
              borderRadius: '999px',
              border: selectedCategory === 'all' ? '1px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
              background: selectedCategory === 'all' ? '#FF9500' : '#121212',
              color: selectedCategory === 'all' ? '#16201B' : '#EBEBF5',
              fontSize: '11.5px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            All Competitions
          </button>
          {Object.entries(categories).map(([key, cat]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedCategory(key)}
              style={{
                padding: '6px 12px',
                borderRadius: '999px',
                border: selectedCategory === key ? '1px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
                background: selectedCategory === key ? '#FF9500' : '#121212',
                color: selectedCategory === key ? '#16201B' : '#EBEBF5',
                fontSize: '11.5px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {cat.label || key}
            </button>
          ))}
        </div>

        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="text"
            placeholder="🔍 Search highlights..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: '#0B261D',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '7px 12px',
              fontSize: '12px',
              color: '#FFFFFF',
              outline: 'none',
              width: '200px',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                background: 'none',
                border: 'none',
                color: '#8E8E93',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Highlights Video Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#8E8E93' }}>
          Loading Ruiru Titans highlights…
        </div>
      ) : filteredHighlights.length === 0 ? (
        <div
          style={{
            background: '#121212',
            border: '1px dashed rgba(255, 255, 255, 0.1)',
            borderRadius: '14px',
            padding: '40px 20px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎥</div>
          <h3 style={{ margin: '0 0 6px', color: '#FFFFFF', fontSize: '18px' }}>No Highlights Found</h3>
          <p style={{ margin: '0 auto 16px', color: '#8E8E93', fontSize: '13px', maxWidth: '420px' }}>
            {searchQuery || selectedCategory !== 'all'
              ? 'Try adjusting your search query or competition filter.'
              : 'Highlights will be posted as the tournament progresses.'}
          </p>
          {isCmsMode && cmsUser && (
            <button
              type="button"
              onClick={handleOpenAddModal}
              style={{
                background: '#FF9500',
                color: '#16201B',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                fontWeight: 800,
                fontSize: '12.5px',
                cursor: 'pointer',
              }}
            >
              ➕ Upload First Highlight
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '18px',
          }}
        >
          {filteredHighlights.map((item) => {
            const isCurrentPlaying = activePlayerVideo?.id === item.id;
            return (
              <div
                key={item.id}
                style={{
                  background: isCurrentPlaying ? '#133A2D' : '#121212',
                  border: isCurrentPlaying ? '2px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'transform 0.15s ease, border-color 0.15s ease',
                  cursor: 'pointer',
                }}
                onClick={() => setActivePlayerVideo(item)}
              >
                {/* Thumbnail / Video Preview Area */}
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: '175px',
                    background: '#071A14',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {item.thumbnailUrl ? (
                    <img
                      src={item.thumbnailUrl}
                      alt={item.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : item.videoType === 'youtube' || (item.videoUrl && item.videoUrl.includes('youtu')) ? (
                    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                      <img
                        src={`https://img.youtube.com/vi/${(item.videoUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/) || item.videoUrl.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/) || [])[1] || 'aqz-KE-bpKQ'}/hqdefault.jpg`}
                        alt={item.title}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          background: 'rgba(0,0,0,0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <span
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '50%',
                            background: '#FF9500',
                            color: '#16201B',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '18px',
                            fontWeight: 800,
                            boxShadow: '0 4px 10px rgba(0,0,0,0.4)',
                          }}
                        >
                          ▶
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: '#8E8E93' }}>
                      <div style={{ fontSize: '32px', marginBottom: '4px' }}>🎬</div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#FF9500' }}>Click to Play Match Video</span>
                    </div>
                  )}

                  {/* Duration Tag */}
                  {item.duration && (
                    <span
                      style={{
                        position: 'absolute',
                        bottom: '8px',
                        right: '8px',
                        background: 'rgba(0,0,0,0.8)',
                        color: '#FFFFFF',
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                      }}
                    >
                      {item.duration}
                    </span>
                  )}

                  {/* Video Type Tag */}
                  <span
                    style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      background: item.videoType === 'youtube' ? '#E50914' : '#2563EB',
                      color: '#FFF',
                      fontSize: '10px',
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {item.videoType === 'upload' ? '📁 Upload' : item.videoType === 'youtube' ? 'YouTube' : 'Web Video'}
                  </span>
                </div>

                {/* Card Info */}
                <div style={{ padding: '14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '11px', color: '#FF9500', fontWeight: 700 }}>
                      {categories[item.categoryKey]?.label || item.categoryKey || 'Titans'}
                    </span>
                    <span style={{ fontSize: '11px', color: '#8E8E93' }}>
                      {item.matchDate}
                    </span>
                  </div>

                  <h3
                    style={{
                      margin: '0 0 6px',
                      fontSize: '14.5px',
                      color: isCurrentPlaying ? '#FF9500' : '#FFFFFF',
                      fontWeight: 800,
                      lineHeight: 1.3,
                    }}
                  >
                    {item.title}
                  </h3>

                  {item.description && (
                    <p
                      style={{
                        margin: '0 0 12px',
                        fontSize: '12px',
                        color: '#8E8E93',
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {item.description}
                    </p>
                  )}

                  <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span
                      style={{
                        fontSize: '11.5px',
                        color: isCurrentPlaying ? '#6CE5A0' : '#4ADE80',
                        fontWeight: 700,
                      }}
                    >
                      {isCurrentPlaying ? '▶ Now Playing' : 'Watch Highlight →'}
                    </span>

                    {isCmsMode && cmsUser && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id, item.title);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#FF9990',
                          fontSize: '11.5px',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Admin Add / Upload Video Modal */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 9999,
          }}
          onClick={() => setShowAddModal(false)}
        >
          <div
            style={{
              background: '#0B261D',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '520px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 className="scoreboard" style={{ margin: 0, fontSize: '20px', color: '#FFFFFF' }}>
                🎥 UPLOAD / ADD HIGHLIGHT VIDEO
              </h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ background: 'none', border: 'none', color: '#8E8E93', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div
                style={{
                  background: 'rgba(178, 58, 46, 0.25)',
                  border: '1px solid #B23A2E',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  color: '#FF9990',
                  fontSize: '12px',
                  marginBottom: '14px',
                }}
              >
                ⚠️ {modalError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Video Source Type */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#FF9500', fontWeight: 800, marginBottom: '6px' }}>
                  Video Source:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setFormVideoType('youtube')}
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      border: formVideoType === 'youtube' ? '1px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: formVideoType === 'youtube' ? '#FF9500' : '#121212',
                      color: formVideoType === 'youtube' ? '#16201B' : '#EBEBF5',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    ▶ YouTube Link
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormVideoType('upload')}
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      border: formVideoType === 'upload' ? '1px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: formVideoType === 'upload' ? '#FF9500' : '#121212',
                      color: formVideoType === 'upload' ? '#16201B' : '#EBEBF5',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    📁 Upload File
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormVideoType('external')}
                    style={{
                      padding: '8px',
                      borderRadius: '8px',
                      border: formVideoType === 'external' ? '1px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: formVideoType === 'external' ? '#FF9500' : '#121212',
                      color: formVideoType === 'external' ? '#16201B' : '#EBEBF5',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    🌐 External URL
                  </button>
                </div>
              </div>

              {/* Title */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#8E8E93', fontWeight: 700, marginBottom: '4px' }}>
                  Highlight Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Mancheli 2 - 1 Super Strikers | Title Decider"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: '#121212',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    color: '#FFFFFF',
                    outline: 'none',
                  }}
                  required
                />
              </div>

              {/* Video URL or File Input */}
              {formVideoType === 'upload' ? (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#8E8E93', fontWeight: 700, marginBottom: '4px' }}>
                    Select Video File (.mp4, .webm, .mov) *
                  </label>
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/ogg,video/quicktime"
                    onChange={(e) => setUploadedFile(e.target.files[0] || null)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: '#121212',
                      border: '1px dashed #2F7D5C',
                      borderRadius: '8px',
                      padding: '12px',
                      fontSize: '12px',
                      color: '#FFFFFF',
                      cursor: 'pointer',
                    }}
                    required
                  />
                  {uploadedFile && (
                    <div style={{ fontSize: '11px', color: '#4ADE80', marginTop: '4px' }}>
                      Selected: {uploadedFile.name} ({(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB)
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#8E8E93', fontWeight: 700, marginBottom: '4px' }}>
                    {formVideoType === 'youtube' ? 'YouTube Video or Shorts Link *' : 'Direct Video Link (.mp4 / stream) *'}
                  </label>
                  <input
                    type="url"
                    placeholder={
                      formVideoType === 'youtube'
                        ? 'https://www.youtube.com/watch?v=... or https://youtu.be/...'
                        : 'https://example.com/videos/match-highlights.mp4'
                    }
                    value={formData.videoUrl}
                    onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: '#121212',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      color: '#FFFFFF',
                      outline: 'none',
                    }}
                    required
                  />
                </div>
              )}

              {/* Competition & Match Date */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#8E8E93', fontWeight: 700, marginBottom: '4px' }}>
                    Competition
                  </label>
                  <select
                    value={formData.categoryKey}
                    onChange={(e) => setFormData({ ...formData, categoryKey: e.target.value })}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: '#121212',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      color: '#FFFFFF',
                      outline: 'none',
                    }}
                  >
                    {Object.entries(categories).map(([k, c]) => (
                      <option key={k} value={k}>
                        {c.label || k}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#8E8E93', fontWeight: 700, marginBottom: '4px' }}>
                    Match Date
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 23 Aug 2026"
                    value={formData.matchDate}
                    onChange={(e) => setFormData({ ...formData, matchDate: e.target.value })}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: '#121212',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      color: '#FFFFFF',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Match Name & Duration */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#8E8E93', fontWeight: 700, marginBottom: '4px' }}>
                    Fixture / Match Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mancheli vs Super Strikers"
                    value={formData.matchName}
                    onChange={(e) => setFormData({ ...formData, matchName: e.target.value })}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: '#121212',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      color: '#FFFFFF',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', color: '#8E8E93', fontWeight: 700, marginBottom: '4px' }}>
                    Duration (e.g. 08:42)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 08:42"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: '#121212',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      color: '#FFFFFF',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#8E8E93', fontWeight: 700, marginBottom: '4px' }}>
                  Description / Match Story
                </label>
                <textarea
                  rows={3}
                  placeholder="Summary of goals, notable saves, or red card incidents..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    background: '#121212',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    color: '#FFFFFF',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    background: 'none',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#8E8E93',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    background: '#FF9500',
                    color: '#16201B',
                    border: 'none',
                    padding: '8px 20px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: submitting ? 'wait' : 'pointer',
                  }}
                >
                  {submitting ? 'Saving…' : 'Publish Highlight'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
