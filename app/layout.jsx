import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: 'PDF Text Reader',
  description: 'Read and translate PDF text',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'sans-serif', overflowY: 'hidden' }} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
