'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import Link from 'next/link'

interface User {
  evmAddress: string;
  username: string;
  polymarketUserAddress?: string;
  avatarUrl: string;
}

interface Squad {
  id: number;
  name: string;
  inviteCode: string;
  members: User[];
}

export default function SquadsPage() {
  const router = useRouter()
  const { token } = useAuthStore()
  
  const [squads, setSquads] = useState<Squad[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [newSquadName, setNewSquadName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    if (!token) {
      router.push('/')
      return
    }
    
    loadSquads()
  }, [token, router])

  const loadSquads = async () => {
    if (!token) return
    
    try {
      setLoading(true)
      const { squads: fetchedSquads } = await api.getSquads(token)
      setSquads(fetchedSquads)
    } catch (err) {
      console.error('Failed to load squads:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateSquad = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !newSquadName.trim()) return

    try {
      setActionLoading(true)
      setError('')
      const { squad } = await api.createSquad(token, newSquadName.trim())
      setSquads([...squads, squad])
      setShowCreateModal(false)
      setNewSquadName('')
    } catch (err) {
      setError('Failed to create squad. Please try again.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleJoinSquad = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !inviteCode.trim()) return

    try {
      setActionLoading(true)
      setError('')
      const { squad } = await api.joinSquad(token, inviteCode.trim())
      
      // Check if already in list
      const exists = squads.find(s => s.id === squad.id)
      if (!exists) {
        setSquads([...squads, squad])
      }
      
      setShowJoinModal(false)
      setInviteCode('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join squad')
    } finally {
      setActionLoading(false)
    }
  }

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code)
    alert('Invite code copied to clipboard!')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading squads...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/"
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              ← Back to Home
            </Link>
            <h1 className="text-3xl font-bold mt-2">My Squads</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Create Squad
            </button>
            <button
              onClick={() => setShowJoinModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              Join Squad
            </button>
          </div>
        </div>

        {squads.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-12 text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              You haven't joined any squads yet
            </p>
            <p className="text-sm text-gray-500">
              Create a new squad or join an existing one using an invite code
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {squads.map((squad) => (
              <Link
                key={squad.id}
                href={`/squads/${squad.id}`}
                className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow hover:shadow-lg transition"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-semibold mb-2">{squad.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {squad.members.length} member{squad.members.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      copyInviteCode(squad.inviteCode)
                    }}
                    className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition"
                  >
                    📋 {squad.inviteCode}
                  </button>
                </div>

                <div className="flex -space-x-2">
                  {squad.members.slice(0, 5).map((member) => (
                    <img
                      key={member.evmAddress}
                      src={member.avatarUrl}
                      alt={member.username}
                      className="w-10 h-10 rounded-full border-2 border-white dark:border-gray-800"
                      title={member.username}
                    />
                  ))}
                  {squad.members.length > 5 && (
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-gray-800 flex items-center justify-center text-xs">
                      +{squad.members.length - 5}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Create Squad Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
              <h2 className="text-2xl font-bold mb-4">Create New Squad</h2>
              <form onSubmit={handleCreateSquad} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Squad Name
                  </label>
                  <input
                    type="text"
                    value={newSquadName}
                    onChange={(e) => setNewSquadName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., The Alpha Team"
                    maxLength={50}
                    required
                  />
                </div>

                {error && (
                  <p className="text-red-600 text-sm">{error}</p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false)
                      setNewSquadName('')
                      setError('')
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {actionLoading ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Join Squad Modal */}
        {showJoinModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
              <h2 className="text-2xl font-bold mb-4">Join Squad</h2>
              <form onSubmit={handleJoinSquad} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Invite Code
                  </label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-lg text-center"
                    placeholder="ABC123"
                    maxLength={6}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter the 6-character invite code
                  </p>
                </div>

                {error && (
                  <p className="text-red-600 text-sm">{error}</p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowJoinModal(false)
                      setInviteCode('')
                      setError('')
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionLoading}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                  >
                    {actionLoading ? 'Joining...' : 'Join'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
