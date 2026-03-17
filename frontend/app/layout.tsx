import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "kampeerhub",
  description: "Camping zoeker voor Europa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl">
      <body className="antialiased font-mono">
        {children}
      </body>
    </html>
  );
}
