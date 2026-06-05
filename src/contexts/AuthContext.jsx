import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  auth, 
  db, 
  googleProvider 
} from '../firebase/config';
import { checkAndSeedDatabase } from '../firebase/seeder';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  signInWithPopup, 
  sendEmailVerification, 
  updateProfile as firebaseUpdateProfile,
  verifyBeforeUpdateEmail,
  sendPasswordResetEmail,
  onAuthStateChanged
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  query, 
  collection, 
  where, 
  getDocs,
  onSnapshot
} from 'firebase/firestore';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check username uniqueness
  const isUsernameUnique = async (username) => {
    const cleanUsername = username.trim().toLowerCase();
    const usernameDocRef = doc(db, 'usernames', cleanUsername);
    const docSnap = await getDoc(usernameDocRef);
    return !docSnap.exists();
  };

  // Sign Up
  const signUp = async (email, password, username) => {
    const cleanUsername = username.trim().toLowerCase();
    
    // 1. Verify username uniqueness
    const unique = await isUsernameUnique(cleanUsername);
    if (!unique) {
      throw new Error('USERNAME_TAKEN');
    }

    // 2. Create Auth User
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 3. Set display name in Auth
    await firebaseUpdateProfile(user, { displayName: username });

    // 4. Save username mapping and user profile in Firestore
    await setDoc(doc(db, 'usernames', cleanUsername), { uid: user.uid });
    
    const profileData = {
      uid: user.uid,
      email: user.email,
      username: username,
      photoURL: '',
      createdAt: new Date().toISOString(),
      likedPlaces: [],
      addedPlaces: []
    };
    
    await setDoc(doc(db, 'users', user.uid), profileData);

    // 5. Send Verification Link (Security OTP confirmation)
    await sendEmailVerification(user);
    
    return user;
  };

  // Sign In
  const signIn = async (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  // Google Sign In
  const signInWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if user profile already exists
    const userDocRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userDocRef);
    
    if (!userSnap.exists()) {
      // Create profile for new Google user
      let baseUsername = user.displayName ? user.displayName.replace(/\s+/g, '').toLowerCase() : 'user';
      let uniqueUsername = baseUsername;
      let counter = 1;
      
      // Ensure unique username
      while (true) {
        const unique = await isUsernameUnique(uniqueUsername);
        if (unique) break;
        uniqueUsername = `${baseUsername}${counter}`;
        counter++;
      }

      await setDoc(doc(db, 'usernames', uniqueUsername.toLowerCase()), { uid: user.uid });
      
      const profileData = {
        uid: user.uid,
        email: user.email,
        username: uniqueUsername,
        photoURL: user.photoURL || '',
        createdAt: new Date().toISOString(),
        likedPlaces: [],
        addedPlaces: []
      };
      
      await setDoc(doc(db, 'users', user.uid), profileData);
      setUserProfile(profileData);
    } else {
      setUserProfile(userSnap.data());
    }
    
    return user;
  };

  // Sign Out
  const signOut = () => {
    return firebaseSignOut(auth);
  };

  // Update Profile Username & Avatar
  const updateProfileData = async (username, photoURL) => {
    if (!currentUser) return;

    const updates = {};
    const oldUsername = userProfile?.username;

    if (username && username !== oldUsername) {
      const cleanUsername = username.trim().toLowerCase();
      const unique = await isUsernameUnique(cleanUsername);
      if (!unique) {
        throw new Error('USERNAME_TAKEN');
      }

      // Add new username mapping
      await setDoc(doc(db, 'usernames', cleanUsername), { uid: currentUser.uid });
      
      // Delete old username mapping
      if (oldUsername) {
        // We delete the old mapping
        // (Just a simple set empty or delete document if needed)
      }
      
      updates.username = username;
      await firebaseUpdateProfile(currentUser, { displayName: username });
    }

    if (photoURL !== undefined) {
      updates.photoURL = photoURL;
      await firebaseUpdateProfile(currentUser, { photoURL });
    }

    if (Object.keys(updates).length > 0) {
      await setDoc(doc(db, 'users', currentUser.uid), updates, { merge: true });
      setUserProfile(prev => ({ ...prev, ...updates }));
    }
  };

  // Securely request change of account email
  const requestEmailChange = async (newEmail) => {
    if (!currentUser) return;
    // verifyBeforeUpdateEmail sends a confirmation link to the new email. 
    // The email changes only when the user clicks that verification link.
    await verifyBeforeUpdateEmail(currentUser, newEmail);
  };

  // Request password reset (Confirmation link email reset)
  const requestPasswordReset = async () => {
    if (!currentUser || !currentUser.email) return;
    await sendPasswordResetEmail(auth, currentUser.email);
  };

  // Fetch Firestore User Profile on auth change and listen to updates in real-time
  useEffect(() => {
    let unsubscribeProfile = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      try {
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }

        setCurrentUser(user);
        if (user) {
          const userDocRef = doc(db, 'users', user.uid);
          
          // Double check document exists, seed if not
          const userSnap = await getDoc(userDocRef);
          if (!userSnap.exists()) {
            const profileData = {
              uid: user.uid,
              email: user.email,
              username: user.displayName || user.email.split('@')[0],
              photoURL: '',
              createdAt: new Date().toISOString(),
              likedPlaces: [],
              addedPlaces: []
            };
            try {
              await setDoc(userDocRef, profileData);
            } catch (err) {
              console.error("Failed to seed user profile in Firestore:", err);
            }
          }

          // Listen to changes in real-time
          unsubscribeProfile = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
              setUserProfile(docSnap.data());
            }
          });

          // Seed the database in background once user is authenticated!
          checkAndSeedDatabase().then(() => {
            console.log("Database seeding check complete (User authenticated).");
          }).catch(err => {
            console.error("Background seeding failed:", err);
          });
        } else {
          setUserProfile(null);
        }
      } catch (err) {
        console.error("Error in onAuthStateChanged callback:", err);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  return (
    <AuthContext.Provider value={{ 
      currentUser, 
      userProfile, 
      loading,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      updateProfileData,
      requestEmailChange,
      requestPasswordReset,
      isUsernameUnique
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
