import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DomainFlow',
  description: 'Track domains, not tasks.',
  manifest: '/manifest.json',
  icons: {
    icon: '/logo_bar.png',
    shortcut: '/logo_bar.png',
    apple: '/logo_bar.png',
  },
  themeColor: '#3b82f6',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
