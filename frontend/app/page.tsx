'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import Link from 'next/link'

export default function Home() {
  const router = useRouter()
  const { user, setAuth } = useAuthStore()
  const [evmAddress, setEvmAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!evmAddress.trim()) {
      setError('Please enter an address')
      return
    }

    // Basic validation - should start with 0x and be 42 chars
    if (!evmAddress.startsWith('0x') || evmAddress.length !== 42) {
      setError('Invalid address format. Must be a valid 0x... address')
      return
    }

    try {
      setLoading(true)
      setError('')
      const { token, user } = await api.login(evmAddress)
      setAuth(token, user)
      router.push('/squads')
    } catch (err) {
      setError('Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // If already logged in, show dashboard
  if (user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="max-w-2xl w-full space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">Polymarket Social Squads</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              Turn trading into a social team sport with your friends
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
              <div className="flex items-center gap-4 mb-4">
                <img
                  src={user.avatarUrl}
                  alt="Avatar"
                  className="w-16 h-16 rounded-full"
                />
                <div>
                  <p className="font-semibold">{user.username}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {user.evmAddress?.slice(0, 6)}...{user.evmAddress?.slice(-4)}
                  </p>
                </div>
              </div>

              {user.polymarketUserAddress ? (
                <p className="text-sm text-green-600 dark:text-green-400">
                  ✓ Polymarket address configured
                </p>
              ) : (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  ⚠ Please add your Polymarket address in Profile
                </p>
              )}
            </div>

            <div className="flex gap-4">
              <Link
                href="/profile"
                className="flex-1 px-6 py-3 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition text-center"
              >
                Profile
              </Link>
              <Link
                href="/squads"
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-center"
              >
                My Squads
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Login form
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">Polymarket Social Squads</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Turn trading into a social team sport with your friends
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-lg">
          <h2 className="text-2xl font-bold mb-6 text-center">Demo Login</h2>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Enter Any EVM Address
              </label>
              <input
                type="text"
                value={evmAddress}
                onChange={(e) => setEvmAddress(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                placeholder="0x..."
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-2">
                For demo purposes, just paste any Ethereum address. 
                The app will create or log into that user.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Logging in...' : 'Login / Create User'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 mb-3">
              💡 <strong>Quick Demo Addresses:</strong>
            </p>
            <div className="space-y-1 text-xs font-mono">
              <button
                type="button"
                onClick={() => setEvmAddress('0x1234567890123456789012345678901234567890')}
                className="w-full text-left px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Alex: 0x1234...7890
              </button>
              <button
                type="button"
                onClick={() => setEvmAddress('0xABCDEF1234567890ABCDEF1234567890ABCDEF12')}
                className="w-full text-left px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Steve: 0xABCD...EF12
              </button>
              <button
                type="button"
                onClick={() => setEvmAddress('0x9876543210987654321098765432109876543210')}
                className="w-full text-left px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                Jordan: 0x9876...3210
              </button>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
          <p className="text-sm text-blue-800 dark:text-blue-200">
            <strong>Note:</strong> To claim NFT prizes, you'll need to verify wallet ownership 
            on your profile page after logging in.
          </p>
        </div>
      </div>
    </div>
  )
}
