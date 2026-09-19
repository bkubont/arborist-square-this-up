/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		opacity: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [i, `${i / 100}`])),
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			brand: {
  				DEFAULT: 'hsl(var(--brand))',
  				foreground: 'hsl(var(--brand-foreground))',
  				muted: 'hsl(var(--brand-muted))',
  				'muted-foreground': 'hsl(var(--brand-muted-foreground))',
  				border: 'hsl(var(--brand-border))'
  			},
  			attention: {
  				DEFAULT: 'hsl(var(--attention))',
  				foreground: 'hsl(var(--attention-foreground))',
  				muted: 'hsl(var(--attention-muted))',
  				'muted-foreground': 'hsl(var(--attention-muted-foreground))',
  				border: 'hsl(var(--attention-border))',
  				materials: 'hsl(var(--attention-materials))',
  				'materials-muted': 'hsl(var(--attention-materials-muted))',
  				'materials-foreground': 'hsl(var(--attention-materials-foreground))',
  				'materials-border': 'hsl(var(--attention-materials-border))',
  				approval: 'hsl(var(--attention-approval))',
  				'approval-muted': 'hsl(var(--attention-approval-muted))',
  				'approval-foreground': 'hsl(var(--attention-approval-foreground))',
  				'approval-border': 'hsl(var(--attention-approval-border))',
  				payment: 'hsl(var(--attention-payment))',
  				'payment-muted': 'hsl(var(--attention-payment-muted))',
  				'payment-foreground': 'hsl(var(--attention-payment-foreground))',
  				'payment-border': 'hsl(var(--attention-payment-border))'
  			},
  			surface: {
  				DEFAULT: 'hsl(var(--surface))',
  				muted: 'hsl(var(--surface-muted))'
  			},
  			page: 'hsl(var(--page))',
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))',
  				muted: 'hsl(var(--sidebar-muted))'
  			}
  		},
  		fontFamily: {
  			heading: ['var(--font-heading)'],
  			body: ['var(--font-body)'],
  			display: ['var(--font-display)'],
  			mono: ['var(--font-mono)']
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
