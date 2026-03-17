import React from 'react';

/**
 * Edge logo — icon (3×2 dot grid) + "EDGE" wordmark.
 * showText = false renders the icon mark only (for collapsed sidebar / favicon).
 */
export default function EdgeLogo({ height = 32, showText = true, className = '' }) {
  // Keep proportions: icon ~40px wide, full lockup ~140px wide at h=40
  const scale = height / 40;
  const iconW = Math.round(40 * scale);
  const totalW = showText ? Math.round(140 * scale) : iconW;

  return (
    <svg
      width={totalW}
      height={height}
      viewBox={`0 0 ${showText ? 140 : 40} 40`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Edge"
    >
      {/* ── Icon mark: 3 rows × 2 dots ── */}
      {/* Row 1 */}
      <circle cx="7"  cy="7"  r="5" fill="#7C3AED" />
      <circle cx="21" cy="7"  r="5" fill="#7C3AED" />
      {/* Row 2 */}
      <circle cx="7"  cy="20" r="5" fill="#7C3AED" />
      <circle cx="21" cy="20" r="5" fill="#7C3AED" />
      {/* Row 3 */}
      <circle cx="7"  cy="33" r="5" fill="#7C3AED" />
      <circle cx="21" cy="33" r="5" fill="#7C3AED" />

      {/* ── Wordmark ── */}
      {showText && (
        <text
          x="34"
          y="32"
          fontFamily="'Segoe UI', Arial, sans-serif"
          fontSize="28"
          fontWeight="900"
          letterSpacing="1"
          fill="#7C3AED"
        >
          EDGE
        </text>
      )}
    </svg>
  );
}

/**
 * Inline SVG string for non-React contexts (e.g. the salary slip HTML template).
 */
export const edgeLogoSvg = `<svg width="110" height="32" viewBox="0 0 140 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Edge">
  <circle cx="7"  cy="7"  r="5" fill="#7C3AED"/>
  <circle cx="21" cy="7"  r="5" fill="#7C3AED"/>
  <circle cx="7"  cy="20" r="5" fill="#7C3AED"/>
  <circle cx="21" cy="20" r="5" fill="#7C3AED"/>
  <circle cx="7"  cy="33" r="5" fill="#7C3AED"/>
  <circle cx="21" cy="33" r="5" fill="#7C3AED"/>
  <text x="34" y="32" font-family="'Segoe UI',Arial,sans-serif" font-size="28" font-weight="900" letter-spacing="1" fill="#7C3AED">EDGE</text>
</svg>`;
