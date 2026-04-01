'use client'

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050507] p-4 text-white">
      <h2 className="text-xl font-bold text-red-500 mb-4">Something went wrong!</h2>
      <pre className="p-4 bg-white/5 border border-white/10 rounded mb-4 max-w-full overflow-auto text-xs text-gray-400">
        {error.message}
      </pre>
      <button
        onClick={() => reset()}
        className="px-4 py-2 bg-purple-600 rounded hover:bg-purple-700 transition"
      >
        Try again
      </button>
    </div>
  )
}
