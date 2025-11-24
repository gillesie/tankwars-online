class GameRoom {
    constructor(io, roomId) {
        this.io = io;
        this.roomId = roomId;
        this.host = null;
        this.status = 'lobby';
        this.players = {};
        this.crates = [];
        this.planes = [];
        this.dynamicPlatforms = [];
        this.destroyedPlatforms = [];
        this.destroyedBlocks = []; // NEW: Track destroyed blocks
        this.seed = Math.random();
        this.lastCrate = Date.now();
    }

    getSummary(name) {
        const pList = Object.values(this.players);
        return {
            name: name,
            status: this.status,
            blue: pList.filter(p => p.team === 1).length,
            red: pList.filter(p => p.team === 2).length
        };
    }

    addPlayer(socket, name, team) {
        if (!this.host) this.host = socket.id;

        this.players[socket.id] = {
            id: socket.id,
            name: name || `Trooper ${socket.id.substr(0,3)}`,
            team: parseInt(team),
            x: team == 1 ? 200 : 5800,
            y: -500,
            hp: 100, maxHp: 100,
            shield: 0, lives: 5,
            angle: 0, turretAngle: 0,
            dead: false
        };

        socket.emit('init', {
            id: socket.id,
            team: parseInt(team),
            isHost: (this.host === socket.id),
            gameStatus: this.status,
            seed: this.seed,
            crates: this.crates,
            planes: this.planes,
            dynamicPlatforms: this.dynamicPlatforms,
            destroyedPlatforms: this.destroyedPlatforms,
            destroyedBlocks: this.destroyedBlocks, // NEW
            players: this.players 
        });

        socket.broadcast.to(this.roomId).emit('playerJoined', this.players[socket.id]);
    }

    removePlayer(socketId) {
        delete this.players[socketId];
        this.io.to(this.roomId).emit('playerLeft', socketId);
        
        if (this.host === socketId) {
            const remaining = Object.keys(this.players);
            if (remaining.length > 0) this.host = remaining[0];
        }

        if (this.status === 'playing') this.checkWinCondition();
    }

    isEmpty() {
        return Object.keys(this.players).length === 0;
    }

    startGame(requesterId) {
        if (this.host !== requesterId) return;

        const pList = Object.values(this.players);
        const blues = pList.filter(p => p.team === 1).length;
        const reds = pList.filter(p => p.team === 2).length;

        if (blues > 0 && reds > 0) {
            this.status = 'playing';
            this.io.to(this.roomId).emit('gameStarted');
        } else {
            // Optional: Notify need more players
        }
    }

    handleStateUpdate(socket, state) {
        if (this.players[socket.id] && !this.players[socket.id].dead) {
            Object.assign(this.players[socket.id], state);
        }
    }

    handleFire(socket, data) {
        data.id = socket.id;
        socket.broadcast.to(this.roomId).emit('playerFired', data);
    }

    broadcastHit(socket, data) {
        socket.broadcast.to(this.roomId).emit('hitConfirmed', data); 
    }

    createPlatform(socket, platData) {
        this.dynamicPlatforms.push(platData);
        this.io.to(this.roomId).emit('platformCreated', platData);
    }

    platformDestroyed(socket, id) {
        if (typeof id === 'string' && id.startsWith('static')) {
            if (!this.destroyedPlatforms.includes(id)) {
                this.destroyedPlatforms.push(id);
            }
        } else {
            this.dynamicPlatforms = this.dynamicPlatforms.filter(p => p.id !== id);
        }
        this.io.to(this.roomId).emit('platformDestroyed', id);
    }

    // NEW
    blockDestroyed(socket, id) {
        if (!this.destroyedBlocks.includes(id)) {
            this.destroyedBlocks.push(id);
            this.io.to(this.roomId).emit('blockDestroyed', id);
        }
    }

    broadcastPlatformDamage(socket, data) {
        socket.broadcast.to(this.roomId).emit('platformDamage', data);
    }

    handlePlaneHit(socket, data) {
        const plane = this.planes.find(p => p.id === data.planeId);
        if (plane) {
            plane.hp -= data.damage;
            if (plane.hp <= 0) {
                const player = this.players[socket.id];
                if (player) {
                    player.hp = 200; 
                    player.maxHp = 200;
                    player.lives += 1;
                    this.io.to(this.roomId).emit('planeDestroyed', { 
                        planeId: plane.id, killerId: socket.id, x: plane.x, y: plane.y 
                    });
                    socket.emit('grantSuperpower');
                }
                this.planes = this.planes.filter(p => p.id !== plane.id);
            }
        }
    }

    handleDeath(socket) {
        const p = this.players[socket.id];
        if (!p || p.dead) return;

        p.lives -= 1;
        p.dead = true;
        p.hp = 0;
        
        this.io.to(this.roomId).emit('playerDied', { id: socket.id, lives: p.lives });

        if (p.lives > 0) {
            setTimeout(() => {
                if (!this.players[socket.id]) return;
                p.dead = false;
                p.hp = 100; p.maxHp = 100; p.shield = 0;
                p.x = Math.floor(Math.random() * 5000) + 500;
                p.y = -500; 
                this.io.to(this.roomId).emit('playerRespawn', p);
            }, 3000);
        } else {
            this.checkWinCondition();
        }
    }

    removeCrate(socket, id) {
        this.crates = this.crates.filter(c => c.id !== id);
        this.io.to(this.roomId).emit('crateRemoved', id);
    }

    checkWinCondition() {
        const pList = Object.values(this.players);
        const blueAlive = pList.some(p => p.team === 1 && p.lives > 0);
        const redAlive = pList.some(p => p.team === 2 && p.lives > 0);

        if (!blueAlive && !redAlive) {
            this.io.to(this.roomId).emit('gameOver', { winner: 'DRAW' });
        } else if (!blueAlive) {
            this.io.to(this.roomId).emit('gameOver', { winner: 'RED TEAM' });
        } else if (!redAlive) {
            this.io.to(this.roomId).emit('gameOver', { winner: 'BLUE TEAM' });
        }
    }

    update(now) {
        if (this.status !== 'playing') return;

        // Sync Players
        this.io.to(this.roomId).emit('stateUpdate', this.players);

        // Crate Spawning
        if (now - this.lastCrate > 10000 && this.crates.length < 5) {
            this.lastCrate = now;
            const id = Math.random().toString(36).substr(2, 9);
            const type = ['repair', 'ammo', 'shield', 'scatter', 'seeker', 'nuke'][Math.floor(Math.random() * 6)];
            const x = Math.floor(Math.random() * 5800) + 100;
            const crate = { id, x, y: -100, type };
            this.crates.push(crate);
            this.io.to(this.roomId).emit('crateSpawned', crate);
        }

        // NPC Plane Logic
        if (this.planes.length < 1 && Math.random() < 0.005) {
            const isLeft = Math.random() > 0.5;
            const plane = {
                id: Math.random().toString(36).substr(2, 9),
                x: isLeft ? -200 : 6200,
                y: Math.random() * 200 + 100,
                vx: isLeft ? 5 : -5,
                hp: 50,
                direction: isLeft ? 1 : -1
            };
            this.planes.push(plane);
            this.io.to(this.roomId).emit('planeSpawned', plane);
        }

        this.planes.forEach((p, index) => {
            p.x += p.vx;
            if (Math.random() < 0.02 && p.x > 200 && p.x < 5800) {
                this.io.to(this.roomId).emit('clusterBombDropped', { x: p.x, y: p.y });
            }
            if (p.x < -1000 || p.x > 7000) {
                this.planes.splice(index, 1);
            }
        });
    }
}

module.exports = GameRoom;