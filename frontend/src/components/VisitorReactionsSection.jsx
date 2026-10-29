import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../api/client';

const REACTION_OPTIONS = [
  { emoji: '🔥', label: 'Match On Fire', key: '🔥 Match On Fire' },
  { emoji: '❤️', label: 'Titans Love', key: '❤️ Titans Love' },
  { emoji: '⚽', label: 'Goal Machine', key: '⚽ Goal Machine' },
  { emoji: '👏', label: 'Pure Class', key: '👏 Pure Class' },
  { emoji: '⚡', label: 'Electric Vibe', key: '⚡ Electric Vibe' },
  { emoji: '🏆', label: 'Champions', key: '🏆 Champions' },
  { emoji: '💪', label: 'Titans Strength', key: '💪 Titans Strength' },
];

export default function VisitorReactionsSection({
  cmsUser = null,
  isCmsMode = false,
  playerUser = null,
}) {
  const isAdmin = Boolean(cmsUser && isCmsMode);

  // Comments state
  const [comments, setComments] = useState([]);
  const [counts, setCounts] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [adminTab, setAdminTab] = useState('approved'); // 'approved' | 'pending' | 'rejected' | 'all'

  // Submission form state
  const [authorName, setAuthorName] = useState(() => playerUser?.name || '');
  const [reaction, setReaction] = useState('🔥 Match On Fire');
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Carousel & Modal state
  const [activeSlide, setActiveSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [fullModalComment, setFullModalComment] = useState(null);

  // Responsive items per slide
  const [windowWidth, setWindowWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200));

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const itemsPerSlide = windowWidth <= 640 ? 1 : windowWidth <= 1024 ? 2 : 3;

  // Load comments
  const loadComments = async (statusParam = '') => {
    try {
      setLoading(true);
      const queryStatus = isAdmin ? (statusParam || adminTab) : 'approved';
      const res = await api.getComments(queryStatus);
      if (res?.comments) {
        setComments(res.comments);
      }
      if (res?.counts) {
        setCounts(res.counts);
      }
    } catch (err) {
      console.warn('Failed to load visitor comments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments(isAdmin ? adminTab : 'approved');
  }, [isAdmin, adminTab]);

  // Auto-slide carousel
  const displayComments = useMemo(() => {
    if (!isAdmin) {
      return comments.filter((c) => c.isApproved);
    }
    if (adminTab === 'pending') return comments.filter((c) => !c.isApproved && c.status === 'pending');
    if (adminTab === 'approved') return comments.filter((c) => c.isApproved);
    if (adminTab === 'rejected') return comments.filter((c) => c.status === 'rejected');
    return comments;
  }, [comments, isAdmin, adminTab]);

  const totalSlides = Math.max(1, Math.ceil(displayComments.length / itemsPerSlide));

  useEffect(() => {
    if (isPaused || fullModalComment || totalSlides <= 1) return;
    const interval = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % totalSlides);
    }, 4500);
    return () => clearInterval(interval);
  }, [isPaused, fullModalComment, totalSlides]);

  // Keep slide in bounds when list changes
  useEffect(() => {
    if (activeSlide >= totalSlides) {
      setActiveSlide(0);
    }
  }, [totalSlides, activeSlide]);

  // Handle visitor or user comment submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanComment = commentText.trim();
    if (!cleanComment) {
      setFeedback({ type: 'error', message: 'Please write a message or reaction before submitting.' });
      return;
    }

    try {
      setSubmitting(true);
      setFeedback(null);
      const res = await api.submitComment({
        name: authorName.trim() || 'Anonymous',
        reaction,
        comment: cleanComment,
      });

      setFeedback({
        type: 'success',
        message: res.message || '🎉 Thank you! Your reaction has been submitted.',
      });
      setCommentText('');

      // Reload comments to refresh counters / approved list
      await loadComments();
    } catch (err) {
      console.error('Failed to post comment:', err);
      setFeedback({ type: 'error', message: err.message || 'Failed to submit reaction.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Admin moderation actions: approve, reject, delete
  const handleModerate = async (commentId, action) => {
    try {
      const res = await api.moderateComment(commentId, action);
      if (res?.counts) {
        setCounts(res.counts);
      }
      setFeedback({
        type: 'success',
        message: res.message || `Comment ${action}d successfully.`,
      });
      // Refresh current tab
      await loadComments(adminTab);
    } catch (err) {
      console.error('Moderation error:', err);
      setFeedback({ type: 'error', message: err.message || 'Action failed.' });
    }
  };

  const currentSlideComments = useMemo(() => {
    const start = activeSlide * itemsPerSlide;
    return displayComments.slice(start, start + itemsPerSlide);
  }, [displayComments, activeSlide, itemsPerSlide]);

  return (
    <section
      className="visitor-reactions-section"
      style={{
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        marginTop: '8px',
        marginBottom: '12px',
      }}
    >
      {/* =========================================================
          1. SUBMIT COMMENT & REACTION FORM
         ========================================================= */}
      <div
        className="apple-card"
        style={{
          background: '#121212',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '18px',
          padding: '24px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
          width: '100%',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  color: '#FF9500',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  background: 'rgba(255, 149, 0, 0.15)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 149, 0, 0.35)',
                }}
              >
                🗣️ FAN WALL &amp; MATCHDAY VOICES
              </span>
              <span style={{ fontSize: '11px', color: '#6CE5A0', fontWeight: 700 }}>
                ● Open to Everyone
              </span>
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#FFFFFF', margin: '4px 0 2px', letterSpacing: '-0.3px' }}>
              Leave a Comment or Reaction
            </h2>
            <p style={{ fontSize: '13px', color: '#AEAEB2', margin: 0, maxWidth: '640px' }}>
              Share your thoughts, cheer for your team, or leave a word of encouragement for Ruiru Titans.
              Your message will be reviewed and featured on the official fan wall!
            </p>
          </div>

          {isAdmin && counts.pending > 0 && (
            <div
              style={{
                background: 'rgba(255, 149, 0, 0.15)',
                border: '1px solid #FF9500',
                padding: '6px 14px',
                borderRadius: '8px',
                color: '#FF9500',
                fontSize: '12px',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>🛡️ Moderation:</span>
              <span>{counts.pending} pending reaction(s) awaiting your review</span>
            </div>
          )}
        </div>

        {/* Feedback message */}
        {feedback && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '10px',
              background: feedback.type === 'error' ? 'rgba(255, 69, 58, 0.15)' : 'rgba(48, 209, 88, 0.15)',
              border: feedback.type === 'error' ? '1px solid #FF453A' : '1px solid #30D158',
              color: feedback.type === 'error' ? '#FF453A' : '#30D158',
              fontSize: '13px',
              fontWeight: 700,
              marginBottom: '16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '14px', fontWeight: 800 }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Reaction Input Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Top row: Name & Reaction Chips */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#8E8E93', marginBottom: '6px', textTransform: 'uppercase' }}>
                Your Name (Optional)
              </label>
              <input
                type="text"
                placeholder="Enter your name (leave blank for Anonymous)…"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                maxLength={60}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: '#1C1C1E',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#FFFFFF',
                  fontSize: '13.5px',
                  outline: 'none',
                  minHeight: '42px',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#8E8E93', marginBottom: '6px', textTransform: 'uppercase' }}>
                Select Reaction / Vibe
              </label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {REACTION_OPTIONS.map((opt) => {
                  const isSelected = reaction === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setReaction(opt.key)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: isSelected ? '1.5px solid #FF9500' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: isSelected ? 'rgba(255, 149, 0, 0.2)' : '#1C1C1E',
                        color: isSelected ? '#FF9500' : '#EBEBF5',
                        fontSize: '12px',
                        fontWeight: isSelected ? 800 : 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <span>{opt.emoji}</span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Comment Textarea */}
          <div>
            <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#8E8E93', marginBottom: '6px', textTransform: 'uppercase' }}>
              Your Comment or Message
            </label>
            <textarea
              placeholder="What are your thoughts on recent matches, teams, or upcoming Titans fixtures? Write here…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              maxLength={3000}
              rows={3}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '12px 14px',
                borderRadius: '10px',
                background: '#1C1C1E',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#FFFFFF',
                fontSize: '13.5px',
                fontFamily: 'inherit',
                outline: 'none',
                resize: 'vertical',
                lineHeight: 1.5,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
              <span style={{ fontSize: '11px', color: '#8E8E93' }}>
                All comments are reviewed by club moderators before public display.
              </span>
              <span style={{ fontSize: '11px', color: '#8E8E93' }}>
                {commentText.length} / 3000
              </span>
            </div>
          </div>

          {/* Submit Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={submitting || !commentText.trim()}
              style={{
                background: '#FF9500',
                color: '#16201B',
                border: 'none',
                borderRadius: '10px',
                padding: '10px 22px',
                fontSize: '13.5px',
                fontWeight: 800,
                cursor: commentText.trim() ? 'pointer' : 'not-allowed',
                opacity: commentText.trim() ? 1 : 0.6,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                minHeight: '44px',
                transition: 'all 0.15s ease',
                boxShadow: '0 4px 14px rgba(255, 149, 0, 0.35)',
              }}
            >
              <span>💬</span>
              <span>{submitting ? 'Submitting…' : 'Post Reaction'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* =========================================================
          2. ADMIN MODERATION CONTROL BAR (WHEN IN CMS MODE)
         ========================================================= */}
      {isAdmin && (
        <div
          style={{
            background: '#1C1C1E',
            border: '1px solid rgba(255, 149, 0, 0.4)',
            borderRadius: '14px',
            padding: '12px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>🛡️</span>
            <span style={{ fontWeight: 800, fontSize: '13px', color: '#FF9500', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Admin Moderation Center:
            </span>
          </div>

          {/* Filter tabs for admin */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { key: 'approved', label: `Approved (${counts.approved})` },
              { key: 'pending', label: `⏳ Pending Review (${counts.pending})`, alert: counts.pending > 0 },
              { key: 'rejected', label: `Rejected (${counts.rejected})` },
              { key: 'all', label: `All (${counts.total})` },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setAdminTab(tab.key)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: adminTab === tab.key ? '1px solid #FF9500' : '1px solid rgba(255,255,255,0.1)',
                  background: adminTab === tab.key
                    ? '#FF9500'
                    : tab.alert
                    ? 'rgba(255, 149, 0, 0.2)'
                    : 'rgba(255, 255, 255, 0.05)',
                  color: adminTab === tab.key ? '#16201B' : tab.alert ? '#FF9500' : '#EBEBF5',
                  fontWeight: adminTab === tab.key || tab.alert ? 800 : 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                  minHeight: '36px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================
          3. APPROVED COMMENTS CAROUSEL (BELOW FORM)
         ========================================================= */}
      <div
        className="apple-card"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        style={{
          background: '#121212',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '18px',
          padding: '24px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
          width: '100%',
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {/* Header with Navigation Arrows */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 800,
                  color: '#6CE5A0',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  background: 'rgba(108, 229, 160, 0.15)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  border: '1px solid rgba(108, 229, 160, 0.35)',
                }}
              >
                {isAdmin && adminTab !== 'approved' ? `MODERATION VIEW (${adminTab.toUpperCase()})` : 'COMMUNITY VOICES'}
              </span>
              <span style={{ fontSize: '11px', color: '#AEAEB2', fontWeight: 600 }}>
                {displayComments.length} {displayComments.length === 1 ? 'Reaction' : 'Reactions'}
              </span>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#FFFFFF', margin: '4px 0 0', letterSpacing: '-0.3px' }}>
              {isAdmin && adminTab === 'pending'
                ? 'Pending Moderation Queue'
                : 'What Fans & Members Are Saying'}
            </h3>
          </div>

          {/* Navigation Controls */}
          {totalSlides > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setActiveSlide((prev) => (prev > 0 ? prev - 1 : totalSlides - 1))}
                aria-label="Previous reactions slide"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#1C1C1E',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                ‹
              </button>
              <span style={{ fontSize: '12px', color: '#8E8E93', fontWeight: 600, minWidth: '40px', textAlign: 'center' }}>
                {activeSlide + 1} / {totalSlides}
              </span>
              <button
                type="button"
                onClick={() => setActiveSlide((prev) => (prev + 1) % totalSlides)}
                aria-label="Next reactions slide"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#1C1C1E',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#FFFFFF',
                  fontWeight: 800,
                  fontSize: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}
              >
                ›
              </button>
            </div>
          )}
        </div>

        {/* Carousel Content */}
        {loading && comments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#8E8E93', fontSize: '13px' }}>
            ⏳ Loading community voices…
          </div>
        ) : displayComments.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 20px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: '12px',
              border: '1px dashed rgba(255, 255, 255, 0.1)',
              color: '#8E8E93',
            }}
          >
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>💬</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF', marginBottom: '4px' }}>
              {isAdmin && adminTab === 'pending'
                ? 'No pending reactions in the queue.'
                : 'No comments yet on the wall.'}
            </div>
            <div style={{ fontSize: '12.5px' }}>
              Be the first to leave a comment or cheer for Ruiru Titans using the form above!
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${itemsPerSlide}, 1fr)`,
              gap: '16px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {currentSlideComments.map((item) => {
              const maxChars = 140;
              const isLong = item.content.length > maxChars;
              const previewText = isLong ? item.content.slice(0, maxChars) + '…' : item.content;
              const formattedDate = item.createdAt
                ? new Date(item.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : 'Recent';

              return (
                <div
                  key={item.id}
                  style={{
                    background: '#1C1C1E',
                    borderRadius: '14px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
                    transition: 'transform 0.2s ease, border-color 0.2s ease',
                  }}
                >
                  <div>
                    {/* Top card row: Name, Avatar, Reaction, Date */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #FF9500, #FF5E3A)',
                            color: '#1C1C1E',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '14px',
                            flexShrink: 0,
                          }}
                        >
                          {(item.authorName || 'A')[0].toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 800,
                              fontSize: '13.5px',
                              color: '#FFFFFF',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {item.authorName || 'Anonymous'}
                          </div>
                          <div style={{ fontSize: '11px', color: '#8E8E93', marginTop: '1px' }}>
                            {formattedDate}
                          </div>
                        </div>
                      </div>

                      {/* Reaction Badge */}
                      <span
                        style={{
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          padding: '3px 8px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: '#FF9500',
                          flexShrink: 0,
                        }}
                      >
                        {item.reaction || '❤️'}
                      </span>
                    </div>

                    {/* Status badge for admin */}
                    {isAdmin && (
                      <div style={{ marginBottom: '8px' }}>
                        {item.isApproved ? (
                          <span style={{ fontSize: '10px', color: '#30D158', background: 'rgba(48,209,88,0.15)', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                            ✓ Approved
                          </span>
                        ) : item.status === 'rejected' ? (
                          <span style={{ fontSize: '10px', color: '#FF453A', background: 'rgba(255,69,58,0.15)', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                            ✕ Rejected
                          </span>
                        ) : (
                          <span style={{ fontSize: '10px', color: '#FF9500', background: 'rgba(255,149,0,0.15)', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                            ⏳ Pending Moderation
                          </span>
                        )}
                      </div>
                    )}

                    {/* Comment Body */}
                    <p
                      style={{
                        margin: 0,
                        fontSize: '13px',
                        lineHeight: 1.55,
                        color: '#EBEBF5',
                        wordBreak: 'break-word',
                      }}
                    >
                      "{previewText}"
                    </p>

                    {/* Link to view full comment if long */}
                    {isLong && (
                      <button
                        type="button"
                        onClick={() => setFullModalComment(item)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#FF9500',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          padding: '6px 0 0 0',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          outline: 'none',
                        }}
                      >
                        <span>Read full comment</span>
                        <span>→</span>
                      </button>
                    )}
                  </div>

                  {/* Admin Moderation Actions */}
                  {isAdmin && (
                    <div
                      style={{
                        marginTop: '10px',
                        paddingTop: '10px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                        display: 'flex',
                        gap: '6px',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      {!item.isApproved && (
                        <button
                          type="button"
                          onClick={() => handleModerate(item.id, 'approve')}
                          style={{
                            background: '#30D158',
                            color: '#000000',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                          title="Approve and publish to public carousel"
                        >
                          ✓ Approve
                        </button>
                      )}
                      {item.isApproved && (
                        <button
                          type="button"
                          onClick={() => handleModerate(item.id, 'reject')}
                          style={{
                            background: 'rgba(255, 149, 0, 0.15)',
                            color: '#FF9500',
                            border: '1px solid #FF9500',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                          title="Unpublish from public carousel"
                        >
                          Unpublish
                        </button>
                      )}
                      {item.status !== 'rejected' && (
                        <button
                          type="button"
                          onClick={() => handleModerate(item.id, 'reject')}
                          style={{
                            background: 'rgba(255, 69, 58, 0.15)',
                            color: '#FF453A',
                            border: '1px solid #FF453A',
                            borderRadius: '6px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                          title="Reject comment"
                        >
                          ✕ Reject
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Permanently delete comment from "${item.authorName}"?`)) {
                            handleModerate(item.id, 'delete');
                          }
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#8E8E93',
                          fontSize: '11px',
                          cursor: 'pointer',
                          marginLeft: 'auto',
                          padding: '4px',
                        }}
                        title="Delete permanently"
                      >
                        🗑️
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Carousel Pagination Dots */}
        {totalSlides > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginTop: '18px' }}>
            {Array.from({ length: totalSlides }).map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveSlide(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                style={{
                  width: activeSlide === idx ? '20px' : '6px',
                  height: '6px',
                  borderRadius: '3px',
                  background: activeSlide === idx ? '#FF9500' : 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'all 0.25s ease',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* =========================================================
          4. FULL COMMENT POPUP MODAL (WHEN A COMMENT IS LONG)
         ========================================================= */}
      {fullModalComment && (
        <div
          className="modal-overlay"
          onClick={() => setFullModalComment(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            className="apple-modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1C1C1E',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '20px',
              padding: '24px',
              maxWidth: '560px',
              width: '100%',
              boxSizing: 'border-box',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6)',
              position: 'relative',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #FF9500, #FF5E3A)',
                    color: '#1C1C1E',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '16px',
                  }}
                >
                  {(fullModalComment.authorName || 'A')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '15px', color: '#FFFFFF' }}>
                    {fullModalComment.authorName || 'Anonymous'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#8E8E93' }}>
                    {fullModalComment.createdAt ? new Date(fullModalComment.createdAt).toLocaleString() : ''}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    background: 'rgba(255, 149, 0, 0.15)',
                    border: '1px solid #FF9500',
                    color: '#FF9500',
                    padding: '3px 8px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: 800,
                  }}
                >
                  {fullModalComment.reaction}
                </span>
                <button
                  type="button"
                  onClick={() => setFullModalComment(null)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '4px' }}>
              <p
                style={{
                  fontSize: '14px',
                  lineHeight: 1.65,
                  color: '#FFFFFF',
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {fullModalComment.content}
              </p>
            </div>

            {/* Modal Footer */}
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setFullModalComment(null)}
                style={{
                  background: '#FF9500',
                  color: '#16201B',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '8px 20px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
