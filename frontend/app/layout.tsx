import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import Navigation from "@/components/Navigation";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Water Trading Platform",
  description: "A platform for farmers to buy and sell water and water credits",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        // Global theme variables
        variables: {
          colorPrimary: "#004434",
          colorText: "#0f172a",        // slate-900
          colorBackground: "white",
          borderRadius: "1rem",        // ~rounded-2xl
          fontFamily: inter.style.fontFamily,
        },
        // Tailwind-y element overrides
        elements: {
          card: "rounded-2xl border border-slate-200 shadow-lg",
          headerTitle: "text-slate-900",
          headerSubtitle: "text-slate-600",

          formButtonPrimary:
            "bg-[#004434] hover:bg-[#00392f] text-white rounded-xl focus:ring-2 focus:ring-[#004434]",

          formFieldInput:
            "rounded-xl border-slate-300 focus:ring-2 focus:ring-[#004434] focus:border-[#004434]",
          formFieldLabel: "text-slate-700",

          footerActionLink: "text-[#004434] hover:text-[#00392f]",
          formFieldAction: "text-[#004434] hover:text-[#00392f]",

          socialButtonsBlockButton:
            "rounded-xl border-slate-300 hover:bg-slate-50",
        },
      }}
    >
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
