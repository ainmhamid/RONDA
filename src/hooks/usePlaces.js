import { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase/config';
import { collection, getDocs, doc, getDoc, addDoc, updateDoc } from 'firebase/firestore';

export function usePlaces() {
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch all places
  const fetchPlaces = useCallback(async () => {
    setLoading(true);
    try {
      const placesCol = collection(db, 'places');
      const snapshot = await getDocs(placesCol);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPlaces(data);
      setLoading(false);
    } catch (err) {
      console.error("Error fetching places:", err);
      setError(err);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlaces();
  }, [fetchPlaces]);

  // Fetch a single place by ID
  const getPlaceById = useCallback(async (id) => {
    try {
      const docRef = doc(db, 'places', id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() };
      }
      return null;
    } catch (err) {
      console.error("Error getting place:", err);
      return null;
    }
  }, []);

  // Add a new user-generated place directly (Publish immediately)
  const addNewPlace = useCallback(async (placeData) => {
    try {
      const docRef = await addDoc(collection(db, 'places'), {
        ...placeData,
        createdAt: new Date().toISOString(),
        totalScore: 5.0,
        reviewsCount: 0,
        reviews: []
      });
      // Update local state
      const newPlace = { id: docRef.id, ...placeData, totalScore: 5.0, reviewsCount: 0, reviews: [] };
      setPlaces(prev => [newPlace, ...prev]);
      return docRef.id;
    } catch (err) {
      console.error("Error adding place:", err);
      throw err;
    }
  }, []);

  // Add review to a place
  const addPlaceReview = useCallback(async (placeId, review) => {
    try {
      const placeRef = doc(db, 'places', placeId);
      const placeSnap = await getDoc(placeRef);
      if (placeSnap.exists()) {
        const placeData = placeSnap.data();
        const currentReviews = placeData.reviews || [];
        
        // Add new review
        const newReview = {
          id: `rev_${Date.now()}`,
          ...review,
          createdAt: new Date().toISOString()
        };
        const updatedReviews = [newReview, ...currentReviews];
        
        // Calculate new rating
        const newReviewsCount = updatedReviews.length;
        const totalRatingSum = updatedReviews.reduce((sum, r) => sum + r.rating, 0);
        const newScore = parseFloat((totalRatingSum / newReviewsCount).toFixed(1));
        
        await updateDoc(placeRef, {
          reviews: updatedReviews,
          totalScore: newScore,
          reviewsCount: newReviewsCount
        });
        
        // Refresh local list
        fetchPlaces();
      }
    } catch (err) {
      console.error("Error adding review:", err);
      throw err;
    }
  }, [fetchPlaces]);

  return {
    places,
    loading,
    error,
    getPlaceById,
    addNewPlace,
    addPlaceReview,
    refreshPlaces: fetchPlaces
  };
}
