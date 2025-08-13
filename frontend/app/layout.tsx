import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import Navigation from "@/components/Navigation";
import "./globals.css"; // keep relative to this file

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Water Trading Platform",
  description: "A platform for farmers to buy and sell water and water credits",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={inter.className}>
          <div className="min-h-screen bg-gradient-to-br from-water-50 to-earth-50">
            <Navigation />
            <main>{children}</main>
          </div>
        </body>
      </html>
    </ClerkProvider>
  );
}
