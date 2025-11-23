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
            status: game.status, // 'lobby' or 'playing'
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
                planes: [], // Store active NPC planes
                dynamicPlatforms: [], // User drawn platforms
                destroyedPlatforms: [], // IDs of destroyed static platforms
                seed: Math.random(),
                lastCrate: Date.now()
            };
        }
        
        const game = games[room];

        // Reset or Add Player
        game.players[socket.id] = {
            id: socket.id,
            name: name || `Trooper ${socket.id.substr(0,3)}`,
            team: parseInt(team),
            x: team == 1 ? 200 : 5800,
            y: -500, // Spawn high
            hp: 100,
            maxHp: 100, // Track max HP for superpowers
            shield: 0,
            lives: 5,
            angle: 0,
            turretAngle: 0,
            dead: false
        };

        // Send Init Data
        socket.emit('init', {
            id: socket.id,
            team: team,
            isHost: (game.host === socket.id),
            gameStatus: game.status,
            seed: game.seed,
            crates: game.crates,
            planes: game.planes, // [FIX] Send existing planes so they appear on minimap
            dynamicPlatforms: game.dynamicPlatforms, // [NEW] Send user-drawn platforms
            destroyedPlatforms: game.destroyedPlatforms, // [NEW] Sync destruction
            players: game.players 
        });

        socket.broadcast.to(room).emit('playerJoined', game.players[socket.id]);
        io.emit('roomList', getRoomList());
    });

    // --- HOST STARTS GAME ---
    socket.on('requestStartGame', () => {
        const room = socket.data.room;
        if (!room || !games[room]) return;
        const game = games[room];

        if (game.host !== socket.id) return;

        const blues = Object.values(game.players).filter(p => p.team === 1).length;
        const reds = Object.values(game.players).filter(p => p.team === 2).length;

        // Allow single player testing if needed, or keep strict
        if (blues > 0 && reds > 0) {
            game.status = 'playing';
            io.to(room).emit('gameStarted');
            io.emit('roomList', getRoomList());
        } else {
            socket.emit('notification', 'NEED 1 PLAYER PER TEAM TO START');
        }
    });

    socket.on('updateState', (state) => {
        const room = socket.data.room;
        if (room && games[room] && games[room].players[socket.id]) {
            if (!games[room].players[socket.id].dead) {
                Object.assign(games[room].players[socket.id], state);
            }
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

    // --- PLATFORM LOGIC [NEW] ---
    socket.on('createPlatform', (platData) => {
        const room = socket.data.room;
        if (room && games[room]) {
            games[room].dynamicPlatforms.push(platData);
            io.to(room).emit('platformCreated', platData);
        }
    });

    socket.on('platformDestroyed', (id) => {
        const room = socket.data.room;
        if (room && games[room]) {
            // If it's a static platform (string ID), add to destroyed list
            // If it's dynamic, we could remove it from array, but identifying by index is tricky
            // simplified: Just broadcast destruction
            if (typeof id === 'string' && id.startsWith('static')) {
                if (!games[room].destroyedPlatforms.includes(id)) {
                    games[room].destroyedPlatforms.push(id);
                }
            } else {
                // Remove dynamic platform
                games[room].dynamicPlatforms = games[room].dynamicPlatforms.filter(p => p.id !== id);
            }
            io.to(room).emit('platformDestroyed', id);
        }
    });

    socket.on('platformDamage', (data) => {
        const room = socket.data.room;
        if(room) socket.broadcast.to(room).emit('platformDamage', data);
    });

    // --- NPC PLANE HIT ---
    socket.on('planeHit', (data) => {
        const room = socket.data.room;
        if (room && games[room]) {
            const plane = games[room].planes.find(p => p.id === data.planeId);
            if (plane) {
                plane.hp -= data.damage;
                if (plane.hp <= 0) {
                    // Reward Player
                    const player = games[room].players[socket.id];
                    if (player) {
                        player.hp = 200; // Super HP
                        player.maxHp = 200;
                        player.lives += 1;
                        io.to(room).emit('planeDestroyed', { 
                            planeId: plane.id, 
                            killerId: socket.id,
                            x: plane.x, 
                            y: plane.y 
                        });
                        socket.emit('grantSuperpower'); // Specific event for the killer
                    }
                    // Remove plane immediately
                    games[room].planes = games[room].planes.filter(p => p.id !== plane.id);
                }
            }
        }
    });

    // --- HANDLING DEATH & RESPAWN ---
    socket.on('died', () => {
        const room = socket.data.room;
        if (room && games[room] && games[room].players[socket.id]) {
            const p = games[room].players[socket.id];
            
            if (p.dead) return; 

            p.lives -= 1;
            p.dead = true;
            p.hp = 0;
            
            io.to(room).emit('playerDied', { id: socket.id, lives: p.lives });

            if (p.lives > 0) {
                setTimeout(() => {
                    if (!games[room] || !games[room].players[socket.id]) return;
                    p.dead = false;
                    p.hp = 100;
                    p.maxHp = 100; // Reset max HP on respawn
                    p.shield = 0;
                    p.x = Math.floor(Math.random() * 5000) + 500;
                    p.y = -500; 
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
            
            if (games[room].host === socket.id) {
                const remaining = Object.keys(games[room].players);
                if (remaining.length > 0) {
                    games[room].host = remaining[0];
                }
            }

            if (Object.keys(games[room].players).length === 0) {
                delete games[room];
            } else {
                if (games[room].status === 'playing') checkWinCondition(room);
            }
            io.emit('roomList', getRoomList());
        }
    });
});

// --- SERVER LOOP ---
setInterval(() => {
    const now = Date.now();
    for (const room in games) {
        const game = games[room];
        
        if (game.status === 'playing') {
            // Sync Players
            io.to(room).emit('stateUpdate', game.players);

            // Crate Spawning
            if (now - game.lastCrate > 10000 && game.crates.length < 5) {
                game.lastCrate = now;
                const id = Math.random().toString(36).substr(2, 9);
                const type = ['repair', 'ammo', 'shield', 'scatter', 'seeker', 'nuke'][Math.floor(Math.random() * 6)];
                const x = Math.floor(Math.random() * 5800) + 100;
                const crate = { id, x, y: -100, type };
                game.crates.push(crate);
                io.to(room).emit('crateSpawned', crate);
            }

            // --- NPC PLANE LOGIC ---
            // Spawn Plane (1% chance per tick if none exist)
            if (game.planes.length < 1 && Math.random() < 0.005) {
                const isLeft = Math.random() > 0.5;
                const plane = {
                    id: Math.random().toString(36).substr(2, 9),
                    x: isLeft ? -200 : 6200,
                    y: Math.random() * 200 + 100, // High altitude
                    vx: isLeft ? 5 : -5,
                    hp: 50,
                    direction: isLeft ? 1 : -1
                };
                game.planes.push(plane);
                io.to(room).emit('planeSpawned', plane);
            }

            // Update Planes
            game.planes.forEach((p, index) => {
                p.x += p.vx;
                
                // Bombing Run (random drop)
                if (Math.random() < 0.02 && p.x > 200 && p.x < 5800) {
                    io.to(room).emit('clusterBombDropped', { x: p.x, y: p.y });
                }

                // Despawn if out of bounds
                if (p.x < -1000 || p.x > 7000) {
                    game.planes.splice(index, 1);
                }
            });
        }
    }
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));