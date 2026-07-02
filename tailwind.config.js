/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(214 32% 91%)',
        input: 'hsl(214 32% 91%)',
        ring: 'hsl(24 95% 45%)',
        background: 'hsl(0 0% 100%)',
        foreground: 'hsl(222 47% 11%)',
        muted: {
          DEFAULT: 'hsl(210 40% 96%)',
          foreground: 'hsl(215 16% 42%)',
        },
        brand: {
          DEFAULT: 'hsl(21 90% 48%)',
          foreground: 'hsl(0 0% 100%)',
          dark: 'hsl(21 90% 40%)',
        },
        destructive: {
          DEFAULT: 'hsl(0 72% 45%)',
          foreground: 'hsl(0 0% 100%)',
        },
      },
      borderRadius: {
        lg: '0.6rem',
        md: '0.45rem',
        sm: '0.3rem',
      },
    },
  },
  plugins: [],
}
