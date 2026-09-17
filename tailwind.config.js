/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Luxe 浅色奢华配色：奶白 / 香槟金
        // 「纸感」奶白底 + 低饱和金线，靠留白与材质而非深色压场
        ink: {
          DEFAULT: '#FBF8F1', // 主背景：奶白（暖调，非纯白）
          soft: '#F6F1E5', // 次级面板：浅奶油
          panel: '#FFFDF8', // 卡片浮层：近乎纯白，微微暖
          line: '#E6DCC6', // 分隔线：淡金砂
          deep: '#3A3226' // 深棕（仅用于正文/反色元素）
        },
        gold: {
          DEFAULT: '#C8A44D', // 香檳金（浅底上略带深，保证描边可读）
          bright: '#B9912F', // 强调金：比 DEFAULT 更深，用于文字保证对比度
          deep: '#8C6D22', // 深金：边框/阴影
          soft: '#EBD9A8', // 浅金：渐变/填充
          glow: 'rgba(200,164,77,0.28)'
        },
        ivory: {
          DEFAULT: '#3A3226', // 正文：深摩卡棕（替代原象牙白文字）
          soft: '#7A6E58' // 次级文字：灰棕
        },
        cream: '#FFFDF8',
        champagne: '#F3E7C9'
      },
      fontFamily: {
        // 標題: Serif 襯線體 → VOGUE / ELLE 時尚雜誌感
        display: ['"Playfair Display"', 'Georgia', '"Times New Roman"', 'serif'],
        // 數字與按鈕: 精緻 Sans-serif
        body: ['"Montserrat"', '"Helvetica Neue"', 'Arial', 'sans-serif']
      },
      boxShadow: {
        'gold-glow': '0 6px 18px rgba(140,109,34,0.18), 0 2px 6px rgba(140,109,34,0.12)',
        'gold-inner': 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -2px 6px rgba(140,109,34,0.18)',
        'metal-cell': 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -2px 5px rgba(140,109,34,0.15)',
        'card-soft': '0 1px 2px rgba(140,109,34,0.08), 0 8px 24px rgba(140,109,34,0.10)'
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #EFDCAB 0%, #D4AF37 45%, #B9912F 100%)',
        'gold-text':
          'linear-gradient(180deg, #C9A63F 0%, #9E7C24 45%, #C8A44D 100%)',
        'metal-panel':
          'linear-gradient(160deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.35) 40%, rgba(200,164,77,0.12) 100%)',
        'cream-panel':
          'linear-gradient(160deg, #FFFDF8 0%, #F9F4E9 55%, #F1E9D6 100%)'
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' }
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-5px)' },
          '50%': { transform: 'translateX(5px)' },
          '75%': { transform: 'translateX(-3px)' }
        }
      },
      animation: {
        shimmer: 'shimmer 3.2s linear infinite',
        float: 'float 5s ease-in-out infinite',
        shake: 'shake 0.4s ease-in-out'
      }
    }
  },
  plugins: []
};
