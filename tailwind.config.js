/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Luxury high-contrast palette
        ink: {
          DEFAULT: '#0A0A0A', // 高冷黑
          soft: '#121212',
          panel: '#17171A',
          line: '#26262B'
        },
        gold: {
          DEFAULT: '#D4AF37', // 香檳金
          bright: '#F0D68A', // 高光金
          deep: '#9A7B2D',
          glow: 'rgba(212,175,55,0.35)'
        },
        ivory: '#F5F5F7' // 象牙白
      },
      fontFamily: {
        // 標題: Serif 襯線體 → VOGUE / ELLE 時尚雜誌感
        display: ['"Playfair Display"', 'Georgia', '"Times New Roman"', 'serif'],
        // 數字與按鈕: 精緻 Sans-serif
        body: ['"Montserrat"', '"Helvetica Neue"', 'Arial', 'sans-serif']
      },
      boxShadow: {
        'gold-glow': '0 0 18px rgba(212,175,55,0.35), 0 0 42px rgba(212,175,55,0.12)',
        'gold-inner': 'inset 0 1px 0 rgba(240,214,138,0.55), inset 0 -2px 6px rgba(0,0,0,0.55)',
        'metal-cell': 'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -2px 5px rgba(0,0,0,0.7)'
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #F0D68A 0%, #D4AF37 45%, #9A7B2D 100%)',
        'gold-text':
          'linear-gradient(180deg, #F7E7B4 0%, #D4AF37 38%, #9A7B2D 62%, #E8C96A 100%)',
        'metal-panel':
          'linear-gradient(160deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0) 40%, rgba(0,0,0,0.35) 100%)'
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' }
        }
      },
      animation: {
        shimmer: 'shimmer 3.2s linear infinite',
        float: 'float 5s ease-in-out infinite'
      }
    }
  },
  plugins: []
};
