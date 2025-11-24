const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameRoom = require('./GameRoom');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, '../public')));

// Global Game Manager
const games = {};

function getRoomList() {
    const roomData = [];
    for (const [roomName, game] of Object.entries(games)) {
        roomData.push(game.getSummary(roomName));
    }
    return roomData;
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    socket.emit('roomList', getRoomList());

    socket.on('createOrJoin', ({ room, name, team }) => {
        socket.join(room);
        socket.data.room = room;

        if (!games[room]) {
            games[room] = new GameRoom(io, room);
        }
        
        games[room].addPlayer(socket, name, team);
        io.emit('roomList', getRoomList());
    });

    socket.on('requestStartGame', () => {
        const room = socket.data.room;
        if (room && games[room]) games[room].startGame(socket.id);
        io.emit('roomList', getRoomList());
    });

    // Forward game events to the specific room instance
    const forwardToRoom = (method, ...args) => {
        const room = socket.data.room;
        if (room && games[room]) {
            if (games[room][method]) {
                games[room][method](socket, ...args);
            }
        }
    };

    socket.on('updateState', (data) => forwardToRoom('handleStateUpdate', data));
    socket.on('fire', (data) => forwardToRoom('handleFire', data));
    socket.on('hit', (data) => forwardToRoom('broadcastHit', data));
    socket.on('createPlatform', (data) => forwardToRoom('createPlatform', data));
    socket.on('platformDestroyed', (id) => forwardToRoom('platformDestroyed', id));
    socket.on('blockDestroyed', (id) => forwardToRoom('blockDestroyed', id)); // NEW
    socket.on('platformDamage', (data) => forwardToRoom('broadcastPlatformDamage', data));
    socket.on('planeHit', (data) => forwardToRoom('handlePlaneHit', data));
    socket.on('died', () => forwardToRoom('handleDeath'));
    socket.on('crateCollected', (id) => forwardToRoom('removeCrate', id));

    socket.on('disconnect', () => {
        const room = socket.data.room;
        if (room && games[room]) {
            games[room].removePlayer(socket.id);
            if (games[room].isEmpty()) {
                delete games[room];
            }
            io.emit('roomList', getRoomList());
        }
    });
});

// Server Loop
setInterval(() => {
    const now = Date.now();
    for (const room in games) {
        games[room].update(now);
    }
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));