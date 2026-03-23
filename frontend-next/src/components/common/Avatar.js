import React from 'react';

// Returns a DiceBear avatar URL based on name seed
export const avatarUrl = (firstName, lastName, size = 80) => {
  const seed = encodeURIComponent(`${firstName || ''} ${lastName || ''}`.trim() || 'User');
  return `https://api.dicebear.com/7.x/initials/svg?seed=${seed}&backgroundColor=1D6BE4,7C5CFC,059669,D97706&backgroundType=gradientLinear&fontSize=36&fontWeight=600&size=${size}`;
};

// Avatar component — shows photo if available, otherwise DiceBear
export default function Avatar({ src, firstName, lastName, size = 40, className = '', style = {} }) {
  const fallback = avatarUrl(firstName, lastName, size * 2);
  const imgSrc = src || fallback;

  return (
    <img
      src={imgSrc}
      alt={`${firstName || ''} ${lastName || ''}`}
      width={size}
      height={size}
      className={`rounded-full object-cover flex-shrink-0 ${className}`}
      style={{ width: size, height: size, ...style }}
      onError={e => { e.target.src = fallback; }}
    />
  );
}
