const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

let players = {};
let crates = []; // { id, x, y, type }
let crateIdCounter = 0;
let playerCount = 0;
const SEED = Math.floor(Math.random() * 10000);

// Crate Configuration
const CRATE_TYPES = ['repair', 'ammo', 'shield', 'scatter', 'seeker', 'nuke'];
const SPAWN_INTERVAL = 5000; // Spawn a crate every 5 seconds
const MAX_CRATES = 10;

io.on("connection", (socket) => {
  console.log("New Tank Connected: " + socket.id);
  playerCount++;
  
  // Auto-assign team (1 or 2)
  const team = playerCount % 2 === 0 ? 2 : 1;
  
  players[socket.id] = {
    x: team === 1 ? 200 : 5000,
    y: 0,
    angle: 0,
    turretAngle: 0,
    hp: 100,
    maxHp: 100,
    shield: 0, // Added Shield property
    team: team,
    name: "Tank " + playerCount
  };

  // Send initial data to the joining player
  socket.emit("init", { 
    id: socket.id, 
    team: team, 
    seed: SEED,
    crates: crates // Send existing crates
  });
  
  // Notify others
  socket.broadcast.emit("playerJoined", { id: socket.id, ...players[socket.id] });
  
  // Send existing players to the new joiner
  socket.emit("stateUpdate", players);

  socket.on("updateState", (data) => {
    if (players[socket.id]) {
      players[socket.id] = { ...players[socket.id], ...data };
    }
  });

  socket.on("fire", (data) => {
    data.id = socket.id;
    socket.broadcast.emit("playerFired", data);
  });

  socket.on("crateCollected", (crateId) => {
      // Verify crate exists to prevent double collection
      const index = crates.findIndex(c => c.id === crateId);
      if (index !== -1) {
          crates.splice(index, 1);
          io.emit("crateRemoved", crateId); // Tell everyone to remove it
      }
  });

  // Loop to sync all players to all clients 20 times a second
  setInterval(() => {
    io.emit("stateUpdate", players);
  }, 50);

  socket.on("disconnect", () => {
    delete players[socket.id];
    io.emit("playerLeft", socket.id);
    console.log("Tank Disconnected");
  });
});

// Server-side Crate Spawner
setInterval(() => {
    if (crates.length < MAX_CRATES && playerCount > 0) {
        const newCrate = {
            id: crateIdCounter++,
            x: Math.random() * 6000 + 200, // Random X within map bounds
            y: -100, // Start in sky
            type: CRATE_TYPES[Math.floor(Math.random() * CRATE_TYPES.length)]
        };
        crates.push(newCrate);
        io.emit("crateSpawned", newCrate);
    }
}, SPAWN_INTERVAL);

console.log("Artillery Blitz Server running on port 3000");