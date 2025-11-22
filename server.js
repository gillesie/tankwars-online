const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

// 1. Initialize Express and HTTP Server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // Allow connections from any origin
});

// 2. Serve Static Files (HTML, CSS, JS)
// This tells the server to look for files in the current directory
app.use(express.static(__dirname));

// Serve the main game file when visiting the root URL
app.get('/', (req, res) => {
    // Checks for game2-online.html. If you renamed it to index.html, update this line!
    const gameFile = path.join(__dirname, 'game2-online.html');
    res.sendFile(gameFile, (err) => {
        if (err) {
            // Fallback if the specific file isn't found, tries index.html
            res.sendFile(path.join(__dirname, 'index.html'));
        }
    });
});

// 3. Game State
let players = {};
let crates = [];
let seed = Math.random();

// Crate Spawning Loop (Every 10 seconds)
setInterval(() => {
    if (crates.length < 5) {
        const id = Math.random().toString(36).substr(2, 9);
        const type = ['repair', 'ammo', 'shield', 'scatter', 'seeker', 'nuke'][Math.floor(Math.random() * 6)];
        const x = Math.floor(Math.random() * 5800) + 100; // Random position within map bounds
        const crate = { id, x, y: -100, type };
        crates.push(crate);
        io.emit('crateSpawned', crate);
    }
}, 10000);

// 4. Socket.io Event Handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Handle new player joining
    socket.on('joinGame', (data) => {
        // Assign team: 1 (Blue) or 2 (Red)
        const team = Object.keys(players).length % 2 === 0 ? 1 : 2;

        players[socket.id] = {
            id: socket.id,
            name: data.name || `Player ${socket.id.substr(0,4)}`,
            team: team,
            x: team === 1 ? 200 : 5800, // Spawn points
            y: 0,
            hp: 100,
            shield: 0,
            angle: 0,
            turretAngle: 0
        };

        // Send init data to the new player
        socket.emit('init', {
            id: socket.id,
            team: team,
            seed: seed,
            crates: crates
        });

        // Notify everyone else
        socket.broadcast.emit('playerJoined', players[socket.id]);
    });

    // Receive movement/state updates from client
    socket.on('updateState', (state) => {
        if (players[socket.id]) {
            // Update our server-side record of the player
            Object.assign(players[socket.id], state);
        }
    });

    // Relay firing events
    socket.on('fire', (data) => {
        // Add the shooter's ID so clients know who fired
        data.id = socket.id;
        socket.broadcast.emit('playerFired', data);
    });

    // Handle crate collection
    socket.on('crateCollected', (id) => {
        // Remove crate and notify all clients
        crates = crates.filter(c => c.id !== id);
        io.emit('crateRemoved', id);
    });

    // Cleanup on disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

// 5. Game Loop (Broadcast State)
// Sends all player positions to all clients 30 times a second
setInterval(() => {
    io.emit('stateUpdate', players);
}, 1000 / 30);

// 6. Start the Server
// Render gives us a port in process.env.PORT. We must use it.
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});