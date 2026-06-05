import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { usePlaces } from '../hooks/usePlaces';
import { useAuth } from '../contexts/AuthContext';
import SearchBar from '../components/SearchBar';
import PlaceCard from '../components/PlaceCard';
import LoadingSpinner from '../components/LoadingSpinner';
import './HomePage.css';

export default function HomePage() {
  const { t, language, setLanguage } = useLanguage();
  const { places, loading, refreshPlaces } = usePlaces();
  const { userProfile } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(null); // null means all
  const [savedPlaceIds, setSavedPlaceIds] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  useEffect(() => {
    if (userProfile && userProfile.likedPlaces) {
      setSavedPlaceIds(userProfile.likedPlaces);
    }
  }, [userProfile]);

  const handleTouchStart = (e) => {
    setTouchEnd(null);
    if (window.scrollY === 0) {
      setTouchStart(e.targetTouches[0].clientY);
    } else {
      setTouchStart(null);
    }
  };

  const handleTouchMove = (e) => {
    if (!touchStart) return;
    setTouchEnd(e.targetTouches[0].clientY);
  };

  const handleTouchEnd = async () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchEnd - touchStart;
    if (distance > 70 && !refreshing) {
      setRefreshing(true);
      if (refreshPlaces) {
        await refreshPlaces();
      }
      setRefreshing(false);
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'my' : 'en');
  };

  const handleLikeToggle = (placeId, isNowLiked) => {
    if (isNowLiked) {
      setSavedPlaceIds(prev => [...prev, placeId]);
    } else {
      setSavedPlaceIds(prev => prev.filter(id => id !== placeId));
    }
  };

  // Filter places based on search and category
  const filteredPlaces = places.filter(place => {
    const matchesSearch = searchQuery.trim() === '' || 
      place.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (place.address && place.address.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (place.state && place.state.toLowerCase().includes(searchQuery.toLowerCase()));
      
    const matchesCategory = !activeCategory || 
      place.categoryName?.toLowerCase() === activeCategory.toLowerCase();
      
    return matchesSearch && matchesCategory;
  });

  // Get Top Destinations (sort by totalScore desc)
  const topDestinations = [...places]
    .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0))
    .slice(0, 5);

  // Recommended places (sort by reviewsCount desc or fallback)
  const recommendedPlaces = [...filteredPlaces]
    .sort((a, b) => (b.reviewsCount || 0) - (a.reviewsCount || 0));

  const categories = [
    { id: 'eateries', label: t('eateries'), icon: '/Entites/food icon.png' },
    { id: 'shop', label: t('shop'), icon: '/Entites/shopping icon.png' },
    { id: 'activity', label: t('activity'), icon: '/Entites/activity icon.png' },
    { id: 'hotel', label: t('hotel'), icon: '/Entites/Hotel Icon.png' }
  ];

  return (
    <div 
      className="home-page app-content"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Hero Banner Header */}
      <div className="home-hero-banner" style={{ backgroundImage: `linear-gradient(rgba(55, 32, 24, 0.4), rgba(55, 32, 24, 0.2)), url('https://images.unsplash.com/photo-1596422846543-75c6fc197f07?q=80&w=600&auto=format&fit=crop')` }}>
        <div className="home-banner-top">
          <div className="lang-pill" onClick={toggleLanguage}>
            <span className={language === 'my' ? 'active' : ''}>MY</span>
            <span className={language === 'en' ? 'active' : ''}>EN</span>
          </div>
        </div>
        <div className="home-banner-center">
          <h2 className="banner-welcome">WELCOME TO</h2>
          <div className="banner-ronda-logo-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/Entites/Main Logo (White).png" alt="RONDA" style={{ height: '55px', objectFit: 'contain' }} />
          </div>
        </div>
        
        {/* Integrated Search Bar inside hero area for neat layouts */}
        <div className="hero-search-wrapper">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>
      </div>

      {/* Main content body in white curve background style */}
      <div className="home-body-content">
        {refreshing && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '15px 0', gap: '8px', alignItems: 'center' }}>
            <div className="ronda-spinner" style={{ width: '20px', height: '20px', border: '3px solid var(--border-color)', borderTopColor: 'var(--color-primary)' }}></div>
            <span style={{ fontSize: '13px', color: 'var(--text-color-muted)', fontWeight: 'bold' }}>{t('loading')}</span>
          </div>
        )}
        {/* Category Picker */}
        <div className="category-section">
          <h3 className="section-title">{t('findPerfectPlace')}</h3>
          <div className="category-row">
            {categories.map((cat) => (
              <div 
                key={cat.id} 
                className={`category-item-container ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
              >
                <div className="category-circle-btn">
                  <img src={cat.icon} alt={cat.label} className="category-icon-img" />
                </div>
                <span className="category-label">{cat.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Destination Carousel */}
        {!activeCategory && searchQuery.trim() === '' && (
          <div className="top-destination-section">
            <h3 className="section-title">{t('topDestination')}</h3>
            <div className="carousel-wrapper">
              {loading ? (
                <div className="carousel-loading shimmer" style={{ height: '180px', borderRadius: '20px' }}></div>
              ) : (
                topDestinations.map(place => (
                  <PlaceCard 
                    key={place.id} 
                    place={place} 
                    layout="top" 
                    isLiked={savedPlaceIds.includes(place.id)}
                    onLikeToggle={handleLikeToggle}
                  />
                ))
              )}
            </div>
            <div className="carousel-dots">
              <span className="dot active"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </div>
          </div>
        )}

        {/* Recommended Places */}
        <div className="recommended-section">
          <h3 className="section-title">
            {activeCategory || searchQuery.trim() !== '' ? 'FILTERED RESULTS' : t('recommendedForYou')}
          </h3>
          
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[...Array(3)].map((_, i) => (
                <div key={i} className="shimmer" style={{ height: '100px', borderRadius: '20px' }}></div>
              ))}
            </div>
          ) : recommendedPlaces.length === 0 ? (
            <div className="no-results-placeholder">No places match your search criteria.</div>
          ) : (
            <div className="recommended-grid">
              {recommendedPlaces.map(place => (
                <PlaceCard 
                  key={place.id} 
                  place={place} 
                  layout="recommended" 
                  isLiked={savedPlaceIds.includes(place.id)}
                  onLikeToggle={handleLikeToggle}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
