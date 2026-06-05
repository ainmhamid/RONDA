import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './SplashScreen.css';

export default function SplashScreen() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [animating, setAnimating] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimating(false);
      if (currentUser) {
        navigate('/home');
      } else {
        navigate('/auth');
      }
    }, 2500); // 2.5 seconds splash display

    return () => clearTimeout(timer);
  }, [currentUser, navigate]);

  return (
    <div className="splash-screen">
      <div className={`splash-content ${animating ? 'fade-in-up' : 'fade-out'}`}>
        <img src="/Entites/Chatbot Icon (Brown).png" alt="RONDA Bot" className="splash-logo" />
        <h1 className="splash-title">RONDA</h1>
        <p className="splash-subtitle">Your Travel Buddy App</p>
      </div>
    </div>
  );
}
