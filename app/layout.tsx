import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YTResearch",
  description: "YouTube content intelligence and production engine.",
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
