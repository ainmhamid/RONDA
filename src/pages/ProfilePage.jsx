import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { usePlaces } from '../hooks/usePlaces';
import { db, storage } from '../firebase/config';
import { doc, updateDoc, arrayUnion, arrayRemove, getDoc, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import LoadingSpinner from '../components/LoadingSpinner';
import StarRating from '../components/StarRating';
import './ProfilePage.css';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { currentUser, userProfile, updateProfileData, requestEmailChange, requestPasswordReset, signOut } = useAuth();
  const { t, language, setLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { places, addNewPlace, refreshPlaces } = usePlaces();

  const [refreshing, setRefreshing] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  // Active view tabs
  const [activeTab, setActiveTab] = useState('settings'); // 'settings', 'addplace', 'myactivity'

  // Profile Edit fields
  const [username, setUsername] = useState(userProfile?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(userProfile?.photoURL || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [updatingProfile, setUpdatingProfile] = useState(false);

  // Add Place Form fields
  const [placeTitle, setPlaceTitle] = useState('');
  const [placeCategory, setPlaceCategory] = useState('activity');
  const [placeAddress, setPlaceAddress] = useState('');
  const [placeImage, setPlaceImage] = useState('');
  const [placeDesc, setPlaceDesc] = useState('');
  const [placeAmenities, setPlaceAmenities] = useState('');
  const [placeAccess, setPlaceAccess] = useState('');
  const [placeInterests, setPlaceInterests] = useState('');
  const [submittingPlace, setSubmittingPlace] = useState(false);
  const [uploadingPlaceImage, setUploadingPlaceImage] = useState(false);

  // Edit/Manage Reviews and Places States
  const [myReviewsList, setMyReviewsList] = useState([]);
  const [myPlacesList, setMyPlacesList] = useState([]);
  
  // Edit review state
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [editReviewText, setEditReviewText] = useState('');
  const [editReviewRating, setEditReviewRating] = useState(5);
  
  // Edit place state
  const [editingPlaceId, setEditingPlaceId] = useState(null);
  const [editPlaceTitle, setEditPlaceTitle] = useState('');
  const [editPlaceAddress, setEditPlaceAddress] = useState('');
  const [editPlaceDesc, setEditPlaceDesc] = useState('');

  useEffect(() => {
    if (userProfile) {
      setUsername(userProfile.username || '');
      setAvatarUrl(userProfile.photoURL || '');
      setEmail(currentUser?.email || '');
    }
  }, [userProfile, currentUser]);

  // Load User Activities (reviews and places added by user)
  const fetchUserActivities = async () => {
    if (!currentUser) return;
    try {
      // 1. Get user reviews
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const uData = userSnap.data();
        setMyReviewsList(uData.myReviews || []);
      }

      // 2. Get user places added (places in firestore where addedBy == user uid)
      const q = query(collection(db, 'places'), where('addedBy', '==', currentUser.uid));
      const snapshot = await getDocs(q);
      const placesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMyPlacesList(placesData);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchUserActivities();
  }, [currentUser, activeTab]);

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
      await fetchUserActivities();
      if (refreshPlaces) {
        await refreshPlaces();
      }
      setRefreshing(false);
    }
  };

  // Submit Profile information changes
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setUpdatingProfile(true);
    try {
      // 1. Apply username and photoUrl update
      await updateProfileData(username, avatarUrl);

      // 2. If email changed, trigger verification security mail
      if (email !== currentUser.email) {
        await requestEmailChange(email);
        alert(t('confirmLinkSent'));
      } else {
        alert(t('profileUpdatedSuccess'));
      }
    } catch (err) {
      console.error(err);
      if (err.message === 'USERNAME_TAKEN') {
        alert(t('usernameTaken'));
      } else {
        alert(t('failedUpdateProfile'));
      }
    } finally {
      setUpdatingProfile(false);
    }
  };

  // Trigger password reset security email
  const handleResetPassword = async () => {
    try {
      await requestPasswordReset();
      alert(t('passwordResetSent'));
    } catch (err) {
      console.error(err);
      alert(t('failedSendResetLink'));
    }
  };

  // Upload picture for new place to Firebase Storage
  const handlePlaceImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploadingPlaceImage(true);
    try {
      const storageRef = ref(storage, `Places/${Date.now()}_${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      setPlaceImage(downloadURL);
    } catch (err) {
      console.error("Error uploading place image:", err);
      alert("Error uploading image: " + err.message);
    } finally {
      setUploadingPlaceImage(false);
    }
  };

  // Submit Add New Place Form
  const handleAddPlace = async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    setSubmittingPlace(true);

    try {
      const amenitiesArr = placeAmenities.split(',').map(s => s.trim()).filter(Boolean);
      const accessArr = placeAccess.split(',').map(s => s.trim()).filter(Boolean);
      const interestsArr = placeInterests.split(',').map(s => s.trim()).filter(Boolean);

      const placeData = {
        title: placeTitle,
        categoryName: placeCategory,
        address: placeAddress,
        state: placeAddress.includes('Penang') ? 'Penang' : 'Selangor', // basic mapping
        imageUrl: placeImage || 'https://images.unsplash.com/photo-1540553016722-983e48a2cd10?q=80&w=600&auto=format&fit=crop',
        description: placeDesc,
        amenities: amenitiesArr.length ? amenitiesArr : ["Free parking", "Wi-Fi"],
        accessibility: accessArr.length ? accessArr : ["Family friendly"],
        interest: interestsArr.length ? interestsArr : ["Nature Photography"],
        location: { lat: 3.139, lng: 101.686 }, // Default KL coords
        addedBy: currentUser.uid,
      };

      await addNewPlace(placeData);
      
      // Reset fields
      setPlaceTitle('');
      setPlaceAddress('');
      setPlaceImage('');
      setPlaceDesc('');
      setPlaceAmenities('');
      setPlaceAccess('');
      setPlaceInterests('');

      alert(t('placeAddedSuccess'));
      setActiveTab('myactivity');
      fetchUserActivities();
    } catch (err) {
      console.error("Error adding place:", err);
      alert(t('failedAddPlace'));
    } finally {
      setSubmittingPlace(false);
    }
  };

  // Check if review is editable (less than 1 week old)
  const isReviewEditable = (createdAt) => {
    if (!createdAt) return false;
    const reviewDate = new Date(createdAt);
    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;
    return (Date.now() - reviewDate.getTime()) < oneWeekInMs;
  };

  // Manage Review Edits
  const handleStartEditReview = (rev) => {
    if (!isReviewEditable(rev.createdAt)) {
      alert(t('editReviewExpiryMsg'));
      return;
    }
    setEditingReviewId(rev.reviewId);
    setEditReviewText(rev.text);
    setEditReviewRating(rev.rating);
  };

  const handleSaveEditReview = async () => {
    try {
      // 1. Update User Document myReviews
      const userRef = doc(db, 'users', currentUser.uid);
      const updatedReviews = myReviewsList.map(r => {
        if (r.reviewId === editingReviewId) {
          return { ...r, text: editReviewText, rating: editReviewRating };
        }
        return r;
      });
      await updateDoc(userRef, { myReviews: updatedReviews });

      // 2. Update Place Document reviews list
      const reviewObj = myReviewsList.find(r => r.reviewId === editingReviewId);
      if (reviewObj && reviewObj.placeId) {
        const placeRef = doc(db, 'places', reviewObj.placeId);
        const placeSnap = await getDoc(placeRef);
        if (placeSnap.exists()) {
          const pReviews = placeSnap.data().reviews || [];
          const updatedPReviews = pReviews.map(pr => {
            // Find review with matching text/user or matching unique timestamp/id
            if (pr.reviewerName === userProfile.username) {
              return { ...pr, text: editReviewText, rating: editReviewRating };
            }
            return pr;
          });
          
          await updateDoc(placeRef, { reviews: updatedPReviews });
        }
      }

      setEditingReviewId(null);
      fetchUserActivities();
      refreshPlaces();
      alert(t('reviewUpdatedSuccess'));
    } catch (err) {
      console.error(err);
      alert(t('failedSaveReview'));
    }
  };

  // Manage Place Edits (Anytime edit access)
  const handleStartEditPlace = (place) => {
    setEditingPlaceId(place.id);
    setEditPlaceTitle(place.title);
    setEditPlaceAddress(place.address);
    setEditPlaceDesc(place.description);
  };

  const handleSaveEditPlace = async () => {
    try {
      const placeRef = doc(db, 'places', editingPlaceId);
      await updateDoc(placeRef, {
        title: editPlaceTitle,
        address: editPlaceAddress,
        description: editPlaceDesc
      });

      setEditingPlaceId(null);
      fetchUserActivities();
      refreshPlaces();
      alert(t('placeUpdatedSuccess'));
    } catch (err) {
      console.error(err);
    }
  };

  // Change Profile avatar picture preset
  const selectAvatar = (idx) => {
    const presetAvatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=Avatar${idx}`;
    setAvatarUrl(presetAvatar);
  };

  // Handle actual file upload to Firebase Storage bucket /User
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !currentUser) return;
    
    setUpdatingProfile(true);
    try {
      const storageRef = ref(storage, `User/${currentUser.uid}`);
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      setAvatarUrl(downloadURL);
      
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, { photoURL: downloadURL });
      
      alert(t('avatarUpdatedSuccess'));
    } catch (err) {
      console.error("Error uploading file: ", err);
      alert(t('avatarUploadError') + err.message);
    } finally {
      setUpdatingProfile(false);
    }
  };

  return (
    <div 
      className="profile-page app-content"
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
      {/* Top Banner Navigation */}
      <div className="profile-header-banner">
        <div className="profile-top-bar">
          <div className="profile-logo-row">
            <img src="/Entites/Small Logo (White).png" alt="R" className="prof-logo-steer cyan-filter" style={{ width: '45px', height: '45px' }} />
          </div>
          <div className="lang-pill dark" onClick={toggleLanguage}>
            <span className={language === 'my' ? 'active' : ''}>MY</span>
            <span className={language === 'en' ? 'active' : ''}>EN</span>
          </div>
        </div>

        {/* User Card - only shown for other tabs */}
        {activeTab !== 'settings' && (
          <div className="user-profile-header-card">
            <div className="user-avatar-upload-wrapper" style={{ position: 'relative', cursor: 'pointer' }}>
              <img 
                src={avatarUrl || 'https://api.dicebear.com/7.x/adventurer/svg?seed=default'} 
                alt="User Avatar" 
                className="user-header-avatar editable"
                onClick={() => document.getElementById('avatar-file-input').click()}
                title="Click to upload profile picture"
                style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover' }}
              />
              <input 
                type="file" 
                id="avatar-file-input" 
                style={{ display: 'none' }} 
                onChange={handleFileChange}
                accept="image/*" 
              />
              <span className="avatar-edit-overlay" onClick={() => document.getElementById('avatar-file-input').click()} style={{ position: 'absolute', bottom: '0', right: '0', backgroundColor: 'var(--color-primary)', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: 'white', border: '1px solid white' }}>📷</span>
            </div>
            <div className="user-header-info">
              <h3>{userProfile?.username || 'Traveler'}</h3>
              <p>{currentUser?.email}</p>
            </div>
          </div>
        )}

        {/* Profile Tabs */}
        <div className="profile-sub-tabs">
          <button 
            className={`prof-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
          <button 
            className={`prof-tab-btn ${activeTab === 'addplace' ? 'active' : ''}`}
            onClick={() => setActiveTab('addplace')}
          >
            {t('addNewPlace')}
          </button>
          <button 
            className={`prof-tab-btn ${activeTab === 'myactivity' ? 'active' : ''}`}
            onClick={() => setActiveTab('myactivity')}
          >
            {t('myActivity')}
          </button>
        </div>
      </div>

      <div className="profile-body-content">
        
        {/* TABS 1 — SETTINGS */}
        {activeTab === 'settings' && (
          <div className="profile-settings-view fade-in">
            <h2 className="accout-info-heading" style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text-color-main)', margin: '15px 0', fontFamily: 'var(--font-heading)' }}>
              {t('accountInfo')}
            </h2>
            
            <form onSubmit={handleUpdateProfile} className="settings-form">
              <div className="account-info-card" style={{ backgroundColor: 'var(--bg-color-card)', borderRadius: '24px', padding: '10px 20px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
                
                <div className="account-info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span className="info-label" style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-color-main)' }}>{t('profilePhoto')}</span>
                  <div className="user-avatar-upload-wrapper" style={{ position: 'relative', cursor: 'pointer' }}>
                    <img 
                      src={avatarUrl || 'https://api.dicebear.com/7.x/adventurer/svg?seed=default'} 
                      alt="User Avatar" 
                      onClick={() => document.getElementById('avatar-file-input-inline').click()}
                      title="Click to upload profile picture"
                      style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--color-primary)' }}
                    />
                    <input 
                      type="file" 
                      id="avatar-file-input-inline" 
                      style={{ display: 'none' }} 
                      onChange={handleFileChange}
                      accept="image/*" 
                    />
                  </div>
                </div>

                <div className="account-info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span className="info-label" style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-color-main)' }}>{t('emailAddress')}</span>
                  <input 
                    type="email" 
                    className="info-value-input" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    required 
                    style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', color: 'var(--text-color-muted)', fontSize: '13px', fontWeight: '600', width: '60%' }}
                  />
                </div>

                <div className="account-info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span className="info-label" style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-color-main)' }}>{t('username')}</span>
                  <input 
                    type="text" 
                    className="info-value-input" 
                    value={username} 
                    onChange={(e) => setUsername(e.target.value)} 
                    required 
                    style={{ border: 'none', background: 'transparent', textAlign: 'right', outline: 'none', color: 'var(--text-color-muted)', fontSize: '13px', fontWeight: '600', width: '60%' }}
                  />
                </div>

                <div className="account-info-row" onClick={handleResetPassword} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}>
                  <span className="info-label" style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-color-main)' }}>{t('password')}</span>
                  <span className="info-value-text" style={{ color: 'var(--text-color-muted)', fontSize: '13px', fontWeight: '600' }}>xxxxxxxxxxxx</span>
                </div>

                <div className="account-info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span className="info-label" style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-color-main)' }}>{t('userLabel')}</span>
                  <span className="info-value-text" style={{ color: 'var(--text-color-muted)', fontSize: '13px', fontWeight: '600' }}>
                    {myReviewsList.length > 30 ? t('localGuide') : t('traveler')}
                  </span>
                </div>

                <div className="account-info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span className="info-label" style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-color-main)' }}>{t('language')}</span>
                  <select 
                    className="info-value-select" 
                    value={language} 
                    onChange={(e) => setLanguage(e.target.value)}
                    style={{ border: 'none', background: 'transparent', color: 'var(--text-color-muted)', fontSize: '13px', fontWeight: '600', outline: 'none', cursor: 'pointer', textAlign: 'right' }}
                  >
                    <option value="en">English</option>
                    <option value="my">Malay</option>
                  </select>
                </div>

                <div className="account-info-row" onClick={() => alert(t('termsAlert'))} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', cursor: 'pointer' }}>
                  <span className="info-label" style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-color-main)' }}>{t('termsAndConditions')}</span>
                  <span className="info-value-text" style={{ color: 'var(--text-color-muted)', fontSize: '13px', fontWeight: '600' }}>➔</span>
                </div>
              </div>

              {/* Preferences: Mode Toggle */}
              <div className="preferences-block-card" style={{ backgroundColor: 'var(--bg-color-card)', borderRadius: '24px', padding: '16px 20px', border: '1px solid var(--border-color)', margin: '20px 0', boxShadow: 'var(--shadow-sm)' }}>
                <div className="pref-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-color-main)' }}>{t('themeMode')}</span>
                  <button type="button" className="btn-secondary" onClick={toggleTheme} style={{ padding: '6px 14px', fontSize: '12px' }}>
                    {theme === 'light' ? t('darkMode') : t('lightMode')}
                  </button>
                </div>
              </div>

              <button 
                type="submit" 
                className="btn-primary save-changes-btn" 
                disabled={updatingProfile}
                style={{ width: '100%', padding: '16px', borderRadius: '18px', backgroundColor: 'var(--color-primary)', border: 'none', color: 'white', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', boxShadow: 'var(--shadow-md)', transition: 'background-color 0.2s' }}
              >
                {updatingProfile ? t('loading') : t('saveChanges')}
              </button>

              <button 
                type="button" 
                className="btn-secondary sign-out-profile-btn" 
                style={{ width: '100%', marginTop: '12px', padding: '14px', borderRadius: '18px', borderColor: '#dc3545', color: '#dc3545', fontWeight: 'bold', fontSize: '14px', background: 'transparent' }}
                onClick={async () => {
                  await signOut();
                  navigate('/auth');
                }}
              >
                {t('signOut')}
              </button>
            </form>
          </div>
        )}

        {/* TABS 2 — ADD NEW PLACE FORM */}
        {activeTab === 'addplace' && (
          <div className="add-place-view fade-in">
            <h3 className="sub-section-title">{t('addNewPlace')}</h3>
            <form onSubmit={handleAddPlace} className="add-place-form-fields">
              <div className="form-group">
                <label>{t('placeName')} *</label>
                <input 
                  type="text" 
                  value={placeTitle}
                  onChange={(e) => setPlaceTitle(e.target.value)}
                  placeholder="e.g. Pantai Morib"
                  required
                />
              </div>

              <div className="form-group">
                <label>{t('category')} *</label>
                <select 
                  value={placeCategory}
                  onChange={(e) => setPlaceCategory(e.target.value)}
                  className="modal-select"
                >
                  <option value="activity">{t('activity')}</option>
                  <option value="eateries">{t('eateries')}</option>
                  <option value="shop">{t('shop')}</option>
                  <option value="hotel">{t('hotel')}</option>
                </select>
              </div>

              <div className="form-group">
                <label>{t('address')} *</label>
                <input 
                  type="text" 
                  value={placeAddress}
                  onChange={(e) => setPlaceAddress(e.target.value)}
                  placeholder="Street name, City, State"
                  required
                />
              </div>

              <div className="form-group">
                <label>Place Image (Upload or enter URL)</label>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '8px' }}>
                  <input 
                    type="file" 
                    onChange={handlePlaceImageChange}
                    accept="image/*"
                    style={{ display: 'none' }}
                    id="place-image-file-input"
                  />
                  <button 
                    type="button" 
                    className="btn-secondary"
                    onClick={() => document.getElementById('place-image-file-input').click()}
                    style={{ padding: '8px 16px', fontSize: '13px' }}
                    disabled={uploadingPlaceImage}
                  >
                    {uploadingPlaceImage ? t('loading') : "Upload Picture"}
                  </button>
                  {placeImage && (
                    <div style={{ position: 'relative' }}>
                      <img 
                        src={placeImage} 
                        alt="Place preview" 
                        style={{ width: '60px', height: '60px', borderRadius: '12px', objectFit: 'cover', border: '1px solid var(--border-color)' }}
                      />
                      <button 
                        type="button"
                        onClick={() => setPlaceImage('')}
                        style={{ position: 'absolute', top: '-5px', right: '-5px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#dc3545', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
                <input 
                  type="url" 
                  value={placeImage}
                  onChange={(e) => setPlaceImage(e.target.value)}
                  placeholder="Or paste an Image URL here..."
                />
              </div>

              <div className="form-group">
                <label>{t('description')} *</label>
                <textarea 
                  value={placeDesc}
                  onChange={(e) => setPlaceDesc(e.target.value)}
                  placeholder="Explain details about the place..."
                  required
                />
              </div>

              <div className="form-group">
                <label>Amenities (Comma separated)</label>
                <input 
                  type="text" 
                  value={placeAmenities}
                  onChange={(e) => setPlaceAmenities(e.target.value)}
                  placeholder="Free Parking, Restrooms, Cafeteria"
                />
              </div>

              <div className="form-group">
                <label>Accessibility (Comma separated)</label>
                <input 
                  type="text" 
                  value={placeAccess}
                  onChange={(e) => setPlaceAccess(e.target.value)}
                  placeholder="Wheelchair ramp, Stroller friendly"
                />
              </div>

              <div className="form-group">
                <label>Interests (Comma separated)</label>
                <input 
                  type="text" 
                  value={placeInterests}
                  onChange={(e) => setPlaceInterests(e.target.value)}
                  placeholder="Nature, Sightseeing, Family"
                />
              </div>

              <button type="submit" className="btn-primary auth-submit-btn" disabled={submittingPlace}>
                {submittingPlace ? t('loading') : t('submit')}
              </button>
            </form>
          </div>
        )}

        {/* TABS 3 — MY ACTIVITY (MANAGE REVIEWS & PLACES ADDED) */}
        {activeTab === 'myactivity' && (
          <div className="my-activity-view fade-in">
            
            {/* Reviews Section */}
            <div className="my-activity-section" style={{ marginBottom: '28px' }}>
              <h3 className="sub-section-title">{t('myReviews')}</h3>
              {myReviewsList.length === 0 ? (
                <p className="empty-message-text">You haven't written any reviews yet.</p>
              ) : (
                <div className="profile-activity-list">
                  {myReviewsList.map(rev => {
                    const isEditable = isReviewEditable(rev.createdAt);
                    const isEditing = editingReviewId === rev.reviewId;
                    
                    return (
                      <div key={rev.reviewId} className="profile-activity-card">
                        <div className="activity-card-header">
                          <h4>{rev.placeTitle}</h4>
                          <span className="activity-card-meta">
                            {isEditable ? "✍️ Editable (1wk)" : "🔒 Locked (>1wk)"}
                          </span>
                        </div>
                        
                        {isEditing ? (
                          <div className="editing-form-fields" style={{ marginTop: '10px' }}>
                            <div className="rating-select-row" style={{ marginBottom: '8px' }}>
                              <span>Rating:</span>
                              <StarRating rating={editReviewRating} size={16} interactive onRatingChange={setEditReviewRating} />
                            </div>
                            <textarea 
                              className="edit-textarea"
                              value={editReviewText}
                              onChange={(e) => setEditReviewText(e.target.value)}
                            />
                            <div className="edit-btn-row">
                              <button className="btn-secondary" onClick={() => setEditingReviewId(null)}>{t('cancel')}</button>
                              <button className="btn-primary" onClick={handleSaveEditReview}>Save</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ margin: '6px 0' }}>
                              <StarRating rating={rev.rating} size={11} />
                            </div>
                            <p className="activity-card-text">"{rev.text}"</p>
                            {isEditable && (
                              <button 
                                className="activity-edit-action-btn"
                                onClick={() => handleStartEditReview(rev)}
                              >
                                Edit Review
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Places Section (Editable anytime) */}
            <div className="my-activity-section">
              <h3 className="sub-section-title">{t('myPlaces')}</h3>
              {myPlacesList.length === 0 ? (
                <p className="empty-message-text">You haven't added any places yet.</p>
              ) : (
                <div className="profile-activity-list">
                  {myPlacesList.map(p => {
                    const isEditing = editingPlaceId === p.id;
                    
                    return (
                      <div key={p.id} className="profile-activity-card">
                        {isEditing ? (
                          <div className="editing-form-fields">
                            <input 
                              type="text" 
                              value={editPlaceTitle}
                              onChange={(e) => setEditPlaceTitle(e.target.value)}
                              placeholder="Title"
                              style={{ marginBottom: '8px' }}
                            />
                            <input 
                              type="text" 
                              value={editPlaceAddress}
                              onChange={(e) => setEditPlaceAddress(e.target.value)}
                              placeholder="Address"
                              style={{ marginBottom: '8px' }}
                            />
                            <textarea 
                              className="edit-textarea"
                              value={editPlaceDesc}
                              onChange={(e) => setEditPlaceDesc(e.target.value)}
                            />
                            <div className="edit-btn-row" style={{ marginTop: '8px' }}>
                              <button className="btn-secondary" onClick={() => setEditingPlaceId(null)}>{t('cancel')}</button>
                              <button className="btn-primary" onClick={handleSaveEditPlace}>Save</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="activity-card-header">
                              <h4>{p.title}</h4>
                              <span className="activity-card-meta">✍️ Editable anytime</span>
                            </div>
                            <p className="activity-card-address">📍 {p.address}</p>
                            <p className="activity-card-text">{p.description}</p>
                            <button 
                              className="activity-edit-action-btn"
                              onClick={() => handleStartEditPlace(p)}
                            >
                              Edit Place
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
