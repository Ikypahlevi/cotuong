import express from "express";
import cors from "cors";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Server } from "socket.io";
import { getMatch, incrementTurn } from "./game-service.js";

dotenv.config();

import { initializeDatabase } from "./database.js";
import { router as authRouter } from "./auth.js";
import {
  addWaitingPlayer,
  removeWaitingPlayer,
  findMatch,
  createRoom,
  getRoomById,
  getUserRoom,
  updateRoomStatus,
  startMatch,
  saveMove,
  endMatch,
  saveChatMessage,
  kickPlayerFromRoom,
  closeRoom,
  getWaitingPlayersCount,
  getRoomInfo,
  getRoomByCode,
} from "./game-service.js";
import { getConnection } from "./database.js";
import { create } from "domain";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const withTimeout = (promise, timeoutMs = 5000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Operation timeout")), timeoutMs),
    ),
  ]);
};

const app = express();
const server = http.createServer(app);
const frontendOrigin = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

const io = new Server(server, {
  cors: {
    origin: frontendOrigin,
    credentials: true,
  },
});

const disconnectTimers = new Map();

// Middleware
app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  }),
);
app.use(express.json());
app.use("/assets", express.static(path.join(__dirname, "../assets")));
app.use("/audio", express.static(path.join(__dirname, "../audio")));
app.use("/frontend", express.static(path.join(__dirname, "../frontend")));
app.use(express.static(path.join(__dirname, "../frontend")));

// Routes
app.use("/api/auth", authRouter);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date() });
});

// Serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/dashboard.html"));
});

app.get("/game", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/game.html"));
});

// ==================== SOCKET.IO EVENTS ====================

io.on("connection", (socket) => {
  console.log(`📱 Client connected: ${socket.id}`);
  const userId = socket.handshake.auth?.userId;

  if (userId && disconnectTimers.has(userId)) {
    clearTimeout(disconnectTimers.get(userId));
    disconnectTimers.delete(userId);

    console.log(`🔄 User ${userId} reconnected`);
  }
  /**
   * Join waiting queue for finding opponent
   */
  socket.on("joinQueue", async (data) => {
    try {
      const { userId, username, avatarUrl } = data;

      if (!userId) {
        socket.emit("error", { message: "User ID is required" });
        return;
      }

      // Add to waiting queue
      await addWaitingPlayer(userId, {
        username,
        avatar_url: avatarUrl,
      });

      // Store userId in socket for later reference
      socket.data.userId = userId;
      socket.data.username = username;

      // Broadcast waiting players count
      io.emit("waitingPlayersUpdate", { count: getWaitingPlayersCount() });

      // Try to find opponent
      const opponent = findMatch(userId);

      if (opponent) {
        console.log(`🎯 Match found! ${userId} vs ${opponent.userId}`);

        // Get user info for room creation
        const connection = await getConnection();
        const [user1Data] = await connection.execute(
          `SELECT u.username, u.email, p.full_name, p.avatar_url 
           FROM users u 
           LEFT JOIN user_profiles p ON u.user_id = p.user_id
           WHERE u.user_id = ?`,
          [userId],
        );
        const [user2Data] = await connection.execute(
          `SELECT u.username, u.email, p.full_name, p.avatar_url 
           FROM users u 
           LEFT JOIN user_profiles p ON u.user_id = p.user_id
           WHERE u.user_id = ?`,
          [opponent.userId],
        );

        await connection.release();
        // Get user info for room creation
        const room = await createRoom(
          userId,
          user1Data[0],
          opponent.userId,
          user2Data[0],
        );

        // Broadcast waiting players count to everyone except the matched players
        io.except(`room_${room.roomId}`).emit("waitingPlayersUpdate", {
          count: getWaitingPlayersCount(),
        });

        // Get sockets of both players and notify them directly
        const player1Socket = io.sockets.sockets.get(socket.id);
        const player2Sockets = Array.from(io.sockets.sockets.values()).filter(
          (s) => s.data.userId === opponent.userId,
        );

        // Player 1 gets normal data - they are player1 in the room object
        if (player1Socket) {
          player1Socket.join(`room_${room.roomId}`);
          player1Socket.emit("matchFound", {
            roomId: room.roomId,
            roomCode: room.roomCode,
            player1: room.player1,
            player2: room.player2,
            redPlayerId: room.redPlayerId,
            blackPlayerId: room.blackPlayerId,
            player1Id: userId,
            player2Id: opponent.userId,
          });
        }

        // Player 2 gets SWAPPED data - they are player2 in the room object
        for (const player2Socket of player2Sockets) {
          if (player2Socket) {
            player2Socket.join(`room_${room.roomId}`);
            player2Socket.emit("matchFound", {
              roomId: room.roomId,
              roomCode: room.roomCode,
              player1: room.player2,
              player2: room.player1,
              redPlayerId: room.redPlayerId,
              blackPlayerId: room.blackPlayerId,
              player1Id: opponent.userId,
              player2Id: userId,
            });
          }
        }

        // Update waiting players count
        io.to(`room_${room.roomId}`).emit("waitingPlayersUpdate", {
          count: getWaitingPlayersCount(),
        });
      } else {
        socket.emit("waitingForOpponent", {
          message: "Waiting for opponent...",
          waitingTime: 0,
        });
      }
    } catch (error) {
      console.error("❌ Error in joinQueue:", error);
      socket.emit("error", { message: error.message });
    }
  });

  /**
   * Join game room by code (rejoin after game ends)
   */
  socket.on("joinRoomByCode", async (data) => {
    try {
      const { userId, roomCode } = data;

      if (!userId || !roomCode) {
        socket.emit("error", { message: "User ID and Room Code required" });
        return;
      }

      const room = await getRoomByCode(roomCode);

      if (!room) {
        socket.emit("error", { message: "Room not found" });
        return;
      }

      // Only host can join back, and only if game ended
      if (room.host_user_id !== userId && room.status !== "ended") {
        socket.emit("error", {
          message: "Only host can join this room after game ends",
        });
        return;
      }

      socket.data.userId = userId;
      socket.data.roomId = room.room_id;

      socket.emit("roomJoined", {
        roomId: room.room_id,
        roomCode: room.room_code,
        hostUserId: room.host_user_id,
        guestUserId: room.guest_user_id,
        status: room.status,
      });
    } catch (error) {
      console.error("❌ Error in joinRoomByCode:", error);
      socket.emit("error", { message: error.message });
    }
  });

  /**
   * Both players confirm starting new match
   */
  socket.on("confirmNewMatch", async (data) => {
    try {
      const { roomId, userId, confirmed } = data;

      const room = getRoomById(roomId);
      if (!room) {
        socket.emit("error", { message: "Room not found" });
        return;
      }

      if (!confirmed) {
        // Player declined - kick guest and close room
        if (room.guestUserId === userId) {
          kickPlayerFromRoom(room.guestUserId);
          io.to(`room_${roomId}`).emit("playerKicked", {
            userId: room.guestUserId,
            reason: "Host declined new match",
          });
        } else {
          io.to(`room_${roomId}`).emit("matchDeclined", { roomId });
        }
        return;
      }

      // Both confirmed - start new match
      await updateRoomStatus(roomId, "playing");
      const matchInfo = await startMatch(roomId);

      io.to(`room_${roomId}`).emit("newMatchStarted", {
        roomId,
        matchId: matchInfo.matchId,
        redPlayerId: room.redPlayerId,
        blackPlayerId: room.blackPlayerId,
      });
    } catch (error) {
      console.error("❌ Error in confirmNewMatch:", error);
      socket.emit("error", { message: error.message });
    }
  });

  /**
   * Join game room (from matchFound)
   */
  socket.on("joinGame", async (data) => {
    try {
      const { userId, roomId: roomIdRaw } = data;
      const roomId = Number(roomIdRaw);
      if (!userId || !roomId) {
        socket.emit("error", { message: "User ID and Room ID required" });
        return;
      }
      const room = getRoomById(roomId);
      if (!room) {
        socket.emit("error", { message: "Room not found" });
        return;
      }
      // Store user info in socket
      socket.data.userId = userId;
      socket.data.roomId = roomId;
      socket.data.username =
        room.player1.userId === userId
          ? room.player1.username
          : room.player2.username;
      // Join Socket.IO room
      socket.join(`room_${roomId}`);
      const roomMembers = await io.in(`room_${roomId}`).fetchSockets();
      const memberIds = roomMembers.map((s) => s.data?.userId).filter(Boolean);
      console.log(
        `Player ${userId} joined room_${roomId}. Room members: ${memberIds.join(", ")} (total: ${roomMembers.length})`,
      );
      // Gửi thông tin đầy đủ về cả 2 người chơi
      const redPlayerName =
        room.player1.role === "red"
          ? room.player1.username
          : room.player2.username;
      const blackPlayerName =
        room.player1.role === "black"
          ? room.player1.username
          : room.player2.username;
      socket.emit("gameReady", {
        roomId,
        roomCode: room.roomCode,
        myRole: userId === room.redPlayerId ? "red" : "black",
        redPlayerName,
        blackPlayerName,
        redPlayerId: room.redPlayerId,
        blackPlayerId: room.blackPlayerId,
        opponentName:
          userId === room.redPlayerId ? blackPlayerName : redPlayerName,
        opponentAvatar: "", // Thêm avatar nếu có
        myName: socket.data.username,
        myAvatar: "", // Thêm avatar nếu có
        joinedSuccessfully: true,
      });
      // Kiểm tra cả 2 đã join chưa
      const roomSockets = await io.in(`room_${roomId}`).fetchSockets();
      console.log(`👥 Room ${roomId} has ${roomSockets.length} players`);
      if (roomSockets.length === 2) {
        const matchInfo = await startMatch(roomId);

        io.to(`room_${roomId}`).emit("gameStarted", {
          roomId,
          matchId: matchInfo.matchId,
          redPlayerId: room.redPlayerId,
          blackPlayerId: room.blackPlayerId,
        });
      }
    } catch (error) {
      console.error("❌ Error in joinGame:", error);
      socket.emit("error", { message: error.message });
    }
  });

  /**
   * Handle move
   */
  socket.on("makeMove", async (data) => {
    try {
      const { roomId: roomIdRaw, matchId, playerId, fromPos, toPos } = data;
      const roomId = Number(roomIdRaw || socket.data.roomId);

      console.log(
        `🎮 makeMove event received: roomId=${roomId}, matchId=${matchId}, playerId=${playerId}, fromPos=${fromPos}, toPos=${toPos}`,
      );

      // Validate required fields
      if (!roomId || !matchId || !playerId || !fromPos || !toPos) {
        console.log(
          `❌ Missing fields: roomId=${roomId}, matchId=${matchId}, playerId=${playerId}, fromPos=${fromPos}, toPos=${toPos}`,
        );
        socket.emit("error", { message: "Missing required move data" });
        return;
      }

      // Ensure socket has the correct room association
      if (!socket.data.roomId) {
        socket.data.roomId = roomId;
      }

      // Get room info
      const room = getRoomById(roomId);
      if (!room) {
        console.log(`❌ Room not found: roomId=${roomId}`);
        socket.emit("error", { message: "Room not found" });
        return;
      }

      console.log(
        `✅ Room found: ${roomId}, red=${room.redPlayerId}, black=${room.blackPlayerId}`,
      );

      // Validate player is in this room
      if (playerId !== room.redPlayerId && playerId !== room.blackPlayerId) {
        console.log(
          `❌ Player ${playerId} not in room ${roomId}. Red=${room.redPlayerId}, Black=${room.blackPlayerId}`,
        );
        socket.emit("error", { message: "You are not a player in this match" });
        return;
      }

      // Determine whose turn it should be (red goes first, then alternates)
      const isRedPlayer = playerId === room.redPlayerId;
      const isBlackPlayer = playerId === room.blackPlayerId;

      const match = await getMatch(matchId);
      const currentTurn = match.turn_number;

      const expectedPlayerId =
        currentTurn % 2 === 1 ? room.redPlayerId : room.blackPlayerId;

      if (playerId !== expectedPlayerId) {
        socket.emit("error", {
          message: `Not your turn!`,
          notYourTurn: true,
        });
        return;
      }

      // Save move to database
      await saveMove(matchId, playerId, currentTurn, fromPos, toPos);
      console.log(
        `✅ Move saved to DB: matchId=${matchId}, playerId=${playerId}, ${fromPos} → ${toPos}`,
      );
      // 🔥 tăng turn ở server
      await incrementTurn(matchId);

      // Determine player role for the move
      const playerRole = playerId === room.redPlayerId ? "red" : "black";

      // Get room members before broadcasting
      const roomSockets = await io.in(`room_${roomId}`).fetchSockets();
      console.log(
        `👥 Broadcasting to room_${roomId}: ${roomSockets.length} players connected`,
      );

      // Broadcast move to BOTH players in the room (using room-based emission)
      io.to(`room_${roomId}`).emit("moveMade", {
        roomId,
        matchId,
        playerId,
        playerRole,
        fromPos,
        toPos,
        turnNumber: currentTurn + 1, // gửi turn đã được increment ở server
        timestamp: new Date(),
      });

      console.log(
        `📍 Move broadcasted to room_${roomId}: ${fromPos} → ${toPos}`,
      );
    } catch (error) {
      console.error("❌ Error in makeMove:", error);
      socket.emit("error", { message: error.message });
    }
  });

  /**
   * Handle chat message
   */
  socket.on("sendMessage", async (data) => {
    try {
      const { roomId, messageText } = data;
      const userId = socket.data.userId;

      if (!userId || !roomId) {
        socket.emit("error", { message: "Missing required fields" });
        return;
      }

      await saveChatMessage(roomId, userId, messageText);

      // Broadcast to room excluding sender so own message is displayed only once locally
      socket.to(`room_${roomId}`).emit("newMessage", {
        roomId,
        senderId: userId,
        senderName: socket.data.username,
        messageText,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("❌ Error in sendMessage:", error);
      socket.emit("error", { message: error.message });
    }
  });

  /**
   * End match
   */
  socket.on("endMatch", async (data) => {
    try {
      const { matchId, winnerId, result } = data;

      await endMatch(matchId, winnerId, result);

      const room = getRoomById(socket.data.roomId);
      if (room) {
        await updateRoomStatus(socket.data.roomId, "ended");

        io.to(`room_${socket.data.roomId}`).emit("matchEnded", {
          roomId: socket.data.roomId,
          matchId,
          winnerId,
          result,
          hostUserId: room.hostUserId,
          guestUserId: room.guestUserId,
        });
      }
    } catch (error) {
      console.error("❌ Error in endMatch:", error);
      socket.emit("error", { message: error.message });
    }
  });

  /**
   * Resign match
   */
  socket.on("resign", async (data) => {
    try {
      const { matchId, playerId } = data;
      const room = getRoomById(socket.data.roomId);

      if (room) {
        const winnerId =
          room.redPlayerId === playerId ? room.blackPlayerId : room.redPlayerId;
        await endMatch(matchId, winnerId, "resign");
        await updateRoomStatus(socket.data.roomId, "ended");

        io.to(`room_${socket.data.roomId}`).emit("matchEnded", {
          roomId: socket.data.roomId,
          matchId,
          winnerId,
          result: "resign",
          hostUserId: room.hostUserId,
          guestUserId: room.guestUserId,
        });
      }
    } catch (error) {
      console.error("❌ Error in resign:", error);
      socket.emit("error", { message: error.message });
    }
  });

  /**
   * Player leaves room
   */
  socket.on("leaveRoom", async (data) => {
    try {
      const { roomId } = data;
      const userId = socket.data.userId;
      const room = getRoomById(roomId);

      if (room) {
        if (room.hostUserId === userId) {
          // Host left - keep room open for guest to rejoin
          io.to(`room_${roomId}`).emit("hostLeft", { roomId });
        } else if (room.guestUserId === userId) {
          // Guest left - close room and notify host
          kickPlayerFromRoom(userId);
          io.to(`room_${roomId}`).emit("guestLeft", { roomId });
        }
      }
    } catch (error) {
      console.error("❌ Error in leaveRoom:", error);
    }
  });
  socket.data.userId = userId; // nếu userId có
  /**
   * Disconnect handler
   */
  socket.on("disconnect", (reason) => {
    const userId = socket.data.userId;

    console.log(`❌ Disconnected: ${userId} | Reason: ${reason}`);

    if (!userId) return;

    const timer = setTimeout(() => {
      console.log(`💀 User ${userId} really left`);

      removeWaitingPlayer(userId);

      io.emit("waitingPlayersUpdate", {
        count: getWaitingPlayersCount(),
      });

      disconnectTimers.delete(userId);
    }, 5000); // ⏱️ delay 5s

    disconnectTimers.set(userId, timer);
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await initializeDatabase();
    server.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════╗
║      🏮 Cờ Tướng Server Started 🏮     ║
╠════════════════════════════════════════╣
║  Server: http://localhost:${PORT}         ║
║  WebSocket: ws://localhost:${PORT}        ║
║  Environment: ${process.env.NODE_ENV || "development"}              ║
╚════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down server...");
  server.close(() => {
    console.log("✅ Server closed");
    process.exit(0);
  });
});
