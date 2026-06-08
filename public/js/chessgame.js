console.log("=== Chess Game Script Loading ===");

// Get room ID from URL
const pathParts = window.location.pathname.split('/');
const roomId = pathParts[pathParts.length - 1] || 'default';

// Get player name from URL parameter
const urlParams = new URLSearchParams(window.location.search);
const playerName = urlParams.get('name') || 'Anonymous';

const socket = io(window.location.origin);
const chess = new Chess();
const boardElement = document.querySelector(".chessboard");
console.log("Socket initialized:", socket);
console.log("Chess initialized:", chess);
console.log("Board element:", boardElement);
console.log("Room ID:", roomId);
console.log("Player name:", playerName);

// Join the room with name
socket.emit('joinRoom', { roomId, name: playerName });

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;
let selectedSquare = null;

let whiteTime = 30;
let blackTime = 30;
let moveHistory = [];

/* ============================================================
   NOTIFICATION PILL
============================================================ */
function showNotif(msg, duration = 3000) {
    const pill = document.getElementById('notifPill');
    if (!pill) return;
    pill.textContent = msg;
    pill.classList.add('show');
    setTimeout(() => pill.classList.remove('show'), duration);
}

/* ============================================================
   CONFETTI
============================================================ */
function fireConfetti() {
    if (typeof confetti === 'undefined') return;
    const end = Date.now() + 3500;
    const colors = ['#a855f7', '#3b82f6', '#06b6d4', '#ec4899', '#f59e0b'];
    (function frame() {
        confetti({ particleCount: 5, angle: 60,  spread: 55, origin: { x: 0 }, colors, scalar: 1.1 });
        confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors, scalar: 1.1 });
        if (Date.now() < end) requestAnimationFrame(frame);
    })();
}

/* ============================================================
   TIMER DISPLAY
============================================================ */
const updateTimerDisplay = () => {
    // IDs in HTML: blackTimer (top strip), whiteTimer (bottom strip)
    // When board is flipped (player=b), top shows White and bottom shows Black
    let whiteTimerEl, blackTimerEl;

    if (playerRole === 'b') {
        whiteTimerEl = document.getElementById("blackTimer");  // top strip shows white
        blackTimerEl = document.getElementById("whiteTimer");  // bottom strip shows black
    } else {
        whiteTimerEl = document.getElementById("whiteTimer");
        blackTimerEl = document.getElementById("blackTimer");
    }

    const currentTurn = chess.turn();

    const applyTimer = (el, time, isActive) => {
        if (!el) return;
        el.innerText = formatTime(time);
        // Remove all timer classes first
        el.classList.remove('timer-normal', 'timer-danger', 'timer-inactive');
        if (isActive) {
            el.classList.add(time <= 10 ? 'timer-danger' : 'timer-normal');
            el.style.opacity = '1';
        } else {
            el.classList.add('timer-inactive');
            el.style.opacity = '0.5';
        }
    };

    applyTimer(whiteTimerEl, whiteTime, currentTurn === 'w');
    applyTimer(blackTimerEl, blackTime, currentTurn === 'b');
};

const formatTime = (seconds) => {
    if (seconds >= 60) {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
    return seconds.toString();
};

/* ============================================================
   MOVE HISTORY
============================================================ */
const updateMoveHistoryDisplay = () => {
    const moveHistoryEl = document.getElementById("moveHistory");
    const moveBadge     = document.getElementById("moveCountBadge");
    console.log("updateMoveHistoryDisplay called", { moveHistory, moveHistoryEl });
    if (!moveHistoryEl) {
        console.error("moveHistory element not found!");
        return;
    }

    if (moveBadge) moveBadge.textContent = moveHistory.length;

    moveHistoryEl.innerHTML = "";

    if (moveHistory.length === 0) {
        moveHistoryEl.innerHTML = `<div class="no-moves-msg">▸ NO MOVES YET</div>`;
        return;
    }

    for (let i = 0; i < moveHistory.length; i += 2) {
        const moveNumber = Math.floor(i / 2) + 1;
        const whiteMove  = moveHistory[i];
        const blackMove  = moveHistory[i + 1] || "";

        const moveRow = document.createElement("div");
        moveRow.className = "move-row";
        moveRow.innerHTML = `
            <span class="move-number">${moveNumber}.</span>
            <span class="move-san">
                <span class="move-color-dot dot-white"></span>
                ${whiteMove}
            </span>
            <span class="move-san ${blackMove ? '' : 'empty'}">
                ${blackMove
                    ? `<span class="move-color-dot dot-black"></span>${blackMove}`
                    : '&nbsp;'}
            </span>
        `;
        moveHistoryEl.appendChild(moveRow);
    }

    moveHistoryEl.scrollTop = moveHistoryEl.scrollHeight;
};

/* ============================================================
   CAPTURED PIECES + PLAYER LABELS + INDICATORS
============================================================ */
const updateCapturedPieces = () => {
    const initialCounts = {
        w: { p: 8, r: 2, n: 2, b: 2, q: 1 },
        b: { p: 8, r: 2, n: 2, b: 2, q: 1 }
    };
    const currentCounts = {
        w: { p: 0, r: 0, n: 0, b: 0, q: 0 },
        b: { p: 0, r: 0, n: 0, b: 0, q: 0 }
    };
    const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9 };

    chess.board().forEach(row => {
        row.forEach(sq => {
            if (sq && sq.type !== 'k') currentCounts[sq.color][sq.type]++;
        });
    });

    const capturedByWhite = []; // black pieces taken by White
    const capturedByBlack = []; // white pieces taken by Black
    let whiteValueTaken = 0, blackValueTaken = 0;

    Object.keys(initialCounts.b).forEach(type => {
        const diff = initialCounts.b[type] - currentCounts.b[type];
        for (let i = 0; i < diff; i++) { capturedByWhite.push(type); whiteValueTaken += pieceValues[type]; }
    });
    Object.keys(initialCounts.w).forEach(type => {
        const diff = initialCounts.w[type] - currentCounts.w[type];
        for (let i = 0; i < diff; i++) { capturedByBlack.push(type.toUpperCase()); blackValueTaken += pieceValues[type]; }
    });

    const sortOrder = { q: 5, r: 4, b: 3, n: 2, p: 1 };
    const sortFn = (a, b) => sortOrder[b.toLowerCase()] - sortOrder[a.toLowerCase()];
    capturedByWhite.sort(sortFn);
    capturedByBlack.sort(sortFn);

    // Elements
    const topStripNameEl    = document.getElementById("topStripName");
    const bottomStripNameEl = document.getElementById("bottomStripName");
    const topAvatar         = document.getElementById("topStripAvatar");
    const bottomAvatar      = document.getElementById("bottomStripAvatar");
    const topCapturedEl     = document.getElementById("topCaptured");
    const bottomCapturedEl  = document.getElementById("bottomCaptured");
    const topIndicator      = document.getElementById("topPlayerIndicator");
    const bottomIndicator   = document.getElementById("bottomPlayerIndicator");

    if (topCapturedEl)    topCapturedEl.innerHTML    = "";
    if (bottomCapturedEl) bottomCapturedEl.innerHTML = "";

    const renderCaptures = (container, pieces, isWhitePiece) => {
        if (!container || pieces.length === 0) return;
        pieces.forEach(p => {
            const img = document.createElement("img");
            img.className = `captured-piece ${isWhitePiece ? 'white-piece' : 'black-piece'}`;
            img.src = getPieceSVGPath({ color: isWhitePiece ? 'w' : 'b', type: p.toLowerCase() });
            img.alt = `${isWhitePiece ? 'White' : 'Black'} ${p.toLowerCase()}`;
            container.appendChild(img);
        });
    };

    const currentTurn = chess.turn();
    let topColor, bottomColor;
    const names = window.playerNames || { white: 'White', black: 'Black' };

    if (playerRole === "b") {
        // Board is flipped: top = white, bottom = black
        topColor = "w"; bottomColor = "b";
        if (topStripNameEl)    topStripNameEl.innerText    = names.white;
        if (bottomStripNameEl) bottomStripNameEl.innerText = names.black + (playerRole === "b" ? " (You)" : "");
        if (topAvatar)    topAvatar.innerText    = "♔";
        if (bottomAvatar) bottomAvatar.innerText = "♚";
        if (bottomAvatar) bottomAvatar.style.background = "linear-gradient(135deg,var(--neon-purple),var(--neon-blue))";
        // White (top) captured black pieces; Black (bottom) captured white pieces
        renderCaptures(topCapturedEl,    capturedByWhite, false);
        renderCaptures(bottomCapturedEl, capturedByBlack, true);
    } else {
        // Normal: top = black, bottom = white
        topColor = "b"; bottomColor = "w";
        if (topStripNameEl)    topStripNameEl.innerText    = names.black;
        if (bottomStripNameEl) bottomStripNameEl.innerText = names.white + (playerRole === "w" ? " (You)" : "");
        if (topAvatar)    topAvatar.innerText    = "♚";
        if (bottomAvatar) bottomAvatar.innerText = "♔";
        if (bottomAvatar) bottomAvatar.style.background = "linear-gradient(135deg,#e8deff,#a78bfa)";
        // Black (top) captured white pieces; White (bottom) captured black pieces
        renderCaptures(topCapturedEl,    capturedByBlack, true);
        renderCaptures(bottomCapturedEl, capturedByWhite, false);
    }

    // Turn indicators
    if (topIndicator)    topIndicator.className    = currentTurn === topColor    ? "turn-dot-active" : "turn-dot-inactive";
    if (bottomIndicator) bottomIndicator.className = currentTurn === bottomColor ? "turn-dot-active" : "turn-dot-inactive";

    // Active strip highlight
    const topStrip    = document.getElementById("topStripPanel");
    const bottomStrip = document.getElementById("bottomStripPanel");
    if (topStrip)    topStrip.classList.toggle("active-strip",    currentTurn === topColor);
    if (bottomStrip) bottomStrip.classList.toggle("active-strip", currentTurn === bottomColor);

    // HUD status
    updateHUD();
};

function updateHUD() {
    const gameTurnStatus = document.getElementById("gameTurnStatus");
    const resignBtn      = document.getElementById("resignBtn");
    const offerDrawBtn   = document.getElementById("offerDrawBtn");
    const replayBtn      = document.getElementById("replayBtn");

    if (chess.game_over()) {
        if (gameTurnStatus) {
            gameTurnStatus.innerText = "GAME OVER";
            gameTurnStatus.style.cssText = "font-family:var(--font-hud);font-size:9px;letter-spacing:1.5px;padding:4px 10px;border-radius:6px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.35);color:var(--neon-red);flex:1;text-align:center;";
        }
        if (resignBtn)    resignBtn.classList.add("hidden");
        if (offerDrawBtn) offerDrawBtn.classList.add("hidden");
        if (replayBtn)    replayBtn.classList.remove("hidden");
    } else {
        const turn = chess.turn() === "w" ? "WHITE" : "BLACK";
        if (gameTurnStatus) {
            gameTurnStatus.innerText = `${turn}'S TURN`;
            gameTurnStatus.style.cssText = "font-family:var(--font-hud);font-size:9px;letter-spacing:1.5px;padding:4px 10px;border-radius:6px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);color:var(--neon-amber);flex:1;text-align:center;";
        }
        if (resignBtn)    resignBtn.classList.remove("hidden");
        if (offerDrawBtn) offerDrawBtn.classList.remove("hidden");
        if (replayBtn)    replayBtn.classList.add("hidden");
    }
}

/* ============================================================
   LEGAL MOVES HELPERS
============================================================ */
function getSquareNotation(row, col) {
    return `${String.fromCharCode(97 + col)}${8 - row}`;
}

function getRowColFromNotation(notation) {
    const col = notation.charCodeAt(0) - 97;
    const row = 8 - parseInt(notation[1]);
    return { row, col };
}

function showLegalMoves(row, col) {
    clearLegalMoves();
    const from  = getSquareNotation(row, col);
    const moves = chess.moves({ square: from, verbose: true });

    moves.forEach(move => {
        const { row: tr, col: tc } = getRowColFromNotation(move.to);
        const sq = boardElement.querySelector(`.square[data-row="${tr}"][data-col="${tc}"]`);
        if (!sq) return;

        const board = chess.board();
        if (board[tr][tc]) {
            const ring = document.createElement("div");
            ring.className = "capture-ring";
            sq.appendChild(ring);
        } else {
            const dot = document.createElement("div");
            dot.className = "move-dot";
            sq.appendChild(dot);
        }
    });

    const srcEl = boardElement.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
    if (srcEl) srcEl.classList.add("selected-square");
}

function clearLegalMoves() {
    document.querySelectorAll(".move-dot").forEach(el => el.remove());
    document.querySelectorAll(".capture-ring").forEach(el => el.remove());
    document.querySelectorAll(".selected-square").forEach(el => el.classList.remove("selected-square"));
}

/* ============================================================
   KING CHECK HIGHLIGHT
============================================================ */
function updateCheckHighlight() {
    document.querySelectorAll(".square.king-in-check").forEach(sq => sq.classList.remove("king-in-check"));

    if (chess.in_check()) {
        const turnColor = chess.turn();
        const board = chess.board();
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece && piece.type === 'k' && piece.color === turnColor) {
                    const el = boardElement.querySelector(`.square[data-row="${r}"][data-col="${c}"]`);
                    if (el) el.classList.add("king-in-check");
                    return;
                }
            }
        }
    }
}

/* ============================================================
   RENDER BOARD
============================================================ */
const renderBoard = () => {
    const board = chess.board();
    boardElement.innerHTML = "";

    board.forEach((row, rowindex) => {
        row.forEach((square, squareindex) => {
            const squareEl = document.createElement("div");
            squareEl.classList.add("square", (rowindex + squareindex) % 2 === 0 ? "light" : "dark");
            squareEl.dataset.row = rowindex;
            squareEl.dataset.col = squareindex;

            if (square) {
                const pieceEl = document.createElement("img");
                pieceEl.classList.add("piece", square.color === "w" ? "white" : "black");
                pieceEl.src = getPieceSVGPath(square);
                pieceEl.alt = `${square.color === "w" ? "White" : "Black"} ${square.type}`;
                pieceEl.draggable = playerRole === square.color;
                if (pieceEl.draggable) pieceEl.classList.add("draggable");

                pieceEl.addEventListener("dragstart", (e) => {
                    if (pieceEl.draggable) {
                        draggedPiece = pieceEl;
                        sourceSquare = { row: rowindex, col: squareindex };
                        e.dataTransfer.setData("text/plain", "");
                        setTimeout(() => pieceEl.classList.add("dragging"), 0);
                    }
                });

                pieceEl.addEventListener("dragend", () => {
                    pieceEl.classList.remove("dragging");
                    draggedPiece = null;
                    sourceSquare = null;
                });

                squareEl.appendChild(pieceEl);
            }

            // Click to move
            squareEl.addEventListener("click", function () {
                const cr = parseInt(squareEl.dataset.row);
                const cc = parseInt(squareEl.dataset.col);
                const cp = chess.board()[cr][cc];

                if (selectedSquare) {
                    if (selectedSquare.row === cr && selectedSquare.col === cc) {
                        selectedSquare = null;
                        clearLegalMoves();
                        return;
                    }
                    if (cp && cp.color === playerRole) {
                        selectedSquare = { row: cr, col: cc };
                        showLegalMoves(cr, cc);
                        return;
                    }
                    handleMove(selectedSquare, { row: cr, col: cc });
                    selectedSquare = null;
                    clearLegalMoves();
                    return;
                }

                if (cp && cp.color === playerRole) {
                    selectedSquare = { row: cr, col: cc };
                    showLegalMoves(cr, cc);
                }
            });

            squareEl.addEventListener("dragover", (e) => e.preventDefault());

            squareEl.addEventListener("drop", (e) => {
                e.preventDefault();
                if (draggedPiece) {
                    handleMove(sourceSquare, {
                        row: parseInt(squareEl.dataset.row),
                        col: parseInt(squareEl.dataset.col),
                    });
                }
            });

            // Coordinates
            const isFlipped = playerRole === "b";
            const isLight   = (rowindex + squareindex) % 2 === 0;

            if (squareindex === 0) {
                const lbl = document.createElement("span");
                lbl.classList.add("board-coordinate", "coord-tl", isLight ? "text-dark-square" : "text-light-square");
                lbl.innerText = isFlipped ? (rowindex + 1) : (8 - rowindex);
                squareEl.appendChild(lbl);
            }
            if (squareindex === 7) {
                const lbl = document.createElement("span");
                lbl.classList.add("board-coordinate", "coord-br", isLight ? "text-dark-square" : "text-light-square");
                lbl.innerText = isFlipped ? (rowindex + 1) : (8 - rowindex);
                squareEl.appendChild(lbl);
            }
            if (rowindex === 0) {
                const lbl = document.createElement("span");
                lbl.classList.add("board-coordinate", "coord-tr", isLight ? "text-dark-square" : "text-light-square");
                lbl.innerText = isFlipped ? String.fromCharCode(104 - squareindex) : String.fromCharCode(97 + squareindex);
                squareEl.appendChild(lbl);
            }
            if (rowindex === 7) {
                const lbl = document.createElement("span");
                lbl.classList.add("board-coordinate", "coord-bl", isLight ? "text-dark-square" : "text-light-square");
                lbl.innerText = isFlipped ? String.fromCharCode(104 - squareindex) : String.fromCharCode(97 + squareindex);
                squareEl.appendChild(lbl);
            }

            boardElement.appendChild(squareEl);
        });
    });

    if (playerRole === "b") {
        boardElement.classList.add("flipped");
    } else {
        boardElement.classList.remove("flipped");
    }

    updateCheckHighlight();
    updateCapturedPieces();
};

/* ============================================================
   PROMOTION DIALOG
============================================================ */
function showPromotionDialog(color, callback) {
    const dialog = document.getElementById('promotionDialog');
    if (!dialog) { callback('q'); return; }

    const promoQueen  = document.getElementById('promoQueen');
    const promoRook   = document.getElementById('promoRook');
    const promoBishop = document.getElementById('promoBishop');
    const promoKnight = document.getElementById('promoKnight');

    if (color === 'w') {
        if (promoQueen)  promoQueen.src = getPieceSVGPath({ color: 'w', type: 'q' });
        if (promoRook)   promoRook.src = getPieceSVGPath({ color: 'w', type: 'r' });
        if (promoBishop) promoBishop.src = getPieceSVGPath({ color: 'w', type: 'b' });
        if (promoKnight) promoKnight.src = getPieceSVGPath({ color: 'w', type: 'n' });
    } else {
        if (promoQueen)  promoQueen.src = getPieceSVGPath({ color: 'b', type: 'q' });
        if (promoRook)   promoRook.src = getPieceSVGPath({ color: 'b', type: 'r' });
        if (promoBishop) promoBishop.src = getPieceSVGPath({ color: 'b', type: 'b' });
        if (promoKnight) promoKnight.src = getPieceSVGPath({ color: 'b', type: 'n' });
    }

    dialog.classList.remove('hidden');
    const buttons = dialog.querySelectorAll('.promo-btn');

    function handler(e) {
        const choice = e.currentTarget.getAttribute('data-piece');
        dialog.classList.add('hidden');
        buttons.forEach(btn => btn.removeEventListener('click', handler));
        callback(choice);
    }
    buttons.forEach(btn => btn.addEventListener('click', handler));
}

/* ============================================================
   HANDLE MOVE
============================================================ */
const handleMove = (source, target) => {
    const from  = `${String.fromCharCode(97 + source.col)}${8 - source.row}`;
    const to    = `${String.fromCharCode(97 + target.col)}${8 - target.row}`;
    const piece = chess.get(from);
    const isPawn = piece && piece.type === 'p';
    const promoRank = piece && piece.color === 'w' ? 0 : 7;

    if (isPawn && target.row === promoRank) {
        showPromotionDialog(piece.color, (choice) => {
            socket.emit('move', { from, to, promotion: choice });
        });
    } else {
        socket.emit('move', { from, to });
    }
};

/* ============================================================
   GAME POPUP
============================================================ */
function showGamePopup(title, message, isCheckmate = false) {
    const trophy  = document.getElementById("popupTrophy");
    const popTitle = document.getElementById("popupTitle");
    const popMsg   = document.getElementById("popupMessage");

    if (popTitle) popTitle.innerText = title;
    if (popMsg)   popMsg.innerText   = message;

    if (isCheckmate) {
        if (trophy) trophy.innerText = "👑";
        fireConfetti();
    } else if (title.includes("DRAW") || title.includes("RESIGN")) {
        if (trophy) trophy.innerText = "🤝";
    } else if (title.includes("TIME")) {
        if (trophy) trophy.innerText = "⏱";
    } else {
        if (trophy) trophy.innerText = "🏆";
    }

    document.getElementById("gamePopup").classList.remove("hidden");
}

function closePopup() {
    document.getElementById("gamePopup").classList.add("hidden");
}

// Create a brand-new room and redirect both this player there.
// The current room is closed once a game ends, so a new room is required to play again.
async function createNewRoom() {
    try {
        const response = await fetch('/api/create-room');
        const data = await response.json();
        if (data.roomId) {
            window.location.href = `/room/${data.roomId}`;
        } else {
            showNotif('❌ Failed to create a new room');
        }
    } catch (err) {
        console.error('Error creating room:', err);
        showNotif('❌ Failed to create a new room');
    }
}

function goHome() {
    window.location.href = '/';
}

/* ============================================================
   PIECE SVG PATH
============================================================ */
const getPieceSVGPath = (piece) => {
    const colorPrefix = piece.color === "w" ? "w" : "b";
    const type = piece.type;
    return `/pieces/neo/${colorPrefix}${type.toUpperCase()}.svg`;
};

/* ============================================================
   SOCKET EVENTS
============================================================ */
socket.on("playerRole", function (role) {
    playerRole = role;
    renderBoard();
    updateTimerDisplay();
});

socket.on("spectatorRole", function () {
    playerRole = null;
    renderBoard();
    updateTimerDisplay();
});

socket.on("playerNames", function (names) {
    // Store names locally for display
    window.playerNames = names;
    updateCapturedPieces(); // This will update the player name display
});

socket.on("boardState", function (fen) {
    chess.load(fen);
    selectedSquare = null;
    clearLegalMoves();
    renderBoard();
    updateMoveHistoryDisplay();
    closePopup(false);
    // Restore button states
    const resignBtn    = document.getElementById("resignBtn");
    const offerDrawBtn = document.getElementById("offerDrawBtn");
    const replayBtn    = document.getElementById("replayBtn");
    if (resignBtn)    resignBtn.classList.remove("hidden");
    if (offerDrawBtn) offerDrawBtn.classList.remove("hidden");
    if (replayBtn)    replayBtn.classList.add("hidden");
    updateHUD();
    // Reset local timers when receiving new board state
    // This ensures synchronization with server
    whiteTime = 30;
    blackTime = 30;
    updateTimerDisplay();
});

socket.on("move", function (move) {
    console.log("Received move from server:", move);
    chess.move(move);
    selectedSquare = null;
    clearLegalMoves();
    renderBoard();
    updateMoveHistoryDisplay();
});

socket.on("timerUpdate", function (data) {
    whiteTime = data.whiteTime;
    blackTime = data.blackTime;
    updateTimerDisplay();
});

socket.on("moveHistory", function (history) {
    console.log("Received moveHistory from server:", history);
    moveHistory = history;
    updateMoveHistoryDisplay();
});

socket.on("gameOver", function (data) {
    let title, message, isCheckmate = false;

    const youText = (winner) => {
        if (!playerRole) return null;
        return winner === playerRole ? 'You win! 🎉' : 'You lost! 😢';
    };

    if (data.reason === 'timeout') {
        const w = data.winner === 'w' ? 'White' : 'Black';
        const loser = data.winner === 'w' ? 'Black' : 'White';
        title = "TIME'S UP!";
        message = youText(data.winner) || `${loser} ran out of time. ${w} wins!`;
    } else if (data.reason === 'checkmate') {
        const w = data.winner === 'w' ? 'White' : 'Black';
        title = "CHECKMATE!"; isCheckmate = true;
        message = youText(data.winner) || `${w} wins the game!`;
    } else {
        const r = data.reason ? data.reason.toUpperCase() : "DRAW";
        title = "DRAW!"; message = `Game ended in a draw (${r})!`;
    }

    showGamePopup(title, message, isCheckmate);

    const rBtn = document.getElementById("resignBtn");
    const oBtn = document.getElementById("offerDrawBtn");
    const rpBtn = document.getElementById("replayBtn");
    if (rBtn)  rBtn.classList.add("hidden");
    if (oBtn)  oBtn.classList.add("hidden");
    if (rpBtn) rpBtn.classList.remove("hidden");
    
    // Game over: this room is now closed. Players must create a new room to play again.
});

socket.on("resigned", function (data) {
    const resignerText = data.resigner === 'w' ? 'White' : 'Black';
    const winner       = data.resigner === 'w' ? 'b' : 'w';
    const winnerText   = winner === 'w' ? 'White' : 'Black';
    let msg = `${resignerText} resigned. ${winnerText} wins!`;
    if (playerRole) msg = (data.resigner === playerRole) ? 'You resigned. You lost! 😢' : `Opponent resigned. You win! 🎉`;
    showGamePopup("RESIGNATION", msg);
    const rBtn = document.getElementById("resignBtn");
    const oBtn = document.getElementById("offerDrawBtn");
    const rpBtn = document.getElementById("replayBtn");
    if (rBtn)  rBtn.classList.add("hidden");
    if (oBtn)  oBtn.classList.add("hidden");
    if (rpBtn) rpBtn.classList.remove("hidden");
    
    // Resignation ends the game: this room is now closed. Create a new room to play again.
});

socket.on("drawOffered", function () {
    if (confirm("⚡ DRAW OFFER — Your opponent proposes a draw. Accept?")) {
        socket.emit("drawResponse", { accepted: true });
    } else {
        socket.emit("drawResponse", { accepted: false });
    }
});

socket.on("drawDeclined", function () {
    showNotif("⚡ Opponent declined the draw offer");
});

socket.on("drawDeclared", function () {
    showGamePopup("DRAW AGREED", "Game ended in a draw by mutual agreement.");
    const rBtn = document.getElementById("resignBtn");
    const oBtn = document.getElementById("offerDrawBtn");
    const rpBtn = document.getElementById("replayBtn");
    if (rBtn)  rBtn.classList.add("hidden");
    if (oBtn)  oBtn.classList.add("hidden");
    if (rpBtn) rpBtn.classList.remove("hidden");
    
    // Draw ends the game: this room is now closed. Create a new room to play again.
});

/* ============================================================
   ACTION BUTTONS
============================================================ */
const resignBtn    = document.getElementById("resignBtn");
const offerDrawBtn = document.getElementById("offerDrawBtn");
const replayBtn    = document.getElementById("replayBtn");

if (replayBtn) {
    replayBtn.addEventListener("click", () => createNewRoom());
}

if (resignBtn) {
    resignBtn.addEventListener("click", () => {
        if (!playerRole) { showNotif("⚡ Spectators cannot resign!"); return; }
        if (confirm("🏳 Are you sure you want to resign?")) socket.emit("resign");
    });
}

if (offerDrawBtn) {
    offerDrawBtn.addEventListener("click", () => {
        if (!playerRole) { showNotif("⚡ Spectators cannot offer a draw!"); return; }
        socket.emit("offerDraw");
        showNotif("🤝 Draw offer sent to opponent...");
    });
}

/* ============================================================
   CHAT
============================================================ */
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const chatMessagesContainer = document.getElementById("chatMessages");

function addChatMessage(sender, message) {
    // Remove "no messages" placeholder if it exists
    const noChatMsg = chatMessagesContainer.querySelector(".no-chat-msg");
    if (noChatMsg) noChatMsg.remove();

    const msgEl = document.createElement("div");
    msgEl.className = "chat-message";
    msgEl.innerHTML = `
        <div class="sender">${sender}</div>
        <div class="content">${message}</div>
    `;
    chatMessagesContainer.appendChild(msgEl);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

function sendChatMessage() {
    const message = chatInput.value.trim();
    if (!message) return;

    // For spectators, include the name with the message
    const data = playerRole ? { message } : { message, name: playerName };
    socket.emit("chatMessage", data);
    chatInput.value = "";
}

if (sendChatBtn) {
    sendChatBtn.addEventListener("click", sendChatMessage);
}

if (chatInput) {
    chatInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            sendChatMessage();
        }
    });
}

socket.on("chatMessage", function (data) {
    addChatMessage(data.sender, data.message);
});

/* ============================================================
   INIT
============================================================ */
console.log("Chess game initializing...");
console.log("Move history element:", document.getElementById("moveHistory"));
console.log("Move count badge element:", document.getElementById("moveCountBadge"));

renderBoard();