/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        pulse: {
          idle: '#6366f1',
          working: '#3b82f6',
          learning: '#22c55e',
          focus: '#f59e0b',
          paused: '#6b7280',
          achievement: '#fbbf24'
        },
        surface: {
          dark: '#0f172a',
          card: '#1e293b',
          border: '#334155'
        }
      },
      animation: {
        'pulse-core': 'pulseCore 2s ease-in-out infinite',
        'breathe': 'breathe 4s ease-in-out infinite',
        'ripple': 'ripple 1.5s ease-out infinite',
        'heartbeat': 'heartbeat 0.8s ease-in-out infinite',
        'achievement-burst': 'achievementBurst 0.5s ease-out 3',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out'
      },
      keyframes: {
        pulseCore: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.9' },
          '50%': { transform: 'scale(1.05)', opacity: '1' }
        },
        breathe: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(99,102,241,0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(99,102,241,0.6)' }
        },
        ripple: {
          '0%': { transform: 'scale(0.8)', opacity: '0.8' },
          '100%': { transform: 'scale(1.5)', opacity: '0' }
        },
        heartbeat: {
          '0%, 100%': { transform: 'scale(1)' },
          '15%': { transform: 'scale(1.1)' },
          '30%': { transform: 'scale(1)' },
          '45%': { transform: 'scale(1.08)' },
          '60%': { transform: 'scale(1)' }
        },
        achievementBurst: {
          '0%': { transform: 'scale(1)', boxShadow: '0 0 0 rgba(251,191,36,0)' },
          '50%': { transform: 'scale(1.3)', boxShadow: '0 0 60px rgba(251,191,36,0.8)' },
          '100%': { transform: 'scale(1)', boxShadow: '0 0 0 rgba(251,191,36,0)' }
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      }
    }
  },
  plugins: []
}
