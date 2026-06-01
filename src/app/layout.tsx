import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NoteHealth",
  description: "A local-first health checker for your Markdown knowledge base.",
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
