/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                puzzle: {
                    yellow: "#FFF44F",
                    blue: "#00BFFF",
                    dark: "#1A1A1A",
                    light: "#FDFDFD",
                    citrus: "#FFD700",
                    sky: "#87CEEB",
                }
            },
            fontFamily: {
                sans: ['Inter', 'Outfit', 'sans-serif'],
                display: ['Outfit', 'sans-serif'],
            },
            animation: {
                'float': 'float 6s ease-in-out infinite',
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-20px)' },
                }
            }
        },
    },
    plugins: [],
}
