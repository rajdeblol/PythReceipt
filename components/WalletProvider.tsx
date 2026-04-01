"use client"
import { FC, ReactNode, useMemo } from "react"
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom"
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare"
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack"
import { SOLANA_DEVNET_RPC } from "@/lib/constants"
import "@solana/wallet-adapter-react-ui/styles.css"

const ConnectionProviderCompat = ConnectionProvider as unknown as FC<{ endpoint: string; children: ReactNode }>
const WalletProviderCompat = WalletProvider as unknown as FC<{ wallets: any[]; autoConnect?: boolean; children: ReactNode }>
const WalletModalProviderCompat = WalletModalProvider as unknown as FC<{ children: ReactNode }>

export const WalletContextProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new BackpackWalletAdapter(),
  ], [])
  return (
    <ConnectionProviderCompat endpoint={SOLANA_DEVNET_RPC}>
      <WalletProviderCompat wallets={wallets} autoConnect>
        <WalletModalProviderCompat>{children}</WalletModalProviderCompat>
      </WalletProviderCompat>
    </ConnectionProviderCompat>
  )
}
