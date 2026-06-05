import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyAbx-E4KaVeDVGLoiWDArguHHNv_KYF6ss",
  authDomain: "travel-buddy-app-c5367.firebaseapp.com",
  projectId: "travel-buddy-app-c5367",
  storageBucket: "travel-buddy-app-c5367.firebasestorage.app",
  messagingSenderId: "470711873893",
  appId: "1:470711873893:web:df51706a8dd9d0af3c718c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
