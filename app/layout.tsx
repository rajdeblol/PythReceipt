import type { Metadata } from "next"
import dynamic from "next/dynamic"
import "./globals.css"

const WalletContextProvider = dynamic(
  () => import("@/components/WalletProvider").then((m) => m.WalletContextProvider),
  { ssr: false }
)

export const metadata: Metadata = {
  title: "PythReceipt",
  description: "Cryptographic proof for every DeFi liquidation.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#050507] text-white antialiased">
        <WalletContextProvider>{children}</WalletContextProvider>
      </body>
    </html>
  )
}
