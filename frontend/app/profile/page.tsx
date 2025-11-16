'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import Link from 'next/link'

export default function ProfilePage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const { open } = useWeb3Modal()
  const { token, user, updateUser, walletVerified, setWalletVerified, logout } = useAuthStore()
  
  const [username, setUsername] = useState('')
  const [polymarketAddress, setPolymarketAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) {
      router.push('/')
      return
    }
    
    if (user) {
      setUsername(user.username || '')
      setPolymarketAddress(user.polymarketUserAddress || '')
    }
  }, [token, user, router])

  // Check if connected wallet matches logged-in address
  useEffect(() => {
    if (isConnected && address && user?.evmAddress) {
      const matches = address.toLowerCase() === user.evmAddress.toLowerCase()
      setWalletVerified(matches)
    } else {
      setWalletVerified(false)
    }
  }, [isConnected, address, user?.evmAddress, setWalletVerified])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return

    setLoading(true)
    setMessage('')

    try {
      const { user: updatedUser } = await api.updateProfile(token, {
        username: username.trim() || undefined,
        polymarketUserAddress: polymarketAddress.trim() || undefined,
      })

      updateUser(updatedUser)
      setMessage('Profile updated successfully!')
    } catch (error) {
      setMessage('Failed to update profile. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    logout()
    router.push('/')
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-blue-600 hover:text-blue-700"
          >
            ← Back to Home
          </Link>
          <button
            onClick={handleLogout}
            className="text-red-600 hover:text-red-700"
          >
            Logout
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-8 shadow-lg">
          <div className="flex items-center gap-4 mb-8">
            <img
              src={user.avatarUrl}
              alt="Avatar"
              className="w-20 h-20 rounded-full"
            />
            <div>
              <h1 className="text-2xl font-bold">Your Profile</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {user.evmAddress?.slice(0, 6)}...{user.evmAddress?.slice(-4)}
              </p>
            </div>
          </div>

          {/* Wallet Verification Section */}
          <div className="mb-8 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Wallet Verification</h3>
              {walletVerified ? (
                <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-full text-sm font-medium">
                  ✓ Verified
                </span>
              ) : (
                <span className="px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded-full text-sm font-medium">
                  Not Verified
                </span>
              )}
            </div>
            
            {walletVerified ? (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Your wallet is verified. You can claim NFT prizes!
              </p>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Connect your wallet to verify ownership and enable prize claims.
              </p>
            )}

            <button
              onClick={() => open()}
              className={`w-full px-4 py-2 rounded-lg transition ${
                walletVerified
                  ? 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isConnected 
                ? walletVerified 
                  ? 'Manage Wallet' 
                  : '⚠ Wrong Wallet Connected'
                : 'Connect Wallet to Verify'
              }
            </button>

            {isConnected && !walletVerified && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                The connected wallet ({address?.slice(0, 6)}...{address?.slice(-4)}) 
                doesn't match your login address. Please switch wallets.
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Polymarket User Address
                <span className="text-gray-500 text-xs ml-2">(Required for bot and leaderboard)</span>
              </label>
              <input
                type="text"
                value={polymarketAddress}
                onChange={(e) => setPolymarketAddress(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0x... (Your public Polymarket address)"
              />
              <p className="text-xs text-gray-500 mt-1">
                This is your public Polymarket address, not your wallet address. 
                Find it on your Polymarket profile.
              </p>
            </div>

            {message && (
              <div className={`p-4 rounded-lg ${
                message.includes('success') 
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' 
                  : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
              }`}>
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </div>

        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-6">
          <h2 className="font-semibold mb-2">About Your Avatar</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Your avatar is automatically generated from your wallet address using Dicebear. 
            It will appear in squad chats and leaderboards.
          </p>
        </div>
      </div>
    </div>
  )
}
