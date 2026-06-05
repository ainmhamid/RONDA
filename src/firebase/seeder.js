import { db } from './config';
import { collection, getDocs, writeBatch, doc, getDoc, setDoc } from 'firebase/firestore';

const APIFY_URL = '/data/places.json';
const CURRENT_DATASET_ID = 'local_xlsx_dataset_v3';

// Helper to determine state from address
function getStateFromAddress(address) {
  if (!address) return 'Selangor';
  const states = ['Penang', 'Pulau Pinang', 'Selangor', 'Kuala Lumpur', 'Sabah', 'Sarawak', 'Kedah', 'Johor', 'Melaka', 'Pahang', 'Terengganu', 'Kelantan', 'Perlis', 'Negeri Sembilan', 'Perak'];
  for (const state of states) {
    if (address.toLowerCase().includes(state.toLowerCase())) {
      return state === 'Pulau Pinang' ? 'Penang' : state;
    }
  }
  return 'Selangor';
}

// Normalise Category name
function normalizeCategory(categoryName, categories = []) {
  const cat = (categoryName || categories[0] || 'activity').toLowerCase();
  if (cat.includes('restaurant') || cat.includes('food') || cat.includes('cafe') || cat.includes('eatery') || cat.includes('bakery')) {
    return 'eateries';
  }
  if (cat.includes('shop') || cat.includes('store') || cat.includes('mall') || cat.includes('market') || cat.includes('gift')) {
    return 'shop';
  }
  if (cat.includes('hotel') || cat.includes('homestay') || cat.includes('resort') || cat.includes('guesthouse') || cat.includes('stay') || cat.includes('motel') || cat.includes('house')) {
    return 'hotel';
  }
  return 'activity';
}

export async function checkAndSeedDatabase() {
  try {
    const metadataRef = doc(db, 'metadata', 'seeding');
    const metadataSnap = await getDoc(metadataRef);
    const placesCol = collection(db, 'places');
    
    let needsSeeding = false;
    
    if (!metadataSnap.exists() || metadataSnap.data().datasetId !== CURRENT_DATASET_ID) {
      console.log('New local dataset version detected or first-time seed. Preparing to clear and re-seed...');
      
      // Fetch all existing places to delete them
      const snapshot = await getDocs(placesCol);
      if (!snapshot.empty) {
        console.log(`Deleting ${snapshot.size} outdated places...`);
        let deleteBatch = writeBatch(db);
        let delCount = 0;
        
        for (const docSnap of snapshot.docs) {
          deleteBatch.delete(docSnap.ref);
          delCount++;
          if (delCount === 400) {
            await deleteBatch.commit();
            deleteBatch = writeBatch(db);
            delCount = 0;
          }
        }
        if (delCount > 0) {
          await deleteBatch.commit();
        }
        console.log('Outdated places deleted.');
      }
      
      needsSeeding = true;
    } else {
      // Even if datasetId matches, verify places is not empty
      const snapshot = await getDocs(placesCol);
      if (snapshot.empty) {
        needsSeeding = true;
      } else {
        console.log('Database already seeded with the latest dataset:', CURRENT_DATASET_ID);
        return;
      }
    }

    if (!needsSeeding) return;

    console.log('Fetching places from local places.json...');
    const response = await fetch(APIFY_URL);
    if (!response.ok) throw new Error('API fetch failed');
    const items = await response.json();
    
    console.log(`Fetched ${items.length} items from places.json. Seeding to Firestore...`);
    
    const BATCH_LIMIT = 400;
    let batch = writeBatch(db);
    let count = 0;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const placeId = item.id || `local_place_${i}`;
      
      const placeData = {
        id: placeId,
        title: item.title || 'Beautiful Attraction',
        categoryName: item.categoryName || 'activity',
        address: item.address || '',
        state: item.state || 'Selangor',
        location: item.location || { 
          lat: 3.139 + (Math.random() - 0.5) * 0.25, 
          lng: 101.686 + (Math.random() - 0.5) * 0.25 
        },
        totalScore: item.totalScore || 5.0,
        reviewsCount: item.reviewsCount || 0,
        imageUrl: item.imageUrl || 'https://images.unsplash.com/photo-1540553016722-983e48a2cd10?q=80&w=600',
        description: item.description || '',
        reviews: item.reviews || [],
        amenities: item.amenities || [],
        accessibility: item.accessibility || [],
        interest: item.interest || [],
        createdAt: item.createdAt || new Date().toISOString()
      };
      
      const docRef = doc(db, 'places', placeId);
      batch.set(docRef, placeData);
      count++;
      
      // If we reach batch limit, commit and create a new batch
      if (count === BATCH_LIMIT) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
        console.log(`Committed batch of ${BATCH_LIMIT} items...`);
      }
    }
    
    // Commit any remaining items
    if (count > 0) {
      await batch.commit();
      console.log(`Committed final batch of ${count} items.`);
    }
    
    // Save metadata tracking document to prevent future re-seeding of same dataset
    await setDoc(metadataRef, { datasetId: CURRENT_DATASET_ID, seededAt: new Date().toISOString() });
    console.log('Firestore successfully seeded with all', items.length, 'places!');
  } catch (error) {
    console.error('Error seeding Firestore database:', error);
  }
}
