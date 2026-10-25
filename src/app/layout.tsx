import './globals.css';
import { Navbar } from '@/components/Navbar';

export const metadata = {
  title: 'ProofChain AI',
  description: 'AI-powered supply chain verification',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 font-sans antialiased">
        <Navbar />
        <div className="min-h-[calc(100vh-57px)]">{children}</div>
        <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-400">
          ProofChain AI — Blockchain record proves integrity, not truth.
        </footer>
      </body>
    </html>
  );
}
