// Dashboard Socket.io Client
let socket = null;
let currentUser = null;

window.addEventListener("pageshow", async (event) => {
  if (event.persisted) {
    console.log("Page restored from cache → reload user");

    document.addEventListener("DOMContentLoaded", loadUserData);
  }
});
/**
 * Initialize dashboard
 */
document.addEventListener("DOMContentLoaded", () => {
  const userDataStr = localStorage.getItem("userData");

  if (!userDataStr) {
    window.location.href = "/";
    return;
  }

  try {
    currentUser = JSON.parse(userDataStr);

    // Normalize ID
    currentUser.userId = currentUser.userId || currentUser.user_id;
    currentUser.user_id = currentUser.user_id || currentUser.userId;

    updateDashboardUI(currentUser);
    initializeDashboardSocket(currentUser);
    setupDashboardEventListeners();
  } catch (error) {
    console.error("❌ Error parsing user data:", error);
    localStorage.removeItem("userData"); // 🔥 tránh user lỗi
    window.location.href = "/";
  }
});

/**
 * Initialize Socket.io for dashboard
 */
function initializeDashboardSocket(user) {
  // Import socket.io from CDN if not already imported
  if (typeof io === "undefined") {
    const script = document.createElement("script");
    script.src = "https://cdn.socket.io/4.7.2/socket.io.min.js";
    script.onload = () => {
      setupDashboardSocket(user);
    };
    document.head.appendChild(script);
  } else {
    setupDashboardSocket(user);
  }
}

/**
 * Setup dashboard socket connection
 */
function setupDashboardSocket(user) {
  socket = io(window.location.origin, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  socket.on("connect", () => {
    console.log("✅ Connected to server");
  });

  socket.on("error", (error) => {
    console.error("❌ Socket error:", error);
    showDashboardNotification("Error: " + error.message, "error");
  });

  socket.on("disconnect", () => {
    console.log("📴 Disconnected from server");
  });

  // Dashboard specific events
  socket.on("waitingPlayersUpdate", (data) => {
    console.log(`⏳ Waiting players: ${data.count}`);
    updateWaitingPlayersDisplay(data.count);
  });

  socket.on("matchFound", (data) => {
    console.log("🎯 Match found!", data);

    // Preserve match data so the game page can restore the room state.
    sessionStorage.setItem("inGame", "true");
    sessionStorage.setItem("roomId", data.roomId);
    sessionStorage.setItem("roomCode", data.roomCode);
    sessionStorage.setItem("myRole", data.player1.role);
    sessionStorage.setItem("redPlayerId", data.redPlayerId);
    sessionStorage.setItem("blackPlayerId", data.blackPlayerId);
    sessionStorage.setItem("opponentName", data.player2?.username || "");
    sessionStorage.setItem("opponentAvatar", data.player2?.avatar || "");

    showMatchFoundNotification(data);
  });

  socket.on("waitingForOpponent", (data) => {
    console.log("⏳ " + data.message);
    showDashboardNotification(data.message, "info");
  });
}

/**
 * Update dashboard UI with user data
 */
function updateDashboardUI(user) {
  try {
    // Update user name
    const userNameEl = document.getElementById("userName");
    if (userNameEl) {
      userNameEl.textContent = user.full_name || user.username;
    }

    // Update user stats
    document.getElementById("userWins").textContent = user.wins || 0;
    document.getElementById("userLosses").textContent = user.losses || 0;
    document.getElementById("userPoints").textContent =
      `${user.rank_points || 500} điểm`;

    // Update user avatar
    const avatarElements = document.querySelectorAll(
      "#userAvatar, #profileAvatar",
    );
    avatarElements.forEach((el) => {
      if (user.avatar_url) {
        el.src = user.avatar_url;
      }
    });
  } catch (error) {
    console.error("❌ Error updating dashboard:", error);
  }
}
async function loadUserData() {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "index.html";
    return;
  }

  try {
    const response = await fetch(`${API_URL}/auth/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) throw new Error("Unauthorized");

    const data = await response.json();
    const userData = data.user;

    // update UI
    document.getElementById("userName").textContent =
      userData.full_name || userData.username;

    // ... (các field khác)

    // init socket (chỉ 1 lần)
    if (!window.socketInitialized) {
      initializeSocket(userData.user_id, userData);
      window.socketInitialized = true;
    }
  } catch (err) {
    localStorage.clear();
    window.location.href = "index.html";
  }
}
/**
 * Setup dashboard event listeners
 */
function setupDashboardEventListeners() {
  // Find play button - it's the large central button
  const buttons = document.querySelectorAll("button.group");

  // The play button should be the second main button (after machine match)
  const playButton = document.getElementById("playButton");

  if (playButton) {
    playButton.addEventListener("click", onPlayButtonClick);
  }

  // Machine match button
  const machineButton = document.querySelector("button.group");
  if (machineButton && !machineButton.id) {
    machineButton.addEventListener("click", onMachineMatchClick);
  }

  // Search room input
  const searchInputs = document.querySelectorAll(
    "input[placeholder='Nhập mã phòng...']",
  );
  if (searchInputs.length > 0) {
    const searchInput = searchInputs[0];
    const searchParent = searchInput.parentElement;
    const searchButton = searchParent.querySelector("button");

    if (searchButton) {
      searchButton.addEventListener("click", () =>
        onSearchRoomClick(searchInput.value),
      );
    }

    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        onSearchRoomClick(searchInput.value);
      }
    });
  }

  // Settings button
  const settingsBtn = document.getElementById("settingsBtn");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      document.getElementById("settingsModal")?.classList.remove("hidden");
    });
  }

  // Close settings button
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener("click", () => {
      document.getElementById("settingsModal")?.classList.add("hidden");
    });
  }

  // Logout button
  const logoutBtn = document.querySelector("[data-logout]");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", onLogout);
  }
}

/**
 * Handle play button click - join matching queue
 */
function onPlayButtonClick() {
  console.log("🎮 Play button clicked");

  if (!socket || !socket.connected) {
    showDashboardNotification("Đang kết nối server...", "warning");
    return;
  }

  // Show waiting status
  showDashboardNotification("Đang tìm đối thủ...", "info");

  // Join waiting queue
  socket.emit("joinQueue", {
    userId: currentUser.user_id,
    username: currentUser.username,
    avatarUrl: currentUser.avatar_url,
  });
}

/**
 * Handle machine match button click
 */
function onMachineMatchClick() {
  console.log("🤖 Machine match clicked");
  showDashboardNotification("Chế độ đấu máy sắp có!", "info");
}

/**
 * Handle search room
 */
function onSearchRoomClick(roomCode) {
  if (!roomCode.trim()) {
    showDashboardNotification("Vui lòng nhập mã phòng", "warning");
    return;
  }

  console.log("🔍 Searching for room:", roomCode);
  showDashboardNotification(`Tìm phòng ${roomCode}...`, "info");

  // Navigate to game with room code
  window.location.href = `/game?roomCode=${roomCode}`;
}

/**
 * Handle logout
 */
function onLogout() {
  if (confirm("Bạn có chắc chắn muốn đăng xuất?")) {
    localStorage.removeItem("userData");
    localStorage.removeItem("user");
    localStorage.removeItem("token");

    sessionStorage.clear();

    window.location.href = "/";
  }
}

/**
 * Show match found notification
 */
function showMatchFoundNotification(data) {
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: linear-gradient(135deg, #1a4d4e 0%, #0d2f30 100%);
    border: 2px solid #9ecfd0;
    border-radius: 16px;
    padding: 40px;
    color: #d4e6e5;
    text-align: center;
    z-index: 10000;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    animation: slideIn 0.3s ease-out;
  `;

  notification.innerHTML = `
    <h2 style="font-size: 24px; margin-bottom: 20px; color: #9ecfd0;">🎯 Tìm Thấy Đối Thủ!</h2>
    <p style="font-size: 16px; margin-bottom: 10px;">
      <strong>${data.player2.username}</strong>
    </p>
    <p style="font-size: 14px; margin-bottom: 20px; color: #c0c8c8;">
      ${data.player1.role === "red" ? "Bạn chơi Đỏ" : "Bạn chơi Đen"}
    </p>
    <p style="font-size: 12px; color: #8a9292;">Đang mở trò chơi...</p>
  `;

  document.body.appendChild(notification);

  // Auto navigate to game after 2 seconds
  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease-out";
    setTimeout(() => {
      notification.remove();
      window.location.href = "/game";
    }, 300);
  }, 2000);
}

/**
 * Show notification
 */
function showDashboardNotification(message, type = "info") {
  console.log(`[${type.toUpperCase()}] ${message}`);

  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    background: ${
      type === "error"
        ? "#ff4444"
        : type === "success"
          ? "#44ff44"
          : type === "warning"
            ? "#ffaa44"
            : "#4444ff"
    };
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    animation: slideIn 0.3s ease-out;
  `;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease-out";
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Update waiting players display
 */
function updateWaitingPlayersDisplay(count) {
  // Try to find or create a waiting players display
  let display = document.getElementById("waitingPlayersDisplay");

  if (!display) {
    display = document.createElement("div");
    display.id = "waitingPlayersDisplay";
    display.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(158, 207, 208, 0.1);
      border: 1px solid #9ecfd0;
      border-radius: 8px;
      padding: 12px 16px;
      color: #9ecfd0;
      font-size: 14px;
      z-index: 100;
    `;
    document.body.appendChild(display);
  }

  display.textContent = `⏳ ${count} người chơi đang chờ...`;
}

// Add CSS animations
if (!document.getElementById("dashboardAnimations")) {
  const style = document.createElement("style");
  style.id = "dashboardAnimations";
  style.textContent = `
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateX(100px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    
    @keyframes slideOut {
      from {
        opacity: 1;
        transform: translateX(0);
      }
      to {
        opacity: 0;
        transform: translateX(100px);
      }
    }
  `;
  document.head.appendChild(style);
}
