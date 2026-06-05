import React from 'react';

export default function StarRating({ rating = 0, size = 16, interactive = false, onRatingChange }) {
  const roundedRating = Math.round(rating * 2) / 2; // round to nearest 0.5
  
  const handleClick = (index) => {
    if (interactive && onRatingChange) {
      onRatingChange(index + 1);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
      {[...Array(5)].map((_, i) => {
        const starValue = i + 1;
        let starChar = '☆';
        
        if (roundedRating >= starValue) {
          starChar = '★';
        } else if (roundedRating >= starValue - 0.5) {
          starChar = '⯪'; // half star unicode or customized
        }
        
        return (
          <span 
            key={i} 
            onClick={() => handleClick(i)}
            style={{ 
              color: starValue <= roundedRating ? 'var(--color-primary)' : 'var(--color-grey-medium)',
              fontSize: `${size}px`,
              cursor: interactive ? 'pointer' : 'default',
              userSelect: 'none',
              transition: 'color 0.15s ease'
            }}
          >
            ★
          </span>
        );
      })}
    </div>
  );
}
