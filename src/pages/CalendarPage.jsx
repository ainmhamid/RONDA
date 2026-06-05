import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { usePlaces } from '../hooks/usePlaces';
import { db, storage } from '../firebase/config';
import { collection, query, where, getDocs, doc, addDoc, deleteDoc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import StarRating from '../components/StarRating';
import LoadingSpinner from '../components/LoadingSpinner';
import './CalendarPage.css';

export default function CalendarPage() {
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { places, addPlaceReview, refreshPlaces } = usePlaces();

  const [refreshing, setRefreshing] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const [activeSubTab, setActiveSubTab] = useState('planner'); // 'previous', 'planner', 'save'
  
  // Calendar states
  const getLocalDateString = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(getLocalDateString(new Date()));
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [draggedOverHour, setDraggedOverHour] = useState(null);

  // Modal forms
  const [showAddPlanModal, setShowAddPlanModal] = useState(false);
  const [newPlanHour, setNewPlanHour] = useState('10:00');
  const [newPlanTitle, setNewPlanTitle] = useState('');
  const [newPlanPlaceId, setNewPlanPlaceId] = useState('');

  // Previous Trips states
  const [previousTrips, setPreviousTrips] = useState([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewTripId, setReviewTripId] = useState(null);
  const [reviewPlaceId, setReviewPlaceId] = useState('');
  const [reviewPlaceTitle, setReviewPlaceTitle] = useState('');
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewImages, setReviewImages] = useState([]);
  const [uploadingReviewImages, setUploadingReviewImages] = useState(false);
  
  // Liked Places states
  const [likedPlacesList, setLikedPlacesList] = useState([]);

  // Fetch plans from Firestore
  const fetchPlans = async () => {
    if (!currentUser) return;
    setLoadingPlans(true);
    try {
      const q = query(
        collection(db, 'planner'), 
        where('uid', '==', currentUser.uid)
      );
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPlans(data);
      
      // Categorise into previous trips (if date is in the past)
      const nowStr = new Date().toISOString().split('T')[0]; // Current date
      const prev = data.filter(p => p.date < nowStr);
      setPreviousTrips(prev);

    } catch (err) {
      console.error("Error fetching plans:", err);
    } finally {
      setLoadingPlans(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, [currentUser]);

  // Load Liked places details
  useEffect(() => {
    if (places.length > 0 && userProfile && userProfile.likedPlaces) {
      const liked = places.filter(p => userProfile.likedPlaces.includes(p.id));
      setLikedPlacesList(liked);
    }
  }, [places, userProfile]);

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
      await fetchPlans();
      if (refreshPlaces) {
        await refreshPlaces();
      }
      setRefreshing(false);
    }
  };

  // Helper calendar calculations
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

  const handlePrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleDaySelect = (day) => {
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const dateStr = `${currentDate.getFullYear()}-${month}-${day.toString().padStart(2, '0')}`;
    setSelectedDate(dateStr);
  };

  // Add hourly plan
  const handleAddPlanSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser || !newPlanTitle.trim()) return;

    try {
      await addDoc(collection(db, 'planner'), {
        uid: currentUser.uid,
        date: selectedDate,
        time: newPlanHour,
        title: newPlanTitle,
        placeId: newPlanPlaceId,
        createdAt: new Date().toISOString()
      });

      setShowAddPlanModal(false);
      setNewPlanTitle('');
      setNewPlanPlaceId('');
      fetchPlans();
    } catch (err) {
      console.error("Error adding plan:", err);
    }
  };

  // Delete hourly plan
  const handleDeletePlan = async (planId) => {
    if (!window.confirm("Are you sure you want to delete this event?")) return;
    try {
      await deleteDoc(doc(db, 'planner', planId));
      fetchPlans();
    } catch (err) {
      console.error(err);
    }
  };

  // Open write review for previous trip place
  const handleOpenReview = (trip) => {
    setReviewTripId(trip.id);
    setReviewPlaceId(trip.placeId || 'general');
    setReviewPlaceTitle(trip.title);
    setReviewText('');
    setReviewRating(5);
    setReviewImages([]);
    setShowReviewModal(true);
  };

  // Upload review image(s) to Firebase Storage
  const handleReviewImagesChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    setUploadingReviewImages(true);
    try {
      const urls = [];
      for (const file of files) {
        const storageRef = ref(storage, `Reviews/${Date.now()}_${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        urls.push(downloadURL);
      }
      setReviewImages(prev => [...prev, ...urls]);
    } catch (err) {
      console.error("Error uploading review images:", err);
      alert("Error uploading image(s): " + err.message);
    } finally {
      setUploadingReviewImages(false);
    }
  };

  // Submit review
  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
      const reviewData = {
        name: userProfile?.username || "Explorer",
        stars: reviewRating,
        rating: reviewRating, // compatibility key
        text: reviewText,
        publishAt: "Recently",
        isLocalGuide: (userProfile?.myReviews?.length || 0) > 30,
        reviewerPhotoUrl: userProfile?.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.uid}`,
        images: reviewImages
      };

      // 1. Add to place in Firestore (if place exists)
      if (reviewPlaceId && reviewPlaceId !== 'general') {
        await addPlaceReview(reviewPlaceId, reviewData);
      }

      // 2. Log review in user profile myReviews
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const currentReviews = userDoc.data().myReviews || [];
        await updateDoc(userRef, {
          myReviews: [
            {
              reviewId: `rev_${Date.now()}`,
              tripId: reviewTripId,
              placeId: reviewPlaceId,
              placeTitle: reviewPlaceTitle,
              rating: reviewRating,
              text: reviewText,
              createdAt: new Date().toISOString(),
              images: reviewImages
            },
            ...currentReviews
          ]
        });
      }

      // 3. Mark planner trip item reviewed status
      await updateDoc(doc(db, 'planner', reviewTripId), {
        reviewed: true,
        reviewText: reviewText,
        reviewRating: reviewRating,
        reviewCreatedAt: new Date().toISOString()
      });

      setShowReviewModal(false);
      fetchPlans();
      setReviewImages([]);
      alert(t('tripReviewedSuccess'));
    } catch (err) {
      console.error("Error submitting trip review:", err);
    }
  };

  // Redirect to Chatbot with "Plan Now"
  const handlePlanNow = (placeTitle) => {
    navigate(`/chatbot?prefill=${encodeURIComponent(placeTitle)}`);
  };

  // Drag and Drop handlers
  const handleDragStart = (e, plan) => {
    e.dataTransfer.setData('text/plain', plan.id);
  };

  const handleDragOver = (e, hour) => {
    e.preventDefault();
  };

  const handleDragEnter = (e, hour) => {
    e.preventDefault();
    setDraggedOverHour(hour);
  };

  const handleDragLeave = (e, hour) => {
    setDraggedOverHour(prev => prev === hour ? null : prev);
  };

  const handleDrop = async (e, targetHour) => {
    e.preventDefault();
    setDraggedOverHour(null);
    const planId = e.dataTransfer.getData('text/plain');
    if (!planId) return;

    const planToUpdate = plans.find(p => p.id === planId);
    if (!planToUpdate) return;

    // Check if the hour is already the same
    if (planToUpdate.time === targetHour) return;

    try {
      // Optimistic state update
      setPlans(prev => prev.map(p => {
        if (p.id === planId) {
          return { ...p, time: targetHour };
        }
        return p;
      }));

      // Update Firestore document
      const planDocRef = doc(db, 'planner', planId);
      await updateDoc(planDocRef, { time: targetHour });

      fetchPlans();
    } catch (err) {
      console.error("Error updating plan time:", err);
      fetchPlans();
    }
  };

  // Render Calendar Grid Helper
  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    
    const days = [];
    // Blank padding for first day offset
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
    }

    // Days grid
    for (let day = 1; day <= daysInMonth; day++) {
      const monthStr = (month + 1).toString().padStart(2, '0');
      const dateStr = `${year}-${monthStr}-${day.toString().padStart(2, '0')}`;
      const isSelected = selectedDate === dateStr;
      
      // Check if date has scheduled plans
      const hasPlans = plans.some(p => p.date === dateStr);

      days.push(
        <div 
          key={day} 
          className={`calendar-day ${isSelected ? 'selected' : ''} ${hasPlans ? 'has-plans' : ''}`}
          onClick={() => handleDaySelect(day)}
        >
          <span>{day}</span>
          {hasPlans && <span className="plan-dot"></span>}
        </div>
      );
    }

    return days;
  };

  // Hourly schedule mapper (08:00 to 22:00)
  const hoursList = [
    '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'
  ];

  // Map plans for currently selected date
  const selectedDatePlans = plans.filter(p => p.date === selectedDate);

  const monthNames = language === 'my' ? [
    "Januari", "Februari", "Mac", "April", "Mei", "Jun", 
    "Julai", "Ogos", "September", "Oktober", "November", "Disember"
  ] : [
    "January", "February", "March", "April", "May", "June", 
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <div 
      className="calendar-page app-content"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {refreshing && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '15px 0', gap: '8px', alignItems: 'center', backgroundColor: 'var(--bg-color-card)', position: 'sticky', top: '0', zIndex: '1000' }}>
          <div className="ronda-spinner" style={{ width: '20px', height: '20px', border: '3px solid var(--border-color)', borderTopColor: 'var(--color-primary)' }}></div>
          <span style={{ fontSize: '13px', color: 'var(--text-color-muted)', fontWeight: 'bold' }}>{t('loading')}</span>
        </div>
      )}
      {/* Top Banner Navigation Header */}
      <div className="calendar-header-banner">
        <div className="calendar-top-bar">
          <div className="calendar-header-logo-row">
            <img src="/Entites/Small Logo (White).png" alt="O" className="cal-logo-steer" />
            <span className="cal-logo-text">RONDA PLANNER</span>
          </div>
          <div className="lang-pill" onClick={toggleLanguage}>
            <span className={language === 'my' ? 'active' : ''}>MY</span>
            <span className={language === 'en' ? 'active' : ''}>EN</span>
          </div>
        </div>

        {/* Sub-tabs toggle */}
        <div className="calendar-sub-tabs">
          <button 
            className={`sub-tab-btn ${activeSubTab === 'previous' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('previous')}
          >
            {t('previousTripsTab')}
          </button>
          <button 
            className={`sub-tab-btn ${activeSubTab === 'planner' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('planner')}
          >
            {t('plannerTab')}
          </button>
          <button 
            className={`sub-tab-btn ${activeSubTab === 'save' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('save')}
          >
            {t('savedPlacesTab')}
          </button>
        </div>
      </div>

      <div className="calendar-body-content">
        
        {/* SUBTAB 1 — PREVIOUS TRIPS */}
        {activeSubTab === 'previous' && (
          <div className="previous-trips-view fade-in">
            <h3 className="sub-section-title">{t('pastTravelLogs')}</h3>
            {previousTrips.length === 0 ? (
              <p className="empty-message-text">{t('noCompletedTrips')}</p>
            ) : (
              <div className="previous-trips-list">
                {previousTrips.map(trip => (
                  <div key={trip.id} className="trip-log-card">
                    <div className="trip-log-meta">
                      <span className="trip-log-date">📅 {trip.date} at {trip.time}</span>
                      <h4 className="trip-log-title">{trip.title}</h4>
                    </div>
                    {trip.reviewed ? (
                      <div className="trip-reviewed-details">
                        <StarRating rating={trip.reviewRating} size={12} />
                        <p>"{trip.reviewText}"</p>
                      </div>
                    ) : (
                      <button 
                        className="btn-primary review-action-btn"
                        onClick={() => handleOpenReview(trip)}
                      >
                        {t('tripReviewTitle')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 2 — PLANNER MONTHLY & HOURLY */}
        {activeSubTab === 'planner' && (
          <div className="planner-view fade-in">
            {/* Month & Year header select */}
            <div className="month-picker-header">
              <button className="arrow-picker" onClick={handlePrevMonth}>‹</button>
              <h3 className="month-picker-title">
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </h3>
              <button className="arrow-picker" onClick={handleNextMonth}>›</button>
            </div>

            {/* Calendar grid */}
            <div className="calendar-grid-wrapper">
              <div className="weekday-header">
                {language === 'my' ? (
                  <><span>Ahd</span><span>Isn</span><span>Sel</span><span>Rab</span><span>Kha</span><span>Jum</span><span>Sab</span></>
                ) : (
                  <><span>Sun</span><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span></>
                )}
              </div>
              <div className="days-grid-body">
                {renderCalendar()}
              </div>
            </div>

            {/* Daily schedule title */}
            <div className="daily-schedule-title-row">
              <h3>{selectedDate === new Date().toISOString().split('T')[0] ? t('today') : selectedDate}</h3>
              {currentUser && (
                <button 
                  className="add-event-plus-btn"
                  onClick={() => setShowAddPlanModal(true)}
                >
                  + {t('addPlan')}
                </button>
              )}
            </div>

            {/* Hourly slots */}
            <div className="hourly-slots-list">
              {hoursList.map(hour => {
                const hourPlans = selectedDatePlans.filter(p => p.time.startsWith(hour.split(':')[0]));
                const isDraggedOver = draggedOverHour === hour;
                
                return (
                  <div 
                    key={hour} 
                    className={`hourly-slot-row ${isDraggedOver ? 'drag-over' : ''}`}
                    onDragOver={(e) => handleDragOver(e, hour)}
                    onDragEnter={(e) => handleDragEnter(e, hour)}
                    onDragLeave={(e) => handleDragLeave(e, hour)}
                    onDrop={(e) => handleDrop(e, hour)}
                  >
                    <div className="slot-time-label">
                      <span>{hour}</span>
                    </div>
                    <div className="slot-events-container">
                      {hourPlans.length === 0 ? (
                        <div className="empty-slot-line"></div>
                      ) : (
                        hourPlans.map(plan => (
                          <div 
                            key={plan.id} 
                            className="planner-event-card"
                            draggable
                            onDragStart={(e) => handleDragStart(e, plan)}
                            style={{ cursor: 'grab' }}
                          >
                            <div className="event-info">
                              <h5 className="event-title">{plan.title}</h5>
                            </div>
                            <button 
                              className="event-delete-btn"
                              onClick={() => handleDeletePlan(plan.id)}
                            >
                              ✕
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SUBTAB 3 — SAVED PLACES (LIKED) */}
        {activeSubTab === 'save' && (
          <div className="saved-places-view fade-in">
            <h3 className="sub-section-title">{t('savedWishlist')}</h3>
            {likedPlacesList.length === 0 ? (
              <p className="empty-message-text">{t('likedPlacesEmpty')}</p>
            ) : (
              <div className="saved-places-grid">
                {likedPlacesList.map(place => (
                  <div key={place.id} className="saved-place-list-item">
                    <img src={place.imageUrl} alt={place.title} className="saved-place-thumb" />
                    <div className="saved-place-info">
                      <h4>{place.title}</h4>
                      <p>{place.state || 'Malaysia'}</p>
                    </div>
                    <button 
                      className="btn-primary plan-now-btn"
                      onClick={() => handlePlanNow(place.title)}
                    >
                      {t('planNow')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Write review Modal Overlay */}
      {showReviewModal && (
        <div className="modal-overlay">
          <div className="modal-content glass">
            <h3>{t('tripReviewTitle')}</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-color-muted)' }}>{reviewPlaceTitle}</p>
            <form onSubmit={handleReviewSubmit}>
              <div className="rating-select-row" style={{ margin: '15px 0' }}>
                <span>{t('ratingLabel')}:</span>
                <StarRating rating={reviewRating} size={20} interactive onRatingChange={setReviewRating} />
              </div>
              <textarea 
                className="review-textarea"
                placeholder={t('reviewPlaceholder')}
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                required
              />
              <div className="review-image-upload-section" style={{ margin: '15px 0', textAlign: 'left' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '13px', color: 'var(--text-color-main)' }}>Attach Photos (Optional)</label>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input 
                    type="file" 
                    multiple 
                    onChange={handleReviewImagesChange}
                    accept="image/*"
                    style={{ display: 'none' }}
                    id="modal-review-image-file-input"
                  />
                  <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={() => document.getElementById('modal-review-image-file-input').click()}
                    style={{ padding: '6px 12px', fontSize: '11px' }}
                    disabled={uploadingReviewImages}
                  >
                    {uploadingReviewImages ? t('loading') : "Upload Photos"}
                  </button>
                  {reviewImages.map((url, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img 
                        src={url} 
                        alt="preview" 
                        style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border-color)' }}
                      />
                      <button 
                        type="button"
                        onClick={() => setReviewImages(prev => prev.filter((_, idx) => idx !== i))}
                        style={{ position: 'absolute', top: '-5px', right: '-5px', width: '15px', height: '15px', borderRadius: '50%', backgroundColor: '#dc3545', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-buttons-row">
                <button type="button" className="btn-secondary" onClick={() => setShowReviewModal(false)}>{t('cancel')}</button>
                <button type="submit" className="btn-primary">{t('submit')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Plan Modal Overlay */}
      {showAddPlanModal && (
        <div className="modal-overlay">
          <div className="modal-content glass">
            <h3>{t('addPlan')}</h3>
            <form onSubmit={handleAddPlanSubmit}>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label>{t('selectHour')}:</label>
                <select 
                  value={newPlanHour} 
                  onChange={(e) => setNewPlanHour(e.target.value)}
                  className="modal-select"
                >
                  {hoursList.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: '15px' }}>
                <label>{t('planTitleLabel')}:</label>
                <input 
                  type="text" 
                  value={newPlanTitle} 
                  onChange={(e) => setNewPlanTitle(e.target.value)}
                  placeholder={t('planTitlePlaceholder')}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label>{t('linkSavedPlace')}:</label>
                <select 
                  value={newPlanPlaceId} 
                  onChange={(e) => setNewPlanPlaceId(e.target.value)}
                  className="modal-select"
                >
                  <option value="">{t('selectPlacePlaceholder')}</option>
                  {likedPlacesList.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
              <div className="modal-buttons-row">
                <button type="button" className="btn-secondary" onClick={() => setShowAddPlanModal(false)}>{t('cancel')}</button>
                <button type="submit" className="btn-primary">{t('addEvent')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
