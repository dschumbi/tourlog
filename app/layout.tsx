import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import NavBar from "@/components/nav-bar";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TourLog",
  description: "Tourerfassung für Gästeführer",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "TourLog" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-gray-50">
        <NavBar />
        <main className="flex-1 container mx-auto max-w-lg md:max-w-2xl lg:max-w-4xl px-4 py-6 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-6">
          {children}
        </main>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
