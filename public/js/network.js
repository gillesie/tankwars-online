import { state } from './state.js';
import { SERVER_URL } from './config.js';
import { Crate } from './entities/Crate.js';
import { Plane } from './entities/Plane.js';
import { Tank } from './entities/Tank.js';
import { Projectile } from './entities/Projectile.js';
import { FloatingText } from './entities/FloatingText.js';
import { Particle } from './entities/Particle.js';
import { generateTerrain } from './world.js';
import { log, updateHUD, updateScoreboard, updateLobbyStatus, createExplosion, createDebris } from './ui.js';
import { fxRand } from './utils.js';
import { startGameClient } from './game.js';

export function connectSocket() {
    if(state.socket) return;
    state.socket = io(SERVER_URL);

    state.socket.on('roomList', (rooms) => {
        const container = document.getElementById('room-list-container');
        container.innerHTML = '';
        if(rooms.length === 0) container.innerHTML = '<div style="padding:10px; color:#555;">NO ACTIVE SIGNALS. CREATE A ROOM.</div>';
        
        rooms.forEach(r => {
            const div = document.createElement('div');
            div.className = 'room-item';
            div.innerHTML = `
                <span style="color:#fff; font-weight:bold;">${r.name} ${r.status==='playing'?'[LIVE]':''}</span>
                <span><span style="color:#0ff">${r.blue}</span> vs <span style="color:#f00">${r.red}</span></span>
            `;
            div.onclick = () => { document.getElementById('inp-room').value = r.name; };
            container.appendChild(div);
        });
    });
    
    state.socket.on('notification', (msg) => alert(msg));
}

export function joinGame() {
    const name = document.getElementById('inp-name').value || "Unknown";
    const room = document.getElementById('inp-room').value || "Global";
    
    setupGameListeners();

    state.socket.emit('createOrJoin', {
        room: room.toUpperCase(),
        name: name,
        team: state.selectedTeam
    });

    document.getElementById('join-area').style.display = 'none';
    document.getElementById('waiting-area').style.display = 'flex';
}

function handlePlayerJoin(data) {
    log(`${data.name} JOINED (TEAM ${data.team})`);
    const t = new Tank(false, data.team, data.id);
    t.name = data.name;
    t.lives = data.lives;
    t.maxHp = data.maxHp || 100;
    state.remotePlayers[data.id] = t;
    updateScoreboard();
}

function setupGameListeners() {
    const socket = state.socket;
    
    socket.on('init', (data) => {
        state.myId = data.id;
        state.myTeam = data.team;
        state.seed.val = data.seed; 
        state.isHost = data.isHost;

        if(state.isHost) document.getElementById('btn-start-game').classList.remove('hidden');
        
        if(data.crates) state.crates = data.crates.map(c => new Crate(c.id, c.x, c.y, c.type));
        if(data.planes) state.planes = data.planes.map(p => new Plane(p));

        if(data.players) {
            for (let pid in data.players) {
                if(pid !== state.myId) handlePlayerJoin(data.players[pid]);
            }
        }

        const hpBox = document.getElementById('hp-box');
        hpBox.className = 'stat-box'; 
        hpBox.classList.add(state.myTeam === 1 ? 'team-1-hud' : 'team-2-hud');

        // Generate Terrain and Blocks (filtering destroyed ones)
        generateTerrain(data.destroyedPlatforms || [], data.destroyedBlocks || []);
        
        if (data.dynamicPlatforms) {
            data.dynamicPlatforms.forEach(p => state.platforms.push(p));
        }

        state.player = new Tank(true, state.myTeam, state.myId);
        state.player.name = document.getElementById('inp-name').value || "YOU";
        
        if(data.gameStatus === 'playing') {
            startGameClient();
        } else {
            updateLobbyStatus();
        }
        updateScoreboard();
    });

    socket.on('playerJoined', (data) => {
        if(data.id === state.myId) return;
        handlePlayerJoin(data);
        updateLobbyStatus();
    });
    
    socket.on('gameStarted', startGameClient);

    socket.on('playerLeft', (id) => {
        if(state.remotePlayers[id]) {
            log(`${state.remotePlayers[id].name} DISCONNECTED`);
            delete state.remotePlayers[id];
            updateScoreboard();
            updateLobbyStatus();
        }
    });

    socket.on('stateUpdate', (serverPlayers) => {
        for (let id in serverPlayers) {
            if (id !== state.myId) {
                if (!state.remotePlayers[id]) handlePlayerJoin(serverPlayers[id]);
                const p = state.remotePlayers[id];
                const s = serverPlayers[id];
                p.targetX = s.x; p.targetY = s.y;
                p.turretAngle = s.turretAngle;
                p.hp = s.hp; p.shield = s.shield || 0;
                p.maxHp = s.maxHp || 100;
                p.angle = s.angle;
                p.lives = s.lives;
                p.dead = s.dead;
            } else {
                 if (serverPlayers[id].maxHp > state.player.maxHp) state.player.maxHp = serverPlayers[id].maxHp;
            }
        }
    });

    socket.on('playerFired', (data) => {
        if (state.remotePlayers[data.id]) {
            state.remotePlayers[data.id].spawnProjectile(data.x, data.y, data.angle, data.power, data.type);
        }
    });

    socket.on('crateSpawned', (c) => state.crates.push(new Crate(c.id, c.x, c.y, c.type)));
    socket.on('crateRemoved', (id) => state.crates = state.crates.filter(c => c.id !== id));
    socket.on('hitConfirmed', (data) => { if (data.x) createExplosion(data.x, data.y, 'heal'); });

    socket.on('platformCreated', (p) => state.platforms.push(p));
    
    socket.on('platformDestroyed', (id) => {
        const p = state.platforms.find(x => x.id === id);
        if(p) {
            createExplosion(p.x + p.width/2, p.y, 'standard');
            createDebris(p.x, p.y, p.width, p.height);
            state.platforms = state.platforms.filter(x => x.id !== id);
        }
    });

    socket.on('blockDestroyed', (id) => {
        const idx = state.blocks.findIndex(b => b.id === id);
        if(idx !== -1) {
            const b = state.blocks[idx];
            createExplosion(b.x + b.size/2, b.y + b.size/2, 'standard');
            createDebris(b.x, b.y, b.size, b.size);
            state.blocks.splice(idx, 1);
        }
    });
    
    socket.on('platformDamage', (data) => {
        const p = state.platforms.find(x => x.id === data.id);
        if(p) {
            p.hp -= data.damage;
            state.floatingTexts.push(new FloatingText(p.x, p.y - 10, `-${data.damage}`, '#aaa', 10));
        }
    });

    socket.on('planeSpawned', (p) => {
        state.planes.push(new Plane(p));
        log("WARNING: HOSTILE AIRCRAFT DETECTED");
    });

    socket.on('clusterBombDropped', (data) => {
        for(let i = 0; i < 5; i++) {
            const angle = 90 + fxRand(-20, 20);
            const power = fxRand(5, 15);
            const p = new Projectile(data.x, data.y, angle, power, 'enemy', 'cluster', 0); 
            state.projectiles.push(p);
        }
    });

    socket.on('planeDestroyed', (data) => {
        state.planes = state.planes.filter(p => p.id !== data.planeId);
        createExplosion(data.x, data.y, 'nuke');
        log("AIRCRAFT DESTROYED!");
    });

    socket.on('grantSuperpower', () => {
        log("SUPERPOWER ACTIVATED: ARMOR BOOST + NUKES!");
        state.player.hp = 200; state.player.maxHp = 200;
        state.player.lives += 1;
        state.player.ammo['nuke'] += 10;
        state.player.ammo['laser'] = 99;
        updateHUD();
    });

    socket.on('playerDied', (data) => {
        let name = "ENEMY";
        if (data.id === state.myId) {
            state.player.dead = true;
            state.player.lives = data.lives;
            updateHUD();
            name = "YOU";
        } else if (state.remotePlayers[data.id]) {
            state.remotePlayers[data.id].dead = true;
            state.remotePlayers[data.id].lives = data.lives;
            name = state.remotePlayers[data.id].name;
            createExplosion(state.remotePlayers[data.id].x, state.remotePlayers[data.id].y, 'nuke');
        }
        log(`${name} DESTROYED. LIVES: ${data.lives}`);
        updateScoreboard();
    });

    socket.on('playerRespawn', (data) => {
         if (data.id === state.myId) {
             state.player.dead = false;
             state.player.hp = 100; state.player.maxHp = 100;
             state.player.x = data.x; state.player.y = data.y;
             state.player.vx = 0; state.player.vy = 0;
             updateHUD();
             log("SYSTEM REBOOT: ONLINE");
         } else if (state.remotePlayers[data.id]) {
             state.remotePlayers[data.id].dead = false;
             state.remotePlayers[data.id].x = data.x; state.remotePlayers[data.id].y = data.y;
         }
    });

    socket.on('gameOver', (data) => {
        state.gameActive = false;
        document.getElementById('game-over-screen').classList.remove('hidden');
        document.getElementById('go-score').innerText = "VICTORY: " + data.winner;
    });
}