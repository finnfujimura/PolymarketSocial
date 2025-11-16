import { Router } from 'express';
import { supabase } from '../supabase';
import { authMiddleware, AuthRequest } from '../auth';
import NodeCache from 'node-cache';
import { io as socketClient } from 'socket.io-client';
import jwt from 'jsonwebtoken';

const router = Router();
const pnlCache = new NodeCache({ stdTTL: 30 }); // 30 second TTL

// Initialize Socket.IO client to send messages to chat
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET!;
const socket = socketClient(BACKEND_URL, {
  auth: {
    token: jwt.sign({ evmAddress: '0xBOT0000000000000000000000000000000000000' }, JWT_SECRET),
  },
});

// Helper to generate a random 6-character invite code
function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper to get squad with members
async function getSquadWithMembers(squadId: number) {
  const { data: squad, error: squadError } = await supabase
    .from('squads')
    .select('*')
    .eq('id', squadId)
    .single();

  if (squadError || !squad) {
    return null;
  }

  const { data: memberRows, error: membersError } = await supabase
    .from('squad_members')
    .select('userId')
    .eq('squadId', squadId);

  if (membersError) {
    return null;
  }

  const userIds = memberRows.map(m => m.userId);
  
  if (userIds.length === 0) {
    return { ...squad, members: [] };
  }

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('*')
    .in('evmAddress', userIds);

  if (usersError) {
    return null;
  }

  const members = users.map(user => ({
    ...user,
    avatarUrl: `https://api.dicebear.com/9.x/pixel-art/svg?seed=${user.evmAddress}`,
  }));

  return { ...squad, members };
}

// GET /api/squads - Get all squads for current user
router.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { data: memberRows, error: memberError } = await supabase
      .from('squad_members')
      .select('squadId')
      .eq('userId', req.userId);

    if (memberError) {
      throw memberError;
    }

    if (!memberRows || memberRows.length === 0) {
      return res.json({ squads: [] });
    }

    const squadIds = memberRows.map(m => m.squadId);

    const squads = await Promise.all(
      squadIds.map(id => getSquadWithMembers(id))
    );

    const validSquads = squads.filter(s => s !== null);

    res.json({ squads: validSquads });
  } catch (error) {
    console.error('Get squads error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/squads/:id - Get details for a single squad
router.get('/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const squadId = parseInt(req.params.id);

    if (isNaN(squadId)) {
      return res.status(400).json({ message: 'Invalid squad ID' });
    }

    // Check if user is a member
    const { data: membership, error: memberError } = await supabase
      .from('squad_members')
      .select('*')
      .eq('squadId', squadId)
      .eq('userId', req.userId)
      .single();

    if (memberError || !membership) {
      return res.status(403).json({ message: 'You are not a member of this squad' });
    }

    const squad = await getSquadWithMembers(squadId);

    if (!squad) {
      return res.status(404).json({ message: 'Squad not found' });
    }

    res.json({ squad });
  } catch (error) {
    console.error('Get squad error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/squads/create - Create a new squad
router.post('/create', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'Squad name is required' });
    }

    const inviteCode = generateInviteCode();

    // Create squad
    const { data: squad, error: squadError } = await supabase
      .from('squads')
      .insert({
        name: name.trim(),
        inviteCode,
      })
      .select()
      .single();

    if (squadError) {
      throw squadError;
    }

    // Add creator as first member
    const { error: memberError } = await supabase
      .from('squad_members')
      .insert({
        squadId: squad.id,
        userId: req.userId,
      });

    if (memberError) {
      throw memberError;
    }

    const fullSquad = await getSquadWithMembers(squad.id);

    res.json({ squad: fullSquad });
  } catch (error) {
    console.error('Create squad error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/squads/join - Join a squad with invite code
router.post('/join', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { inviteCode } = req.body;

    if (!inviteCode || typeof inviteCode !== 'string') {
      return res.status(400).json({ message: 'Invite code is required' });
    }

    // Find squad by invite code
    const { data: squad, error: squadError } = await supabase
      .from('squads')
      .select('*')
      .eq('inviteCode', inviteCode.trim().toUpperCase())
      .single();

    if (squadError || !squad) {
      return res.status(404).json({ message: 'Squad not found with that invite code' });
    }

    // Check if already a member
    const { data: existingMember } = await supabase
      .from('squad_members')
      .select('*')
      .eq('squadId', squad.id)
      .eq('userId', req.userId)
      .single();

    if (existingMember) {
      const fullSquad = await getSquadWithMembers(squad.id);
      return res.json({ squad: fullSquad, message: 'You are already a member of this squad' });
    }

    // Check member count (3-10 limit from spec)
    const { data: members, error: countError } = await supabase
      .from('squad_members')
      .select('userId')
      .eq('squadId', squad.id);

    if (countError) {
      throw countError;
    }

    if (members.length >= 10) {
      return res.status(400).json({ message: 'Squad is full (max 10 members)' });
    }

    // Add member
    const { error: memberError } = await supabase
      .from('squad_members')
      .insert({
        squadId: squad.id,
        userId: req.userId,
      });

    if (memberError) {
      throw memberError;
    }

    const fullSquad = await getSquadWithMembers(squad.id);

    res.json({ squad: fullSquad });
  } catch (error) {
    console.error('Join squad error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/squads/:id/messages - Get chat messages for a squad
router.get('/:id/messages', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const squadId = parseInt(req.params.id);

    if (isNaN(squadId)) {
      return res.status(400).json({ message: 'Invalid squad ID' });
    }

    // Verify user is a member
    const { data: membership, error: memberError } = await supabase
      .from('squad_members')
      .select('*')
      .eq('squadId', squadId)
      .eq('userId', req.userId)
      .single();

    if (memberError || !membership) {
      return res.status(403).json({ message: 'You are not a member of this squad' });
    }

    // Get last 200 messages
    const { data: messages, error: messagesError } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('squadId', squadId)
      .order('timestamp', { ascending: true })
      .limit(200);

    if (messagesError) {
      throw messagesError;
    }

    // Get unique author addresses
    const authorAddresses = [...new Set(messages.map(m => m.authorAddress).filter(Boolean))];

    // Fetch user data for all authors
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .in('evmAddress', authorAddresses);

    if (usersError) {
      throw usersError;
    }

    // Create user map
    const userMap = new Map(users.map(u => [u.evmAddress, u]));

    // Format messages
    const formattedMessages = messages.map(msg => {
      const author = msg.authorAddress ? userMap.get(msg.authorAddress) : null;
      return {
        id: msg.id.toString(),
        squadId: squadId.toString(),
        author: author ? {
          evmAddress: author.evmAddress,
          username: author.username || 'Anonymous',
          avatarUrl: `https://api.dicebear.com/9.x/pixel-art/svg?seed=${author.evmAddress}`,
        } : {
          evmAddress: 'bot',
          username: 'Bot',
          avatarUrl: 'https://api.dicebear.com/9.x/pixel-art/svg?seed=bot',
        },
        content: msg.content,
        isBot: msg.isBot,
        timestamp: msg.timestamp,
      };
    });

    res.json({ messages: formattedMessages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/squads/:id/leaderboard - Get live PnL leaderboard for squad
router.get('/:id/leaderboard', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const squadId = parseInt(req.params.id);
    const userId = req.userId!;
    const timeframe = req.query.timeframe as string || 'all'; // all, weekly, daily

    if (isNaN(squadId)) {
      return res.status(400).json({ message: 'Invalid squad ID' });
    }

    // Verify user is a member of this squad
    const { data: membership, error: memberError } = await supabase
      .from('squad_members')
      .select('*')
      .eq('squadId', squadId)
      .eq('userId', userId)
      .single();

    if (memberError || !membership) {
      return res.status(403).json({ message: 'You are not a member of this squad' });
    }

    // Check cache first
    const cacheKey = `leaderboard:${squadId}:${timeframe}`;
    const cached = pnlCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Get all squad members
    const { data: memberRows, error: membersError } = await supabase
      .from('squad_members')
      .select('userId')
      .eq('squadId', squadId);

    if (membersError || !memberRows || memberRows.length === 0) {
      return res.json({ leaderboard: [] });
    }

    const userIds = memberRows.map(m => m.userId);

    // Get user details
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .in('evmAddress', userIds);

    if (usersError || !users) {
      return res.status(500).json({ message: 'Failed to fetch users' });
    }

    const POLYMARKET_API_KEY = process.env.POLYMARKET_ADMIN_API_KEY;

    // Calculate time filter based on timeframe
    // Note: For daily/weekly, we show realized PnL from closed positions + current open position value
    // This gives a sense of "performance during this period" even if positions aren't closed yet
    let startTimestamp: number | null = null;
    if (timeframe === 'weekly') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      startTimestamp = Math.floor(weekAgo.getTime() / 1000);
    } else if (timeframe === 'daily') {
      const dayAgo = new Date();
      dayAgo.setDate(dayAgo.getDate() - 1);
      startTimestamp = Math.floor(dayAgo.getTime() / 1000);
    }

    // Fetch PnL for each member
    const leaderboard = await Promise.all(
      users.map(async (user: any) => {
        
        // If no polymarket address, return 0 PnL
        if (!user.polymarketUserAddress) {
          return {
            evmAddress: user.evmAddress,
            username: user.username || 'Anonymous',
            avatarUrl: user.avatarUrl || `https://api.dicebear.com/9.x/pixel-art/svg?seed=${user.evmAddress}`,
            totalLivePnl: 0,
          };
        }

        try {
          // Build URL with optional start time filter
          const closedUrl = startTimestamp
            ? `https://data-api.polymarket.com/closed-positions?user=${user.polymarketUserAddress}&limit=50&sortBy=REALIZEDPNL&start=${startTimestamp}`
            : `https://data-api.polymarket.com/closed-positions?user=${user.polymarketUserAddress}&limit=50&sortBy=REALIZEDPNL`;

          // Fetch closed positions and open positions value in parallel
          const [closedResponse, valueResponse] = await Promise.all([
            fetch(closedUrl, {
              headers: { Authorization: `Bearer ${POLYMARKET_API_KEY}` },
            }),
            fetch(
              `https://data-api.polymarket.com/value?user=${user.polymarketUserAddress}`,
              {
                headers: {
                  Authorization: `Bearer ${POLYMARKET_API_KEY}`,
                },
              }
            ),
          ]);

          if (!closedResponse.ok || !valueResponse.ok) {
            console.error(`Failed to fetch data for ${user.username}: closed=${closedResponse.status}, value=${valueResponse.status}`);
            return {
              evmAddress: user.evmAddress,
              username: user.username || 'Anonymous',
              avatarUrl: user.avatarUrl || `https://api.dicebear.com/9.x/pixel-art/svg?seed=${user.evmAddress}`,
              totalLivePnl: 0,
            };
          }

          const closedPositions = await closedResponse.json();
          const valueData: any = await valueResponse.json();

          // Filter closed positions by time if needed
          let filteredClosedPositions = closedPositions;
          if (startTimestamp && Array.isArray(closedPositions)) {
            filteredClosedPositions = closedPositions.filter((pos: any) => {
              // The timestamp field appears to be in seconds already (not milliseconds)
              const timestamp = pos.timestamp;
              if (!timestamp) return false;
              
              // Timestamp is already in seconds, just compare directly
              return timestamp >= startTimestamp;
            });
            
            console.log(`Timeframe: ${timeframe}, Total positions: ${closedPositions.length}, Filtered: ${Array.isArray(filteredClosedPositions) ? filteredClosedPositions.length : 0}, StartTime: ${startTimestamp}`);
          }

          // Sum up realizedPnl from filtered closed positions
          const realizedPnl = Array.isArray(filteredClosedPositions)
            ? filteredClosedPositions.reduce((sum: number, pos: any) => sum + (pos.realizedPnl || 0), 0)
            : 0;

          // For "all time", include open positions value. For daily/weekly, only show realized PnL
          const openPositionsValue = timeframe === 'all' ? (valueData?.value || 0) : 0;

          // Total PnL = realized (from closed positions) + unrealized (from open positions, all-time only)
          const totalLivePnl = realizedPnl + openPositionsValue;
          
          if (timeframe !== 'all') {
            console.log(`User ${user.username}: realizedPnl=${realizedPnl}, total=${totalLivePnl}`);
          }

          return {
            evmAddress: user.evmAddress,
            username: user.username || 'Anonymous',
            avatarUrl: user.avatarUrl || `https://api.dicebear.com/9.x/pixel-art/svg?seed=${user.evmAddress}`,
            totalLivePnl: parseFloat(totalLivePnl.toFixed(2)),
          };
        } catch (error) {
          console.error(`Error fetching PnL for ${user.username}:`, error);
          return {
            evmAddress: user.evmAddress,
            username: user.username || 'Anonymous',
            avatarUrl: user.avatarUrl || `https://api.dicebear.com/9.x/pixel-art/svg?seed=${user.evmAddress}`,
            totalLivePnl: 0,
          };
        }
      })
    );

    // Sort by PnL descending
    leaderboard.sort((a, b) => b.totalLivePnl - a.totalLivePnl);

    const result = { leaderboard };

    // Cache for 30 seconds
    pnlCache.set(cacheKey, result);

    res.json(result);
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/squads/:id/calculate-winner - Calculate and save weekly MVP winner
router.post('/:id/calculate-winner', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const squadId = parseInt(req.params.id);
    const userId = req.userId!;

    if (isNaN(squadId)) {
      return res.status(400).json({ message: 'Invalid squad ID' });
    }

    // Verify user is a member of this squad
    const { data: membership, error: memberError } = await supabase
      .from('squad_members')
      .select('*')
      .eq('squadId', squadId)
      .eq('userId', userId)
      .single();

    if (memberError || !membership) {
      return res.status(403).json({ message: 'You are not a member of this squad' });
    }

    // Get leaderboard data (reuse the same logic)
    const cacheKey = `leaderboard:${squadId}`;
    let leaderboard: any[] = [];

    // Try to get from cache first
    const cached = pnlCache.get(cacheKey);
    if (cached && (cached as any).leaderboard) {
      leaderboard = (cached as any).leaderboard;
    } else {
      // Fetch fresh leaderboard data
      const { data: memberRows } = await supabase
        .from('squad_members')
        .select('userId')
        .eq('squadId', squadId);

      if (!memberRows || memberRows.length === 0) {
        return res.status(400).json({ message: 'No members in squad' });
      }

      const userIds = memberRows.map(m => m.userId);
      const { data: users } = await supabase
        .from('users')
        .select('*')
        .in('evmAddress', userIds);

      if (!users) {
        return res.status(500).json({ message: 'Failed to fetch users' });
      }

      const POLYMARKET_API_KEY = process.env.POLYMARKET_ADMIN_API_KEY;

      leaderboard = await Promise.all(
        users.map(async (user: any) => {
          if (!user.polymarketUserAddress) {
            return {
              evmAddress: user.evmAddress,
              username: user.username || 'Anonymous',
              totalLivePnl: 0,
            };
          }

          try {
            const [closedResponse, valueResponse] = await Promise.all([
              fetch(
                `https://data-api.polymarket.com/closed-positions?user=${user.polymarketUserAddress}&limit=50&sortBy=REALIZEDPNL`,
                { headers: { Authorization: `Bearer ${POLYMARKET_API_KEY}` } }
              ),
              fetch(
                `https://data-api.polymarket.com/value?user=${user.polymarketUserAddress}`,
                { headers: { Authorization: `Bearer ${POLYMARKET_API_KEY}` } }
              ),
            ]);

            if (!closedResponse.ok || !valueResponse.ok) {
              return {
                evmAddress: user.evmAddress,
                username: user.username || 'Anonymous',
                totalLivePnl: 0,
              };
            }

            const closedPositions = await closedResponse.json();
            const valueData: any = await valueResponse.json();

            const realizedPnl = Array.isArray(closedPositions)
              ? closedPositions.reduce((sum: number, pos: any) => sum + (pos.realizedPnl || 0), 0)
              : 0;

            const openPositionsValue = valueData?.value || 0;
            const totalLivePnl = realizedPnl + openPositionsValue;

            return {
              evmAddress: user.evmAddress,
              username: user.username || 'Anonymous',
              totalLivePnl: parseFloat(totalLivePnl.toFixed(2)),
            };
          } catch (error) {
            return {
              evmAddress: user.evmAddress,
              username: user.username || 'Anonymous',
              totalLivePnl: 0,
            };
          }
        })
      );

      leaderboard.sort((a, b) => b.totalLivePnl - a.totalLivePnl);
    }

    if (leaderboard.length === 0) {
      return res.status(400).json({ message: 'No leaderboard data available' });
    }

    // Get the winner (top performer)
    const winner = leaderboard[0];

    // Calculate week number (1-52)
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now.getTime() - start.getTime();
    const oneWeek = 1000 * 60 * 60 * 24 * 7;
    const week = Math.floor(diff / oneWeek) + 1;

    // Check if winner already exists for this squad/week and delete it
    const { data: existingWinner } = await supabase
      .from('squad_winners')
      .select('*')
      .eq('squadId', squadId)
      .eq('week', week)
      .single();

    if (existingWinner) {
      // Delete old winner to replace with new one
      await supabase
        .from('squad_winners')
        .delete()
        .eq('squadId', squadId)
        .eq('week', week);
    }

    // Save new winner to database
    const { error: insertError } = await supabase
      .from('squad_winners')
      .insert({
        squadId,
        winnerAddress: winner.evmAddress,
        week,
        pnl: winner.totalLivePnl,
      })

    if (insertError) {
      console.error('Failed to save winner:', insertError)
      return res.status(500).json({ error: 'Failed to save winner' })
    }

    // Post winner announcement to chat
    const pnlDisplay = winner.totalLivePnl >= 0 ? `+$${winner.totalLivePnl.toFixed(2)}` : `-$${Math.abs(winner.totalLivePnl).toFixed(2)}`;
    const winnerMessage = `🏆 Week ${week} MVP: ${winner.username} with ${pnlDisplay} PnL! Congratulations! 🎉`;
    
    socket.emit('bot:broadcast', {
      squadId,
      message: winnerMessage,
    });

    res.json({
      message: 'Winner calculated successfully',
      winner: {
        evmAddress: winner.evmAddress,
        username: winner.username,
        pnl: winner.totalLivePnl,
        week,
      },
    });
  } catch (error) {
    console.error('Calculate winner error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
