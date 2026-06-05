import React from 'react';
import { useNavigate } from 'react-router-dom';
import StarRating from './StarRating';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase/config';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import './PlaceCard.css';

export default function PlaceCard({ place, layout = 'recommended', isLiked = false, onLikeToggle }) {
  const navigate = useNavigate();
  const { currentUser, userProfile } = useAuth();

  const handleCardClick = () => {
    navigate(`/place/${place.id}`);
  };

  const handleLikeClick = async (e) => {
    e.stopPropagation();
    if (!currentUser) {
      alert("Please sign in to save places!");
      return;
    }

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      if (isLiked) {
        await updateDoc(userRef, {
          likedPlaces: arrayRemove(place.id)
        });
      } else {
        await updateDoc(userRef, {
          likedPlaces: arrayUnion(place.id)
        });
      }
      if (onLikeToggle) {
        onLikeToggle(place.id, !isLiked);
      }
    } catch (error) {
      console.error("Error updating saved places:", error);
    }
  };

  const getPlaceholderImage = (category) => {
    switch (category?.toLowerCase()) {
      case 'eateries': return '/Entites/food icon.png';
      case 'shop': return '/Entites/shopping icon.png';
      case 'activity': return '/Entites/activity icon.png';
      case 'hotel': return '/Entites/Hotel Icon.png';
      default: return '/Entites/Small Logo (White).png';
    }
  };

  const displayImage = place.imageUrl || (place.imageUrls && place.imageUrls[0]) || getPlaceholderImage(place.categoryName);

  if (layout === 'top') {
    return (
      <div className="place-card-top" onClick={handleCardClick}>
        <div className="card-top-image-wrapper">
          <img src={displayImage} alt={place.title} className="card-top-image" />
          <div className="card-top-overlay">
            <h3 className="card-top-title">{place.title?.toUpperCase()}</h3>
            <p className="card-top-subtitle">{place.address || place.state || ''}</p>
          </div>
          <button 
            className={`like-button ${isLiked ? 'liked' : ''}`} 
            onClick={handleLikeClick}
          >
            <img 
              src={isLiked ? "/Entites/liked icon (2).png" : "/Entites/liked icon.png"} 
              alt="Heart" 
              className="heart-icon-img"
            />
          </button>
        </div>
      </div>
    );
  }

  // Recommended list style (horizontal rounded item layout)
  return (
    <div className="place-card-recommended" onClick={handleCardClick}>
      <div className="card-rec-image-container">
        <img src={displayImage} alt={place.title} className="card-rec-image" />
      </div>
      <div className="card-rec-details">
        <h4 className="card-rec-title">{place.title}</h4>
        <p className="card-rec-location">{place.state || place.city || 'Malaysia'}</p>
        <div className="card-rec-rating">
          <StarRating rating={place.totalScore || 5.0} size={13} />
          <span className="card-rec-rating-text">{place.totalScore || '5.0'}</span>
        </div>
      </div>
      <button 
        className={`like-button-rec ${isLiked ? 'liked' : ''}`} 
        onClick={handleLikeClick}
      >
        <img 
          src={isLiked ? "/Entites/liked icon (2).png" : "/Entites/liked icon.png"} 
          alt="Heart" 
          className="heart-icon-img"
        />
      </button>
    </div>
  );
}
