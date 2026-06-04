const socket = io(window.location.origin);
const chess = new Chess();
const boardElement = document.querySelector(".chessboard");

let draggedPiece = null;
let sourceSquare = null;
let playerRole = null;
let selectedSquare = null; // For click-to-move

// Timer variables
let whiteTime = 30;
let blackTime = 30;

// Move history
let moveHistory = [];

// Timer display update
const updateTimerDisplay = () => {
    const whiteTimerEl = document.getElementById("whiteTimer");
    const blackTimerEl = document.getElementById("blackTimer");
    const currentTurn = chess.turn(); // 'w' or 'b'
    
    if (whiteTimerEl) {
        whiteTimerEl.innerText = formatTime(whiteTime);
        if (currentTurn === 'w') {
            whiteTimerEl.className = whiteTime <= 10 ? "timer-danger" : "timer-normal";
            whiteTimerEl.style.opacity = "1";
        } else {
            whiteTimerEl.className = "timer-inactive";
            whiteTimerEl.style.opacity = "0.4";
        }
    }
    
    if (blackTimerEl) {
        blackTimerEl.innerText = formatTime(blackTime);
        if (currentTurn === 'b') {
            blackTimerEl.className = blackTime <= 10 ? "timer-danger" : "timer-normal";
            blackTimerEl.style.opacity = "1";
        } else {
            blackTimerEl.className = "timer-inactive";
            blackTimerEl.style.opacity = "0.4";
        }
    }
};

const formatTime = (seconds) => {
    return seconds.toString();
};

// Move history display update
const updateMoveHistoryDisplay = () => {
    const moveHistoryEl = document.getElementById("moveHistory");
    if (!moveHistoryEl) return;
    
    moveHistoryEl.innerHTML = "";
    
    if (moveHistory.length === 0) {
        moveHistoryEl.innerHTML = `<span class="text-xs text-zinc-500 italic">No moves yet</span>`;
        return;
    }
    
    // Group moves in pairs (white and black)
    for (let i = 0; i < moveHistory.length; i += 2) {
        const moveNumber = Math.floor(i / 2) + 1;
        const whiteMove = moveHistory[i];
        const blackMove = moveHistory[i + 1] || "";
        
        const moveRow = document.createElement("div");
        moveRow.className = "flex gap-2 text-sm py-1 border-b border-zinc-800/50";
        moveRow.innerHTML = `
            <span class="w-8 text-zinc-500">${moveNumber}.</span>
            <span class="flex-1 text-zinc-200">${whiteMove}</span>
            <span class="flex-1 text-zinc-200">${blackMove}</span>
        `;
        moveHistoryEl.appendChild(moveRow);
    }
    
    // Scroll to bottom
    moveHistoryEl.scrollTop = moveHistoryEl.scrollHeight;
};

const updateCapturedPieces = () => {
    // Initial starting counts (excluding Kings)
    const initialCounts = {
        w: { p: 8, r: 2, n: 2, b: 2, q: 1 },
        b: { p: 8, r: 2, n: 2, b: 2, q: 1 }
    };

    // Current counts on board
    const currentCounts = {
        w: { p: 0, r: 0, n: 0, b: 0, q: 0 },
        b: { p: 0, r: 0, n: 0, b: 0, q: 0 }
    };

    // Piece material values
    const pieceValues = {
        p: 1,
        n: 3,
        b: 3,
        r: 5,
        q: 9
    };

    // Scan the board
    chess.board().forEach(row => {
        row.forEach(square => {
            if (square && square.type !== 'k') {
                currentCounts[square.color][square.type]++;
            }
        });
    });

    // Captured pieces lists
    const capturedByWhite = []; // Black pieces taken by White
    const capturedByBlack = []; // White pieces taken by Black

    let whiteValueTaken = 0;
    let blackValueTaken = 0;

    // Calculate captured black pieces (taken by White)
    Object.keys(initialCounts.b).forEach(type => {
        const diff = initialCounts.b[type] - currentCounts.b[type];
        if (diff > 0) {
            for (let i = 0; i < diff; i++) {
                capturedByWhite.push(type);
                whiteValueTaken += pieceValues[type];
            }
        }
    });

    // Calculate captured white pieces (taken by Black)
    Object.keys(initialCounts.w).forEach(type => {
        const diff = initialCounts.w[type] - currentCounts.w[type];
        if (diff > 0) {
            for (let i = 0; i < diff; i++) {
                capturedByBlack.push(type.toUpperCase());
                blackValueTaken += pieceValues[type];
            }
        }
    });

    // Sort pieces by standard value descending (Queen, Rook, Bishop, Knight, Pawn)
    const sortOrder = { q: 5, r: 4, b: 3, n: 2, p: 1 };
    const sortFn = (a, b) => sortOrder[b.toLowerCase()] - sortOrder[a.toLowerCase()];
    capturedByWhite.sort(sortFn);
    capturedByBlack.sort(sortFn);

    // Update Player Names & Panels according to role and flip state
    const topPlayerNameEl = document.getElementById("topPlayerName");
    const bottomPlayerNameEl = document.getElementById("bottomPlayerName");
    const topPlayerIndicator = document.getElementById("topPlayerIndicator");
    const bottomPlayerIndicator = document.getElementById("bottomPlayerIndicator");

    const topCapturedEl = document.getElementById("topCaptured");
    const bottomCapturedEl = document.getElementById("bottomCaptured");

    // Clear inline captured elements
    if (topCapturedEl) topCapturedEl.innerHTML = "";
    if (bottomCapturedEl) bottomCapturedEl.innerHTML = "";

    // Helper to render inline captures
    const renderInlineCaptures = (container, pieces, isWhitePiece) => {
        if (!container) return;
        pieces.forEach(p => {
            const span = document.createElement("span");
            span.className = `captured-piece ${isWhitePiece ? 'white-piece' : 'black-piece'}`;
            span.innerText = getPieceUnicode({ color: isWhitePiece ? 'w' : 'b', type: p.toLowerCase() });
            container.appendChild(span);
        });
    };

    // Determine which color is on top/bottom based on player role
    const currentTurn = chess.turn(); // 'w' or 'b'
    let topColor, bottomColor;

    if (playerRole === "b") {
        topColor = "w";
        bottomColor = "b";
        if (topPlayerNameEl) topPlayerNameEl.innerText = "White";
        if (bottomPlayerNameEl) bottomPlayerNameEl.innerText = "Black (You)";

        // White (top) has captured black pieces. Black (bottom) has captured white pieces.
        renderInlineCaptures(topCapturedEl, capturedByWhite, false);
        renderInlineCaptures(bottomCapturedEl, capturedByBlack, true);
    } else {
        topColor = "b";
        bottomColor = "w";
        if (topPlayerNameEl) topPlayerNameEl.innerText = "Black";
        if (bottomPlayerNameEl) bottomPlayerNameEl.innerText = playerRole === "w" ? "White (You)" : "White";

        // Black (top) has captured white pieces. White (bottom) has captured black pieces.
        renderInlineCaptures(topCapturedEl, capturedByBlack, true);
        renderInlineCaptures(bottomCapturedEl, capturedByWhite, false);
    }

    // Update Turn Indicator Green Dot
    if (topPlayerIndicator) {
        topPlayerIndicator.className = currentTurn === topColor ? "turn-dot-active" : "turn-dot-inactive";
    }
    if (bottomPlayerIndicator) {
        bottomPlayerIndicator.className = currentTurn === bottomColor ? "turn-dot-active" : "turn-dot-inactive";
    }

    // Render Sidebar Captured Trophies
    const sidebarWhiteCaptured = document.getElementById("sidebarWhiteCaptured");
    const sidebarBlackCaptured = document.getElementById("sidebarBlackCaptured");

    if (sidebarWhiteCaptured) {
        sidebarWhiteCaptured.innerHTML = "";
        if (capturedByWhite.length === 0) {
            sidebarWhiteCaptured.innerHTML = `<span class="text-xs text-zinc-500 italic">No captures yet</span>`;
        } else {
            capturedByWhite.forEach(p => {
                const span = document.createElement("span");
                span.className = "captured-piece black-piece";
                span.innerText = getPieceUnicode({ color: 'b', type: p.toLowerCase() });
                sidebarWhiteCaptured.appendChild(span);
            });
        }
    }

    if (sidebarBlackCaptured) {
        sidebarBlackCaptured.innerHTML = "";
        if (capturedByBlack.length === 0) {
            sidebarBlackCaptured.innerHTML = `<span class="text-xs text-zinc-500 italic">No captures yet</span>`;
        } else {
            capturedByBlack.forEach(p => {
                const span = document.createElement("span");
                span.className = "captured-piece white-piece";
                span.innerText = getPieceUnicode({ color: 'w', type: p.toLowerCase() });
                sidebarBlackCaptured.appendChild(span);
            });
        }
    }

    // Calculate score differentials (advantage)
    const whiteLeadScore = document.getElementById("whiteLeadScore");
    const blackLeadScore = document.getElementById("blackLeadScore");

    const whiteNet = whiteValueTaken - blackValueTaken; // positive means White is winning

    if (whiteLeadScore && blackLeadScore) {
        if (whiteNet > 0) {
            whiteLeadScore.innerText = `+${whiteNet}`;
            whiteLeadScore.classList.remove("hidden");
            blackLeadScore.classList.add("hidden");
        } else if (whiteNet < 0) {
            blackLeadScore.innerText = `+${Math.abs(whiteNet)}`;
            blackLeadScore.classList.remove("hidden");
            whiteLeadScore.classList.add("hidden");
        } else {
            whiteLeadScore.classList.add("hidden");
            blackLeadScore.classList.add("hidden");
        }
    }

    // Update Turn Indicator
    const gameTurnStatus = document.getElementById("gameTurnStatus");
    if (gameTurnStatus) {
        if (chess.isGameOver()) {
            gameTurnStatus.innerText = "Game Over";
            gameTurnStatus.className = "font-semibold text-red-400 bg-red-950/30 px-2.5 py-0.5 rounded border border-red-900/30 text-xs";

            const matchStatusLabel = document.getElementById("matchStatusLabel");
            if (matchStatusLabel) {
                matchStatusLabel.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500"></span> Finished`;
                matchStatusLabel.className = "font-semibold text-red-400 text-xs flex items-center gap-1.5";
            }
        } else {
            const turn = chess.turn() === "w" ? "White" : "Black";
            gameTurnStatus.innerText = `${turn}'s Turn`;
            gameTurnStatus.className = "font-semibold text-amber-400 bg-amber-950/30 px-2.5 py-0.5 rounded border border-amber-900/30 text-xs";

            const matchStatusLabel = document.getElementById("matchStatusLabel");
            if (matchStatusLabel) {
                matchStatusLabel.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Active`;
                matchStatusLabel.className = "font-semibold text-emerald-400 text-xs flex items-center gap-1.5";
            }
        }
    }
};

/* =========================
   LEGAL MOVE HELPERS
========================= */

function getSquareNotation(row, col) {
    return `${String.fromCharCode(97 + col)}${8 - row}`;
}

function getRowColFromNotation(notation) {
    const col = notation.charCodeAt(0) - 97;
    const row = 8 - parseInt(notation[1]);
    return { row, col };
}

function getLegalMovesForSquare(row, col) {
    const from = getSquareNotation(row, col);
    const moves = chess.moves({ square: from, verbose: true });
    return moves;
}

/* =========================
   RENDER LEGAL MOVE DOTS
========================= */

function showLegalMoves(row, col) {
    clearLegalMoves();

    const moves = getLegalMovesForSquare(row, col);

    moves.forEach(move => {
        const { row: targetRow, col: targetCol } = getRowColFromNotation(move.to);
        const squareEl = boardElement.querySelector(
            `.square[data-row="${targetRow}"][data-col="${targetCol}"]`
        );
        if (!squareEl) return;

        const board = chess.board();
        const targetPiece = board[targetRow][targetCol];

        if (targetPiece) {
            // Capture: show ring
            const ring = document.createElement("div");
            ring.className = "capture-ring";
            squareEl.appendChild(ring);
        } else {
            // Empty square: show dot
            const dot = document.createElement("div");
            dot.className = "move-dot";
            squareEl.appendChild(dot);
        }
    });

    // Highlight source square
    const sourceEl = boardElement.querySelector(
        `.square[data-row="${row}"][data-col="${col}"]`
    );
    if (sourceEl) {
        sourceEl.classList.add("selected-square");
    }
}

function clearLegalMoves() {
    document.querySelectorAll(".move-dot").forEach(el => el.remove());
    document.querySelectorAll(".capture-ring").forEach(el => el.remove());
    document.querySelectorAll(".selected-square").forEach(el => el.classList.remove("selected-square"));
}

/* =========================
   KING CHECK HIGHLIGHT
========================= */

function updateCheckHighlight() {
    // Remove all previous check highlights
    document.querySelectorAll(".square.king-in-check").forEach(sq => {
        sq.classList.remove("king-in-check");
    });

    if (chess.in_check()) {
        // Find the king of the current turn's color
        const turnColor = chess.turn();
        const board = chess.board();
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece && piece.type === 'k' && piece.color === turnColor) {
                    const kingSquareEl = boardElement.querySelector(
                        `.square[data-row="${r}"][data-col="${c}"]`
                    );
                    if (kingSquareEl) {
                        kingSquareEl.classList.add("king-in-check");
                    }
                    return;
                }
            }
        }
    }
}

const renderBoard = () => {
    const board = chess.board();
    boardElement.innerHTML = "";
    board.forEach((row, rowindex) => {
        row.forEach((square, squareindex) => {
            const squareElement = document.createElement("div");
            squareElement.classList.add(
                "square",
                (rowindex + squareindex) % 2 === 0 ? "light" : "dark"
            );

            squareElement.dataset.row = rowindex;
            squareElement.dataset.col = squareindex;

            if (square) {
                const pieceElement = document.createElement("div");
                pieceElement.classList.add(
                    "piece",
                    square.color === "w" ? "white" : "black"
                );
                pieceElement.innerText = getPieceUnicode(square);
                pieceElement.draggable = playerRole === square.color;

                pieceElement.addEventListener("dragstart", (e) => {
                    if (pieceElement.draggable) {
                        draggedPiece = pieceElement;
                        sourceSquare = { row: rowindex, col: squareindex };
                        e.dataTransfer.setData("text/plain", "");
                    }
                });

                pieceElement.addEventListener("dragend", () => {
                    draggedPiece = null;
                    sourceSquare = null;
                });

                squareElement.appendChild(pieceElement);
            }

            // Click to select / move
            squareElement.addEventListener("click", function () {
                const clickedRow = parseInt(squareElement.dataset.row);
                const clickedCol = parseInt(squareElement.dataset.col);
                const clickedPiece = chess.board()[clickedRow][clickedCol];

                if (selectedSquare) {
                    // If clicking same square, deselect
                    if (selectedSquare.row === clickedRow && selectedSquare.col === clickedCol) {
                        selectedSquare = null;
                        clearLegalMoves();
                        return;
                    }

                    // If clicking own piece, re-select that piece instead
                    if (clickedPiece && clickedPiece.color === playerRole) {
                        selectedSquare = { row: clickedRow, col: clickedCol };
                        showLegalMoves(clickedRow, clickedCol);
                        return;
                    }

                    // Try to move
                    handleMove(selectedSquare, { row: clickedRow, col: clickedCol });
                    selectedSquare = null;
                    clearLegalMoves();
                    return;
                }

                // No piece selected yet: select if it's our piece
                if (clickedPiece && clickedPiece.color === playerRole) {
                    selectedSquare = { row: clickedRow, col: clickedCol };
                    showLegalMoves(clickedRow, clickedCol);
                }
            });

            squareElement.addEventListener("dragover", function (e) {
                e.preventDefault();
            });

            squareElement.addEventListener("drop", function (e) {
                e.preventDefault();
                if (draggedPiece) {
                    const targetSorce = {
                        row: parseInt(squareElement.dataset.row),
                        col: parseInt(squareElement.dataset.col),
                    };
                    handleMove(sourceSquare, targetSorce);
                }
            });
            boardElement.appendChild(squareElement);
        });
    });

    if (playerRole === "b") {
        boardElement.classList.add("flipped");
    }
    else {
        boardElement.classList.remove("flipped");
    }

    // Highlight king in check
    updateCheckHighlight();

    updateCapturedPieces();
};

/* =========================
   PROMOTION DIALOG
========================= */

function showPromotionDialog(color, callback) {
    const dialog = document.getElementById('promotionDialog');
    if (!dialog) { callback('q'); return; }

    // Update promotion piece icons to match the promoting player's color
    const promoQueen = document.getElementById('promoQueen');
    const promoRook = document.getElementById('promoRook');
    const promoBishop = document.getElementById('promoBishop');
    const promoKnight = document.getElementById('promoKnight');

    if (color === 'w') {
        if (promoQueen) promoQueen.childNodes[0].textContent = '♕';
        if (promoRook) promoRook.childNodes[0].textContent = '♖';
        if (promoBishop) promoBishop.childNodes[0].textContent = '♗';
        if (promoKnight) promoKnight.childNodes[0].textContent = '♘';
    } else {
        if (promoQueen) promoQueen.childNodes[0].textContent = '♛';
        if (promoRook) promoRook.childNodes[0].textContent = '♜';
        if (promoBishop) promoBishop.childNodes[0].textContent = '♝';
        if (promoKnight) promoKnight.childNodes[0].textContent = '♞';
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

const handleMove = (source, target) => {
    const from = `${String.fromCharCode(97 + source.col)}${8 - source.row}`;
    const to = `${String.fromCharCode(97 + target.col)}${8 - target.row}`;
    const piece = chess.get(from);
    const isPawn = piece && piece.type === 'p';
    const promoRank = (piece && piece.color === 'w') ? 0 : 7;

    if (isPawn && target.row === promoRank) {
        showPromotionDialog(piece.color, (choice) => {
            socket.emit('move', { from, to, promotion: choice });
        });
    } else {
        socket.emit('move', { from, to });
    }
};

/* =========================
   GAME END POPUP FUNCTIONS
========================= */

function showGamePopup(title, message) {
    document.getElementById("popupTitle").innerText = title;
    document.getElementById("popupMessage").innerText = message;

    document.getElementById("gamePopup").classList.remove("hidden");
}

function closePopup() {
    document.getElementById("gamePopup").classList.add("hidden");
}

/* =========================
   CHECKMATE FUNCTION
========================= */

function handleCheckmate(winnerColor) {

    // Show popup
    showGamePopup(
        "CHECKMATE!",
        `${winnerColor.toUpperCase()} Wins the Game`
    );
}

/* =========================
   DRAW FUNCTION
========================= */

function handleDraw(reason = "Stalemate") {

    showGamePopup(
        "DRAW!",
        `Game ended in a draw (${reason})`
    );
}

/* =========================
   KING CHECK RED EFFECT (legacy helpers)
========================= */

function highlightCheckedKing(kingSquare) {

    // Remove old red effect
    document.querySelectorAll(".square").forEach(square => {
        square.classList.remove("king-in-check");
    });

    // Add red effect
    kingSquare.classList.add("king-in-check");
}

function removeCheckHighlight() {

    document.querySelectorAll(".square").forEach(square => {
        square.classList.remove("king-in-check");
    });
}

const getPieceUnicode = (piece) => {
    const unicodePieces = {
        p: "♟", // black pawn
        r: "♜",
        n: "♞",
        b: "♝",
        q: "♛",
        k: "♚",
        P: "♙", // white pawn
        R: "♖",
        N: "♘",
        B: "♗",
        Q: "♕",
        K: "♔",
    };

    const key =
        piece.color === "w"
            ? piece.type.toUpperCase()
            : piece.type;

    return unicodePieces[key];
};

socket.on("playerRole", function (role) {
    playerRole = role;
    renderBoard();
});

socket.on("spectatorRole", function () {
    playerRole = null;
    renderBoard();
});

socket.on("boardState", function (fen) {
    chess.load(fen);
    selectedSquare = null;
    clearLegalMoves();
    renderBoard();
    updateMoveHistoryDisplay();
});

socket.on("move", function (move) {
    chess.move(move);
    selectedSquare = null;
    clearLegalMoves();
    renderBoard();
    updateMoveHistoryDisplay();
});

// Action Buttons click handlers
const resignBtn = document.getElementById("resignBtn");
const offerDrawBtn = document.getElementById("offerDrawBtn");

if (resignBtn) {
    resignBtn.addEventListener("click", () => {
        if (!playerRole) {
            alert("Spectators cannot resign!");
            return;
        }
        if (confirm("Are you sure you want to resign the game?")) {
            socket.emit("resign");
        }
    });
}

if (offerDrawBtn) {
    offerDrawBtn.addEventListener("click", () => {
        if (!playerRole) {
            alert("Spectators cannot offer a draw!");
            return;
        }
        socket.emit("offerDraw");
        alert("Draw offer sent to opponent.");
    });
}

// Resign and Draw Socket Listeners
socket.on("resigned", function (data) {
    const resignerText = data.resigner === 'w' ? 'White' : 'Black';
    const winnerText = data.resigner === 'w' ? 'Black' : 'White';
    showGamePopup("RESIGNATION", `${resignerText} resigned. ${winnerText} wins!`);
});

socket.on("drawOffered", function () {
    if (confirm("Your opponent has offered a draw. Do you accept?")) {
        socket.emit("drawResponse", { accepted: true });
    } else {
        socket.emit("drawResponse", { accepted: false });
    }
});

socket.on("drawDeclined", function () {
    alert("Opponent declined the draw offer.");
});

socket.on("drawDeclared", function (data) {
    showGamePopup("DRAW AGREED", "Game ended in a draw by mutual agreement.");
});

// Timer update listener
socket.on("timerUpdate", function (data) {
    whiteTime = data.whiteTime;
    blackTime = data.blackTime;
    updateTimerDisplay();
});

// Move history listener
socket.on("moveHistory", function (history) {
    moveHistory = history;
    updateMoveHistoryDisplay();
});

// Game over listener (timeout)
socket.on("gameOver", function (data) {
    if (data.reason === 'timeout') {
        const winnerText = data.winner === 'w' ? 'White' : 'Black';
        showGamePopup("TIME'S UP!", `${winnerText} wins on time!`);
    }
});

renderBoard();