import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PDF AF',
  description: 'Grade PDFs. Fix PDFs. Download results.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

