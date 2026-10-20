import React, { useState, useEffect, useMemo } from 'react';

const JERSEY_ROWS = [
  {
    key: 'u13',
    label: 'U13 JERSEY PHOTOS',
    tag: 'UNDER-13 YOUTH ACADEMY',
    description: 'Official matchday home, away, and training kits for the Ruiru Titans U13 squad.',
    accent: '#5CD685',
    speed: 3000,
    speedLabel: '3.0s',
  },
  {
    key: 'u15',
    label: 'U15 JERSEY PHOTOS',
    tag: 'UNDER-15 JUNIOR TITANS',
    description: 'Official season jerseys and alternate cup kits worn by the Ruiru Titans U15 division.',
    accent: '#4FA8FF',
    speed: 4200,
    speedLabel: '4.2s',
  },
  {
    key: 'u17',
    label: 'U17 JERSEY PHOTOS',
    tag: 'UNDER-17 ELITE COLTS',
    description: 'Pro-cut performance home, away, and goalkeeper kits for the Ruiru Titans U17 squad.',
    accent: '#C9A227',
    speed: 5400,
    speedLabel: '5.4s',
  },
  {
    key: 'wazae',
    label: 'WAZAE JERSEY PHOTOS',
    tag: 'WAZAE VETERANS & LEGENDS',
    description: 'Heritage collector jerseys and Sunday derby kits for the Ruiru Titans Wazae veterans.',
    accent: '#FF9F5A',
    speed: 6800,
    speedLabel: '6.8s',
  },
];

function JerseyRowCarousel({
  row,
  photos = [],
  onPhotoClick,
  isCmsMode,
  cmsUser,
  onNavigateManageHomepage,
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStartX, setTouchStartX] = useState(null);

  // Auto-advance carousel at row's specific speed
  useEffect(() => {
    if (!photos || photos.length <= 1 || isPaused) return;
    const timer = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % photos.length);
    }, row.speed || 4000);
    return () => clearInterval(timer);
  }, [photos.length, isPaused, row.speed]);

  // Clamp currentIdx if photos change
  useEffect(() => {
    if (currentIdx >= photos.length && photos.length > 0) {
      setCurrentIdx(0);
    }
  }, [photos.length, currentIdx]);

  const handleTouchStart = (e) => {
    if (e.touches && e.touches.length > 0) {
      setTouchStartX(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = (e) => {
    if (touchStartX === null || !e.changedTouches || e.changedTouches.length === 0) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 35 && photos.length > 1) {
      if (diff > 0) {
        // Swipe left -> Next
        setCurrentIdx((prev) => (prev + 1) % photos.length);
      } else {
        // Swipe right -> Prev
        setCurrentIdx((prev) => (prev - 1 + photos.length) % photos.length);
      }
    }
    setTouchStartX(null);
  };

  const handlePrev = () => {
    if (photos.length <= 1) return;
    setCurrentIdx((prev) => (prev - 1 + photos.length) % photos.length);
  };

  const handleNext = () => {
    if (photos.length <= 1) return;
    setCurrentIdx((prev) => (prev + 1) % photos.length);
  };

  return (
    <section
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{
        background: '#0F2E24',
        border: '1px solid #1E4636',
        borderRadius: '16px',
        padding: '20px',
        boxShadow: '0 10px 24px rgba(0, 0, 0, 0.22)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* 1. Header Bar: Tag, Label, Speed Badge, Controls, Upload */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          paddingBottom: '12px',
          borderBottom: '1px solid #16352A',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                padding: '3px 10px',
                borderRadius: '999px',
                background: 'rgba(201, 162, 39, 0.15)',
                color: row.accent,
                border: `1px solid ${row.accent}`,
                letterSpacing: '0.1em',
              }}
            >
              👕 {row.tag}
            </span>
            <h3
              className="scoreboard"
              style={{
                fontSize: '24px',
                color: '#F4F2EA',
                margin: 0,
                letterSpacing: '0.04em',
              }}
            >
              {row.label}
            </h3>
          </div>
          <div style={{ fontSize: '12px', color: '#8FA89B', marginTop: '4px' }}>
            {row.description}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Speed Indicator Badge */}
          {photos.length > 1 && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '999px',
                background: isPaused ? 'rgba(245, 158, 11, 0.15)' : 'rgba(92, 214, 133, 0.15)',
                color: isPaused ? '#FCD34D' : row.accent,
                border: `1px solid ${isPaused ? 'rgba(245, 158, 11, 0.4)' : row.accent}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
              title={`Carousel auto-slides every ${row.speedLabel}`}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: isPaused ? '#F59E0B' : '#5CD685',
                  display: 'inline-block',
                }}
              />
              {isPaused ? 'Paused' : `Auto-Slide: ${row.speedLabel}`}
            </span>
          )}

          {/* Play/Pause Toggle */}
          {photos.length > 1 && (
            <button
              type="button"
              onClick={() => setIsPaused(!isPaused)}
              style={{
                background: '#16352A',
                border: '1px solid #2B4E40',
                color: '#DDE6DF',
                borderRadius: '8px',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title={isPaused ? 'Resume auto-sliding' : 'Pause auto-sliding'}
            >
              {isPaused ? '▶ Play' : '⏸ Pause'}
            </button>
          )}

          {/* Slide counter */}
          {photos.length > 1 && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#C9A227',
                background: '#0B281F',
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid #1E4636',
              }}
            >
              {currentIdx + 1} / {photos.length}
            </span>
          )}

          {(isCmsMode || cmsUser) && (
            <button
              type="button"
              onClick={onNavigateManageHomepage}
              style={{
                background: '#16352A',
                color: '#C9A227',
                border: '1px solid #C9A227',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '11.5px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              + Upload {row.key.toUpperCase()} Jersey
            </button>
          )}
        </div>
      </div>

      {/* 2. Carousel Viewport */}
      {photos.length === 0 ? (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: '#8FA89B',
            border: '1px dashed #2B4E40',
            borderRadius: '10px',
            fontSize: '12.5px',
          }}
        >
          No {row.label} uploaded yet.
        </div>
      ) : (
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            borderRadius: '14px',
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Sliding Track */}
          <div
            style={{
              display: 'flex',
              width: '100%',
              transition: 'transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)',
              transform: `translateX(-${currentIdx * 100}%)`,
            }}
          >
            {photos.map((item, idx) => (
              <div
                key={item.id || idx}
                style={{
                  flex: '0 0 100%',
                  minWidth: '100%',
                  boxSizing: 'border-box',
                }}
              >
                <div
                  className="jersey-slide-card"
                  style={{
                    background: '#08231B',
                    border: '1px solid #1E4636',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1.2fr)',
                    alignItems: 'center',
                    gap: '16px',
                    padding: '16px',
                    minHeight: '260px',
                  }}
                >
                  {/* Photo Display Column */}
                  <div
                    onClick={() => onPhotoClick && onPhotoClick(item)}
                    style={{
                      position: 'relative',
                      height: '240px',
                      background: 'radial-gradient(circle at center, rgba(20, 90, 62, 0.3) 0%, #051610 80%)',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      border: '1px solid rgba(43, 87, 70, 0.5)',
                      padding: '8px',
                    }}
                    title="Click to view full-size photo"
                  >
                    <img
                      src={item.image}
                      alt={item.title}
                      style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        display: 'block',
                        transition: 'transform 0.25s ease',
                      }}
                    />
                    {item.badge && (
                      <span
                        style={{
                          position: 'absolute',
                          top: '10px',
                          right: '10px',
                          background: 'rgba(8, 32, 24, 0.92)',
                          color: '#C9A227',
                          border: '1px solid rgba(201, 162, 39, 0.5)',
                          fontSize: '9.5px',
                          fontWeight: 800,
                          padding: '3px 10px',
                          borderRadius: '999px',
                          letterSpacing: '0.08em',
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                    <span
                      style={{
                        position: 'absolute',
                        bottom: '8px',
                        right: '8px',
                        background: 'rgba(8, 32, 24, 0.85)',
                        color: '#8FA89B',
                        fontSize: '10px',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        border: '1px solid #16352A',
                      }}
                    >
                      🔍 Click to zoom
                    </span>
                  </div>

                  {/* Details & Action Column */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          color: row.accent,
                          background: 'rgba(201, 162, 39, 0.1)',
                          border: `1px solid ${row.accent}`,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          letterSpacing: '0.06em',
                        }}
                      >
                        {item.badge || `${row.tag} EDITION`}
                      </span>
                      <span style={{ fontSize: '11px', color: '#6E9080' }}>
                        Slide {idx + 1} of {photos.length}
                      </span>
                    </div>

                    <h4
                      className="scoreboard"
                      style={{
                        fontSize: '26px',
                        color: '#F4F2EA',
                        margin: 0,
                        letterSpacing: '0.04em',
                        lineHeight: 1.15,
                      }}
                    >
                      {item.title}
                    </h4>

                    {item.subtitle && (
                      <div style={{ fontSize: '13px', color: '#C2D6CB', lineHeight: 1.45 }}>
                        {item.subtitle}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => onPhotoClick && onPhotoClick(item)}
                        style={{
                          background: '#C9A227',
                          color: '#16201B',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '7px 14px',
                          fontSize: '11.5px',
                          fontWeight: 800,
                          cursor: 'pointer',
                        }}
                      >
                        🔍 View Fullscreen
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Carousel Left & Right Arrow Buttons */}
          {photos.length > 1 && (
            <>
              <button
                type="button"
                aria-label="Previous kit photo"
                onClick={handlePrev}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'rgba(8, 32, 24, 0.88)',
                  border: '1px solid #2B5746',
                  color: '#F4F2EA',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Next kit photo"
                onClick={handleNext}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'rgba(8, 32, 24, 0.88)',
                  border: '1px solid #2B5746',
                  color: '#F4F2EA',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 2,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                }}
              >
                ›
              </button>
            </>
          )}
        </div>
      )}

      {/* 3. Interactive Thumbnails & Dot Indicators Strip */}
      {photos.length > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            paddingTop: '6px',
          }}
        >
          {/* Thumbnail quick-pick cards */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {photos.map((item, idx) => {
              const isActive = idx === currentIdx;
              return (
                <button
                  key={item.id || idx}
                  type="button"
                  onClick={() => setCurrentIdx(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: isActive ? 'rgba(201, 162, 39, 0.16)' : '#08231B',
                    border: isActive ? '1px solid #C9A227' : '1px solid #1E4636',
                    borderRadius: '8px',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease',
                  }}
                  title={`View ${item.title}`}
                >
                  <img
                    src={item.image}
                    alt={item.title}
                    style={{
                      width: '28px',
                      height: '28px',
                      objectFit: 'contain',
                      borderRadius: '4px',
                    }}
                  />
                  <div style={{ textAlign: 'left' }}>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: isActive ? '#C9A227' : '#DDE6DF',
                      }}
                    >
                      {item.badge || `Kit #${idx + 1}`}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Dots Indicator */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {photos.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Go to slide ${idx + 1}`}
                onClick={() => setCurrentIdx(idx)}
                style={{
                  width: idx === currentIdx ? '22px' : '7px',
                  height: '7px',
                  borderRadius: '999px',
                  border: 'none',
                  background: idx === currentIdx ? '#C9A227' : 'rgba(255,255,255,0.25)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const FIXTURE_CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'internal', label: 'Internal', color: '#A67CFF', bg: 'rgba(166, 124, 255, 0.16)' },
  { key: 'friendly', label: 'Friendly', color: '#4FA8FF', bg: 'rgba(79, 168, 255, 0.16)' },
  { key: 'tournament', label: 'Tournament', color: '#FF9F5A', bg: 'rgba(255, 159, 90, 0.16)' },
  { key: 'league', label: 'League', color: '#5CD685', bg: 'rgba(92, 214, 133, 0.16)' },
  { key: 'cup', label: 'Cup', color: '#C9A227', bg: 'rgba(201, 162, 39, 0.18)' },
];

export default function ClubHomeView({
  homepageData,
  categoriesData,
  isCmsMode,
  cmsUser,
  onNavigateChampionship,
  onNavigateHighlights,
  onNavigateArchives,
  onNavigateManageHomepage,
  onSelectTeam,
}) {
  const slides = homepageData?.carousel?.length ? homepageData.carousel : [];
  const jerseys = homepageData?.jerseys || {};
  const customFixtures = homepageData?.upcoming_fixtures || [];

  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedFixtureCat, setSelectedFixtureCat] = useState('all');
  const [lightboxImage, setLightboxImage] = useState(null);

  useEffect(() => {
    if (slides.length <= 1 || isPaused) return;
    const timer = setInterval(() => {
      setActiveSlideIdx((prev) => (prev + 1) % slides.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [slides.length, isPaused]);

  useEffect(() => {
    if (activeSlideIdx >= slides.length && slides.length > 0) {
      setActiveSlideIdx(0);
    }
  }, [slides.length, activeSlideIdx]);

  // Combine custom upcoming fixtures (internal, friendly, tournament, league, cup)
  // with live unplayed League & Cup fixtures from tournament categories
  const allUpcomingFixtures = useMemo(() => {
    const list = [...customFixtures];

    Object.entries(categoriesData || {}).forEach(([catKey, cat]) => {
      const teamNameMap = {};
      (cat.teams || []).forEach((t) => {
        teamNameMap[t.id] = t.name;
      });

      if (cat.mode === 'league') {
        (cat.fixtures || [])
          .filter((f) => !f.played && !f.walkover)
          .forEach((f) => {
            list.push({
              id: `LG-${catKey}-${f.id}`,
              category: 'league',
              title: `${cat.label} League Match`,
              home: teamNameMap[f.home] || f.home || 'TBD',
              away: teamNameMap[f.away] || f.away || 'TBD',
              homeTeamId: f.home,
              awayTeamId: f.away,
              categoryKey: catKey,
              date: f.date || 'Upcoming',
              venue: 'Ruiru Stadium',
            });
          });
      } else if (cat.mode === 'cup') {
        Object.entries(cat.groupFixtures || {}).forEach(([gLetter, gList]) => {
          (gList || [])
            .filter((f) => !f.played && !f.walkover)
            .forEach((f) => {
              list.push({
                id: `CUP-G-${catKey}-${f.id}`,
                category: 'cup',
                title: `${cat.label} • Group ${gLetter}`,
                home: teamNameMap[f.home] || f.home || 'TBD',
                away: teamNameMap[f.away] || f.away || 'TBD',
                homeTeamId: f.home,
                awayTeamId: f.away,
                categoryKey: catKey,
                date: f.date || 'Upcoming',
                venue: 'Ruiru Main Arena',
              });
            });
        });

        (cat.rounds || []).forEach((roundTies, rIdx) => {
          (roundTies || []).forEach((tie) => {
            if (tie && !tie.match?.played) {
              list.push({
                id: `CUP-KO-${catKey}-${tie.id || rIdx}`,
                category: 'cup',
                title: `${cat.label} • ${tie.stage || 'Knockout Stage'}`,
                home: teamNameMap[tie.home] || tie.home || 'Qualifier TBD',
                away: teamNameMap[tie.away] || tie.away || 'Qualifier TBD',
                homeTeamId: tie.home,
                awayTeamId: tie.away,
                categoryKey: catKey,
                date: tie.date || 'Upcoming',
                venue: 'Ruiru Main Arena',
              });
            }
          });
        });
      }
    });

    return list;
  }, [customFixtures, categoriesData]);

  const filteredFixtures = useMemo(() => {
    if (selectedFixtureCat === 'all') return allUpcomingFixtures;
    return allUpcomingFixtures.filter(
      (f) => (f.category || '').toLowerCase() === selectedFixtureCat.toLowerCase()
    );
  }, [allUpcomingFixtures, selectedFixtureCat]);

  const currentSlide = slides[activeSlideIdx] || null;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '22px',
        alignItems: 'start',
      }}
    >
      {/* Full-width stacked layout for carousels and sidebar */}
      <style>{`
        .club-home-grid {
          display: flex !important;
          flex-direction: column !important;
          width: 100% !important;
          gap: 28px !important;
        }
        .club-home-carousels {
          width: 100% !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 26px !important;
        }
        .club-home-sidebar {
          width: 100% !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
          position: static !important;
        }
        @media (max-width: 680px) {
          .jersey-slide-card {
            grid-template-columns: 1fr !important;
            gap: 12px !important;
          }
        }
      `}</style>

      <div className="club-home-grid" style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '28px', width: '100%' }}>
        {/* CAROUSELS SECTION (WIDTH 100%): HERO GALLERY CAROUSEL + U13, U15, U17, WAZAE JERSEY CAROUSELS */}
        <div className="club-home-carousels" style={{ display: 'flex', flexDirection: 'column', gap: '26px', width: '100%', minWidth: 0 }}>
          {/* 1. ADMIN PICTURE CAROUSEL (WIDTH 100%) */}
          <section
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            style={{
              background: '#0F2E24',
              border: '1px solid #2B5746',
              borderRadius: '18px',
              overflow: 'hidden',
              position: 'relative',
              width: '100%',
              boxShadow: '0 18px 40px rgba(0, 0, 0, 0.4)',
            }}
          >
            {currentSlide ? (
              <div
                style={{
                  position: 'relative',
                  minHeight: '380px',
                  height: '460px',
                  maxHeight: '540px',
                  width: '100%',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                }}
              >
                {/* Ambient Blurred Backdrop: fills container without cropping distortion */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: `url(${currentSlide.image})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(22px) brightness(0.35)',
                    transform: 'scale(1.08)',
                    zIndex: 0,
                  }}
                />

                {/* Main Uploaded Picture: strictly contained within bounds */}
                <img
                  src={currentSlide.image}
                  alt={currentSlide.title || 'Ruiru Titans Gallery'}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    objectPosition: 'center',
                    zIndex: 1,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(180deg, rgba(6,22,16,0.1) 0%, rgba(6,22,16,0.6) 55%, rgba(6,22,16,0.95) 100%)',
                    zIndex: 2,
                  }}
                />

                {/* Top Bar Over Carousel */}
                <div
                  style={{
                    position: 'absolute',
                    top: '16px',
                    left: '20px',
                    right: '20px',
                    zIndex: 3,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <span
                    style={{
                      background: 'rgba(201, 162, 39, 0.92)',
                      color: '#10221B',
                      fontSize: '10.5px',
                      fontWeight: 900,
                      padding: '4px 12px',
                      borderRadius: '999px',
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                    }}
                  >
                    📸 {currentSlide.tag || 'CLUB GALLERY'} • SLIDE {activeSlideIdx + 1}/{slides.length}
                  </span>

                  {(isCmsMode || cmsUser) && (
                    <button
                      type="button"
                      onClick={onNavigateManageHomepage}
                      style={{
                        background: 'rgba(15, 46, 36, 0.9)',
                        color: '#C9A227',
                        border: '1px solid #C9A227',
                        borderRadius: '999px',
                        padding: '5px 14px',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                      }}
                    >
                      🛠️ Upload / Manage Carousel Pictures
                    </button>
                  )}
                </div>

                {/* Slide Caption Content */}
                <div style={{ position: 'relative', zIndex: 2, padding: '28px 26px 22px' }}>
                  <h2
                    className="scoreboard"
                    style={{
                      fontSize: 'clamp(28px, 4.5vw, 44px)',
                      color: '#F4F2EA',
                      margin: '0 0 6px 0',
                      lineHeight: 1.05,
                      letterSpacing: '0.03em',
                    }}
                  >
                    {currentSlide.title}
                  </h2>
                  {currentSlide.subtitle && (
                    <p style={{ fontSize: '14px', color: '#C2D6CB', margin: '0 0 18px 0', maxWidth: '680px', lineHeight: 1.5 }}>
                      {currentSlide.subtitle}
                    </p>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={onNavigateChampionship}
                        style={{
                          background: '#C9A227',
                          color: '#16201B',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '10px 18px',
                          fontSize: '12.5px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          boxShadow: '0 4px 14px rgba(201,162,39,0.35)',
                        }}
                      >
                        🏆 Go to Championship Hub →
                      </button>
                      {onNavigateHighlights && (
                        <button
                          type="button"
                          onClick={onNavigateHighlights}
                          style={{
                            background: '#163E31',
                            color: '#F4F2EA',
                            border: '1px solid #2F7D5C',
                            borderRadius: '8px',
                            padding: '10px 16px',
                            fontSize: '12.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          🎥 Match Highlights
                        </button>
                      )}
                      {onNavigateArchives && (
                        <button
                          type="button"
                          onClick={onNavigateArchives}
                          style={{
                            background: '#113328',
                            color: '#C9A227',
                            border: '1px solid #2B5746',
                            borderRadius: '8px',
                            padding: '10px 16px',
                            fontSize: '12.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          🏛️ Archives
                        </button>
                      )}
                    </div>

                    {/* Prev / Next & Dots */}
                    {slides.length > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                          type="button"
                          aria-label="Previous slide"
                          onClick={() => setActiveSlideIdx((prev) => (prev - 1 + slides.length) % slides.length)}
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            background: 'rgba(22, 53, 42, 0.85)',
                            border: '1px solid #2B5746',
                            color: '#F4F2EA',
                            cursor: 'pointer',
                            fontWeight: 900,
                          }}
                        >
                          ‹
                        </button>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {slides.map((s, idx) => (
                            <button
                              key={s.id || idx}
                              type="button"
                              aria-label={`Slide ${idx + 1}`}
                              onClick={() => setActiveSlideIdx(idx)}
                              style={{
                                width: idx === activeSlideIdx ? '24px' : '8px',
                                height: '8px',
                                borderRadius: '999px',
                                border: 'none',
                                background: idx === activeSlideIdx ? '#C9A227' : 'rgba(255,255,255,0.3)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                              }}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          aria-label="Next slide"
                          onClick={() => setActiveSlideIdx((prev) => (prev + 1) % slides.length)}
                          style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            background: 'rgba(22, 53, 42, 0.85)',
                            border: '1px solid #2B5746',
                            color: '#F4F2EA',
                            cursor: 'pointer',
                            fontWeight: 900,
                          }}
                        >
                          ›
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: '48px 24px', textAlign: 'center', color: '#8FA89B' }}>
                No carousel pictures uploaded yet. Sign in to CMS Admin to upload club pictures.
              </div>
            )}
          </section>

          {/* 2. JERSEY PHOTO CAROUSELS: U13, U15, U17, WAZAE (SLIDING AT DIFFERENT SPEEDS) */}
          {JERSEY_ROWS.map((row) => (
            <JerseyRowCarousel
              key={row.key}
              row={row}
              photos={jerseys[row.key] || []}
              onPhotoClick={(item) => setLightboxImage(item)}
              isCmsMode={isCmsMode}
              cmsUser={cmsUser}
              onNavigateManageHomepage={onNavigateManageHomepage}
            />
          ))}
        </div>

        {/* MATCHDAY FIXTURES SECTION: POSITIONED BELOW CAROUSELS WITH FULL WIDTH (100%) */}
        <aside
          className="club-home-sidebar"
          style={{
            background: '#0F2E24',
            border: '1px solid #2B5746',
            borderRadius: '16px',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            boxShadow: '0 14px 32px rgba(0, 0, 0, 0.35)',
          }}
        >
          <div style={{ borderBottom: '1px solid #16352A', paddingBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#C9A227', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  ⚡ MATCHDAY FIXTURES &amp; UPCOMING SCHEDULE
                </span>
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    color: '#6CE5A0',
                    background: 'rgba(63, 122, 78, 0.2)',
                    padding: '2px 8px',
                    borderRadius: '999px',
                  }}
                >
                  {filteredFixtures.length} Upcoming
                </span>
              </div>
              <h3 className="scoreboard" style={{ fontSize: '26px', color: '#F4F2EA', margin: '4px 0 2px', letterSpacing: '0.04em' }}>
                UPCOMING FIXTURES
              </h3>
              <div style={{ fontSize: '12px', color: '#8FA89B' }}>
                Complete schedule across Internal, Friendly, Tournament, League &amp; Cup
              </div>
            </div>

            {/* Category Filter Pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {FIXTURE_CATEGORIES.map((catOpt) => {
                const isSelected = selectedFixtureCat === catOpt.key;
                return (
                  <button
                    key={catOpt.key}
                    type="button"
                    onClick={() => setSelectedFixtureCat(catOpt.key)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '999px',
                      fontSize: '11px',
                      fontWeight: 800,
                      cursor: 'pointer',
                      border: isSelected ? '1px solid #C9A227' : '1px solid #1E4636',
                      background: isSelected ? '#C9A227' : '#08231B',
                      color: isSelected ? '#16201B' : '#9BB5A8',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {catOpt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fixtures List - Responsive Grid Spanning Full Width */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '14px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {filteredFixtures.length === 0 ? (
              <div
                style={{
                  gridColumn: '1 / -1',
                  padding: '36px 16px',
                  textAlign: 'center',
                  color: '#8FA89B',
                  border: '1px dashed #2B4E40',
                  borderRadius: '12px',
                  fontSize: '13px',
                }}
              >
                No upcoming {selectedFixtureCat !== 'all' ? selectedFixtureCat : ''} fixtures scheduled.
              </div>
            ) : (
              filteredFixtures.map((fix, idx) => {
                const catMeta =
                  FIXTURE_CATEGORIES.find((c) => c.key === (fix.category || '').toLowerCase()) ||
                  FIXTURE_CATEGORIES[4];
                return (
                  <div
                    key={fix.id || idx}
                    style={{
                      background: '#08231B',
                      border: '1px solid #16352A',
                      borderRadius: '10px',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '9.5px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: catMeta.bg || 'rgba(201,162,39,0.15)',
                          color: catMeta.color || '#C9A227',
                        }}
                      >
                        {catMeta.label}
                      </span>
                      <span style={{ fontSize: '10.5px', color: '#C9A227', fontWeight: 700 }}>
                        🗓️ {fix.date}
                      </span>
                    </div>

                    {fix.title && (
                      <div style={{ fontSize: '10.5px', color: '#8FA89B', fontWeight: 600 }}>
                        {fix.title}
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        padding: '4px 0',
                      }}
                    >
                      {onSelectTeam && fix.homeTeamId ? (
                        <button
                          type="button"
                          className="team-link-btn"
                          onClick={() => onSelectTeam(fix.homeTeamId, fix.categoryKey)}
                          style={{ fontSize: '12.5px', fontWeight: 800, color: '#F4F2EA', textAlign: 'left', flex: 1 }}
                          title={`Click to view ${fix.home} profile & tournament odds`}
                        >
                          {fix.home}
                        </button>
                      ) : (
                        <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#F4F2EA', flex: 1 }}>
                          {fix.home}
                        </span>
                      )}
                      <span
                        className="scoreboard"
                        style={{
                          fontSize: '12px',
                          padding: '2px 7px',
                          borderRadius: '4px',
                          background: '#16352A',
                          color: '#C9A227',
                        }}
                      >
                        VS
                      </span>
                      {onSelectTeam && fix.awayTeamId ? (
                        <button
                          type="button"
                          className="team-link-btn"
                          onClick={() => onSelectTeam(fix.awayTeamId, fix.categoryKey)}
                          style={{ fontSize: '12.5px', fontWeight: 800, color: '#F4F2EA', textAlign: 'right', justifyContent: 'flex-end', flex: 1 }}
                          title={`Click to view ${fix.away} profile & tournament odds`}
                        >
                          {fix.away}
                        </button>
                      ) : (
                        <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#F4F2EA', flex: 1, textAlign: 'right' }}>
                          {fix.away}
                        </span>
                      )}
                    </div>

                    {fix.venue && (
                      <div style={{ fontSize: '10.5px', color: '#6E9080' }}>
                        📍 {fix.venue}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={onNavigateChampionship}
            style={{
              width: '100%',
              background: '#16352A',
              color: '#C9A227',
              border: '1px solid #2B5746',
              borderRadius: '8px',
              padding: '10px',
              fontSize: '12px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            🏆 Open Championship Hub (Tables &amp; Brackets) →
          </button>
        </aside>
      </div>

      {/* Lightbox Modal for Jersey Photo Preview */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(4, 14, 10, 0.85)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0F2E24',
              border: '2px solid #C9A227',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '20px',
              textAlign: 'center',
            }}
          >
            <img
              src={lightboxImage.image}
              alt={lightboxImage.title}
              style={{ width: '100%', maxHeight: '380px', objectFit: 'contain', borderRadius: '10px' }}
            />
            <h3 className="scoreboard" style={{ fontSize: '24px', color: '#F4F2EA', margin: '12px 0 4px' }}>
              {lightboxImage.title}
            </h3>
            {lightboxImage.subtitle && (
              <p style={{ fontSize: '13px', color: '#8FA89B', margin: '0 0 14px' }}>{lightboxImage.subtitle}</p>
            )}
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              style={{
                background: '#C9A227',
                color: '#16201B',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 20px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Close Preview
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
