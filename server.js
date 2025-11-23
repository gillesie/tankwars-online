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
const games = {};

function getRoomList() {
    const roomData = [];
    for (const [roomName, game] of Object.entries(games)) {
        const pList = Object.values(game.players);
        roomData.push({
            name: roomName,
            status: game.status, 
            blue: pList.filter(p => p.team === 1).length,
            red: pList.filter(p => p.team === 2).length
        });
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
            games[room] = {
                host: socket.id,
                status: 'lobby',
                players: {},
                crates: [],
                dynamicPlatforms: [],
                seed: Math.random(),
                lastCrate: Date.now()
            };
        }
        
        const game = games[room];
        game.players[socket.id] = {
            id: socket.id,
            name: name || `Trooper ${socket.id.substr(0,3)}`,
            team: parseInt(team),
            x: team == 1 ? 200 : 5800,
            y: -500,
            hp: 100, maxHp: 100, shield: 0, lives: 5,
            angle: 0, turretAngle: 0, dead: false
        };

        socket.emit('init', {
            id: socket.id, team: team, isHost: (game.host === socket.id),
            gameStatus: game.status, seed: game.seed,
            crates: game.crates, dynamicPlatforms: game.dynamicPlatforms,
            players: game.players 
        });

        socket.broadcast.to(room).emit('playerJoined', game.players[socket.id]);
        io.emit('roomList', getRoomList());
    });

    socket.on('requestStartGame', () => {
        const room = socket.data.room;
        if (room && games[room] && games[room].host === socket.id) {
            games[room].status = 'playing';
            io.to(room).emit('gameStarted');
            io.emit('roomList', getRoomList());
        }
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
        if(room) socket.broadcast.to(room).emit('hitConfirmed', data); 
    });
    
    socket.on('createPlatform', (p) => {
        const room = socket.data.room;
        if(room && games[room]) {
            games[room].dynamicPlatforms.push(p);
            io.to(room).emit('createPlatform', p); // Echo to clients
        }
    });

    socket.on('died', () => {
        const room = socket.data.room;
        if (room && games[room] && games[room].players[socket.id]) {
            const p = games[room].players[socket.id];
            if (p.dead) return; 
            p.lives -= 1; p.dead = true; p.hp = 0;
            io.to(room).emit('playerDied', { id: socket.id, lives: p.lives });

            if (p.lives > 0) {
                setTimeout(() => {
                    if (!games[room] || !games[room].players[socket.id]) return;
                    p.dead = false; p.hp = 100; p.x = Math.floor(Math.random() * 5000) + 500; p.y = -500; 
                    io.to(room).emit('playerRespawn', p);
                }, 3000);
            } else {
                checkWinCondition(room);
            }
        }
    });

    function checkWinCondition(room) {
        const game = games[room];
        const pList = Object.values(game.players);
        const blueAlive = pList.some(p => p.team === 1 && p.lives > 0);
        const redAlive = pList.some(p => p.team === 2 && p.lives > 0);

        if (!blueAlive && !redAlive) {
            io.to(room).emit('gameOver', { winner: 'DRAW' });
            delete games[room];
        } else if (!blueAlive) {
            io.to(room).emit('gameOver', { winner: 'RED TEAM' });
            delete games[room];
        } else if (!redAlive) {
            io.to(room).emit('gameOver', { winner: 'BLUE TEAM' });
            delete games[room];
        }
        io.emit('roomList', getRoomList());
    }

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
            if (Object.keys(games[room].players).length === 0) delete games[room];
            else if (games[room].host === socket.id) games[room].host = Object.keys(games[room].players)[0];
            io.emit('roomList', getRoomList());
        }
    });
});

setInterval(() => {
    const now = Date.now();
    for (const room in games) {
        const game = games[room];
        if (game.status === 'playing') {
            io.to(room).emit('stateUpdate', game.players);
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
    }
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));