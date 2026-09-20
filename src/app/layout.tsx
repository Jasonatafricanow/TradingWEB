import type { Metadata } from 'next';
import Script from 'next/script';
import { Geist, Hanken_Grotesk, JetBrains_Mono, Playfair_Display } from 'next/font/google';
import './globals.css';
import { ClientProviders } from '@/components/client-providers';
import { organizationJsonLd } from '@/lib/seo';
import { db } from '@/lib/db';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' });
const hankenGrotesk = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken' });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono-custom' });
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-serif-custom' });

export const metadata: Metadata = {
  title: {
    default: 'GlobalTrade - Cross-Border Commerce',
    template: '%s | GlobalTrade',
  },
  description:
    'Professional consulting services and quality digital goods for international trade.',
  manifest: '/manifest.webmanifest',
  keywords: [
    'cross-border trade',
    'consulting',
    'digital goods',
    'international commerce',
    'PayPal',
    'Visa',
  ],
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let activeTheme = 'shopify';
  try {
    const [rows] = await db.$client.execute(
      "SELECT `value` FROM `site_settings` WHERE `key` = ?",
      ["site.theme"]
    );
    const results = rows as { value: string | null }[];
    if (results.length > 0 && results[0].value) {
      activeTheme = results[0].value;
    }
  } catch {
    // Fallback if db is not connected or error during build
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`antialiased theme-${activeTheme} ${geist.variable} ${hankenGrotesk.variable} ${jetbrainsMono.variable} ${playfair.variable}`}>
        {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
          <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
        ) : null}
        {process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ? (
          <Script src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js" strategy="afterInteractive" />
        ) : null}
        {/* JSON-LD 组织结构化数据 */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: organizationJsonLd() }}
        />
        <ClientProviders activeTheme={activeTheme}>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}


