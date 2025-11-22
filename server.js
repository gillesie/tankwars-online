const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- GAME STATE MANAGEMENT ---
// Structure: { "roomName": { players: {}, crates: [], seed: 123, lastCrate: timestamp } }
const games = {};

function getRoomList() {
    const roomData = [];
    for (const [roomName, game] of Object.entries(games)) {
        const pList = Object.values(game.players);
        roomData.push({
            name: roomName,
            blue: pList.filter(p => p.team === 1).length,
            red: pList.filter(p => p.team === 2).length
        });
    }
    return roomData;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Send available rooms to the user immediately
    socket.emit('roomList', getRoomList());

    socket.on('createOrJoin', ({ room, name, team }) => {
        // Join Socket.io Room
        socket.join(room);
        socket.data.room = room; // Store room on socket session

        // Initialize Game Instance if it doesn't exist
        if (!games[room]) {
            games[room] = {
                players: {},
                crates: [],
                seed: Math.random(),
                lastCrate: Date.now()
            };
        }
        
        const game = games[room];

        // Add Player
        game.players[socket.id] = {
            id: socket.id,
            name: name || `Trooper ${socket.id.substr(0,3)}`,
            team: parseInt(team), // 1 or 2
            x: team == 1 ? 200 : 5800,
            y: 0,
            hp: 100,
            shield: 0,
            angle: 0,
            turretAngle: 0
        };

        // Send Init Data
        socket.emit('init', {
            id: socket.id,
            team: team,
            seed: game.seed,
            crates: game.crates,
            players: game.players // Send current players for the scoreboard
        });

        // Notify room
        io.to(room).emit('playerJoined', game.players[socket.id]);
        
        // Update Lobby for everyone not in a game
        io.emit('roomList', getRoomList());
    });

    socket.on('updateState', (state) => {
        const room = socket.data.room;
        if (room && games[room] && games[room].players[socket.id]) {
            Object.assign(games[room].players[socket.id], state);
        }
    });

    socket.on('fire', (data) => {
        const room = socket.data.room;
        if (room) {
            data.id = socket.id;
            socket.broadcast.to(room).emit('playerFired', data);
        }
    });

    socket.on('hit', (data) => {
        const room = socket.data.room;
        if(room) socket.broadcast.to(room).emit('hitConfirmed', data); // Optional: confirm hits
    });

    socket.on('crateCollected', (id) => {
        const room = socket.data.room;
        if (room && games[room]) {
            games[room].crates = games[room].crates.filter(c => c.id !== id);
            io.to(room).emit('crateRemoved', id);
        }
    });

    socket.on('disconnect', () => {
        const room = socket.data.room;
        if (room && games[room]) {
            delete games[room].players[socket.id];
            io.to(room).emit('playerLeft', socket.id);
            
            // Clean up empty rooms
            if (Object.keys(games[room].players).length === 0) {
                delete games[room];
            }
            
            io.emit('roomList', getRoomList());
        }
    });
});

// --- GLOBAL TICKER (Per Room) ---
setInterval(() => {
    const now = Date.now();
    
    for (const room in games) {
        const game = games[room];
        
        // 1. Broadcast State
        io.to(room).emit('stateUpdate', game.players);

        // 2. Spawn Crates Logic (Per room)
        if (now - game.lastCrate > 10000 && game.crates.length < 5) {
            game.lastCrate = now;
            const id = Math.random().toString(36).substr(2, 9);
            const type = ['repair', 'ammo', 'shield', 'scatter', 'seeker', 'nuke'][Math.floor(Math.random() * 6)];
            const x = Math.floor(Math.random() * 5800) + 100;
            const crate = { id, x, y: -100, type };
            
            game.crates.push(crate);
            io.to(room).emit('crateSpawned', crate);
        }
    }
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));