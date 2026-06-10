console.log("=== Chess Game Script Loading ===");

const pathParts = window.location.pathname.split('/');
const roomId = pathParts[pathParts.length - 1] || 'default';
const urlParams = new URLSearchParams(window.location.search);
const rawPlayerName = (urlParams.get('name') || '').trim();

if (!rawPlayerName) {
  alert('Please enter your name before joining a room.');
  window.location.href = '/';
}

const playerName = rawPlayerName;

const socket = io(window.location.origin);
const chess = new Chess();

console.log("Room ID:", roomId, "Player name:", playerName);

socket.emit('joinRoom', { roomId, name: playerName });

let playerRole = null;
let selectedSquare = null;
let whiteTime = 600;
let blackTime = 600;
let moveHistory = [];
let lastMove = null;
window.playerNames = { white: 'Waiting...', black: 'Waiting...' };

/* ============================================================
   LOCAL STORAGE PERSISTENCE - Save game state for refresh
============================================================ */
const storageKey = `chess_game_${roomId}`;

function saveGameState() {
  const state = {
    fen: chess.fen(),
    moveHistory: moveHistory,
    lastMove: lastMove,
    playerRole: playerRole,
    playerNames: window.playerNames,
    whiteTime: whiteTime,
    blackTime: blackTime,
    timestamp: Date.now()
  };
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function loadGameState() {
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      const state = JSON.parse(saved);
      // Only restore if less than 1 hour old
      if (Date.now() - state.timestamp < 3600000) {
        return state;
      }
    } catch (e) {
      console.error('Failed to load saved game:', e);
    }
  }
  return null;
}

function clearGameState() {
  localStorage.removeItem(storageKey);
}

// Restore saved state on load
const savedState = loadGameState();
if (savedState) {
  chess.load(savedState.fen);
  moveHistory = savedState.moveHistory || [];
  lastMove = savedState.lastMove || null;
  playerRole = savedState.playerRole || null;
  window.playerNames = savedState.playerNames || { white: 'Waiting...', black: 'Waiting...' };
  whiteTime = savedState.whiteTime || 600;
  blackTime = savedState.blackTime || 600;
  console.log('Restored game state from localStorage');
}

/* ============================================================
   RENDER BOARD
============================================================ */
function renderBoard() {
  const boardEl = document.getElementById('chessboard');
  if (!boardEl) {
    console.error('Chessboard element not found!');
    return;
  }
  
  boardEl.innerHTML = '';
  const board = chess.board();
  const isFlipped = (playerRole === 'b');
  
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const displayRow = isFlipped ? (7 - row) : row;
      const displayCol = isFlipped ? (7 - col) : col;
      
      const square = board[displayRow][displayCol];
      const squareDiv = document.createElement('div');
      const file = String.fromCharCode(97 + displayCol);
      const rank = 8 - displayRow;
      const squareId = file + rank;
      
      squareDiv.className = 'square';
      squareDiv.className += (displayRow + displayCol) % 2 === 0 ? ' light' : ' dark';
      squareDiv.dataset.square = squareId;
      
      // Highlight selected square
      if (selectedSquare === squareId) {
        squareDiv.classList.add('selected');
      }
      
      // Highlight last move
      if (lastMove && (lastMove.from === squareId || lastMove.to === squareId)) {
        squareDiv.classList.add('last-move');
      }
      
      // Highlight check
      if (isInCheck()) {
        const kingSquare = findKingSquare(chess.turn());
        if (squareId === kingSquare) {
          squareDiv.classList.add('in-check');
        }
      }
      
      // Show legal moves for selected piece
      let canCapture = false;
      if (selectedSquare) {
        const moves = chess.moves({ square: selectedSquare, verbose: true });
        const canMove = moves.some(m => m.to === squareId);
        if (canMove) {
          squareDiv.classList.add('legal-move');
          // Check if this is a capture move
          const selectedPiece = chess.get(selectedSquare);
          if (square && selectedPiece && square.color !== selectedPiece.color) {
            canCapture = true;
          }
        }
      }
      
      // Add piece
      if (square) {
        const pieceSpan = document.createElement('span');
        pieceSpan.className = `piece ${square.color === 'w' ? 'white-piece' : 'black-piece'}`;
        if (canCapture) pieceSpan.classList.add('piece-capturable');
        pieceSpan.textContent = getPieceUnicode(square);
        squareDiv.appendChild(pieceSpan);
      }
      
      squareDiv.addEventListener('click', () => handleSquareClick(squareId));
      boardEl.appendChild(squareDiv);
    }
  }
}

function findKingSquare(color) {
  const board = chess.board();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = board[row][col];
      if (square && square.type === 'k' && square.color === color) {
        const file = String.fromCharCode(97 + col);
        const rank = 8 - row;
        return file + rank;
      }
    }
  }
  return null;
}

function isInCheck() {
  if (typeof chess.in_check === 'function') return chess.in_check();
  if (typeof chess.inCheck === 'function') return chess.inCheck();
  return false;
}

function getPieceUnicode(piece) {
  const pieces = {
    'wp': '♙', 'wn': '♘', 'wb': '♗', 'wr': '♖', 'wq': '♕', 'wk': '♔',
    'bp': '♟', 'bn': '♞', 'bb': '♝', 'br': '♜', 'bq': '♛', 'bk': '♚'
  };
  return pieces[piece.color + piece.type] || '';
}

/* ============================================================
   HANDLE SQUARE CLICK
============================================================ */
function handleSquareClick(square) {
  if (!playerRole) return;
  if (chess.turn() !== playerRole) return;
  
  const piece = chess.get(square);
  
  // If clicking on own piece, select it
  if (piece && piece.color === playerRole) {
    selectedSquare = square;
    renderBoard();
    return;
  }
  
  // If a square is selected, try to move
  if (selectedSquare) {
    const move = {
      from: selectedSquare,
      to: square,
      promotion: 'q'
    };
    
    const legalMove = chess.moves({ square: selectedSquare, verbose: true }).find(m => m.to === square);
    if (legalMove) {
      selectedSquare = null;
      socket.emit('move', move);
      renderBoard();
    } else {
      selectedSquare = null;
      renderBoard();
    }
  }
}

/* ============================================================
   TIMERS
============================================================ */
function updateTimerDisplay() {
  const topTimer = document.getElementById('topPlayerTimer');
  const bottomTimer = document.getElementById('bottomPlayerTimer');
  const topCard = document.getElementById('topPlayerCard');
  const bottomCard = document.getElementById('bottomPlayerCard');
  
  const currentTurn = chess.turn();
  const isFlipped = (playerRole === 'b');
  
  let topTime, bottomTime, topActive, bottomActive;
  
  if (isFlipped) {
    topTime = whiteTime;
    bottomTime = blackTime;
    topActive = (currentTurn === 'w');
    bottomActive = (currentTurn === 'b');
  } else {
    topTime = blackTime;
    bottomTime = whiteTime;
    topActive = (currentTurn === 'b');
    bottomActive = (currentTurn === 'w');
  }
  
  if (topTimer) {
    topTimer.textContent = formatTime(topTime);
    topTimer.classList.toggle('low', topTime <= 10);
  }
  if (bottomTimer) {
    bottomTimer.textContent = formatTime(bottomTime);
    bottomTimer.classList.toggle('low', bottomTime <= 10);
  }
  
  if (topCard) topCard.classList.toggle('active', topActive);
  if (bottomCard) bottomCard.classList.toggle('active', bottomActive);
}

function formatTime(seconds) {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  return seconds.toString();
}

/* ============================================================
   MOVE HISTORY
============================================================ */
function updateMoveHistory() {
  const historyEl = document.getElementById('moveHistory');
  if (!historyEl) return;
  
  historyEl.innerHTML = '';
  
  if (moveHistory.length === 0) {
    historyEl.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; text-align: center;">No moves yet</div>';
    return;
  }
  
  for (let i = 0; i < moveHistory.length; i += 2) {
    const moveNum = Math.floor(i / 2) + 1;
    const whiteMove = moveHistory[i];
    const blackMove = moveHistory[i + 1] || '';
    
    const moveItem = document.createElement('div');
    moveItem.className = 'move-item';
    // White dot for white's move, Black dot for black's move
    const whiteDot = whiteMove ? '<span class="move-dot move-dot-white"></span>' : '';
    const blackDot = blackMove ? '<span class="move-dot move-dot-black"></span>' : '';
    moveItem.innerHTML = `${moveNum}. ${whiteDot}${whiteMove} ${blackDot}${blackMove}`;
    historyEl.appendChild(moveItem);
  }
  
  historyEl.scrollTop = historyEl.scrollHeight;
}

/* ============================================================
   CAPTURED PIECES - Display near player cards
============================================================ */
function updateCapturedPieces() {
  const initialCounts = {
    w: { p: 8, r: 2, n: 2, b: 2, q: 1 },
    b: { p: 8, r: 2, n: 2, b: 2, q: 1 }
  };
  const currentCounts = {
    w: { p: 0, r: 0, n: 0, b: 0, q: 0 },
    b: { p: 0, r: 0, n: 0, b: 0, q: 0 }
  };
  
  chess.board().forEach(row => {
    row.forEach(sq => {
      if (sq && sq.type !== 'k') currentCounts[sq.color][sq.type]++;
    });
  });
  
  const capturedWhite = [];
  const capturedBlack = [];
  
  Object.keys(initialCounts.w).forEach(type => {
    const diff = initialCounts.w[type] - currentCounts.w[type];
    for (let i = 0; i < diff; i++) capturedWhite.push(getPieceUnicode({ color: 'w', type }));
  });
  
  Object.keys(initialCounts.b).forEach(type => {
    const diff = initialCounts.b[type] - currentCounts.b[type];
    for (let i = 0; i < diff; i++) capturedBlack.push(getPieceUnicode({ color: 'b', type }));
  });
  
  const topCapturedEl = document.getElementById('topCaptured');
  const bottomCapturedEl = document.getElementById('bottomCaptured');
  
  // Determine which player is on top and bottom
  // Top player: If I'm Black, top is White. If I'm White, top is Black.
  // Bottom player: If I'm Black, bottom is Black (me). If I'm White, bottom is White (me).
  
  let topCaptured = [], bottomCaptured = [];
  
  if (playerRole === 'b') {
    // I'm Black, so top is White, bottom is Black (me)
    // Top player (White) has captured Black pieces
    topCaptured = capturedBlack;
    // Bottom player (me - Black) has captured White pieces
    bottomCaptured = capturedWhite;
  } else if (playerRole === 'w') {
    // I'm White, so top is Black, bottom is White (me)
    // Top player (Black) has captured White pieces
    topCaptured = capturedWhite;
    // Bottom player (me - White) has captured Black pieces
    bottomCaptured = capturedBlack;
  } else {
    // Spectator - show normally
    topCaptured = capturedWhite;
    bottomCaptured = capturedBlack;
  }
  
  if (topCapturedEl) {
    topCapturedEl.innerHTML = topCaptured.length ? topCaptured.map(p => `<span class="captured-mini">${p}</span>`).join('') : '';
  }
  
  if (bottomCapturedEl) {
    bottomCapturedEl.innerHTML = bottomCaptured.length ? bottomCaptured.map(p => `<span class="captured-mini">${p}</span>`).join('') : '';
  }
}

/* ============================================================
   PLAYER NAMES
============================================================ */
function updatePlayerNames(names) {
  window.playerNames = {
    white: names.white || 'Waiting...',
    black: names.black || 'Waiting...'
  };

  const topName = document.getElementById('topPlayerName');
  const bottomName = document.getElementById('bottomPlayerName');
  const topLabel = document.getElementById('topPlayerLabel');
  const bottomLabel = document.getElementById('bottomPlayerLabel');
  const topAvatar = document.getElementById('topPlayerAvatar');
  const bottomAvatar = document.getElementById('bottomPlayerAvatar');
  
  // For black player: board is flipped, top is White, bottom is Black
  // For white player: normal, top is Black, bottom is White
  if (playerRole === 'b') {
    // Top = White (opponent), Bottom = Black (you)
    if (topName) topName.textContent = window.playerNames.white;
    if (bottomName) bottomName.textContent = `${window.playerNames.black} (You)`;
    if (topLabel) topLabel.textContent = 'White';
    if (bottomLabel) bottomLabel.textContent = 'Black';
    if (topAvatar) topAvatar.textContent = '♔';
    if (bottomAvatar) bottomAvatar.textContent = '♚';
  } else if (playerRole === 'w') {
    // Top = Black (opponent), Bottom = White (you)
    if (topName) topName.textContent = window.playerNames.black;
    if (bottomName) bottomName.textContent = `${window.playerNames.white} (You)`;
    if (topLabel) topLabel.textContent = 'Black';
    if (bottomLabel) bottomLabel.textContent = 'White';
    if (topAvatar) topAvatar.textContent = '♚';
    if (bottomAvatar) bottomAvatar.textContent = '♔';
  } else {
    // Spectator - show both as waiting or their actual names
    if (topName) topName.textContent = window.playerNames.black;
    if (bottomName) bottomName.textContent = window.playerNames.white;
    if (topLabel) topLabel.textContent = 'Black';
    if (bottomLabel) bottomLabel.textContent = 'White';
  }
}

/* ============================================================
   GAME POPUP
============================================================ */
function showGamePopup(title, message, icon = '🏆') {
  const popup = document.getElementById('gamePopup');
  const popupTitle = document.getElementById('popupTitle');
  const popupMessage = document.getElementById('popupMessage');
  const popupIcon = document.getElementById('popupIcon');
  
  if (popupTitle) popupTitle.textContent = title;
  if (popupMessage) popupMessage.textContent = message;
  if (popupIcon) popupIcon.textContent = icon;
  if (popup) popup.classList.remove('hidden');
}

function closePopup() {
  const popup = document.getElementById('gamePopup');
  if (popup) popup.classList.add('hidden');
}

/* ============================================================
   NOTIFICATION
============================================================ */
function showNotification(message) {
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();
  
  const notif = document.createElement('div');
  notif.className = 'notification';
  notif.textContent = message;
  document.body.appendChild(notif);
  
  setTimeout(() => notif.remove(), 3000);
}

/* ============================================================
   CHAT
============================================================ */
function addChatMessage(name, message) {
  const chatMessages = document.getElementById('chatMessages');
  if (!chatMessages) return;
  
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message';
  msgDiv.innerHTML = `<strong>${name}:</strong> ${message}`;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

document.getElementById('sendChatBtn')?.addEventListener('click', () => {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (message) {
    socket.emit('chatMessage', { roomId, name: playerName, message });
    input.value = '';
  }
});

document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('sendChatBtn')?.click();
  }
});

/* ============================================================
   COPY CODE BUTTON
============================================================ */
document.getElementById('copyCodeBtn')?.addEventListener('click', () => {
  navigator.clipboard.writeText(roomId).then(() => {
    showNotification('Room code copied!');
  });
});

/* ============================================================
   ACTION BUTTONS
============================================================ */
document.getElementById('resignBtn')?.addEventListener('click', () => {
  if (confirm('Are you sure you want to resign?')) {
    socket.emit('resign', { roomId });
  }
});

document.getElementById('drawBtn')?.addEventListener('click', () => {
  socket.emit('offerDraw', { roomId });
  showNotification('Draw offer sent');
});

/* ============================================================
   POPUP BUTTONS
============================================================ */
document.getElementById('newRoomBtn')?.addEventListener('click', () => {
  window.location.href = '/';
});

document.getElementById('homeBtn')?.addEventListener('click', () => {
  window.location.href = '/';
});

/* ============================================================
   SOCKET EVENTS
============================================================ */
socket.on('playerRole', (role) => {
  console.log('Assigned role:', role);
  playerRole = role;
  updatePlayerNames(window.playerNames);
  renderBoard();
});

socket.on('playerNames', (names) => {
  console.log('Player names:', names);
  updatePlayerNames(names);
});

socket.on('spectatorRole', () => {
  playerRole = null;
  updatePlayerNames(window.playerNames);
  renderBoard();
});

socket.on('boardState', (fen) => {
  console.log('Board state received:', fen);
  chess.load(fen);
  renderBoard();
  updateCapturedPieces();
  updateTimerDisplay();
});

socket.on('move', (move) => {
  console.log('Move made:', move);
  const result = chess.move(move);
  lastMove = { from: move.from, to: move.to };
  if (result && result.san) moveHistory.push(result.san);
  renderBoard();
  updateMoveHistory();
  updateCapturedPieces();
  updateTimerDisplay();
  saveGameState();
});

socket.on('timerUpdate', (data) => {
  whiteTime = data.whiteTime;
  blackTime = data.blackTime;
  updateTimerDisplay();
  saveGameState();
});

socket.on('moveHistory', (history) => {
  moveHistory = Array.isArray(history) ? history : [];
  updateMoveHistory();
});

socket.on('gameOver', (data) => {
  console.log('Game over:', data);
  clearGameState();
  const names = window.playerNames || { white: 'White', black: 'Black' };
  
  let title = 'Game Over';
  let message = '';
  let icon = '🏁';
  
  if (data.winner === 'white') {
    title = `${names.white} Wins!`;
    message = `${names.black} ${data.reason}`;
    icon = '🏆';
  } else if (data.winner === 'black') {
    title = `${names.black} Wins!`;
    message = `${names.white} ${data.reason}`;
    icon = '🏆';
  } else {
    title = 'Draw';
    message = data.reason;
    icon = '🤝';
  }
  
  showGamePopup(title, message, icon);
});

socket.on('drawOffered', () => {
  if (confirm('Your opponent offered a draw. Accept?')) {
    socket.emit('acceptDraw', { roomId });
  }
});

socket.on('chatMessage', (data) => {
  addChatMessage(data.sender || data.name, data.message);
});

socket.on('error', (message) => {
  console.error('Socket error:', message);
  showNotification(message);
});

// Initial render - scripts are at bottom of body so DOM is ready
console.log('Initializing game...');
const roomCodeEl = document.getElementById('roomCode');
if (roomCodeEl) roomCodeEl.textContent = roomId;
renderBoard();
updateTimerDisplay();
updateCapturedPieces();
updateMoveHistory();
