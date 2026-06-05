import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import './BottomNav.css';

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

  const getActiveTab = () => {
    const path = location.pathname;
    if (path === '/' || path.startsWith('/home')) return 'home';
    if (path.startsWith('/map')) return 'map';
    if (path.startsWith('/chatbot')) return 'chatbot';
    if (path.startsWith('/calendar')) return 'calendar';
    if (path.startsWith('/profile')) return 'profile';
    return 'home';
  };

  const activeTab = getActiveTab();

  const handleTabClick = (tab) => {
    navigate(`/${tab === 'home' ? 'home' : tab}`);
  };

  return (
    <div className="bottom-nav">
      <div 
        className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
        onClick={() => handleTabClick('home')}
      >
        <img 
          src="/Entites/Home Icon.png" 
          alt={t('home')} 
          className="nav-icon"
        />
      </div>

      <div 
        className={`nav-item ${activeTab === 'map' ? 'active' : ''}`}
        onClick={() => handleTabClick('map')}
      >
        <img 
          src="/Entites/Map Icon.png" 
          alt={t('map')} 
          className="nav-icon"
        />
      </div>

      <div 
        className="nav-chatbot-container"
        onClick={() => handleTabClick('chatbot')}
      >
        <div className={`nav-chatbot-button ${activeTab === 'chatbot' ? 'active' : ''}`}>
          <img 
            src="/Entites/Chatbot Icon (white).png" 
            alt={t('chatbot')} 
            className="chatbot-icon"
          />
        </div>
      </div>

      <div 
        className={`nav-item ${activeTab === 'calendar' ? 'active' : ''}`}
        onClick={() => handleTabClick('calendar')}
      >
        <img 
          src="/Entites/Calendar Icon.png" 
          alt={t('calendar')} 
          className="nav-icon"
        />
      </div>

      <div 
        className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
        onClick={() => handleTabClick('profile')}
      >
        <img 
          src="/Entites/Profile Icon.png" 
          alt={t('profile')} 
          className="nav-icon"
        />
      </div>
    </div>
  );
}
