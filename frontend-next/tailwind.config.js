/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        'oe': {
          'bg':           'rgb(var(--oe-bg) / <alpha-value>)',
          'surface':      'rgb(var(--oe-surface) / <alpha-value>)',
          'card':         'rgb(var(--oe-card) / <alpha-value>)',
          'border':       'rgb(var(--oe-border) / <alpha-value>)',
          'primary':      'rgb(var(--oe-primary) / <alpha-value>)',
          'primary-hover':'rgb(var(--oe-primary-hover) / <alpha-value>)',
          'accent':       'rgb(var(--oe-accent) / <alpha-value>)',
          'purple':       'rgb(var(--oe-purple) / <alpha-value>)',
          'cyan':         'rgb(var(--oe-cyan) / <alpha-value>)',
          'success':      'rgb(var(--oe-success) / <alpha-value>)',
          'warning':      'rgb(var(--oe-warning) / <alpha-value>)',
          'danger':       'rgb(var(--oe-danger) / <alpha-value>)',
          'text':         'rgb(var(--oe-text) / <alpha-value>)',
          'muted':        'rgb(var(--oe-muted) / <alpha-value>)',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
