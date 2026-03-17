/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        'oe': {
          'bg': '#070B14',
          'surface': '#0F1829',
          'card': '#111827',
          'border': '#1E3A5F',
          'primary': '#1D6BE4',
          'primary-hover': '#1558c7',
          'accent': '#5B8DEF',
          'purple': '#7C5CFC',
          'cyan': '#00D4FF',
          'success': '#00D4AA',
          'warning': '#F5A623',
          'danger': '#FF4D6D',
          'text': '#E8F0FE',
          'muted': '#6B8DB5',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
