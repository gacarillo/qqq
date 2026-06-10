/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        copa: {
          green: '#009C3B',
          'green-dark': '#007A2E',
          yellow: '#FFDF00',
          'yellow-dark': '#E6C800',
          blue: '#002776',
          'blue-light': '#1A3A8C',
          white: '#F8F8F8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'copa-gradient': 'linear-gradient(135deg, #009C3B 0%, #002776 100%)',
        'copa-gradient-y': 'linear-gradient(180deg, #002776 0%, #009C3B 100%)',
      },
    },
  },
  plugins: [],
};
