import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050507] p-4 text-white">
      <h2 className="text-xl font-bold text-purple-400 mb-4">404 - Page Not Found</h2>
      <p className="text-gray-400 mb-6">The receipt or analysis you are looking for does not exist.</p>
      <Link
        href="/"
        className="px-4 py-2 bg-purple-600 rounded hover:bg-purple-700 transition"
      >
        Return Home
      </Link>
    </div>
  )
}
