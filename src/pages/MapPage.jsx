import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlaces } from '../hooks/usePlaces';
import { useLanguage } from '../contexts/LanguageContext';
import SearchBar from '../components/SearchBar';
import LoadingSpinner from '../components/LoadingSpinner';
import './MapPage.css';

export default function MapPage() {
  const mapRef = useRef(null);
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();
  const { places, loading, refreshPlaces } = usePlaces();

  const [refreshing, setRefreshing] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  
  const googleMapInstance = useRef(null);
  const markersRef = useRef([]);

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'my' : 'en');
  };

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

  // Get user location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        () => {
          // Default to Banting/KL if blocked
          setUserLocation({ lat: 2.8052599, lng: 101.6337967 });
        }
      );
    } else {
      setUserLocation({ lat: 2.8052599, lng: 101.6337967 });
    }
  }, []);

  // Load Google Maps Script
  useEffect(() => {
    if (window.google && window.google.maps) {
      setMapLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=AIzaSyBVUD9LEGPnkIDxhML4vzwAaJ2CtP37orA&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => setMapLoaded(true);
    document.head.appendChild(script);

    return () => {
      // Clean up script if component unmounts before loading completes
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  // Custom Zoom Handlers
  const zoomIn = () => {
    if (googleMapInstance.current) {
      googleMapInstance.current.setZoom(googleMapInstance.current.getZoom() + 1);
    }
  };

  const zoomOut = () => {
    if (googleMapInstance.current) {
      googleMapInstance.current.setZoom(googleMapInstance.current.getZoom() - 1);
    }
  };

  const recenter = () => {
    if (googleMapInstance.current && userLocation) {
      googleMapInstance.current.setCenter(userLocation);
      googleMapInstance.current.setZoom(12);
      setSelectedPlace(null);
    }
  };

  // Initialize Map
  useEffect(() => {
    if (!mapLoaded || !userLocation || !mapRef.current) return;

    const defaultCenter = userLocation;
    const mapOptions = {
      center: defaultCenter,
      zoom: 12,
      mapId: 'ronda_map_id',
      fullscreenControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      zoomControl: false // Disable default zoom controls to use our custom ones
    };

    googleMapInstance.current = new window.google.maps.Map(mapRef.current, mapOptions);

    // Place user location marker
    new window.google.maps.Marker({
      position: defaultCenter,
      map: googleMapInstance.current,
      title: "Your Location",
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#0f9e9a",
        fillOpacity: 1,
        strokeWeight: 3,
        strokeColor: "#ffffff",
      }
    });

  }, [mapLoaded, userLocation]);

  // Compute filtered places for consistency
  const filteredPlaces = places.filter(place => {
    const matchesSearch = searchQuery.trim() === '' || 
      place.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      place.address?.toLowerCase().includes(searchQuery.toLowerCase());
      
    const matchesCategory = !activeCategory || 
      place.categoryName?.toLowerCase() === activeCategory.toLowerCase();
      
    return matchesSearch && matchesCategory;
  });

  // Update Markers based on filters
  useEffect(() => {
    if (!googleMapInstance.current || !places || !mapLoaded) return;

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    const infowindow = new window.google.maps.InfoWindow();
    const bounds = new window.google.maps.LatLngBounds();
    let hasMarkers = false;

    // Add new markers
    filteredPlaces.forEach(place => {
      const lat = place.location?.lat || place.location?._lat;
      const lng = place.location?.lng || place.location?._lng;

      if (!lat || !lng) return;

      const markerColor = getCategoryColor(place.categoryName);
      const position = { lat: parseFloat(lat), lng: parseFloat(lng) };
      
      const marker = new window.google.maps.Marker({
        position: position,
        map: googleMapInstance.current,
        title: place.title,
        icon: {
          path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
          fillColor: markerColor,
          fillOpacity: 1,
          strokeWeight: 1,
          strokeColor: '#ffffff',
          scale: 1.8,
          anchor: new window.google.maps.Point(12, 21),
        }
      });

      bounds.extend(position);
      hasMarkers = true;

      // Marker click popup
      marker.addListener('click', () => {
        setSelectedPlace(place);
        googleMapInstance.current.panTo(position);

        const contentString = `
          <div style="font-family: var(--font-body); padding: 5px; max-width: 200px; display: flex; flex-direction: column; gap: 6px;">
            <img src="${place.imageUrl}" style="width: 100%; height: 90px; object-fit: cover; border-radius: 8px;" />
            <h4 style="font-size: 13px; font-weight: 700; margin: 0; color: var(--color-brown-dark);">${place.title}</h4>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 11px; font-weight: 700; color: var(--color-primary);">★ ${place.totalScore || '5.0'}</span>
              <button id="infowindow-btn-${place.id}" style="background-color: var(--color-primary); color: white; border: none; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer;">
                Details
              </button>
            </div>
          </div>
        `;

        infowindow.setContent(contentString);
        infowindow.open(googleMapInstance.current, marker);

        // Bind button click navigate inside infowindow
        window.google.maps.event.addListener(infowindow, 'domready', () => {
          const btn = document.getElementById(`infowindow-btn-${place.id}`);
          if (btn) {
            btn.addEventListener('click', () => {
              navigate(`/place/${place.id}`);
            });
          }
        });
      });

      markersRef.current.push(marker);
    });

    // Auto-fit bounds if filter is active
    if (hasMarkers && googleMapInstance.current && (searchQuery.trim() !== '' || activeCategory !== null)) {
      googleMapInstance.current.fitBounds(bounds);
      
      // Limit zoom to a reasonable level so map isn't excessively zoomed in for a single result
      const listener = window.google.maps.event.addListener(googleMapInstance.current, 'idle', () => {
        if (googleMapInstance.current.getZoom() > 14) {
          googleMapInstance.current.setZoom(14);
        }
        window.google.maps.event.removeListener(listener);
      });
    }

  }, [places, mapLoaded, searchQuery, activeCategory, navigate]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setActiveCategory(null);
    setSelectedPlace(null);
    if (googleMapInstance.current && userLocation) {
      googleMapInstance.current.setCenter(userLocation);
      googleMapInstance.current.setZoom(12);
    }
  };

  const getCategoryColor = (category) => {
    switch (category?.toLowerCase()) {
      case 'eateries': return '#0f9e9a'; // primary teal
      case 'shop': return '#25a4a0'; // light teal
      case 'hotel': return '#372018'; // dark brown
      default: return '#f0ad4e'; // orange for activity/others
    }
  };

  const categories = [
    { id: 'eateries', label: t('eateries'), icon: '/Entites/food icon.png' },
    { id: 'shop', label: t('shop'), icon: '/Entites/shopping icon.png' },
    { id: 'activity', label: t('activity'), icon: '/Entites/activity icon.png' },
    { id: 'hotel', label: t('hotel'), icon: '/Entites/Hotel Icon.png' }
  ];

  return (
    <div 
      className="map-page app-content"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {refreshing && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '15px 0', gap: '8px', alignItems: 'center', backgroundColor: 'var(--bg-color-card)', position: 'absolute', top: '0', left: '0', right: '0', zIndex: '1000' }}>
          <div className="ronda-spinner" style={{ width: '20px', height: '20px', border: '3px solid var(--border-color)', borderTopColor: 'var(--color-primary)' }}></div>
          <span style={{ fontSize: '13px', color: 'var(--text-color-muted)', fontWeight: 'bold' }}>{t('loading')}</span>
        </div>
      )}
      {/* Floating Top Elements */}
      <div className="map-floating-top-left" style={{ position: 'absolute', top: '20px', left: '20px', zIndex: '100' }}>
        <img src="/Entites/Small Logo (White).png" alt="Logo" className="map-floating-logo" style={{ width: '40px', height: '40px', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.15))' }} />
      </div>

      <div className="map-floating-top-right" style={{ position: 'absolute', top: '20px', right: '20px', zIndex: '100' }}>
        <div className="lang-pill dark" onClick={toggleLanguage}>
          <span className={language === 'my' ? 'active' : ''}>MY</span>
          <span className={language === 'en' ? 'active' : ''}>EN</span>
        </div>
      </div>

      {/* Floating Recenter Control (White round target on the left, offset higher to clear preview card) */}
      <button 
        className="map-floating-recenter-btn" 
        onClick={recenter}
        style={{ position: 'absolute', bottom: '380px', left: '20px', zIndex: '100', width: '44px', height: '44px', borderRadius: '50%', border: 'none', backgroundColor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-md)', cursor: 'pointer', fontSize: '18px', color: 'var(--color-primary)' }}
      >
        🎯
      </button>

      {/* Floating Zoom Controls (Teal round buttons on the right, offset higher to clear preview card) */}
      <div className="map-floating-zoom-controls" style={{ position: 'absolute', bottom: '370px', right: '20px', zIndex: '100', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button 
          className="map-zoom-btn" 
          onClick={zoomOut}
          style={{ width: '44px', height: '44px', borderRadius: '50%', border: 'none', backgroundColor: 'var(--color-primary)', color: 'white', fontSize: '22px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-md)', cursor: 'pointer' }}
        >
          −
        </button>
        <button 
          className="map-zoom-btn" 
          onClick={zoomIn}
          style={{ width: '44px', height: '44px', borderRadius: '50%', border: 'none', backgroundColor: 'var(--color-primary)', color: 'white', fontSize: '22px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-md)', cursor: 'pointer' }}
        >
          +
        </button>
      </div>

      {/* Map Element */}
      <div className="google-map-element-container" ref={mapRef} style={{ width: '100%', height: '100%', zIndex: '5' }}>
        {(!mapLoaded || !userLocation) && (
          <div className="map-loading-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '15px' }}>
            <LoadingSpinner />
            <p>Locating & Initializing Maps...</p>
          </div>
        )}
      </div>

      {/* Floating Place Details Preview Card (slides up when marker is clicked) */}
      {selectedPlace && (
        <div className="map-place-preview-card fade-in" style={{
          position: 'absolute',
          bottom: '265px',
          left: '20px',
          right: '20px',
          backgroundColor: 'var(--bg-color-card)',
          borderRadius: '20px',
          padding: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
          zIndex: '150',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          border: '1px solid var(--border-color)',
          maxWidth: '440px',
          margin: '0 auto'
        }}>
          <img 
            src={selectedPlace.imageUrl} 
            alt={selectedPlace.title} 
            style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '12px' }} 
          />
          <div style={{ flex: '1', display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontWeight: '800', color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {selectedPlace.categoryName}
              </span>
              <button 
                onClick={() => setSelectedPlace(null)}
                style={{ border: 'none', background: 'transparent', fontSize: '16px', cursor: 'pointer', color: 'var(--text-color-muted)', padding: '0 4px', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>
            <h4 style={{ fontSize: '14px', fontWeight: '700', margin: '0', color: 'var(--text-color-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {selectedPlace.title}
            </h4>
            <p style={{ fontSize: '11px', color: 'var(--text-color-muted)', margin: '0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              📍 {selectedPlace.address}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', width: '100%' }}>
              <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--color-primary)' }}>
                ★ {selectedPlace.totalScore || '5.0'}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button 
                  onClick={() => {
                    const lat = selectedPlace.location?.lat || selectedPlace.location?._lat;
                    const lng = selectedPlace.location?.lng || selectedPlace.location?._lng;
                    const dirUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
                    window.open(dirUrl, '_blank');
                  }}
                  style={{ 
                    backgroundColor: 'transparent', 
                    color: 'var(--color-primary)', 
                    border: '1.5px solid var(--color-primary)', 
                    padding: '5px 10px', 
                    borderRadius: '8px', 
                    fontSize: '11px', 
                    fontWeight: '700', 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  🧭 Navigate
                </button>
                <button 
                  onClick={() => navigate(`/place/${selectedPlace.id}`)}
                  style={{ 
                    backgroundColor: 'var(--color-primary)', 
                    color: 'white', 
                    border: 'none', 
                    padding: '6px 12px', 
                    borderRadius: '8px', 
                    fontSize: '11px', 
                    fontWeight: '700', 
                    cursor: 'pointer'
                  }}
                >
                  Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Curved White Bottom Card Overlay */}
      <div className="map-bottom-card-overlay" style={{ position: 'absolute', bottom: '70px', left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '480px', backgroundColor: 'var(--bg-color-card)', borderTopLeftRadius: '32px', borderTopRightRadius: '32px', padding: '24px 20px 15px 20px', boxShadow: '0 -8px 24px rgba(0,0,0,0.1)', zIndex: '50', display: 'flex', flexDirection: 'column', gap: '14px', border: '1px solid var(--border-color)', borderBottom: 'none' }}>
        
        {/* Results Counter and Clear Filters controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '-4px', padding: '0 4px' }}>
          <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-color-muted)' }}>
            {filteredPlaces.length} {filteredPlaces.length === 1 ? 'place' : 'places'} found
          </span>
          {(searchQuery || activeCategory) && (
            <button 
              onClick={handleClearFilters}
              style={{ border: 'none', background: 'transparent', fontSize: '11px', fontWeight: '800', color: 'var(--color-primary)', cursor: 'pointer', padding: '0' }}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Search bar inside bottom card */}
        <div className="map-search-bar-wrapper" style={{ width: '100%' }}>
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>

        {/* Categories picker inside bottom card */}
        <div className="map-categories-picker-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          {categories.map(cat => (
            <div 
              key={cat.id} 
              className={`map-cat-picker-item-container ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => {
                setActiveCategory(activeCategory === cat.id ? null : cat.id);
                setSelectedPlace(null);
              }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', gap: '4px' }}
            >
              <div 
                className="map-cat-picker-circle"
                style={{ 
                  width: '56px', 
                  height: '56px', 
                  borderRadius: '50%', 
                  backgroundColor: activeCategory === cat.id ? 'var(--color-primary)' : 'var(--color-brown-dark)', 
                  border: activeCategory === cat.id ? '2px solid var(--color-primary)' : '2px solid var(--color-brown-dark)', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  transition: 'all 0.2s' 
                }}
              >
                <img src={cat.icon} alt={cat.label} className="map-cat-picker-img" style={{ width: '26px', height: '26px', objectFit: 'contain' }} />
              </div>
              <span className="map-cat-picker-label" style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-color-main)' }}>{cat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
