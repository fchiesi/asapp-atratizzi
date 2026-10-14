import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ASApp Atratizzi",
  description: "Atratizzi - Sublipaper App: pedidos, producao, financeiro e metas",
  manifest: "/manifest.json",
  applicationName: "ASApp",
  appleWebApp: {
    capable: true,
    title: "ASApp",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f766e" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Inline script to prevent dark mode flash (runs before paint)
const themeScript = `
(function(){
  var t=localStorage.getItem('theme');
  var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches);
  if(d)document.documentElement.classList.add('dark');
})();
`;

// Registra o Service Worker (so em producao, evita conflito com Turbopack)
const swRegisterScript = `
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function(err) {
      console.warn('SW register failed:', err);
    });
  });
}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <Script
          id="sw-register"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{ __html: swRegisterScript }}
        />
      </body>
    </html>
  );
}
