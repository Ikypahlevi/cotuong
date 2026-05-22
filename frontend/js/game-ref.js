// Game Constants - TỐI ƯU MOBILE
const ROWS = 10;
const COLS = 9;
const RIVER_START = 5;
const RIVER_END = 4;
const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;
const ASSET_VERSION = Date.now();
const PIECE_NAME_MAP = {
  king: "Tướng",
  advisor: "Sĩ",
  elephant: "Tượng",
  horse: "Mã",
  chariot: "Xe",
  cannon: "Pháo",
  pawn: "Tốt",
};
// Game State
let gameState = {
  selectedSquare: null,
  validMoves: [],
  currentPlayer: "red",
  moveHistory: [],
  soundEnabled: true,
  volume: 50,
  pieces: {},
  gameStatus: "playing",
  redKingPosition: null,
  blackKingPosition: null,
  lastMove: null,
  // Socket.io state
  userId: null,
  userRole: null, // 'red' or 'black'
  roomId: null,
  roomCode: null,
  matchId: null,
  redPlayerId: null,
  blackPlayerId: null,
};

// Device detection
let currentDeviceType = "desktop";

/**
 * Detect device type chính xác
 */
function getDeviceType() {
  const width = window.innerWidth;
  if (width <= MOBILE_BREAKPOINT) return "mobile";
  if (width <= TABLET_BREAKPOINT) return "tablet";
  return "desktop";
}

function getAssetFolder() {
  return currentDeviceType === "mobile"
    ? "mobile"
    : currentDeviceType === "tablet"
      ? "tablet"
      : "desktop";
}

// Initialize Game
document.addEventListener("DOMContentLoaded", () => {
  // Try to load current user from sessionStorage first, then fallback to localStorage
  const userDataStr =
    sessionStorage.getItem("currentUser") ||
    localStorage.getItem("userData") ||
    localStorage.getItem("user");
  if (userDataStr) {
    try {
      currentUser = JSON.parse(userDataStr);
      currentUser.userId = currentUser.userId || currentUser.user_id;
      currentUser.user_id = currentUser.user_id || currentUser.userId;
      // Initialize Socket.io with user data
      initializeSocket(currentUser.userId, {
        username: currentUser.username,
        avatar_url: currentUser.avatar_url,
      });

      // Restore gameState from sessionStorage if coming from matchFound
      const inGame = sessionStorage.getItem("inGame");
      if (inGame === "true") {
        const roomIdRaw = sessionStorage.getItem("roomId");
        const roomId = roomIdRaw ? parseInt(roomIdRaw, 10) : null;
        const myRole = sessionStorage.getItem("myRole");
        const redPlayerIdRaw = sessionStorage.getItem("redPlayerId");
        const blackPlayerIdRaw = sessionStorage.getItem("blackPlayerId");
        const redPlayerId = redPlayerIdRaw
          ? parseInt(redPlayerIdRaw, 10)
          : null;
        const blackPlayerId = blackPlayerIdRaw
          ? parseInt(blackPlayerIdRaw, 10)
          : null;
        const opponentName = sessionStorage.getItem("opponentName");
        const opponentAvatar = sessionStorage.getItem("opponentAvatar");

        if (roomId && myRole) {
          console.log("🎮 Restoring game state from matchFound...");
          gameState.roomId = roomId;
          gameState.userRole = myRole;
          gameState.redPlayerId = redPlayerId;
          gameState.blackPlayerId = blackPlayerId;
          currentRoom = {
            roomId,
            opponentName,
            opponentAvatar,
            myName: currentUser.username,
            myAvatar: currentUser.avatar_url,
          };
        }
      }

      // Check if there's a roomCode in URL (user is rejoining)
      const roomCode = getRoomCodeFromURL();
      if (roomCode) {
        console.log(`🔄 Rejoining room: ${roomCode}`);
        // Wait for socket to connect, then join room
        setTimeout(() => {
          joinRoomByCode(roomCode);
        }, 1000);
      }
    } catch (error) {
      console.error("❌ Error parsing user data:", error);
    }
  }

  initializeBoard();
  setupEventListeners();
  initializeGame();
});

/**
 * Initialize the chessboard with squares - MOBILE OPTIMIZED
 */
function initializeBoard() {
  const boardElement = document.getElementById("chess-board");
  boardElement.innerHTML = "";

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const square = document.createElement("div");
      const squareId = `square-${row}-${col}`;
      square.className = "square";
      square.id = squareId;

      // Checkerboard pattern
      if ((row + col) % 2 === 0) {
        square.classList.add("even");
      }

      // River styling
      if (row >= RIVER_START && row <= RIVER_END) {
        square.classList.add("river");
      }

      // Mobile: thêm touch-action
      if (currentDeviceType === "mobile") {
        square.style.touchAction = "manipulation";
      }

      // Event listeners - optimized cho mobile
      square.addEventListener("click", () => handleSquareClick(row, col));

      // Mobile touch events
      if (currentDeviceType === "mobile") {
        square.addEventListener(
          "touchstart",
          (e) => {
            e.stopPropagation();
            const rect = square.getBoundingClientRect();
            const touch = e.touches[0];
            const rowHit = Math.floor((touch.clientY - rect.top) / rect.height);
            const colHit = Math.floor((touch.clientX - rect.left) / rect.width);
            handleSquareClick(rowHit, colHit);
          },
          { passive: true },
        );
      }

      boardElement.appendChild(square);
    }
  }
}

/**
 * Initialize game pieces - MOBILE OPTIMIZED
 */
function initializeGame() {
  // Detect device type
  currentDeviceType = getDeviceType();

  // Setup body class for CSS
  if (currentDeviceType === "mobile") {
    document.body.classList.add("mobile");
  }

  // Initialize pieces
  gameState.pieces = {
    // Red pieces (bottom)
    "red-chariot-left": { type: "chariot", color: "red", row: 9, col: 0 },
    "red-horse-left": { type: "horse", color: "red", row: 9, col: 1 },
    "red-elephant-left": { type: "elephant", color: "red", row: 9, col: 2 },
    "red-advisor-left": { type: "advisor", color: "red", row: 9, col: 3 },
    "red-king": { type: "king", color: "red", row: 9, col: 4 },
    "red-advisor-right": { type: "advisor", color: "red", row: 9, col: 5 },
    "red-elephant-right": { type: "elephant", color: "red", row: 9, col: 6 },
    "red-horse-right": { type: "horse", color: "red", row: 9, col: 7 },
    "red-chariot-right": { type: "chariot", color: "red", row: 9, col: 8 },
    "red-cannon-left": { type: "cannon", color: "red", row: 7, col: 1 },
    "red-cannon-right": { type: "cannon", color: "red", row: 7, col: 7 },
    "red-pawn-a": { type: "pawn", color: "red", row: 6, col: 0 },
    "red-pawn-b": { type: "pawn", color: "red", row: 6, col: 2 },
    "red-pawn-c": { type: "pawn", color: "red", row: 6, col: 4 },
    "red-pawn-d": { type: "pawn", color: "red", row: 6, col: 6 },
    "red-pawn-e": { type: "pawn", color: "red", row: 6, col: 8 },

    // Black pieces (top)
    "black-chariot-left": { type: "chariot", color: "black", row: 0, col: 0 },
    "black-horse-left": { type: "horse", color: "black", row: 0, col: 1 },
    "black-elephant-left": { type: "elephant", color: "black", row: 0, col: 2 },
    "black-advisor-left": { type: "advisor", color: "black", row: 0, col: 3 },
    "black-king": { type: "king", color: "black", row: 0, col: 4 },
    "black-advisor-right": { type: "advisor", color: "black", row: 0, col: 5 },
    "black-elephant-right": {
      type: "elephant",
      color: "black",
      row: 0,
      col: 6,
    },
    "black-horse-right": { type: "horse", color: "black", row: 0, col: 7 },
    "black-chariot-right": { type: "chariot", color: "black", row: 0, col: 8 },
    "black-cannon-left": { type: "cannon", color: "black", row: 2, col: 1 },
    "black-cannon-right": { type: "cannon", color: "black", row: 2, col: 7 },
    "black-pawn-a": { type: "pawn", color: "black", row: 3, col: 0 },
    "black-pawn-b": { type: "pawn", color: "black", row: 3, col: 2 },
    "black-pawn-c": { type: "pawn", color: "black", row: 3, col: 4 },
    "black-pawn-d": { type: "pawn", color: "black", row: 3, col: 6 },
    "black-pawn-e": { type: "pawn", color: "black", row: 3, col: 8 },
  };

  // Mobile: preload assets
  if (currentDeviceType === "mobile") {
    preloadMobileAssets();
  }

  renderPieces();

  // Apply board orientation based on current role
  applyBoardOrientation();

  startGameTimer();
  updateKingPositions();

  setupAudio();
  setupBrightness();
  setupMobileOptimizations();
}

/**
 * Preload critical mobile assets
 */
function preloadMobileAssets() {
  const criticalAssets = ["target-new.png", "target-old.png"];

  criticalAssets.forEach((asset) => {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = `../assets/mobile/${asset}?v=${ASSET_VERSION}`;
    document.head.appendChild(link);
  });
}

/**
 * Setup brightness control
 */
function setupBrightness() {
  const slider = document.getElementById("brightness-slider");

  // Tạo overlay
  let overlay = document.querySelector(".brightness-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.className = "brightness-overlay";
    document.body.appendChild(overlay);
  }

  // Load từ localStorage
  const saved = localStorage.getItem("brightness");

  // Default = 50 (bình thường)
  let sliderValue = saved !== null ? parseInt(saved) : 50;

  // Clamp tránh lỗi
  if (isNaN(sliderValue) || sliderValue < 0 || sliderValue > 100) {
    sliderValue = 50;
  }

  const brightness = mapSliderToBrightness(sliderValue);

  applyBrightness(brightness);

  if (slider) {
    slider.value = sliderValue;

    slider.addEventListener("input", (e) => {
      const value = parseInt(e.target.value);

      const newBrightness = mapSliderToBrightness(value);

      applyBrightness(newBrightness);
      localStorage.setItem("brightness", value);
    });
  }
}
/**
 * Apply brightness adjustment
 */
function applyBrightness(value) {
  const overlay = document.querySelector(".brightness-overlay");
  if (!overlay) return;

  // Reset filter trước
  document.body.style.filter = "none";

  if (value < 1) {
    // Tối bằng overlay
    overlay.style.background = `rgba(0,0,0,${1 - value})`;
  } else {
    // Không overlay
    overlay.style.background = `rgba(0,0,0,0)`;

    // Sáng hơn bằng filter
    document.body.style.filter = `brightness(${value})`;
  }
}
/**
 * Map slider value to brightness
 * @param {number} value - Slider value (0-100)
 * @returns {number} - Brightness value (0-1.5)
 */
function mapSliderToBrightness(value) {
  // 50 = bình thường
  if (value <= 50) {
    return value / 50; // 0 → 1
  } else {
    return 1 + (value - 50) / 100; // 1 → 1.5
  }
}
/**
 * Setup audio - MOBILE OPTIMIZED
 */
function setupAudio() {
  const audioElement = document.getElementById("move-sound");
  if (audioElement) {
    audioElement.volume = gameState.soundEnabled ? gameState.volume / 100 : 0;
    setTimeout(() => {
      audioElement.muted = !gameState.soundEnabled;
    }, 100);
  }

  // Mobile: unlock audio context on first touch
  if (currentDeviceType === "mobile") {
    const unlockAudio = () => {
      if (audioElement && gameState.soundEnabled) {
        audioElement.muted = false;
      }
      document.removeEventListener("touchstart", unlockAudio);
      document.removeEventListener("click", unlockAudio);
    };
    document.addEventListener("touchstart", unlockAudio, { once: true });
    document.addEventListener("click", unlockAudio, { once: true });
  }
}

/**
 * Render pieces - MOBILE OPTIMIZED
 */
function renderPieces() {
  document.querySelectorAll(".piece-on-board").forEach((el) => el.remove());
  const assetFolder = getAssetFolder();

  for (const [key, piece] of Object.entries(gameState.pieces)) {
    const squareId = `square-${piece.row}-${piece.col}`;
    const squareElement = document.getElementById(squareId);

    if (squareElement) {
      const pieceElement = createOptimizedPieceElement(key, piece, assetFolder);
      squareElement.innerHTML = "";
      squareElement.appendChild(pieceElement);
    }
  }

  applyBoardOrientation();
}

/**
 * Create optimized piece element
 */
function createOptimizedPieceElement(pieceKey, piece, assetFolder) {
  const pieceElement = document.createElement("div");
  pieceElement.className = `piece-on-board ${piece.color} ${currentDeviceType}`;

  const rotate = gameState.userRole === "black";

  pieceElement.style.transform = rotate ? "rotate(180deg)" : "none";

  const pieceImageName = `${piece.type}_${piece.color}.png`;
  const imageUrl = `../assets/${assetFolder}/${pieceImageName}?v=${ASSET_VERSION}`;

  pieceElement.style.backgroundImage = `url('${imageUrl}')`;
  pieceElement.dataset.pieceKey = pieceKey;

  // Mobile optimizations
  if (currentDeviceType === "mobile") {
    pieceElement.style.backgroundSize = "85% 85%";
    pieceElement.style.backgroundPosition = "center";
    pieceElement.style.touchAction = "manipulation";
  } else if (currentDeviceType === "tablet") {
    pieceElement.classList.add("tablet");
  }
  pieceElement.addEventListener("click", (e) => {
    e.stopPropagation();
    handlePieceClick(e, pieceKey);
  });

  return pieceElement;
}

/**
 * Optimized piece click handler
 */
function handlePieceClick(e, pieceKey) {
  // Mobile haptic feedback
  if ("vibrate" in navigator && currentDeviceType === "mobile") {
    navigator.vibrate(20);
  }

  selectPiece(pieceKey);
}

/**
 * Prevent double-tap zoom on mobile
 */
function setupMobileOptimizations() {
  if (currentDeviceType !== "mobile") return;

  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    function (event) {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    },
    false,
  );

  // Reduced motion
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.documentElement.style.setProperty("--motion-duration", "0s");
  }
}

// ... [TẤT CẢ CÁC HÀM GAME LOGIC GIỮ NGUYÊN - từ handleSquareClick đến endGame] ...

/**
 * Handle square click - MOBILE OPTIMIZED
 */
function handleSquareClick(row, col) {
  console.log("ROLE:", gameState.userRole);
  console.log("TURN:", gameState.currentPlayer);
  if (gameState.gameStatus !== "playing" && gameState.gameStatus !== "check") {
    return;
  }

  // Check if it's player's turn
  if (
    gameState.userRole &&
    gameState.currentPlayer &&
    gameState.userRole !== gameState.currentPlayer
  ) {
    console.log("⏳ Not your turn!");
    showNotYourTurnMessage();
    return;
  }

  if (gameState.selectedSquare) {
    const [selectedRow, selectedCol] = gameState.selectedSquare;
    if (
      gameState.validMoves.some((move) => move[0] === row && move[1] === col)
    ) {
      movePiece(selectedRow, selectedCol, row, col);
    }
    clearSelection();
  }
}

/**
 * Select a piece
 */
function selectPiece(pieceKey) {
  // Check if it's player's turn - prevent selecting when not our turn
  if (
    gameState.userRole &&
    gameState.currentPlayer &&
    gameState.userRole !== gameState.currentPlayer
  ) {
    console.log("⏳ Not your turn!");
    showNotYourTurnMessage();
    return;
  }

  const piece = gameState.pieces[pieceKey];

  // Check if this is the target square for a move (capturing opponent piece)
  if (gameState.selectedSquare) {
    const [selectedRow, selectedCol] = gameState.selectedSquare;

    // If clicking on an opponent piece, try to capture it
    if (piece.color !== gameState.currentPlayer) {
      if (
        gameState.validMoves.some(
          (move) => move[0] === piece.row && move[1] === piece.col,
        )
      ) {
        movePiece(selectedRow, selectedCol, piece.row, piece.col);
        clearSelection();
        return;
      }
    }

    // If clicking on own piece, clear previous selection and select new piece
    if (piece.color === gameState.currentPlayer) {
      clearSelection();
    } else {
      // Clicking on opponent piece that's not a valid move
      clearSelection();
      return;
    }
  }

  // Only allow selecting pieces of the current player
  if (piece.color !== gameState.currentPlayer) {
    return;
  }

  gameState.selectedSquare = [piece.row, piece.col];
  const legalMoves = calculateValidMoves(piece);

  // If piece has no legal moves (pinned or can't resolve check), don't allow selection
  if (legalMoves.length === 0) {
    gameState.selectedSquare = null;
    gameState.validMoves = [];
    return;
  }

  gameState.validMoves = legalMoves;

  // Highlight selected square and valid moves
  highlightSquares();
}

/**
 * Check if a piece occupies a square
 */
function hasPieceAt(row, col) {
  return Object.values(gameState.pieces).some(
    (p) => p.row === row && p.col === col,
  );
}

/**
 * Get piece at a square
 */
function getPieceAt(row, col) {
  return Object.values(gameState.pieces).find(
    (p) => p.row === row && p.col === col,
  );
}

/**
 * Update king positions in gameState
 */
function updateKingPositions() {
  const redKing = Object.values(gameState.pieces).find(
    (p) => p.type === "king" && p.color === "red",
  );
  const blackKing = Object.values(gameState.pieces).find(
    (p) => p.type === "king" && p.color === "black",
  );

  if (redKing) {
    gameState.redKingPosition = [redKing.row, redKing.col];
  }
  if (blackKing) {
    gameState.blackKingPosition = [blackKing.row, blackKing.col];
  }
}

/**
 * Get king position for a color
 */
function getKingPosition(color) {
  return color === "red"
    ? gameState.redKingPosition
    : gameState.blackKingPosition;
}

/**
 * Get raw moves for a piece WITHOUT any check/pin filtering.
 * Used internally to detect attacks without causing infinite recursion.
 */
function getRawMoves(piece) {
  const { type } = piece;
  switch (type) {
    case "chariot":
      return getCharioMoves(piece);
    case "horse":
      return getHorseMoves(piece);
    case "elephant":
      return getElephantMoves(piece);
    case "advisor":
      return getAdvisorMoves(piece);
    case "king":
      return getKingMovesRaw(piece);
    case "cannon":
      return getCannonMoves(piece);
    case "pawn":
      return getPawnMoves(piece);
    default:
      return [];
  }
}

/**
 * King moves without facing-kings check (raw, used in attack detection)
 */
function getKingMovesRaw(piece) {
  const moves = [];
  const { row, col, color } = piece;
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dRow, dCol] of directions) {
    const newRow = row + dRow;
    const newCol = col + dCol;
    if (!isInPalace(newRow, newCol, color)) continue;
    if (!hasPieceAt(newRow, newCol)) {
      moves.push([newRow, newCol]);
    } else {
      const targetPiece = getPieceAt(newRow, newCol);
      if (targetPiece.color !== color) {
        moves.push([newRow, newCol]);
      }
    }
  }
  return moves;
}

/**
 * Check if a square is attacked by any piece of attackerColor,
 * given a temporary board state (pieces object).
 */
function isSquareAttackedBy(row, col, attackerColor, pieces) {
  const savedPieces = gameState.pieces;
  gameState.pieces = pieces;
  let attacked = false;
  for (const piece of Object.values(pieces)) {
    if (piece.color !== attackerColor) continue;
    const moves = getRawMoves(piece);
    if (moves.some((m) => m[0] === row && m[1] === col)) {
      attacked = true;
      break;
    }
  }
  gameState.pieces = savedPieces;
  return attacked;
}

/**
 * Check if kings are facing each other (flying general rule) in a given pieces state.
 */
function kingsAreFacing(pieces) {
  const redKing = Object.values(pieces).find(
    (p) => p.type === "king" && p.color === "red",
  );
  const blackKing = Object.values(pieces).find(
    (p) => p.type === "king" && p.color === "black",
  );
  if (!redKing || !blackKing) return false;
  if (redKing.col !== blackKing.col) return false;
  // Check if any piece stands between them on that column
  const minRow = Math.min(redKing.row, blackKing.row);
  const maxRow = Math.max(redKing.row, blackKing.row);
  for (const p of Object.values(pieces)) {
    if (p.type === "king") continue;
    if (p.col === redKing.col && p.row > minRow && p.row < maxRow) return false;
  }
  return true; // no piece between them → facing
}

/**
 * Simulate a move on a deep-copy of pieces, return new pieces object.
 */
function simulateMoveOnPieces(pieces, fromRow, fromCol, toRow, toCol) {
  // Deep copy
  const newPieces = {};
  for (const [k, p] of Object.entries(pieces)) {
    newPieces[k] = { ...p };
  }
  // Find moving piece
  const entry = Object.entries(newPieces).find(
    ([, p]) => p.row === fromRow && p.col === fromCol,
  );
  if (!entry) return newPieces;
  const [key, movingPiece] = entry;
  // Remove captured piece
  const capturedEntry = Object.entries(newPieces).find(
    ([k, p]) => p.row === toRow && p.col === toCol && k !== key,
  );
  if (capturedEntry) delete newPieces[capturedEntry[0]];
  // Move the piece
  newPieces[key].row = toRow;
  newPieces[key].col = toCol;
  return newPieces;
}

/**
 * After a simulated move (newPieces), check if kingColor's king is in check.
 */
function isKingInCheckAfterMove(kingColor, newPieces) {
  const king = Object.values(newPieces).find(
    (p) => p.type === "king" && p.color === kingColor,
  );
  if (!king) return false; // king captured – handled separately
  const enemyColor = kingColor === "red" ? "black" : "red";
  // Also check flying general
  if (kingsAreFacing(newPieces)) return true;
  return isSquareAttackedBy(king.row, king.col, enemyColor, newPieces);
}

/**
 * Check if a king is under attack by opponent pieces (current board state)
 */
function isKingAttacked(kingColor) {
  const king = Object.values(gameState.pieces).find(
    (p) => p.type === "king" && p.color === kingColor,
  );
  if (!king) return false;
  const enemyColor = kingColor === "red" ? "black" : "red";
  if (kingsAreFacing(gameState.pieces)) return true;
  return isSquareAttackedBy(king.row, king.col, enemyColor, gameState.pieces);
}

/**
 * Check if current player is in check
 */
function isInCheck() {
  return isKingAttacked(gameState.currentPlayer);
}

/**
 * Get ALL legal moves for a piece (filters out moves that leave own king in check / exposed or flying general)
 */
function getLegalMoves(piece) {
  const rawMoves = getRawMoves(piece);
  const legalMoves = [];
  for (const [toRow, toCol] of rawMoves) {
    const newPieces = simulateMoveOnPieces(
      gameState.pieces,
      piece.row,
      piece.col,
      toRow,
      toCol,
    );
    if (!isKingInCheckAfterMove(piece.color, newPieces)) {
      legalMoves.push([toRow, toCol]);
    }
  }
  return legalMoves;
}

/**
 * Check if current player is in checkmate
 */
function isInCheckmate() {
  if (!isInCheck()) return false;
  for (const piece of Object.values(gameState.pieces)) {
    if (piece.color !== gameState.currentPlayer) continue;
    if (getLegalMoves(piece).length > 0) return false;
  }
  return true;
}

/**
 * Check if game is in stalemate (not check but no legal moves)
 */
function isInStalemate() {
  if (isInCheck()) return false;
  for (const piece of Object.values(gameState.pieces)) {
    if (piece.color !== gameState.currentPlayer) continue;
    if (getLegalMoves(piece).length > 0) return false;
  }
  return true;
}

/**
 * Check if piece crossed the river
 */
function hasPickCrossedRiver(piece) {
  if (piece.color === "red") {
    return piece.row < RIVER_START; // Red moves up, crossed if row < 4
  } else {
    return piece.row > RIVER_END; // Black moves down, crossed if row > 5
  }
}

/**
 * Check if a position is within palace (Cung)
 * Red palace: rows 7-9, cols 3-5
 * Black palace: rows 0-2, cols 3-5
 */
function isInPalace(row, col, color) {
  if (color === "red") {
    return row >= 7 && row <= 9 && col >= 3 && col <= 5;
  } else {
    return row >= 0 && row <= 2 && col >= 3 && col <= 5;
  }
}

/**
 * Check if a diagonal move is valid (no blocking piece in the middle)
 */
function isDiagonalPathClear(fromRow, fromCol, toRow, toCol) {
  const rowDir = Math.sign(toRow - fromRow);
  const colDir = Math.sign(toCol - fromCol);
  let row = fromRow + rowDir;
  let col = fromCol + colDir;
  while (row !== toRow || col !== toCol) {
    if (hasPieceAt(row, col)) return false;
    row += rowDir;
    col += colDir;
  }
  return true;
}

/**
 * Check if straight line (for knight/horse) is clear
 */
function isKnightPathClear(fromRow, fromCol, toRow, toCol) {
  const rowDiff = Math.abs(toRow - fromRow);
  const colDiff = Math.abs(toCol - fromCol);

  // Knight moves in L-shape: 2 in one direction, 1 perpendicular
  if (rowDiff === 2 && colDiff === 1) {
    const blockRow = fromRow + Math.sign(toRow - fromRow);
    return !hasPieceAt(blockRow, fromCol);
  } else if (rowDiff === 1 && colDiff === 2) {
    const blockCol = fromCol + Math.sign(toCol - fromCol);
    return !hasPieceAt(fromRow, blockCol);
  }
  return false;
}

/**
 * Get valid moves for a chariot (車/车 - Rook)
 * Moves any number of squares horizontally or vertically
 */
function getCharioMoves(piece) {
  const moves = [];
  const { row, col, color } = piece;

  // All four directions
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (const [dRow, dCol] of directions) {
    let newRow = row + dRow;
    let newCol = col + dCol;

    while (newRow >= 0 && newRow < ROWS && newCol >= 0 && newCol < COLS) {
      if (hasPieceAt(newRow, newCol)) {
        const targetPiece = getPieceAt(newRow, newCol);
        if (targetPiece.color !== color) {
          moves.push([newRow, newCol]);
        }
        break;
      }
      moves.push([newRow, newCol]);
      newRow += dRow;
      newCol += dCol;
    }
  }

  return moves;
}

/**
 * Get valid moves for a horse (馬/马 - Knight)
 * Moves in L-shape: 2 squares in one direction, 1 perpendicular
 * Can be blocked by piece in the straight path
 */
function getHorseMoves(piece) {
  const moves = [];
  const { row, col, color } = piece;

  // All 8 possible L-shaped movements
  const knightMoves = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];

  for (const [dRow, dCol] of knightMoves) {
    const newRow = row + dRow;
    const newCol = col + dCol;

    if (newRow >= 0 && newRow < ROWS && newCol >= 0 && newCol < COLS) {
      if (isKnightPathClear(row, col, newRow, newCol)) {
        if (!hasPieceAt(newRow, newCol)) {
          moves.push([newRow, newCol]);
        } else {
          const targetPiece = getPieceAt(newRow, newCol);
          if (targetPiece.color !== color) {
            moves.push([newRow, newCol]);
          }
        }
      }
    }
  }

  return moves;
}

/**
 * Get valid moves for an elephant (象/象 - Bishop)
 * Moves 2 squares diagonally, can't cross river
 * Can be blocked by piece in the diagonal path
 */
function getElephantMoves(piece) {
  const moves = [];
  const { row, col, color } = piece;

  // 4 diagonal directions
  const diagonals = [
    [-2, -2],
    [-2, 2],
    [2, -2],
    [2, 2],
  ];

  for (const [dRow, dCol] of diagonals) {
    const newRow = row + dRow;
    const newCol = col + dCol;

    if (newRow >= 0 && newRow < ROWS && newCol >= 0 && newCol < COLS) {
      // Check river crossing
      const crossedRiver =
        color === "red" ? newRow < RIVER_START : newRow > RIVER_END;
      if (crossedRiver) continue; // Elephant can't cross river

      // Check if diagonal path is clear
      if (isDiagonalPathClear(row, col, newRow, newCol)) {
        if (!hasPieceAt(newRow, newCol)) {
          moves.push([newRow, newCol]);
        } else {
          const targetPiece = getPieceAt(newRow, newCol);
          if (targetPiece.color !== color) {
            moves.push([newRow, newCol]);
          }
        }
      }
    }
  }

  return moves;
}

/**
 * Get valid moves for an advisor (士/士 - Adviser)
 * Moves 1 square diagonally within the palace only
 */
function getAdvisorMoves(piece) {
  const moves = [];
  const { row, col, color } = piece;

  // 4 diagonal directions
  const diagonals = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  for (const [dRow, dCol] of diagonals) {
    const newRow = row + dRow;
    const newCol = col + dCol;

    // Must stay in palace
    if (!isInPalace(newRow, newCol, color)) continue;

    if (!hasPieceAt(newRow, newCol)) {
      moves.push([newRow, newCol]);
    } else {
      const targetPiece = getPieceAt(newRow, newCol);
      if (targetPiece.color !== color) {
        moves.push([newRow, newCol]);
      }
    }
  }

  return moves;
}

/**
 * Get valid moves for a king (將/将 - King)
 * Moves 1 square horizontally or vertically within the palace.
 * Final legality (not moving into check, flying general) is handled by getLegalMoves.
 */
function getKingMoves(piece) {
  return getKingMovesRaw(piece);
}

/**
 * Get valid moves for a cannon (砲/炮 - Cannon)
 * Moves like chariot but to capture: must jump over exactly 1 piece
 */
function getCannonMoves(piece) {
  const moves = [];
  const { row, col, color } = piece;

  // All four directions
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (const [dRow, dCol] of directions) {
    let newRow = row + dRow;
    let newCol = col + dCol;
    let firstPieceFound = false;

    while (newRow >= 0 && newRow < ROWS && newCol >= 0 && newCol < COLS) {
      if (hasPieceAt(newRow, newCol)) {
        if (!firstPieceFound) {
          // First piece found - cannon cannot move to this or beyond until 1 piece crossed
          firstPieceFound = true;
          newRow += dRow;
          newCol += dCol;
          continue;
        } else {
          // Second piece found - this can be captured
          const targetPiece = getPieceAt(newRow, newCol);
          if (targetPiece.color !== color) {
            moves.push([newRow, newCol]);
          }
          break;
        }
      } else {
        // Empty square
        if (!firstPieceFound) {
          // Before crossing any piece, can move here
          moves.push([newRow, newCol]);
        }
        // After crossing 1 piece, only look for capture target
      }

      newRow += dRow;
      newCol += dCol;
    }
  }

  return moves;
}

/**
 * Get valid moves for a pawn (兵/兵 - Pawn)
 * Before crossing river: moves forward (away from starting side) only
 * After crossing river: moves forward and sideways
 */
function getPawnMoves(piece) {
  const moves = [];
  const { row, col, color } = piece;

  const hasPickCrossed = hasPickCrossedRiver(piece);

  if (color === "red") {
    // Red moves upward (row decreases)
    // Forward direction
    if (row > 0) {
      const newRow = row - 1;
      if (!hasPieceAt(newRow, col)) {
        moves.push([newRow, col]);
      } else {
        const targetPiece = getPieceAt(newRow, col);
        if (targetPiece.color !== color) {
          moves.push([newRow, col]);
        }
      }
    }

    // Sideways (only if crossed river)
    if (hasPickCrossed) {
      for (const newCol of [col - 1, col + 1]) {
        if (newCol >= 0 && newCol < COLS) {
          if (!hasPieceAt(row, newCol)) {
            moves.push([row, newCol]);
          } else {
            const targetPiece = getPieceAt(row, newCol);
            if (targetPiece.color !== color) {
              moves.push([row, newCol]);
            }
          }
        }
      }
    }
  } else {
    // Black moves downward (row increases)
    // Forward direction
    if (row < ROWS - 1) {
      const newRow = row + 1;
      if (!hasPieceAt(newRow, col)) {
        moves.push([newRow, col]);
      } else {
        const targetPiece = getPieceAt(newRow, col);
        if (targetPiece.color !== color) {
          moves.push([newRow, col]);
        }
      }
    }

    // Sideways (only if crossed river)
    if (hasPickCrossed) {
      for (const newCol of [col - 1, col + 1]) {
        if (newCol >= 0 && newCol < COLS) {
          if (!hasPieceAt(row, newCol)) {
            moves.push([row, newCol]);
          } else {
            const targetPiece = getPieceAt(row, newCol);
            if (targetPiece.color !== color) {
              moves.push([row, newCol]);
            }
          }
        }
      }
    }
  }

  return moves;
}

/**
 * Calculate valid (legal) moves for a piece.
 * Uses getLegalMoves which filters for check, pin, and flying general.
 */
function calculateValidMoves(piece) {
  return getLegalMoves(piece);
}

/**
 * Tạo element ảnh target overlay lên ô cờ
 */
function createTargetOverlay(squareEl, imageName) {
  const isMobile = window.innerWidth <= 768;
  const assetFolder = isMobile ? "mobile" : "desktop";

  const img = document.createElement("img");
  img.src = `../assets/${assetFolder}/${imageName}?${ASSET_VERSION}`;
  img.className = "target-overlay";
  img.style.cssText = `
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    object-fit: contain;
    pointer-events: none;
    z-index: 5;
  `;
  squareEl.style.position = "relative";
  squareEl.appendChild(img);
}

/**
 * Highlight selected square and valid moves bằng ảnh target-new.png
 */
function highlightSquares() {
  clearHighlights();

  if (gameState.selectedSquare) {
    for (const [moveRow, moveCol] of gameState.validMoves) {
      const squareEl = document.getElementById(`square-${moveRow}-${moveCol}`);
      if (squareEl) createTargetOverlay(squareEl, "target-new.png");
    }
  }
}

/**
 * Clear highlights — xoá target-overlay gợi ý nước đi (giữ lại last-move markers)
 */
function clearHighlights() {
  document
    .querySelectorAll(".square.selected, .square.valid-move")
    .forEach((el) => {
      el.classList.remove("selected", "valid-move");
    });
  document
    .querySelectorAll(".target-overlay:not(.target-last-move)")
    .forEach((el) => el.remove());
}

/**
 * Clear selection
 */
function clearSelection() {
  gameState.selectedSquare = null;
  gameState.validMoves = [];
  clearHighlights();
}

/**
 * Move a piece
 */
function movePiece(fromRow, fromCol, toRow, toCol) {
  // Find the piece
  const piece = Object.entries(gameState.pieces).find(
    ([key, p]) => p.row === fromRow && p.col === fromCol,
  );

  if (!piece) return;

  const [pieceKey, pieceObj] = piece;

  // Check for capture
  const capturedPieceKey = Object.entries(gameState.pieces).find(
    ([key, p]) => p.row === toRow && p.col === toCol,
  )?.[0];

  // Move piece
  pieceObj.row = toRow;
  pieceObj.col = toCol;

  // Update king positions if king moved
  if (pieceObj.type === "king") {
    updateKingPositions();
  }

  // Remove captured piece
  if (capturedPieceKey) {
    delete gameState.pieces[capturedPieceKey];
    addCapturedPiece(gameState.currentPlayer, capturedPieceKey);
  }

  // Add move to history
  const pieceName = PIECE_NAME_MAP[pieceObj.type] || pieceObj.type;
  const colorName = pieceObj.color === "red" ? "Đỏ" : "Đen";

  const captureInfo = capturedPieceKey ? " x" : "";

  const moveNotation = `${pieceName} ${colorName}${captureInfo}: ${fromRow},${fromCol} -> ${toRow},${toCol}`;
  addMoveToHistory(moveNotation);

  // Send move via Socket.io
  if (
    socket &&
    gameState.matchId &&
    gameState.userRole === gameState.currentPlayer
  ) {
    sendMove(
      gameState.matchId,
      `${fromRow},${fromCol}`,
      `${toRow},${toCol}`,
      gameState.moveHistory.length,
    );
  }

  // Play sound if enabled
  if (gameState.soundEnabled) {
    playBackGroundSound();
  }

  // Switch player
  switchPlayer();

  // Check game status after move
  if (isInCheckmate()) {
    gameState.gameStatus = "checkmate";
    const loserSide = gameState.currentPlayer === "red" ? "Đỏ" : "Đen";
    showGameResult(`${loserSide} chiếu hết! Game Over.`);

    // End match via socket
    if (socket && gameState.matchId) {
      const winnerId =
        gameState.currentPlayer === "red"
          ? gameState.blackPlayerId
          : gameState.redPlayerId;
      endMatch(gameState.matchId, winnerId, "checkmate");
    }
  } else if (isInStalemate()) {
    gameState.gameStatus = "stalemate";
    showGameResult("Cờ bế tắc! Game Over.");

    // End match via socket
    if (socket && gameState.matchId) {
      endMatch(gameState.matchId, null, "stalemate");
    }
  } else if (isInCheck()) {
    gameState.gameStatus = "check";
    showCheckAlert(
      `${gameState.currentPlayer === "red" ? "Đỏ" : "Đen"} bị chiếu tướng!`,
    );
  } else {
    gameState.gameStatus = "playing";
  }

  // Lưu nước đi cuối để hiển thị marker
  gameState.lastMove = { fromRow, fromCol, toRow, toCol };

  // Re-render
  updatePiecePosition(pieceKey, fromRow, fromCol, toRow, toCol);
  clearSelection();
  showLastMoveMarkers();
}

/**
 * Apply remote move from opponent (without sending back via socket)
 */
function applyRemoteMove(fromRow, fromCol, toRow, toCol) {
  // Find the piece
  const piece = Object.entries(gameState.pieces).find(
    ([key, p]) => p.row === fromRow && p.col === fromCol,
  );

  if (!piece) {
    console.error(
      `❌ No piece found at position ${fromRow},${fromCol} to apply remote move`,
    );
    return;
  }

  const [pieceKey, pieceObj] = piece;

  // Check for capture
  const capturedPieceKey = Object.entries(gameState.pieces).find(
    ([key, p]) => p.row === toRow && p.col === toCol,
  )?.[0];

  // Move piece
  pieceObj.row = toRow;
  pieceObj.col = toCol;

  // Update king positions if king moved
  if (pieceObj.type === "king") {
    updateKingPositions();
  }

  // Remove captured piece
  if (capturedPieceKey) {
    delete gameState.pieces[capturedPieceKey];
    const movingColor = pieceObj.color;
    addCapturedPiece(movingColor, capturedPieceKey);
  }

  // Add move to history
  const pieceName = PIECE_NAME_MAP[pieceObj.type] || pieceObj.type;
  const colorName = pieceObj.color === "red" ? "Đỏ" : "Đen";

  const captureInfo = capturedPieceKey ? " x" : "";

  const moveNotation = `${pieceName} ${colorName}${captureInfo}: ${fromRow},${fromCol} -> ${toRow},${toCol}`;
  addMoveToHistory(moveNotation);
  // Save last move
  gameState.lastMove = { fromRow, fromCol, toRow, toCol };

  // Re-render board
  updatePiecePosition(pieceKey, fromRow, fromCol, toRow, toCol);
  clearSelection();
  showLastMoveMarkers();

  // Check game status after opponent move
  if (isInCheckmate()) {
    gameState.gameStatus = "checkmate";
    const loserSide = gameState.currentPlayer === "red" ? "Đỏ" : "Đen";
    showGameResult(`${loserSide} chiếu hết! Game Over.`);

    // End match via socket
    if (socket && gameState.matchId) {
      const winnerId =
        gameState.currentPlayer === "red"
          ? gameState.blackPlayerId
          : gameState.redPlayerId;
      endMatch(gameState.matchId, winnerId, "checkmate");
    }
  } else if (isInStalemate()) {
    gameState.gameStatus = "stalemate";
    showGameResult("Cờ bế tắc! Game Over.");

    // End match via socket
    if (socket && gameState.matchId) {
      endMatch(gameState.matchId, null, "stalemate");
    }
  } else if (isInCheck()) {
    gameState.gameStatus = "check";
    showCheckAlert(
      `${gameState.currentPlayer === "red" ? "Đỏ" : "Đen"} bị chiếu tướng!`,
    );
  } else {
    gameState.gameStatus = "playing";
  }

  switchPlayer();

  console.log("✅ Remote move applied successfully");
}

function updatePiecePosition(pieceKey, fromRow, fromCol, toRow, toCol) {
  const fromSquare = document.getElementById(`square-${fromRow}-${fromCol}`);
  const toSquare = document.getElementById(`square-${toRow}-${toCol}`);

  const pieceEl = fromSquare.querySelector(".piece-on-board");

  if (!pieceEl) return;

  // Xóa quân bị ăn
  const targetPiece = toSquare.querySelector(".piece-on-board");
  if (targetPiece) targetPiece.remove();

  // Move DOM node (KHÔNG tạo mới)
  toSquare.appendChild(pieceEl);
}

/**
 * Show last move markers (target-old.png on from square, target-new.png on to square)
 */
function showLastMoveMarkers() {
  // Delete old last move markers
  document.querySelectorAll(".target-last-move").forEach((el) => el.remove());

  if (!gameState.lastMove) return;
  const { fromRow, fromCol, toRow, toCol } = gameState.lastMove;

  const oldSquare = document.getElementById(`square-${fromRow}-${fromCol}`);
  const newSquare = document.getElementById(`square-${toRow}-${toCol}`);

  if (oldSquare) {
    createTargetOverlay(oldSquare, "target-old.png");
    oldSquare
      .querySelector(".target-overlay:last-child")
      .classList.add("target-last-move");
  }
  if (newSquare) {
    createTargetOverlay(newSquare, "target-new.png");
    newSquare
      .querySelector(".target-overlay:last-child")
      .classList.add("target-last-move");
  }
}

/**
 * Switch current player
 */
function switchPlayer() {
  gameState.currentPlayer = gameState.currentPlayer === "red" ? "black" : "red";
}

/**
 * Show check alert to player
 */
function showCheckAlert(message) {
  // Create a temporary alert (can be enhanced with a modal later)
  const alertDiv = document.createElement("div");
  alertDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(255, 100, 100, 0.9);
    color: white;
    padding: 20px 40px;
    border-radius: 8px;
    font-size: 18px;
    font-weight: bold;
    z-index: 9999;
    animation: fadeInOut 2s ease-in-out;
  `;
  alertDiv.textContent = message;
  document.body.appendChild(alertDiv);

  // Remove after 2 seconds
  setTimeout(() => alertDiv.remove(), 2000);
}

/**
 * Show "not your turn" message to player
 */
function showNotYourTurnMessage() {
  const opponentColor = gameState.currentPlayer === "red" ? "Đỏ" : "Đen";
  showCheckAlert(`Chưa đến lượt bạn! ${opponentColor} đang chơi.`);
}

/**
 * Show game result (checkmate, stalemate)
 */
/**
 * Show game result
 */
function showGameResult(message) {
  const resultDiv = document.createElement("div");
  resultDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.95);
    color: #ffd700;
    padding: 30px 50px;
    border-radius: 8px;
    font-size: 24px;
    font-weight: bold;
    z-index: 9999;
    border: 3px solid #ffd700;
    text-align: center;
  `;
  resultDiv.innerHTML = `${message}<br><button style="margin-top: 15px; padding: 10px 20px; font-size: 16px; cursor: pointer;">Thoát</button>`;
  document.body.appendChild(resultDiv);

  resultDiv.querySelector("button").addEventListener("click", () => {
    resultDiv.remove();
    location.reload(); // Reload to start new game
  });
}

/**
 * End game (called when game ends due to surrender, timeout, etc)
 */
function endGame(reason = "normal") {
  console.log(`🏁 Game ended - Reason: ${reason}`);
  gameState.gameStatus = "ended";
  // Further logic can be added here as needed
}

/**
 * Add move to history
 */
function addMoveToHistory(moveText) {
  if (typeof moveText === "object") {
    console.warn("⚠️ moveText là object:", moveText);
    return; // ❌ không cho hiển thị
  }

  gameState.moveHistory.push(moveText);
  const movesList = document.getElementById("moves-list");
  const moveItem = document.createElement("div");
  moveItem.className = "move-item";
  moveItem.textContent = `${gameState.moveHistory.length}. ${moveText}`;
  movesList.appendChild(moveItem);

  // Auto-scroll to bottom
  movesList.scrollTop = movesList.scrollHeight;
}

/**
 * Add captured piece to display
 */
function addCapturedPiece(playerColor, capturedPieceKey) {
  const containerId =
    playerColor === "red"
      ? "player-captured-pieces"
      : "opponent-captured-pieces";
  const container = document.getElementById(containerId);

  // Get the piece info before it was deleted
  let pieceType = "chariot"; // default

  // Extract piece type from key (e.g., 'red-chariot-left' -> 'chariot')
  const typeMatch = capturedPieceKey.match(/-(\w+?)(?:-|$)/);
  if (typeMatch) {
    pieceType = typeMatch[1];
  }

  // Determine piece color (opposite of player color)
  const pieceColor = playerColor === "red" ? "black" : "red";

  const isMobile = window.innerWidth <= 768;
  const assetFolder = isMobile ? "mobile" : "desktop";

  const img = document.createElement("img");
  img.src = `../assets/${assetFolder}/${pieceType}_${pieceColor}.png?${ASSET_VERSION}`;
  img.draggable = false;

  container.appendChild(img);
}

/**
 * Play move sound
 */
function playBackGroundSound() {
  // For background music: just adjust volume and muted state
  const audioElement = document.getElementById("move-sound");

  if (audioElement) {
    // Set volume based on soundEnabled state
    audioElement.volume = gameState.soundEnabled ? gameState.volume / 100 : 0;
    audioElement.muted = !gameState.soundEnabled;

    // If paused and sound is enabled, try to play
    if (gameState.soundEnabled && audioElement.paused) {
      audioElement.play().catch(() => {
        // If HTML5 audio fails, use fallback beep
        playBeepSound();
      });
    }
  } else {
    // No audio element found, use fallback
    playBeepSound();
  }
}

/**
 * Play beep sound using Web Audio API (fallback)
 */
function playBeepSound() {
  // Always play beep, but volume depends on soundEnabled state
  try {
    const audioContext = new (
      window.AudioContext || window.webkitAudioContext
    )();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    const panner = audioContext.createStereoPanner();

    oscillator.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = "sine";

    // Apply volume based on soundEnabled state
    const volumeLevel = gameState.soundEnabled ? gameState.volume / 100 : 0;
    gainNode.gain.setValueAtTime(0.3 * volumeLevel, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + 0.1,
    );

    // Stereo effect - center (0)
    panner.pan.value = 0;

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (e) {
    console.error("Audio playback error:", e);
  }
}

/**
 * Start game timer - 15 minutes (900 seconds) per player
 */
function startGameTimer() {
  let playerTime = 900; // 15 minutes in seconds
  let opponentTime = 900;
  let timerInterval = null;

  // Store references for pause/resume if needed
  gameState.playerTime = playerTime;
  gameState.opponentTime = opponentTime;

  // Update display initially
  document.getElementById("player-time").textContent = formatTime(playerTime);
  document.getElementById("opponent-time").textContent =
    formatTime(opponentTime);

  timerInterval = setInterval(() => {
    if (
      gameState.gameStatus !== "playing" &&
      gameState.gameStatus !== "check" || !gameState.userRole
    ) {
      clearInterval(timerInterval);
      return;
    }

    // Check whose turn it is - simple logic
    const isPlayerTurn = gameState.userRole === gameState.currentPlayer;

    if (isPlayerTurn) {
      // Player's turn - decrement player time
      playerTime--;
      gameState.playerTime = playerTime;
      document.getElementById("player-time").textContent =
        formatTime(playerTime);

      // Check timeout
      if (playerTime <= 0) {
        clearInterval(timerInterval);
        endGame("timeout");
        showGameResult("Hết thời gian! Bạn thua.");
        if (socket && gameState.matchId) {
          // Get opponent ID
          const opponentId =
            gameState.userRole === "red"
              ? gameState.blackPlayerId
              : gameState.redPlayerId;
          endMatch(gameState.matchId, opponentId, "timeout");
        }
      }
    } else {
      // Opponent's turn - decrement opponent time
      opponentTime--;
      gameState.opponentTime = opponentTime;
      document.getElementById("opponent-time").textContent =
        formatTime(opponentTime);

      // Check timeout
      if (opponentTime <= 0) {
        clearInterval(timerInterval);
        endGame("timeout");
        showGameResult("Đối thủ hết thời gian! Bạn thắng.");
        if (socket && gameState.matchId) {
          endMatch(gameState.matchId, currentUser.userId, "timeout");
        }
      }
    }
  }, 1000);

  gameState.timerInterval = timerInterval;
}

/**
 * Format time to MM:SS
 */
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Rotate board 180 degrees for black player (visual only, coordinates remain same)
 * This only rotates the visual display without changing piece coordinates
 */
function rotateBoard() {
  applyBoardOrientation();
}

/**
 * Apply board orientation based on the current player role.
 */
function applyBoardOrientation() {
  const boardElement = document.getElementById("chess-board");
  const rotate = gameState.userRole === "black";

  // For black player: rotate the board 180 degrees but keep pieces upright
  // We need to counter-rotate the pieces so they display correctly
  if (boardElement) {
    boardElement.style.transform = rotate ? "rotate(180deg)" : "none";
    boardElement.style.transition = "transform 0.3s ease-out";
  }

  // IMPORTANT: Counter-rotate pieces so they appear correct for black player
  // When board rotates 180deg, pieces would appear upside down without this
  document.querySelectorAll(".piece-on-board").forEach((piece) => {
    // Counter-rotate 180deg to negate the board's 180deg rotation
    piece.style.transform = rotate ? "rotate(180deg)" : "none";
    piece.style.transition = "transform 0.3s ease-out";
  });

  // Note: We do NOT change piece coordinates (row, col)
  // This way click handlers still work correctly with original coordinates
  // The visual rotation is purely CSS-based

  if (rotate) {
    console.log(
      "✅ Board rotated visually for black player (pieces counter-rotated)",
    );
  } else {
    console.log("✅ Board oriented normally for red player");
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Settings
  document.getElementById("settings-btn")?.addEventListener("click", () => {
    document.getElementById("settings-modal")?.classList.remove("hidden");
  });

  // Sound toggle
  document.getElementById("sound-toggle")?.addEventListener("change", (e) => {
    gameState.soundEnabled = e.target.checked;
    updateAudioState();
  });

  document.getElementById("sound-btn")?.addEventListener("click", () => {
    gameState.soundEnabled = !gameState.soundEnabled;
    document.getElementById("sound-toggle").checked = gameState.soundEnabled;
    updateAudioState();
    updateSoundButtonDisplay();
  });

  // Volume slider
  document.getElementById("volume-slider")?.addEventListener("input", (e) => {
    gameState.volume = parseInt(e.target.value);
    document.getElementById("volume-value").textContent =
      gameState.volume + "%";
    updateAudioState();
  });

  // Surrender
  document.getElementById("surrender-btn")?.addEventListener("click", () => {
    document.getElementById("surrender-modal")?.classList.remove("hidden");
  });

  // Chat
  document.getElementById("send-btn")?.addEventListener("click", sendMessage);
  document.getElementById("chat-input")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") sendMessage();
  });

  // Modal close handlers
  setupModalHandlers();
}

/**
 * Update audio state
 */
function updateAudioState() {
  const audioElement = document.getElementById("move-sound");
  if (audioElement) {
    audioElement.volume = gameState.soundEnabled ? gameState.volume / 100 : 0;
    audioElement.muted = !gameState.soundEnabled;
  }
}

/**
 * Setup modal handlers
 */
function setupModalHandlers() {
  // Close settings
  document.getElementById("close-settings")?.addEventListener("click", () => {
    document.getElementById("settings-modal")?.classList.add("hidden");
  });

  // Surrender handlers
  document.getElementById("cancel-surrender")?.addEventListener("click", () => {
    document.getElementById("surrender-modal")?.classList.add("hidden");
  });

  document
    .getElementById("confirm-surrender")
    ?.addEventListener("click", () => {
      // Send resign via socket
      if (socket && gameState.matchId && currentUser) {
        resignMatch(gameState.matchId);
      }

      endGame("surrender");
      document.getElementById("surrender-modal")?.classList.add("hidden");
    });

  // Click outside to close
  ["settings-modal", "surrender-modal"].forEach((modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target.id === modalId) {
          modal.classList.add("hidden");
        }
      });
    }
  });
}

/**
 * Optimized resize handler với debounce
 */
let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    const newDeviceType = getDeviceType();
    if (newDeviceType !== currentDeviceType) {
      currentDeviceType = newDeviceType;
      document.body.classList.toggle("mobile", currentDeviceType === "mobile");
      renderPieces();
    }
  }, 250);
});

// [INSERT TẤT CẢ GAME LOGIC FUNCTIONS TỪ CODE GỐC - không thay đổi]
// Bao gồm: selectPiece, tất cả getXXXMoves, movePiece, endGame, sendMessage, etc...

/**
 * Update sound button display
 */
function updateSoundButtonDisplay() {
  const soundBtn = document.getElementById("sound-btn");
  if (soundBtn) {
    soundBtn.classList.toggle("muted", !gameState.soundEnabled);
  }
}

/**
 * Send chat message - MOBILE OPTIMIZED
 */
function sendMessage() {
  const chatInput = document.getElementById("chat-input");
  const messageText = chatInput?.value?.trim();

  if (!messageText) return;

  // Send via Socket.io
  if (socket && currentRoom && gameState.roomId) {
    sendChatMessage(messageText);
  }

  // Display on own UI using addChatMessage for consistency
  if (typeof addChatMessage === "function") {
    addChatMessage("Bạn", messageText, true);
  }

  chatInput.value = "";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
