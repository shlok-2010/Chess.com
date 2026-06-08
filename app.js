 const express = require("express");
 const socket= require("socket.io");
 const http = require("http");
 const { Chess } = require("chess.js");
 const path = require("path");

 const app = express();

 const server = http.createServer(app);
 const io = socket(server);

 // Room management
 const rooms = {};

 // Timer settings
 const INITIAL_TIME = 30; // 30 seconds per player

 function generateRoomId() {
     const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
     let roomId = '';
     for (let i = 0; i < 6; i++) {
         roomId += chars.charAt(Math.floor(Math.random() * chars.length));
     }
     return roomId;
 }

 function createRoom(roomId) {
     rooms[roomId] = {
         chess: new Chess(),
         players: { white: null, black: null },
         playerNames: { white: 'White', black: 'Black' },
         whiteTime: INITIAL_TIME,
         blackTime: INITIAL_TIME,
         timerInterval: null,
         gameActive: true,
         moveHistory: []
     };
     return rooms[roomId];
 }

 function getRoom(roomId) {
     if (!rooms[roomId]) {
         return createRoom(roomId);
     }
     return rooms[roomId];
 }

  // Timer functions
  function startTimer(roomId) {
      const room = rooms[roomId];
      if (!room) return;
      
      if (room.timerInterval) clearInterval(room.timerInterval);
      room.timerInterval = setInterval(() => {
          if (!room.gameActive) {
              clearInterval(room.timerInterval);
              return;
          }

          const currentTurn = room.chess.turn();

          if (currentTurn === 'w') {
              room.whiteTime--;
              if (room.whiteTime <= 0) {
                  room.whiteTime = 0;
                  room.gameActive = false;
                  clearInterval(room.timerInterval);
                  room.timerInterval = null;
                  room.closed = true;
                  io.to(roomId).emit("gameOver", { winner: 'b', reason: 'timeout' });
                  return;
              }
          } else {
              room.blackTime--;
              if (room.blackTime <= 0) {
                  room.blackTime = 0;
                  room.gameActive = false;
                  clearInterval(room.timerInterval);
                  room.timerInterval = null;
                  room.closed = true;
                  io.to(roomId).emit("gameOver", { winner: 'w', reason: 'timeout' });
                  return;
              }
          }

          io.to(roomId).emit("timerUpdate", { whiteTime: room.whiteTime, blackTime: room.blackTime });
      }, 1000);
  }

  function resetGame(roomId) {
      const room = rooms[roomId];
      if (!room) return;
      
      room.chess.reset();
      room.whiteTime = INITIAL_TIME;
      room.blackTime = INITIAL_TIME;
      room.moveHistory = [];
      room.gameActive = true;
      if (room.timerInterval) clearInterval(room.timerInterval);
      room.timerInterval = null;
      if (room.players.white && room.players.black) {
          startTimer(roomId);
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
    res.render("landing", {title: "Chess - Create Room"});
});

app.get("/room/:roomId", (req,res) => {
    const roomId = req.params.roomId;
    // Ensure room exists
    getRoom(roomId);
    res.render("index", {title: "Chess Game", roomId: roomId});
});

app.get("/api/create-room", (req,res) => {
    const roomId = generateRoomId();
    createRoom(roomId);
    res.json({ roomId: roomId });
});

io.on("connection", function(uniquesocket){
    console.log("connected");
    let currentRoomId = null;

    uniquesocket.on("joinRoom", function(data){
        const roomId = data.roomId;
        const playerName = data.name || 'Anonymous';
        currentRoomId = roomId;
        const room = getRoom(roomId);

        // Join socket.io room
        uniquesocket.join(roomId);
        console.log(`Socket ${uniquesocket.id} joined room ${roomId} as ${playerName}`);

        if(!room.players.white){
            room.players.white = uniquesocket.id;
            room.playerNames.white = playerName;
            uniquesocket.emit("playerRole", "w");
            console.log("White player joined:", uniquesocket.id, "as", playerName, "in room", roomId);
        } else if (!room.players.black)  {
            room.players.black = uniquesocket.id;
            room.playerNames.black = playerName;
            uniquesocket.emit("playerRole", "b");
            console.log("Black player joined:", uniquesocket.id, "as", playerName, "in room", roomId);
            // Start timer when both players have joined
            if (!room.timerInterval && room.gameActive) {
                console.log("Both players joined, starting timer in room", roomId);
                startTimer(roomId);
            }
        } else {
            uniquesocket.emit("spectatorRole");
            console.log("Spectator joined:", uniquesocket.id, "as", playerName, "in room", roomId);
        }

        // Send the current game board state to the connecting socket
        uniquesocket.emit("boardState", room.chess.fen());
        uniquesocket.emit("timerUpdate", { whiteTime: room.whiteTime, blackTime: room.blackTime });
        uniquesocket.emit("moveHistory", room.moveHistory);
        io.to(roomId).emit("playerNames", room.playerNames);
    });
    
    uniquesocket.on("disconnect", function(){
        if (currentRoomId && rooms[currentRoomId]) {
            const room = rooms[currentRoomId];
            if(uniquesocket.id === room.players.white){
                delete room.players.white;
            } else if(uniquesocket.id === room.players.black){
                delete room.players.black;
            }
            if (!room.players.white || !room.players.black) {
                if (room.timerInterval) {
                    clearInterval(room.timerInterval);
                    room.timerInterval = null;
                }
            }
        }
    });
    uniquesocket.on("move", (move)=>{
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const room = rooms[currentRoomId];
        
        try{
            if (!room.gameActive) return;
            if (room.chess.turn() === "w" &&  uniquesocket.id !== room.players.white) return;
            if (room.chess.turn() === "b" &&  uniquesocket.id !== room.players.black) return;

            // Get piece before move for notation
            const piece = room.chess.get(move.from);
            
            const result = room.chess.move(move);
            if(result){
                // Track move history
                const moveNotation = result.san;
                room.moveHistory.push(moveNotation);
                
                io.to(currentRoomId).emit("move", move);
                io.to(currentRoomId).emit("boardState", room.chess.fen());
                io.to(currentRoomId).emit("moveHistory", room.moveHistory);
                
                if (room.chess.isGameOver()) {
                    let reason = "draw";
                    let winner = null;
                    if (room.chess.isCheckmate()) {
                        reason = "checkmate";
                        winner = room.chess.turn() === "w" ? "b" : "w";
                    } else if (room.chess.isStalemate()) {
                        reason = "stalemate";
                    } else if (room.chess.isThreefoldRepetition()) {
                        reason = "threefold repetition";
                    } else if (room.chess.isInsufficientMaterial()) {
                        reason = "insufficient material";
                    }
                    
                    if (room.timerInterval) {
                        clearInterval(room.timerInterval);
                        room.timerInterval = null;
                    }
                    room.gameActive = false;
                    room.closed = true;
                    
                    io.to(currentRoomId).emit("gameOver", { winner, reason });
                } else {
                    // Per-move time control: reset the clock after every completed move
                    // so each player gets a fresh INITIAL_TIME for their turn.
                    room.whiteTime = INITIAL_TIME;
                    room.blackTime = INITIAL_TIME;
                    io.to(currentRoomId).emit("timerUpdate", { whiteTime: room.whiteTime, blackTime: room.blackTime });
                    
                    // Restart the countdown for the new active player
                    if (room.players.white && room.players.black && room.gameActive) {
                        startTimer(currentRoomId);
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
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const room = rooms[currentRoomId];
        
        if (!room.gameActive) return;
        if (uniquesocket.id === room.players.white || uniquesocket.id === room.players.black) {
            const resigner = uniquesocket.id === room.players.white ? 'w' : 'b';
            
            if (room.timerInterval) {
                clearInterval(room.timerInterval);
                room.timerInterval = null;
            }
            room.gameActive = false;
            room.closed = true;
            
            io.to(currentRoomId).emit("resigned", { resigner });
        }
    });

    uniquesocket.on("offerDraw", () => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const room = rooms[currentRoomId];
        
        let receiverId = null;
        if (uniquesocket.id === room.players.white) {
            receiverId = room.players.black;
        } else if (uniquesocket.id === room.players.black) {
            receiverId = room.players.white;
        }
        if (receiverId) {
            io.to(receiverId).emit("drawOffered");
        }
    });

    uniquesocket.on("drawResponse", (data) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const room = rooms[currentRoomId];
        
        if (!room.gameActive) return;
        if (data.accepted) {
            if (room.timerInterval) {
                clearInterval(room.timerInterval);
                room.timerInterval = null;
            }
            room.gameActive = false;
            room.closed = true;
            
            io.to(currentRoomId).emit("drawDeclared", { reason: 'agreement' });
        } else {
            let offererId = null;
            if (uniquesocket.id === room.players.white) {
                offererId = room.players.black;
            } else if (uniquesocket.id === room.players.black) {
                offererId = room.players.white;
            }
            if (offererId) {
                io.to(offererId).emit("drawDeclined");
            }
        }
    });

    uniquesocket.on("chatMessage", (data) => {
        if (!currentRoomId || !rooms[currentRoomId]) return;
        const room = rooms[currentRoomId];
        
        // Get sender name from room data
        let senderName = "Anonymous";
        if (uniquesocket.id === room.players.white) {
            senderName = room.playerNames.white;
        } else if (uniquesocket.id === room.players.black) {
            senderName = room.playerNames.black;
        } else if (data.name) {
            // Spectators send their name with the message
            senderName = data.name;
        }
        
        io.to(currentRoomId).emit("chatMessage", {
            sender: senderName,
            message: data.message
        });
    });

});

const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", function(){
    console.log("Server is running on port", PORT);
    console.log(`\n🌐 Chess Game Ready!`);
    console.log(`   Access:      http://localhost:${PORT}\n`);
});