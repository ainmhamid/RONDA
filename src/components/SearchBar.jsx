import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import './SearchBar.css';

export default function SearchBar({ value, onChange, onSubmit }) {
  const { t } = useLanguage();

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && onSubmit) {
      onSubmit();
    }
  };

  return (
    <div className="search-bar-container">
      <input 
        type="text" 
        className="search-input" 
        placeholder={t('searchPlaceholder')} 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyPress={handleKeyPress}
      />
      <button className="search-button" onClick={onSubmit}>
        <img 
          src="/Entites/search icon (white).png" 
          alt="Search" 
          className="search-icon-img"
        />
      </button>
    </div>
  );
}
