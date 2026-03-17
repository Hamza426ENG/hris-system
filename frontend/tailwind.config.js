/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        'oe': {
          'bg': '#F1F5F9',
          'surface': '#FFFFFF',
          'card': '#FFFFFF',
          'border': '#E2E8F0',
          'primary': '#1D6BE4',
          'primary-hover': '#1558C7',
          'accent': '#2563EB',
          'purple': '#7C3AED',
          'cyan': '#0891B2',
          'success': '#059669',
          'warning': '#D97706',
          'danger': '#DC2626',
          'text': '#0F172A',
          'muted': '#64748B',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
