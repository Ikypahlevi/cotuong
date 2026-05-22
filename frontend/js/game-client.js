// Socket.io Game Client
let socket = null;
let currentUser = null;
let currentRoom = null;
let currentMatch = null;

// ==================== PUBLIC API ====================

function sendMove(matchId, fromPos, toPos, turnNumber) {
  if (!socket || !currentRoom || !currentRoom.roomId) {
    console.error("Socket or room not initialized");
    return;
  }
  socket.emit("makeMove", {
    roomId: currentRoom.roomId,
    matchId,
    playerId: currentUser.userId,
    fromPos,
    toPos,
  });
}

function sendChatMessage(messageText) {
  if (!socket || !currentRoom) {
    console.error("Socket not initialized");
    return;
  }
  socket.emit("sendMessage", {
    roomId: currentRoom.roomId,
    messageText,
  });
}

function leaveRoom() {
  if (!socket || !currentRoom) {
    console.error("Room not found");
    return;
  }
  socket.emit("leaveRoom", { roomId: currentRoom.roomId });

  window.location.href = "/dashboard";
}

function confirmNewMatch(confirmed = true) {
  if (!socket || !currentRoom) {
    console.error("Room not found");
    return;
  }
  socket.emit("confirmNewMatch", {
    roomId: currentRoom.roomId,
    userId: currentUser.userId,
    confirmed,
  });
}

function resignMatch(matchId) {
  if (!socket) {
    console.error("Socket not initialized");
    return;
  }
  socket.emit("resign", {
    matchId,
    playerId: currentUser.userId,
  });
}

function joinWaitingQueue() {
  if (!socket || !currentUser) {
    console.error("Socket not initialized");
    return;
  }
  socket.emit("joinQueue", {
    userId: currentUser.userId,
    username: currentUser.username,
    avatarUrl: currentUser.avatar_url,
  });
  showMessage("Joined waiting queue...", "info");
}

function joinGame() {
  if (!socket || !currentRoom) {
    console.error("Room not found");
    return;
  }
  socket.emit("joinGame", {
    userId: currentUser.userId,
    roomId: currentRoom.roomId,
  });
}

function joinRoomByCode(roomCode) {
  if (!socket) {
    console.error("Socket not initialized");
    return;
  }
  socket.emit("joinRoomByCode", {
    userId: currentUser.userId,
    roomCode,
  });
}

function endMatch(matchId, winnerId, result) {
  if (!socket) {
    console.error("Socket not initialized");
    return;
  }
  socket.emit("endMatch", { matchId, winnerId, result });
}

// ==================== INIT ====================

function initializeSocket(userId, userInfo) {
  if (typeof io === "undefined") {
    const script = document.createElement("script");
    script.src = "https://cdn.socket.io/4.7.2/socket.io.min.js";
    script.onload = () => setupSocket(userId, userInfo);
    document.head.appendChild(script);
  } else {
    setupSocket(userId, userInfo);
  }
}

function getRoomCodeFromURL() {
  return new URLSearchParams(window.location.search).get("roomCode");
}

function isReturningFromMatching() {
  return new URLSearchParams(window.location.search).get("matched") === "true";
}

// ==================== SOCKET SETUP ====================

function setupSocket(userId, userInfo) {
  console.log("🎮 setupSocket called with userId:", userId, userInfo);
  socket = io(window.location.origin, {
    auth: { userId },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  currentUser = { userId, ...userInfo };

  socket.on("connect", () => {
    console.log(
      "🔥 Socket connected, will join room:",
      sessionStorage.getItem("roomId"),
    );

    const roomIdRaw = sessionStorage.getItem("roomId");
    const inGame = sessionStorage.getItem("inGame");

    if (roomIdRaw && inGame === "true") {
      setTimeout(() => {
        socket.emit("joinGame", {
          userId: currentUser.userId,
          roomId: parseInt(roomIdRaw, 10),
        });
      }, 500);
    }
  });

  socket.on("error", (error) => {
    console.error("❌ Socket error:", error);
    if (error.notYourTurn) {
      showMessage("⏳ " + error.message, "warning");
      if (typeof clearSelection === "function") clearSelection();
    } else {
      showMessage("Error: " + error.message, "error");
    }
  });

  socket.on("disconnect", (reason) => {
    console.log("📴 Disconnected:", reason);
    showMessage("Disconnected from server", "warning");
  });

  setupGameEventListeners();
}

// ==================== EVENT LISTENERS ====================

function setupGameEventListeners() {
  socket.on("waitingPlayersUpdate", (data) => {
    console.log(`⏳ Waiting players: ${data.count}`);
    updateWaitingCount(data.count);
  });

  socket.on("waitingForOpponent", (data) => {
    console.log("⏳ " + data.message);
    showMessage(data.message, "info");
  });

  socket.on("matchFound", (data) => {
    console.log("🎯 Match found!", data);

    currentRoom = {
      roomId: data.roomId,
      roomCode: data.roomCode,
    };

    const isPlayer1 = data.player1Id === currentUser.userId;
    const myRole = isPlayer1 ? data.player1.role : data.player2.role;
    const opponentData = isPlayer1 ? data.player2 : data.player1;

    sessionStorage.setItem("inGame", "true");
    sessionStorage.setItem("roomId", data.roomId);
    sessionStorage.setItem(
      "currentUser",
      JSON.stringify({
        ...currentUser,
        user_id: currentUser.userId,
      }),
    );

    localStorage.setItem("userData", JSON.stringify(currentUser));

    sessionStorage.setItem("roomCode", data.roomCode);
    sessionStorage.setItem("myRole", myRole);
    sessionStorage.setItem("redPlayerId", data.redPlayerId);
    sessionStorage.setItem("blackPlayerId", data.blackPlayerId);
    sessionStorage.setItem("opponentName", opponentData.username);
    sessionStorage.setItem("opponentAvatar", opponentData.avatar || "");

    currentRoom.opponentName = opponentData.username;
    currentRoom.opponentAvatar = opponentData.avatar;
    currentRoom.myName = currentUser.username;
    currentRoom.myAvatar = currentUser.avatar_url;

    showMessage("Match found! Joining room...", "success");
    window.location.href = "/game";
  });

  socket.on("gameReady", (data) => {
    console.log("🎮 Game ready!", data);

    if (typeof gameState !== "undefined") {
      gameState.roomId = data.roomId;
      gameState.roomCode = data.roomCode;
      gameState.userRole = data.myRole;
    }

    // ── FIX 1: Tính đúng tên cho mình và đối thủ dựa vào myRole ──────────
    // KHÔNG gọi updatePlayerNames() sau đây vì nó sẽ ghi đè sai
    const playerInfo = {
      myName: data.myName || currentUser.username,
      myAvatar: data.myAvatar || currentUser.avatar_url,
      opponentName:
        data.opponentName ||
        (data.myRole === "red" ? data.blackPlayerName : data.redPlayerName),
      opponentAvatar: data.opponentAvatar || "",
      myRole: data.myRole,
    };

    updatePlayerInfoFull(playerInfo);
    // ── KHÔNG gọi updatePlayerNames() ở đây nữa ──────────────────────────

    // ── FIX 2: Xoay bàn cờ SAU KHI đã set gameState.userRole ─────────────
    if (typeof applyBoardOrientation === "function") {
      applyBoardOrientation();
    }

    showMessage("Game is ready! Let's play!", "success");
  });

  socket.on("gameStarted", (data) => {
    console.log("🎮 Game started!", data);

    if (typeof gameState !== "undefined") {
      gameState.matchId = data.matchId;
      gameState.currentPlayer = "red";
      gameState.gameStatus = "playing";

      // ── FIX 3: Đảm bảo turnNumber bắt đầu từ 1 (số lẻ = lượt đỏ) ──────
      // Server dùng: turnNumber % 2 === 1 → red, turnNumber % 2 === 0 → black
      // Nước đầu tiên của đỏ phải là turn=1, của đen là turn=2, v.v.
      gameState.turnNumber = 1;
    }

    if (typeof renderPieces === "function") {
      console.log("   📋 Rendering pieces for gameStarted");
      renderPieces();
    }

    showMessage("Game started! Red plays first.", "success");

    if (typeof startGameTimer === "function") startGameTimer();
  });

  socket.on("moveMade", (data) => {
    console.log("📍 Move received:", data);
    console.log("DEBUG moveMade:", data);

    if (data.playerId !== currentUser.userId) {
      handleRemoteMove(data.fromPos, data.toPos);
    }

    // 🔥 LUÔN sync turn từ server
    gameState.turnNumber = data.turnNumber;

    addMoveToHistory(data);
  });

  socket.on("newMessage", (data) => {
    console.log("💬 New message:", data);
    addChatMessage(
      data.senderName,
      data.messageText,
      data.senderId === currentUser.userId,
    );
  });

  socket.on("matchEnded", (data) => {
    console.log("🏁 Match ended!", data);
    if (typeof gameState !== "undefined") gameState.gameStatus = "ended";
    currentRoom = { ...currentRoom, ...data };

    const message =
      data.winnerId === currentUser.userId ? "🎉 You won!" : "😔 You lost!";
    showMessage(message, "info");

    if (data.hostUserId === currentUser.userId) {
      showWaitForNewMatch(data.roomCode);
    } else {
      showNewMatchConfirmation(data.roomId);
    }
  });

  socket.on("hostLeft", () => {
    console.log("👤 Host left the room");
    showMessage("Host left the room", "warning");
  });

  socket.on("guestLeft", () => {
    console.log("👤 Guest left the room");
    showMessage("Guest left the room", "warning");
  });

  socket.on("playerKicked", (data) => {
    console.log("🚫 Player kicked:", data);
    showMessage("You were kicked from the room: " + data.reason, "error");

    localStorage.setItem("userData", JSON.stringify(currentUser));
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 3000);
  });

  socket.on("matchDeclined", () => {
    console.log("❌ Match declined");
    showMessage("Host declined new match. Closing room...", "warning");
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 3000);
  });

  socket.on("newMatchStarted", (data) => {
    console.log("🎮 New match started!", data);
    if (typeof gameState !== "undefined") {
      gameState.matchId = data.matchId;
      gameState.currentPlayer = "red";
      gameState.gameStatus = "playing";
      gameState.moveHistory = [];
      gameState.validMoves = [];
      gameState.selectedSquare = null;
      gameState.turnNumber = 1; // Reset đúng
    }
    if (typeof initializeGame === "function") initializeGame();
    if (typeof startGameTimer === "function") startGameTimer();
    showMessage("New match started!", "success");
  });
}

// ==================== UI HELPERS ====================

/**
 * FIX 1: updatePlayerNames() đã được loại khỏi gameReady.
 * Hàm này chỉ còn dùng nếu cần gọi độc lập từ nơi khác.
 * Logic đã được sửa để hiển thị đúng: "Bạn" = mình, "Đối thủ" = địch.
 */
function updatePlayerNames(redPlayerName, blackPlayerName) {
  const myNameEl = document.getElementById("player-name");
  const opponentNameEl = document.getElementById("opponent-name");

  if (typeof gameState !== "undefined" && gameState.userRole === "red") {
    // Tôi là đỏ → hiển thị tên đỏ cho mình, tên đen cho đối thủ
    if (myNameEl) myNameEl.textContent = redPlayerName;
    if (opponentNameEl) opponentNameEl.textContent = blackPlayerName;
  } else {
    // Tôi là đen → hiển thị tên đen cho mình, tên đỏ cho đối thủ
    if (myNameEl) myNameEl.textContent = blackPlayerName;
    if (opponentNameEl) opponentNameEl.textContent = redPlayerName;
  }
}

/**
 * Update full player info including avatar and role
 */
function updatePlayerInfoFull(playerInfo) {
  const playerName = document.getElementById("player-name");
  const opponentName = document.getElementById("opponent-name");
  const playerPiece = document.getElementById("player-piece");
  const opponentPiece = document.getElementById("opponent-piece");
  const playerAvatar = document.querySelector(".player-info-bottom .avatar");
  const opponentAvatar = document.querySelector(".opponent-info .avatar");

  if (playerName) playerName.textContent = playerInfo.myName;
  if (playerAvatar && playerInfo.myAvatar)
    playerAvatar.src = playerInfo.myAvatar;
  if (playerPiece) {
    playerPiece.textContent = `Quân đang chơi: ${playerInfo.myRole === "red" ? "Đỏ" : "Đen"}`;
  }
  if (opponentName) opponentName.textContent = playerInfo.opponentName;
  if (opponentAvatar && playerInfo.opponentAvatar)
    opponentAvatar.src = playerInfo.opponentAvatar;
  if (opponentPiece) {
    opponentPiece.textContent = `Quân đang chơi: ${playerInfo.myRole === "red" ? "Đen" : "Đỏ"}`;
  }
}

/**
 * FIX 5: addMoveToHistory — xử lý cả string, object {row,col} và {fromPos,toPos}
 */
function addMoveToHistory(moveData) {
  const movesList = document.getElementById("moves-list");
  if (!movesList) return;

  let moveDisplay = "";

  const formatPos = (pos) => {
    if (!pos) return null;

    if (typeof pos === "string") return pos;

    if (Array.isArray(pos)) return pos.join(",");

    if (typeof pos === "object") {
      if ("row" in pos && "col" in pos) return `${pos.row},${pos.col}`;
      if ("x" in pos && "y" in pos) return `${pos.x},${pos.y}`;
    }

    return null; // ❌ KHÔNG stringify nữa
  };

  // ✅ Case 1: chuẩn fromPos / toPos
  if (moveData?.fromPos && moveData?.toPos) {
    const from = formatPos(moveData.fromPos);
    const to = formatPos(moveData.toPos);

    if (!from || !to) return; // ❌ bỏ luôn nếu lỗi
    moveDisplay = `${from} → ${to}`;
  }

  // ✅ Case 2: nested move
  else if (moveData?.move?.from && moveData?.move?.to) {
    const from = formatPos(moveData.move.from);
    const to = formatPos(moveData.move.to);

    if (!from || !to) return; // ❌ bỏ luôn
    moveDisplay = `${from} → ${to}`;
  }

  // ❌ Case khác → bỏ luôn, KHÔNG hiển thị
  else {
    return;
  }

  // 👉 Render bình thường
  const count = movesList.children.length + 1;

  const moveEl = document.createElement("div");
  moveEl.className = "move-item";
  moveEl.innerHTML = `
    <span class="move-number">${count}.</span>
    <span class="move-text">${moveDisplay}</span>
  `;

  movesList.appendChild(moveEl);
  movesList.scrollTop = movesList.scrollHeight;
}

/**
 * Add chat message with timestamp
 */
function addChatMessage(senderName, messageText, isOwn = false) {
  const chatMessages = document.getElementById("chat-messages");
  if (!chatMessages) return;

  // 🔥 FIX: đảm bảo messageText luôn là string
  if (typeof messageText === "object") {
    messageText = messageText.text || JSON.stringify(messageText);
  }

  const timestamp = new Date().toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const messageEl = document.createElement("div");
  messageEl.className = `message ${isOwn ? "player-message" : "opponent-message"}`;
  messageEl.innerHTML = `
    <div class="message-header">
      <span class="message-sender">${senderName}</span>
      <span class="message-time">${timestamp}</span>
    </div>
    <span class="message-text">${escapeHtml(messageText)}</span>
  `;
  chatMessages.appendChild(messageEl);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showMessage(message, type = "info") {
  console.log(`[${type.toUpperCase()}] ${message}`);

  const colors = {
    error: "#ff4444",
    success: "#22aa55",
    warning: "#ffaa44",
    info: "#4477ff",
  };

  const notif = document.createElement("div");
  notif.className = `notification notification-${type}`;
  notif.textContent = message;
  notif.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    background: ${colors[type] || colors.info};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    font-size: 14px;
  `;
  document.body.appendChild(notif);

  setTimeout(() => {
    notif.style.opacity = "0";
    notif.style.transition = "opacity 0.3s";
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

function updateWaitingCount(count) {
  const countEl = document.getElementById("waiting-players-count");
  if (countEl) {
    countEl.textContent = `${count} player${count !== 1 ? "s" : ""} waiting`;
  }
}

function handleRemoteMove(fromPos, toPos) {
  console.log(`📍 Opponent move: ${fromPos} → ${toPos}`);
  const parsePos = (pos) => {
    if (typeof pos === "string") return pos.split(",").map(Number);
    if (Array.isArray(pos)) return pos.map(Number);
    if (typeof pos === "object" && pos !== null) {
      if ("row" in pos && "col" in pos) return [pos.row, pos.col];
      if ("x" in pos && "y" in pos) return [pos.x, pos.y];
    }
    return [0, 0];
  };
  const [fromRow, fromCol] = parsePos(fromPos);
  const [toRow, toCol] = parsePos(toPos);
  if (typeof applyRemoteMove === "function") {
    applyRemoteMove(fromRow, fromCol, toRow, toCol);
  }
}

function showWaitForNewMatch(roomCode) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "new-match-modal";
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header"><h2>Game Ended</h2></div>
      <div class="modal-body">
        <p>Room Code: <strong>${roomCode}</strong></p>
        <p>Waiting for opponent to join...</p>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" onclick="leaveRoom()">Leave Room</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function showNewMatchConfirmation(roomId) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.id = "confirm-match-modal";
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header"><h2>New Match?</h2></div>
      <div class="modal-body">
        <p>The host wants to play another match. Do you want to continue?</p>
      </div>
      <div class="modal-footer">
        <button class="modal-btn cancel-btn" onclick="confirmNewMatch(false)">Decline</button>
        <button class="modal-btn confirm-btn" onclick="confirmNewMatch(true)">Accept</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}
