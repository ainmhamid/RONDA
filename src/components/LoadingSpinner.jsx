import React from 'react';
import './LoadingSpinner.css';

export default function LoadingSpinner({ fullScreen = false }) {
  return (
    <div className={`spinner-container ${fullScreen ? 'fullscreen' : ''}`}>
      <div className="ronda-spinner"></div>
      <div className="spinner-text">RONDA</div>
    </div>
  );
}
