import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const arabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  weight: ["400", "500", "600", "700"],
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN || process.env.NEXTAUTH_URL || "http://localhost:3000"),
  title: {
    default: "مكتبة بانيورا — مكتبتك العربية للقصص",
    template: "%s · مكتبة بانيورا",
  },
  description:
    "مكتبة قراءة عربية للمانجا والمانهوا والروايات والكوميكس — اكتشف قصصًا جديدة وواصل قراءة أعمالك المفضلة.",
  applicationName: "Bunyora Library",
  openGraph: { siteName: "Bunyora Library" },
};

export const viewport: Viewport = {
  themeColor: "#0B0B10",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="dark" suppressHydrationWarning>
      <body className={`${arabic.variable} font-sans antialiased bg-background text-foreground`}>
        <AuthProvider>{children}</AuthProvider>
        <Toaster />
      </body>
    </html>
  );
}
