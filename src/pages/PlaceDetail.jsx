import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePlaces } from '../hooks/usePlaces';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../firebase/config';
import { doc, updateDoc, arrayUnion, arrayRemove, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import StarRating from '../components/StarRating';
import LoadingSpinner from '../components/LoadingSpinner';
import { useLanguage } from '../contexts/LanguageContext';
import './PlaceDetail.css';

export default function PlaceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t, language, setLanguage } = useLanguage();
  const { getPlaceById, places, addPlaceReview } = usePlaces();
  const { currentUser, userProfile } = useAuth();

  const [place, setPlace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'details', 'review'
  const [isLiked, setIsLiked] = useState(false);
  
  // Review form states
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(5);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewImages, setReviewImages] = useState([]);
  const [uploadingReviewImages, setUploadingReviewImages] = useState(false);

  const [refreshing, setRefreshing] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const loadPlace = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    const data = await getPlaceById(id);
    if (data) {
      setPlace(data);
      if (userProfile && userProfile.likedPlaces) {
        setIsLiked(userProfile.likedPlaces.includes(data.id));
      }
    }
    if (showSpinner) setLoading(false);
  }, [id, getPlaceById, userProfile]);

  useEffect(() => {
    loadPlace(true);
  }, [loadPlace]);

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
      await loadPlace(false);
      setRefreshing(false);
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'my' : 'en');
  };

  // Heart like click handler
  const handleLikeClick = async () => {
    if (!currentUser || !place) {
      alert("Please sign in to save places!");
      return;
    }

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      if (isLiked) {
        await updateDoc(userRef, {
          likedPlaces: arrayRemove(place.id)
        });
        setIsLiked(false);
      } else {
        await updateDoc(userRef, {
          likedPlaces: arrayUnion(place.id)
        });
        setIsLiked(true);
      }
    } catch (error) {
      console.error("Error saving place:", error);
    }
  };

  // Next and Previous place navigation
  const handlePrevPlace = () => {
    if (places.length === 0 || !place) return;
    const currentIndex = places.findIndex(p => p.id === place.id);
    if (currentIndex > 0) {
      navigate(`/place/${places[currentIndex - 1].id}`);
    } else {
      // wrap to end
      navigate(`/place/${places[places.length - 1].id}`);
    }
  };

  const handleNextPlace = () => {
    if (places.length === 0 || !place) return;
    const currentIndex = places.findIndex(p => p.id === place.id);
    if (currentIndex < places.length - 1) {
      navigate(`/place/${places[currentIndex + 1].id}`);
    } else {
      // wrap to beginning
      navigate(`/place/${places[0].id}`);
    }
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

  // Add review submission handler
  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      alert("Please sign in to submit a review!");
      return;
    }
    if (!reviewText.trim()) return;

    setSubmittingReview(true);
    try {
      const newReview = {
        name: userProfile?.username || currentUser.displayName || "Anonymous",
        stars: reviewRating,
        rating: reviewRating, // compatibility key
        text: reviewText,
        publishAt: "Just now",
        isLocalGuide: (userProfile?.myReviews?.length || 0) > 30,
        reviewerPhotoUrl: userProfile?.photoURL || currentUser.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.uid}`,
        images: reviewImages
      };

      await addPlaceReview(place.id, newReview);
      
      // Update local state for review display
      setPlace(prev => ({
        ...prev,
        reviewsCount: (prev.reviewsCount || 0) + 1,
        totalScore: parseFloat((( (prev.totalScore || 5) * (prev.reviewsCount || 0) + reviewRating ) / ((prev.reviewsCount || 0) + 1)).toFixed(1)),
        reviews: [
          {
            id: `rev_${Date.now()}`,
            reviewerName: newReview.name,
            rating: newReview.stars,
            text: newReview.text,
            publishAt: newReview.publishAt,
            isLocalGuide: newReview.isLocalGuide,
            reviewerPhotoUrl: newReview.reviewerPhotoUrl,
            images: newReview.images
          },
          ...(prev.reviews || [])
        ]
      }));

      // Update user Profile added review list in user doc
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const currentReviews = userDoc.data().myReviews || [];
        await updateDoc(userRef, {
          myReviews: [
            {
              placeId: place.id,
              placeTitle: place.title,
              reviewId: `rev_${Date.now()}`,
              rating: reviewRating,
              text: reviewText,
              createdAt: new Date().toISOString(),
              images: reviewImages
            },
            ...currentReviews
          ]
        });
      }

      setReviewText('');
      setReviewRating(5);
      setReviewImages([]);
      alert("Review added successfully!");
    } catch (error) {
      console.error("Error submitting review:", error);
      alert("Failed to submit review.");
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) return <LoadingSpinner fullScreen />;
  if (!place) return <div className="place-not-found">Place not found</div>;

  return (
    <div 
      className="place-detail-page app-content"
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
      {/* Hero Header Area */}
      <div className="detail-hero-section">
        <img src={place.imageUrl} alt={place.title} className="detail-hero-img" />
        
        {/* Top Floating Icons */}
        <button className="detail-back-arrow-btn" onClick={() => navigate(-1)} style={{ position: 'absolute', top: '20px', left: '20px', zIndex: '100' }}>
          ←
        </button>

        <div className="detail-top-logo" style={{ position: 'absolute', top: '20px', left: '70px', zIndex: '100' }}>
          <img src="/Entites/Small Logo (White).png" alt="RONDA" className="detail-top-logo-img" style={{ width: '38px', height: '38px', objectFit: 'contain' }} />
        </div>

        <div className="lang-pill" onClick={toggleLanguage} style={{ position: 'absolute', top: '20px', right: '20px', zIndex: '100' }}>
          <span className={language === 'my' ? 'active' : ''}>MY</span>
          <span className={language === 'en' ? 'active' : ''}>EN</span>
        </div>

        {/* Heart Save Button */}
        <button 
          className={`detail-like-btn ${isLiked ? 'liked' : ''}`}
          onClick={handleLikeClick}
        >
          <img 
            src={isLiked ? "/Entites/liked icon (2).png" : "/Entites/liked icon.png"} 
            alt="Like" 
            className="detail-heart-img" 
          />
        </button>
      </div>

      {/* Main Details Body (Contains navigation arrows on left/right edges) */}
      <div className="detail-body-container">
        
        {/* Navigation Arrows overlayed on layout edge */}
        <button className="nav-arrow prev" onClick={handlePrevPlace}>
          ‹
        </button>
        <button className="nav-arrow next" onClick={handleNextPlace}>
          ›
        </button>

        <div className="detail-content-wrapper">
          <h2 className="detail-title">{place.title?.toUpperCase()}</h2>
          
          <div className="detail-rating-row">
            <StarRating rating={place.totalScore || 5.0} size={18} />
            <span className="rating-value">{place.totalScore || '5.0'}</span>
            <div className="detail-location-pill">
              <span className="location-pin-icon">📍</span>
              <span>{place.state?.toUpperCase() || 'MALAYSIA'}</span>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="detail-tabs">
            <button 
              className={`detail-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              {t('overviewTab')}
            </button>
            <button 
              className={`detail-tab-btn ${activeTab === 'details' ? 'active' : ''}`}
              onClick={() => setActiveTab('details')}
            >
              {t('detailsTab')}
            </button>
            <button 
              className={`detail-tab-btn ${activeTab === 'review' ? 'active' : ''}`}
              onClick={() => setActiveTab('review')}
            >
              {t('reviewTab')}
            </button>
          </div>

          {/* Tab Contents */}
          <div className="tab-content-area">
            {activeTab === 'overview' && (
              <div className="overview-content fade-in">
                <p className="place-description">{place.description}</p>
                <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <strong>Address: </strong>
                  <p style={{ fontSize: '13px', color: 'var(--text-color-muted)', margin: '0 0 8px 0' }}>{place.address}</p>
                  <button 
                    onClick={() => {
                      const lat = place.location?.lat || place.location?._lat;
                      const lng = place.location?.lng || place.location?._lng;
                      const dirUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
                      window.open(dirUrl, '_blank');
                    }}
                    className="btn-primary"
                    style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '8px', 
                      justifyContent: 'center', 
                      width: 'fit-content',
                      padding: '8px 16px',
                      fontSize: '13px'
                    }}
                  >
                    🧭 Get Directions
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'details' && (
              <div className="details-content fade-in">
                {/* Amenities Block */}
                <div className="detail-box teal-box">
                  <h4>{t('amenities')}</h4>
                  <ul>
                    {place.amenities?.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>

                {/* Accessibility Block */}
                <div className="detail-box teal-box">
                  <h4>{t('accessibility')}</h4>
                  <ul>
                    {place.accessibility?.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>

                {/* Interest Block */}
                <div className="detail-box teal-box">
                  <h4>{t('interest')}</h4>
                  <ul>
                    {place.interest?.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'review' && (
              <div className="review-content fade-in">
                
                {/* Submit New Review Block */}
                {currentUser ? (
                  <form className="add-review-form" onSubmit={handleReviewSubmit}>
                    <h4>Write a Review</h4>
                    <div className="rating-select-row">
                      <span>Rating:</span>
                      <StarRating 
                        rating={reviewRating} 
                        size={20} 
                        interactive 
                        onRatingChange={setReviewRating} 
                      />
                    </div>
                    <textarea 
                      placeholder="Share your experience details..."
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value)}
                      required
                    ></textarea>

                    {/* Review Image Upload Row */}
                    <div className="review-image-upload-section" style={{ margin: '15px 0' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '13px', color: 'var(--text-color-main)' }}>Attach Photos (Optional)</label>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input 
                          type="file" 
                          multiple 
                          onChange={handleReviewImagesChange}
                          accept="image/*"
                          style={{ display: 'none' }}
                          id="review-image-file-input"
                        />
                        <button 
                          type="button" 
                          className="btn-secondary"
                          onClick={() => document.getElementById('review-image-file-input').click()}
                          style={{ padding: '8px 16px', fontSize: '12px' }}
                          disabled={uploadingReviewImages}
                        >
                          {uploadingReviewImages ? t('loading') : "Upload Photos"}
                        </button>
                        {reviewImages.map((url, i) => (
                          <div key={i} style={{ position: 'relative' }}>
                            <img 
                              src={url} 
                              alt="preview" 
                              style={{ width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border-color)' }}
                            />
                            <button 
                              type="button"
                              onClick={() => setReviewImages(prev => prev.filter((_, idx) => idx !== i))}
                              style={{ position: 'absolute', top: '-5px', right: '-5px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#dc3545', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button type="submit" className="btn-primary" disabled={submittingReview}>
                      {submittingReview ? t('loading') : t('submit')}
                    </button>
                  </form>
                ) : (
                  <p className="signin-notice">Please sign in to write reviews.</p>
                )}

                {/* Reviews List */}
                <div className="reviews-list-container">
                  {(!place.reviews || place.reviews.length === 0) ? (
                    <p className="no-reviews-text">{t('noReviews')}</p>
                  ) : (
                    place.reviews.map((rev, idx) => (
                      <div key={rev.id || idx} className="review-card">
                        <div className="review-header">
                          <img 
                            src={rev.reviewerPhotoUrl || 'https://api.dicebear.com/7.x/adventurer/svg?seed=user'} 
                            alt={rev.reviewerName} 
                            className="reviewer-avatar" 
                          />
                          <div className="reviewer-info">
                            <h5 className="reviewer-name">
                              {rev.reviewerName || 'Explorer'}
                              {rev.isLocalGuide && <span className="local-guide-badge">Local Guide</span>}
                            </h5>
                            <span className="review-time">{rev.publishAt || 'Recently'}</span>
                          </div>
                          <div className="review-rating-stars">
                            <StarRating rating={rev.rating || 5} size={11} />
                          </div>
                        </div>
                        <p className="review-text">{rev.text}</p>
                        
                        {/* Attached review images */}
                        {rev.images && rev.images.length > 0 && (
                          <div className="review-images-row">
                            {rev.images.map((imgUrl, i) => (
                              <img key={i} src={imgUrl} alt="Review attachment" className="review-thumb" />
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
