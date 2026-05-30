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
    } else if (!players.black)  {
        players.black = uniquesocket.id;
        uniquesocket.emit("playerRole", "b");
    } else {
        uniquesocket.emit("spectatorRole");
    } 
    
    // Send the current game board state to the connecting socket
    uniquesocket.emit("boardState", chess.fen());
    uniquesocket.on("disconnect", function(){
        if(uniquesocket.id === players.white){
            delete players.white;
        } else if(uniquesocket.id === players.black){
            delete players.black;
        }
    });
    uniquesocket.on("move", (move)=>{
        try{
            if (chess.turn() === "w" &&  uniquesocket.id !== players.white) return;
            if (chess.turn() === "b" &&  uniquesocket.id !== players.black) return;

            const result = chess.move(move);
            if(result){
                currentPlayer = chess.turn();
                io.emit("move", move);
                io.emit("boardState", chess.fen());
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
        if (uniquesocket.id === players.white) {
            io.emit("resigned", { resigner: 'w' });
            chess.reset();
            io.emit("boardState", chess.fen());
        } else if (uniquesocket.id === players.black) {
            io.emit("resigned", { resigner: 'b' });
            chess.reset();
            io.emit("boardState", chess.fen());
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
        if (data.accepted) {
            io.emit("drawDeclared", { reason: 'agreement' });
            chess.reset();
            io.emit("boardState", chess.fen());
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

server.listen(3000, "0.0.0.0", function(){
    const os = require("os");
    const nets = os.networkInterfaces();
    let lanIP = "localhost";
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === "IPv4" && !net.internal) {
                lanIP = net.address;
            }
        }
    }
    console.log("Server is running on port 3000");
    console.log(`\n🌐 LAN Multiplayer Ready!`);
    console.log(`   Your PC:      http://localhost:3000`);
    console.log(`   Other player:  http://${lanIP}:3000\n`);
});