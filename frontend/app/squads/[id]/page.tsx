'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useParams } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { api } from '@/lib/api'
import { io, Socket } from 'socket.io-client'
import Link from 'next/link'

interface User {
  evmAddress: string
  username: string
  avatarUrl: string
}

interface ChatMessage {
  id: string
  squadId: string
  author: User
  content: string
  isBot: boolean
  timestamp: string
}

interface Squad {
  id: number
  name: string
  inviteCode: string
  members: User[]
}

export default function SquadChatPage() {
  const router = useRouter()
  const params = useParams()
  const squadId = params.id as string
  const { token, user } = useAuthStore()

  const [squad, setSquad] = useState<Squad | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [sending, setSending] = useState(false)
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  
  const socketRef = useRef<Socket | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Load squad and messages
  useEffect(() => {
    if (!token) {
      router.push('/')
      return
    }

    const loadData = async () => {
      try {
        setLoading(true)
        const [squadData, messagesData] = await Promise.all([
          api.getSquad(token, squadId),
          api.getMessages(token, squadId),
        ])
        setSquad(squadData.squad)
        setMessages(messagesData.messages)
      } catch (err) {
        console.error('Failed to load data:', err)
        router.push('/squads')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [token, squadId, router])

  // Setup Socket.IO
  useEffect(() => {
    if (!token || !squadId) return

    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001', {
      auth: { token },
    })

    socket.on('connect', () => {
      console.log('✅ Connected to chat server')
      setConnected(true)
      socket.emit('join:squad', squadId)
    })

    socket.on('disconnect', () => {
      console.log('❌ Disconnected from chat server')
      setConnected(false)
    })

    socket.on('chat:receive', (message: ChatMessage) => {
      console.log('📩 Received message:', message)
      setMessages((prev) => [...prev, message])
    })

    socket.on('error', (error: { message: string }) => {
      console.error('Socket error:', error)
      alert(error.message)
    })

    socket.on('connect_error', (error) => {
      console.error('Connection error:', error)
      setConnected(false)
    })

    socketRef.current = socket

    return () => {
      socket.disconnect()
    }
  }, [token, squadId])

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()

    if (!socketRef.current || !newMessage.trim() || sending) return

    setSending(true)
    socketRef.current.emit('chat:send', {
      squadId,
      content: newMessage.trim(),
    })

    setNewMessage('')
    setSending(false)
  }

  const loadLeaderboard = async () => {
    if (!token) return
    
    setLoadingLeaderboard(true)
    try {
      const data = await api.getLeaderboard(token, squadId)
      setLeaderboard(data.leaderboard)
      setShowLeaderboard(true)
    } catch (err) {
      console.error('Failed to load leaderboard:', err)
      alert('Failed to load leaderboard')
    } finally {
      setLoadingLeaderboard(false)
    }
  }

  const handleCalculateWinner = async () => {
    if (!token) return
    
    setLoadingLeaderboard(true)
    try {
      await api.calculateWinner(token, squadId)
      // Winner message will appear in chat via bot:broadcast
      // Reload leaderboard to show updated state
      await loadLeaderboard()
    } catch (err: any) {
      console.error('Failed to calculate winner:', err)
      alert(err.message || 'Failed to calculate winner')
    } finally {
      setLoadingLeaderboard(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading chat...</p>
      </div>
    )
  }

  if (!squad) {
    return null
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/squads"
              className="text-blue-600 hover:text-blue-700"
            >
              ← Back
            </Link>
            <div>
              <h1 className="text-xl font-bold">{squad.name}</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {squad.members.length} member{squad.members.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => loadLeaderboard()}
              disabled={loadingLeaderboard}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
            >
              {loadingLeaderboard ? 'Loading...' : '🏆 Leaderboard'}
            </button>
            <div className={`flex items-center gap-2 text-sm ${connected ? 'text-green-600' : 'text-red-600'}`}>
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-600' : 'bg-red-600'}`}></span>
              Bot: {connected ? 'Online' : 'Offline'}
            </div>
            <div className="flex -space-x-2">
              {squad.members.slice(0, 3).map((member) => (
                <img
                  key={member.evmAddress}
                  src={member.avatarUrl}
                  alt={member.username}
                  className="w-8 h-8 rounded-full border-2 border-white dark:border-gray-800"
                  title={member.username}
                />
              ))}
              {squad.members.length > 3 && (
                <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-gray-800 flex items-center justify-center text-xs">
                  +{squad.members.length - 3}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 py-12">
              <p className="text-lg mb-2">No messages yet</p>
              <p className="text-sm">Be the first to say something!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isOwnMessage = user && msg.author?.evmAddress === user.evmAddress
              
              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'} ${msg.isBot ? 'justify-center' : ''}`}
                >
                  {!msg.isBot && msg.author && (
                    <img
                      src={msg.author.avatarUrl}
                      alt={msg.author.username}
                      className="w-10 h-10 rounded-full flex-shrink-0"
                    />
                  )}
                  <div className={`flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} max-w-[70%]`}>
                    <div className="flex items-baseline gap-2 mb-1 px-1">
                      <span className="font-semibold text-xs text-gray-600 dark:text-gray-400">
                        {msg.isBot ? '🤖 Bot' : msg.author?.username || 'Anonymous'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <div
                      className={`px-4 py-2 rounded-2xl ${
                        msg.isBot
                          ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700'
                          : isOwnMessage
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-700'
                      }`}
                    >
                      <div
                        className="text-sm break-words"
                        dangerouslySetInnerHTML={{ __html: msg.content }}
                      />
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 flex-shrink-0">
        <form onSubmit={handleSendMessage} className="max-w-4xl mx-auto flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={connected ? 'Type a message...' : 'Connecting...'}
            disabled={!connected || sending}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!connected || !newMessage.trim() || sending}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            Send
          </button>
        </form>
      </div>

      {/* Leaderboard Modal */}
      {showLeaderboard && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowLeaderboard(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl p-6 max-w-md w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">🏆 Live PnL Leaderboard</h2>
              <button
                onClick={() => setShowLeaderboard(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-2 mb-4">
              {leaderboard.map((entry, index) => (
                <div
                  key={entry.evmAddress}
                  className={`flex items-center gap-3 p-3 rounded-lg ${
                    index === 0
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 border-2 border-yellow-400'
                      : 'bg-gray-100 dark:bg-gray-700'
                  }`}
                >
                  <div className="text-2xl font-bold w-8 text-center">
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`}
                  </div>
                  <img
                    src={entry.avatarUrl}
                    alt={entry.username}
                    className="w-10 h-10 rounded-full"
                  />
                  <div className="flex-1">
                    <p className="font-medium">{entry.username}</p>
                    {entry.topPosition && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        🔥 Best: {entry.topPosition.outcome} in {entry.topPosition.title.substring(0, 30)}{entry.topPosition.title.length > 30 ? '...' : ''} (+${entry.topPosition.cashPnl})
                      </p>
                    )}
                  </div>
                  <div className={`font-bold text-lg ${
                    entry.totalLivePnl > 0
                      ? 'text-green-600'
                      : entry.totalLivePnl < 0
                      ? 'text-red-600'
                      : 'text-gray-600'
                  }`}>
                    {entry.totalLivePnl > 0 ? '+' : ''}${entry.totalLivePnl.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => loadLeaderboard()}
                disabled={loadingLeaderboard}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loadingLeaderboard ? 'Refreshing...' : '🔄 Refresh'}
              </button>
              <button
                onClick={() => setShowLeaderboard(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
