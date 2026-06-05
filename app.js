 const express = require("express");
 const socket= require("socket.io");
 const http = require("http");
 const { Chess } = require("chess.js");
 const path = require("path");

 const app = express();

 const server = http.createServer(app);
 const io = socket(server);

 const chess = new Chess();
 let players = {};
 let currentPlayer = "W";

 // Timer settings
 const INITIAL_TIME = 30; // 30 seconds per player
 let whiteTime = INITIAL_TIME;
 let blackTime = INITIAL_TIME;
 let timerInterval = null;
 let gameActive = true;

 // Move history
 let moveHistory = [];

  // Timer functions
  function startTimer() {
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(() => {
          if (!gameActive) {
              clearInterval(timerInterval);
              return;
          }

          const currentTurn = chess.turn();

          if (currentTurn === 'w') {
              whiteTime--;
              if (whiteTime <= 0) {
                  whiteTime = 0;
                  gameActive = false;
                  clearInterval(timerInterval);
                  timerInterval = null;
                  io.emit("gameOver", { winner: 'b', reason: 'timeout' });
                  
                  setTimeout(() => {
                      chess.reset();
                      resetGame();
                      io.emit("boardState", chess.fen());
                      io.emit("timerUpdate", { whiteTime, blackTime });
                      io.emit("moveHistory", moveHistory);
                  }, 5000);
                  return;
              }
          } else {
              blackTime--;
              if (blackTime <= 0) {
                  blackTime = 0;
                  gameActive = false;
                  clearInterval(timerInterval);
                  timerInterval = null;
                  io.emit("gameOver", { winner: 'w', reason: 'timeout' });
                  
                  setTimeout(() => {
                      chess.reset();
                      resetGame();
                      io.emit("boardState", chess.fen());
                      io.emit("timerUpdate", { whiteTime, blackTime });
                      io.emit("moveHistory", moveHistory);
                  }, 5000);
                  return;
              }
          }

          io.emit("timerUpdate", { whiteTime, blackTime });
      }, 1000);
  }

  function resetGame() {
      whiteTime = INITIAL_TIME;
      blackTime = INITIAL_TIME;
      moveHistory = [];
      gameActive = true;
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = null;
      if (players.white && players.black) {
          startTimer();
      }
  }

 function formatMove(move, piece) {
     const pieceSymbols = {
         'p': '', 'n': 'N', 'b': 'B', 'r': 'R', 'q': 'Q', 'k': 'K'
     };
     let notation = '';
     
     if (piece && piece.type !== 'p') {
         notation += pieceSymbols[piece.type];
     }
     
     notation += move.to;
     
     if (move.promotion) {
         notation += '=' + move.promotion.toUpperCase();
     }
     
     if (move.captured) {
         if (piece && piece.type === 'p') {
             notation = move.from[0] + 'x' + move.to;
         } else {
             notation = notation.replace(move.to, 'x' + move.to);
         }
     }
     
     return notation;
 }

 app.set("view engine", "ejs");
 app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req,res) => {
    res.render("index", {title: "Chess Game"});
});

io.on("connection", function(uniquesocket){
    console.log("connected");

    if(!players.white){
        players.white = uniquesocket.id;
        uniquesocket.emit("playerRole", "w");
        console.log("White player joined:", uniquesocket.id);
    } else if (!players.black)  {
        players.black = uniquesocket.id;
        uniquesocket.emit("playerRole", "b");
        console.log("Black player joined:", uniquesocket.id);
        // Start timer when both players have joined
        if (!timerInterval && gameActive) {
            console.log("Both players joined, starting timer");
            startTimer();
        }
    } else {
        uniquesocket.emit("spectatorRole");
        console.log("Spectator joined:", uniquesocket.id);
    } 
    
    // Send the current game board state to the connecting socket
    uniquesocket.emit("boardState", chess.fen());
    uniquesocket.emit("timerUpdate", { whiteTime, blackTime });
    uniquesocket.emit("moveHistory", moveHistory);
    uniquesocket.on("disconnect", function(){
        if(uniquesocket.id === players.white){
            delete players.white;
        } else if(uniquesocket.id === players.black){
            delete players.black;
        }
        if (!players.white || !players.black) {
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
        }
    });
    uniquesocket.on("move", (move)=>{
        try{
            if (!gameActive) return;
            if (chess.turn() === "w" &&  uniquesocket.id !== players.white) return;
            if (chess.turn() === "b" &&  uniquesocket.id !== players.black) return;

            // Get piece before move for notation
            const piece = chess.get(move.from);
            
            const result = chess.move(move);
            if(result){
                // Track move history
                const moveNotation = formatMove(move, piece);
                moveHistory.push(moveNotation);
                
                currentPlayer = chess.turn();
                io.emit("move", move);
                io.emit("boardState", chess.fen());
                io.emit("moveHistory", moveHistory);
                
                if (chess.isGameOver()) {
                    let reason = "draw";
                    let winner = null;
                    if (chess.in_checkmate()) {
                        reason = "checkmate";
                        winner = chess.turn() === "w" ? "b" : "w";
                    } else if (chess.in_stalemate()) {
                        reason = "stalemate";
                    } else if (chess.in_threefold_repetition()) {
                        reason = "threefold repetition";
                    } else if (chess.insufficient_material()) {
                        reason = "insufficient material";
                    }
                    
                    if (timerInterval) {
                        clearInterval(timerInterval);
                        timerInterval = null;
                    }
                    gameActive = false;
                    
                    io.emit("gameOver", { winner, reason });
                    
                    setTimeout(() => {
                        chess.reset();
                        resetGame();
                        io.emit("boardState", chess.fen());
                        io.emit("timerUpdate", { whiteTime, blackTime });
                        io.emit("moveHistory", moveHistory);
                    }, 5000);
                } else {
                    // Reset the current player's time to 30 seconds after move
                    if (chess.turn() === 'w') {
                        blackTime = INITIAL_TIME;
                    } else {
                        whiteTime = INITIAL_TIME;
                    }
                    io.emit("timerUpdate", { whiteTime, blackTime });
                    
                    // Start timer if not already running
                    if (!timerInterval && gameActive) {
                        startTimer();
                    }
                }
            } else{
                console.log("invalid move : ", move);
                uniquesocket.emit("invalidMove", move);
            }
        } catch(err){
            console.log(err);
            uniquesocket.emit("invalidMove", move);
        }
    });

    uniquesocket.on("resign", () => {
        if (!gameActive) return;
        if (uniquesocket.id === players.white || uniquesocket.id === players.black) {
            const resigner = uniquesocket.id === players.white ? 'w' : 'b';
            io.emit("resigned", { resigner });
            
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            gameActive = false;

            setTimeout(() => {
                chess.reset();
                resetGame();
                io.emit("boardState", chess.fen());
                io.emit("timerUpdate", { whiteTime, blackTime });
                io.emit("moveHistory", moveHistory);
            }, 5000);
        }
    });

    uniquesocket.on("offerDraw", () => {
        let receiverId = null;
        if (uniquesocket.id === players.white) {
            receiverId = players.black;
        } else if (uniquesocket.id === players.black) {
            receiverId = players.white;
        }
        if (receiverId) {
            io.to(receiverId).emit("drawOffered");
        }
    });

    uniquesocket.on("drawResponse", (data) => {
        if (!gameActive) return;
        if (data.accepted) {
            io.emit("drawDeclared", { reason: 'agreement' });
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            gameActive = false;

            setTimeout(() => {
                chess.reset();
                resetGame();
                io.emit("boardState", chess.fen());
                io.emit("timerUpdate", { whiteTime, blackTime });
                io.emit("moveHistory", moveHistory);
            }, 5000);
        } else {
            let offererId = null;
            if (uniquesocket.id === players.white) {
                offererId = players.black;
            } else if (uniquesocket.id === players.black) {
                offererId = players.white;
            }
            if (offererId) {
                io.to(offererId).emit("drawDeclined");
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", function(){
    console.log("Server is running on port", PORT);
    console.log(`\n🌐 Chess Game Ready!`);
    console.log(`   Access:      http://localhost:${PORT}\n`);
});