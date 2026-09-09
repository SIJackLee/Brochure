import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Drive the Air | SUNG-IL',
  description: 'A 3D smart ventilation brochure concept for SUNG-IL.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
