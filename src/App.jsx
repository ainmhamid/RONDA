import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';

// Pages
import SplashScreen from './pages/SplashScreen';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import PlaceDetail from './pages/PlaceDetail';
import MapPage from './pages/MapPage';
import ChatbotPage from './pages/ChatbotPage';
import CalendarPage from './pages/CalendarPage';
import ProfilePage from './pages/ProfilePage';

// Components
import BottomNav from './components/BottomNav';

// Global Styles
import './styles/global.css';

function AppContent() {
  const location = useLocation();
  const { currentUser } = useAuth();

  // Hide BottomNav on Splash and Auth pages
  const hideNav = location.pathname === '/' || location.pathname === '/auth';

  // Basic Route guard: Redirect to /auth if not logged in
  const RequireAuth = ({ children }) => {
    if (!currentUser) {
      // Allow Splash
      return <AuthPage />;
    }
    // Also guard if email is unverified
    if (!currentUser.emailVerified) {
      return <AuthPage />;
    }
    return children;
  };

  return (
    <>
      <Routes>
        <Route path="/" element={<SplashScreen />} />
        <Route path="/auth" element={<AuthPage />} />
        
        {/* Guarded App Screens */}
        <Route path="/home" element={<RequireAuth><HomePage /></RequireAuth>} />
        <Route path="/place/:id" element={<RequireAuth><PlaceDetail /></RequireAuth>} />
        <Route path="/map" element={<RequireAuth><MapPage /></RequireAuth>} />
        <Route path="/chatbot" element={<RequireAuth><ChatbotPage /></RequireAuth>} />
        <Route path="/calendar" element={<RequireAuth><CalendarPage /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        
        {/* Default fallback */}
        <Route path="*" element={<SplashScreen />} />
      </Routes>
      
      {!hideNav && currentUser && currentUser.emailVerified && <BottomNav />}
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <Router>
            <AppContent />
          </Router>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
