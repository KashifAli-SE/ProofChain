import './globals.css';

export const metadata = {
  title: 'ProofChain AI',
  description: 'AI-powered supply chain verification',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
