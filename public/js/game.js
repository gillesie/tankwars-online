import { state } from './state.js';
import { Tank } from './entities/Tank.js';
import { Crate } from './entities/Crate.js';
import { generateCampaignTerrain } from './world.js';
import { startGameClient } from './game.js';
import { updateHUD, log, createExplosion } from './ui.js';
import { dist, fxRand } from './utils.js';
import { FloatingText } from './entities/FloatingText.js';

// --- NEW CAMPAIGN MAP (20 Levels, Branching Paths) ---
const LEVELS = [
    { id: 1, x: 50, y: 300, name: "BOOT CAMP", type: 'linear', difficulty: 1, length: 3000, unlock: null, next: [2] },
    { id: 2, x: 120, y: 300, name: "OUTPOST", type: 'linear', difficulty: 1, length: 4000, unlock: 'scatter', next: [3, 4] },
    { id: 3, x: 200, y: 200, name: "NORTH RIDGE", type: 'linear', difficulty: 2, length: 4000, unlock: null, next: [5] },
    { id: 4, x: 200, y: 400, name: "SOUTH SWAMP", type: 'linear', difficulty: 2, length: 4000, unlock: null, next: [6] },
    { id: 5, x: 280, y: 180, name: "FROZEN PEAK", type: 'linear', difficulty: 3, length: 5000, unlock: null, next: [7] },
    { id: 6, x: 280, y: 420, name: "MUDDY WATERS", type: 'linear', difficulty: 3, length: 5000, unlock: null, next: [7] },
    { id: 7, x: 360, y: 300, name: "IRON GATE", type: 'boss', difficulty: 4, length: 3000, unlock: 'seeker', next: [8] },
    { id: 8, x: 440, y: 300, name: "DUST PLAINS", type: 'linear', difficulty: 4, length: 5000, unlock: null, next: [9, 10] },
    { id: 9, x: 520, y: 250, name: "SANDSTORM", type: 'linear', difficulty: 5, length: 6000, unlock: null, next: [11] },
    { id: 10, x: 520, y: 350, name: "CANYON RUN", type: 'linear', difficulty: 5, length: 6000, unlock: null, next: [11] },
    { id: 11, x: 600, y: 300, name: "STEEL WORKS", type: 'linear', difficulty: 6, length: 6000, unlock: 'laser', next: [12] },
    { id: 12, x: 680, y: 300, name: "REACTOR CORE", type: 'linear', difficulty: 7, length: 5000, unlock: null, next: [13, 14, 15] },
    { id: 13, x: 760, y: 150, name: "SKY FORTRESS", type: 'linear', difficulty: 8, length: 7000, unlock: null, next: [16] },
    { id: 14, x: 780, y: 300, name: "MAGMA CORE", type: 'linear', difficulty: 8, length: 6000, unlock: null, next: [16] },
    { id: 15, x: 760, y: 450, name: "DEEP OCEAN", type: 'linear', difficulty: 8, length: 7000, unlock: null, next: [16] },
    { id: 16, x: 850, y: 300, name: "LAST LINE", type: 'boss', difficulty: 9, length: 4000, unlock: 'nuke', next: [17] },
    { id: 17, x: 920, y: 300, name: "THE CORRIDOR", type: 'linear', difficulty: 10, length: 8000, unlock: 'builder', next: [18] },
    { id: 18, x: 990, y: 300, name: "OMEGA BASE", type: 'boss', difficulty: 12, length: 4000, unlock: null, next: [19] },
    { id: 19, x: 1060, y: 300, name: "VICTORY LAP", type: 'linear', difficulty: 1, length: 2000, unlock: null, next: [20] },
    { id: 20, x: 1150, y: 300, name: "DEV ROOM", type: 'linear', difficulty: 15, length: 5000, unlock: null, next: [] }
];

const BASE_MAP_W = 1200;
const BASE_MAP_H = 600;

export class CampaignManager {
    constructor() {
        this.inMap = true;
        this.mapCanvas = document.getElementById('world-map-canvas');
        this.mapCtx = this.mapCanvas.getContext('2d');
        this.levelActive = false;
        
        // Expose levels for game loop access
        this.LEVELS = LEVELS;
        this.warningCooldown = 0;
        this.hoveredLevel = null;
        
        // Listeners
        this.mapCanvas.addEventListener('click', (e) => this.handleMapClick(e));
        this.mapCanvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        
        // Resize logic
        this.resizeMap();
        window.addEventListener('resize', () => this.resizeMap());
    }

    resizeMap() {
        const container = document.getElementById('world-map-container');
        if(container && !container.classList.contains('hidden')) {
            this.mapCanvas.width = container.clientWidth;
            this.mapCanvas.height = container.clientHeight;
            this.drawMap();
        }
    }

    init() {
        state.isMultiplayer = false;
        state.gameMode = 'campaign';
        state.campaignManager = this;
        state.myId = 'player';
        state.myTeam = 1;
        
        // Ensure progress array exists
        if (!state.completedLevels) state.completedLevels = [];
        
        this.showMap();
    }

    showMap() {
        this.inMap = true;
        this.levelActive = false;
        state.gameActive = false;
        document.getElementById('ui-layer').classList.add('hidden'); 
        document.getElementById('world-map-container').classList.remove('hidden');
        document.getElementById('gameCanvas').style.display = 'none';
        
        this.resizeMap();
        this.animateMap();
    }

    animateMap() {
        if(!this.inMap) return;
        this.drawMap();
        requestAnimationFrame(() => this.animateMap());
    }

    getScale() {
        return {
            x: this.mapCanvas.width / BASE_MAP_W,
            y: this.mapCanvas.height / BASE_MAP_H
        };
    }

    handleMouseMove(e) {
        if(!this.inMap) return;
        const rect = this.mapCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const s = this.getScale();
        
        this.hoveredLevel = null;
        for (let l of LEVELS) {
            const lx = l.x * s.x;
            const ly = l.y * s.y;
            if (dist(mx, my, lx, ly) < 20) {
                this.hoveredLevel = l;
                break;
            }
        }
    }

    isLevelUnlocked(id) {
        if (id === 1) return true;
        // Check if ANY parent node is in completedLevels
        const parents = LEVELS.filter(l => l.next && l.next.includes(id));
        for (let p of parents) {
            if (state.completedLevels.includes(p.id)) return true;
        }
        return false;
    }

    drawMap() {
        const ctx = this.mapCtx;
        const w = this.mapCanvas.width;
        const h = this.mapCanvas.height;
        const s = this.getScale();
        
        // 1. Digital Background
        ctx.fillStyle = '#020b14';
        ctx.fillRect(0, 0, w, h);

        // Grid
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        for(let i=0; i<w; i+=40) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,h); ctx.stroke(); }
        for(let i=0; i<h; i+=40) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(w,i); ctx.stroke(); }

        // 2. Draw Connections
        ctx.save();
        LEVELS.forEach(l => {
            if (l.next) {
                l.next.forEach(nextId => {
                    const nextL = LEVELS.find(x => x.id === nextId);
                    if (nextL) {
                        const unlocked = this.isLevelUnlocked(nextL.id);
                        ctx.strokeStyle = unlocked ? '#0aa' : '#223';
                        ctx.lineWidth = unlocked ? 3 : 1;
                        if (!unlocked) ctx.setLineDash([5, 10]);
                        else ctx.setLineDash([]);
                        
                        ctx.beginPath();
                        ctx.moveTo(l.x * s.x, l.y * s.y);
                        ctx.lineTo(nextL.x * s.x, nextL.y * s.y);
                        ctx.stroke();
                    }
                });
            }
        });
        ctx.restore();

        // 3. Draw Nodes
        LEVELS.forEach(l => {
            const isCompleted = state.completedLevels.includes(l.id);
            const isUnlocked = this.isLevelUnlocked(l.id);
            
            const lx = l.x * s.x;
            const ly = l.y * s.y;
            
            // Halo for available
            if (isUnlocked && !isCompleted) {
                const pulse = Math.sin(Date.now() * 0.005) * 5;
                ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
                ctx.beginPath(); ctx.arc(lx, ly, 14 + pulse, 0, Math.PI*2); ctx.fill();
            }

            // Dot
            ctx.fillStyle = isCompleted ? '#0f0' : (isUnlocked ? '#0ff' : '#444');
            if (l.type === 'boss') ctx.fillStyle = isCompleted ? '#0f0' : (isUnlocked ? '#f00' : '#522');
            
            ctx.beginPath(); ctx.arc(lx, ly, 10, 0, Math.PI*2); ctx.fill();
            
            // Text
            if (isUnlocked || isCompleted) {
                ctx.fillStyle = '#fff';
                ctx.font = '10px Orbitron';
                ctx.textAlign = 'center';
                ctx.fillText(l.name, lx, ly + 25);
            }
        });
        
        // 4. Hover Tooltip
        if (this.hoveredLevel) {
            const l = this.hoveredLevel;
            const lx = l.x * s.x;
            const ly = l.y * s.y;
            const isUnlocked = this.isLevelUnlocked(l.id);
            
            const boxW = 160;
            const boxH = 70;
            let bx = lx + 20; let by = ly - 50;
            if (bx + boxW > w) bx = lx - boxW - 20; // Flip if off screen
            
            ctx.fillStyle = 'rgba(0, 15, 30, 0.95)';
            ctx.strokeStyle = isUnlocked ? '#0ff' : '#555';
            ctx.lineWidth = 1;
            ctx.fillRect(bx, by, boxW, boxH);
            ctx.strokeRect(bx, by, boxW, boxH);
            
            ctx.textAlign = 'left';
            ctx.fillStyle = isUnlocked ? '#fff' : '#888';
            ctx.font = 'bold 12px Orbitron';
            ctx.fillText(l.name, bx + 10, by + 20);
            
            ctx.font = '10px Orbitron';
            ctx.fillStyle = '#aaa';
            ctx.fillText(`Type: ${l.type.toUpperCase()}`, bx + 10, by + 35);
            
            if (l.unlock) {
                ctx.fillStyle = '#ff0';
                ctx.fillText(`REWARD: ${l.unlock.toUpperCase()}`, bx + 10, by + 55);
            } else {
                 ctx.fillStyle = '#555';
                 ctx.fillText(`REWARD: ---`, bx + 10, by + 55);
            }
            
            if (!isUnlocked) {
                 ctx.fillStyle = '#f00';
                 ctx.textAlign = 'right';
                 ctx.fillText("LOCKED", bx + boxW - 10, by + 20);
            }
        }
        
        // --- NEW: DRAW LEGEND ---
        this.drawLegend(ctx, w, h);
    }

    drawLegend(ctx, w, h) {
        const pX = 20; const pY = h - 220;
        const pW = 200; const pH = 200;
        
        ctx.fillStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeStyle = '#055';
        ctx.lineWidth = 1;
        ctx.fillRect(pX, pY, pW, pH);
        ctx.strokeRect(pX, pY, pW, pH);
        
        ctx.font = '12px Orbitron';
        ctx.fillStyle = '#0ff';
        ctx.textAlign = 'left';
        ctx.fillText("SUPPLY INTEL", pX + 10, pY + 20);
        
        const items = [
            { c: '#0f0', t: 'REPAIR', s: '+' },
            { c: '#0ff', t: 'AMMO', s: 'iii' },
            { c: '#f60', t: 'SCATTER', s: '?' },
            { c: '#f0f', t: 'SEEKER', s: 'S' },
            { c: '#ff0', t: 'NUKE', s: '☢' },
            { c: '#fff', t: 'SHIELD', s: 'O' },
            { c: '#a0a', t: 'PLATFORMS', s: '⚒' },
            { c: '#fff', t: 'EXTRA LIFE', s: '♥' }
        ];
        
        let yOff = 40;
        items.forEach(i => {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.strokeStyle = i.c;
            ctx.fillRect(pX + 10, pY + yOff, 15, 15);
            ctx.strokeRect(pX + 10, pY + yOff, 15, 15);
            
            ctx.fillStyle = i.c;
            if(i.t === 'EXTRA LIFE') ctx.fillStyle = '#f00';
            ctx.textAlign = 'center';
            ctx.font = '10px Arial';
            ctx.fillText(i.s, pX + 17, pY + yOff + 11);
            
            ctx.fillStyle = '#aaa';
            ctx.textAlign = 'left';
            ctx.font = '10px Orbitron';
            ctx.fillText(i.t, pX + 35, pY + yOff + 11);
            
            yOff += 20;
        });
    }

    handleMapClick(e) {
        if(!this.inMap) return;
        const rect = this.mapCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const s = this.getScale();

        LEVELS.forEach(l => {
            const lx = l.x * s.x;
            const ly = l.y * s.y;
            if (dist(mx, my, lx, ly) < 20) {
                if (this.isLevelUnlocked(l.id)) {
                    this.startLevel(l);
                }
            }
        });
    }

    startLevel(levelData) {
        this.inMap = false;
        state.currentLevelId = levelData.id;
        document.getElementById('world-map-container').classList.add('hidden');
        document.getElementById('ui-layer').classList.remove('hidden');
        document.getElementById('gameCanvas').style.display = 'block';
        
        // Reset Game State
        state.remotePlayers = {}; 
        state.projectiles = [];
        state.crates = [];
        state.planes = [];
        state.blocks = [];
        state.platforms = [];
        state.flag.active = false;
        state.flag.raised = false;
        state.flag.currentHeight = 0;
        state.flag.raising = false;
        state.centralMsg.timer = 0;
        
        // Generate Level Terrain
        generateCampaignTerrain(levelData);
        
        // --- NEW: SET LEVEL DIMENSIONS ---
        state.levelWidth = levelData.length || 6000;
        state.levelHeight = 2500; // Increased height for deep valleys
        
        // Setup Player
        state.player = new Tank(true, 1, 'player');
        state.player.name = "COMMANDER";
        state.player.x = 200;
        state.player.y = -500;
        
        // --- NEW: DETERMINE UNLOCKED WEAPONS ---
        state.unlockedWeapons = ['standard', 'builder']; // Base weapons
        state.player.ammo = { 'standard': Infinity, 'scatter': 0, 'laser': 0, 'nuke': 0, 'seeker': 0, 'builder': 0 }; // Builder starts at 0
        state.player.currentWeapon = 'standard';
        
        // Iterate through COMPLETED levels to build loadout
        LEVELS.forEach(l => {
            if (state.completedLevels.includes(l.id) && l.unlock) {
                state.player.ammo[l.unlock] += 5; // Starter ammo for unlocked guns
                if (!state.unlockedWeapons.includes(l.unlock)) {
                    state.unlockedWeapons.push(l.unlock);
                }
            }
        });
        
        // Announce current level unlock
        if (levelData.unlock) {
            setTimeout(() => {
                log(`INTEL: ${levelData.unlock.toUpperCase()} TECH DETECTED`);
                state.centralMsg.text = `FIND: ${levelData.unlock.toUpperCase()}`;
                state.centralMsg.color = "#ff0";
                state.centralMsg.timer = 120;
            }, 1000);
        }

        this.spawnLevelEnemies(levelData);

        document.getElementById('hud-level').innerText = levelData.name.toUpperCase();
        updateHUD();
        
        this.levelActive = true;
        startGameClient();
    }

    spawnLevelEnemies(levelData) {
        const count = levelData.difficulty * 3;
        const len = levelData.length;
        
        if (levelData.type === 'boss') {
            const boss = new Tank(false, 2, 'boss_1', true);
            boss.x = len - 500;
            boss.y = -500;
            
            // --- BOSS NERF FOR LEVEL 7 ---
            if (levelData.id === 7) { 
                 boss.maxHp = 1500; // Easier than standard scaling
                 boss.name = "GATE KEEPER";
                 boss.difficulty = 4;
            } else {
                 boss.maxHp = 500 * levelData.difficulty;
                 boss.name = "MEGA TANK";
                 boss.difficulty = 10;
            }
            
            boss.hp = boss.maxHp;
            boss.behavior = 'boss';
            state.remotePlayers[boss.id] = boss;
            return;
        }

        // Standard Spawns
        for(let i=0; i<count; i++) {
            const xPos = fxRand(800, len - 800);
            const id = `enemy_${i}`;
            const t = new Tank(false, 2, id, true);
            t.x = xPos;
            t.y = -500;
            t.hp = 50 + (levelData.difficulty * 10);
            t.maxHp = t.hp;
            t.difficulty = levelData.difficulty;
            
            const r = Math.random();
            if (r < 0.3) t.behavior = 'static'; 
            else if (r < 0.6) t.behavior = 'patrol'; 
            else t.behavior = 'chase'; 
            
            state.remotePlayers[id] = t;
        }
    }

    update() {
        if (!state.gameActive || !this.levelActive) return;

        if (this.warningCooldown > 0) this.warningCooldown--;

        // Check Flag Interaction
        if (state.flag.active && !state.flag.raised && !state.flag.raising) {
            if (Math.abs(state.player.x - state.flag.x) < 50) {
                const enemies = Object.values(state.remotePlayers).filter(e => !e.dead);
                if (enemies.length > 0) {
                     if (this.warningCooldown <= 0) {
                         state.centralMsg.text = "ELIMINATE ALL HOSTILES";
                         state.centralMsg.color = "#f00";
                         state.centralMsg.timer = 120;
                         this.warningCooldown = 180;
                     }
                } else {
                    state.flag.raising = true;
                    log("CAPTURING SECTOR...");
                }
            }
        }

        // Handle Flag Animation
        if (state.flag.raising) {
            state.flag.currentHeight += 1; // Animation speed
            if (state.flag.currentHeight >= state.flag.poleHeight - 10) {
                state.flag.raised = true;
                state.flag.raising = false;
                this.levelComplete(LEVELS.find(l => l.id === state.currentLevelId));
            }
        }
        
        // Spawn help crates occasionally
        if (Math.random() < 0.002) {
             let possibleDrops = ['repair', 'ammo', 'extra_life', 'builder']; 
             
             // Add unlocked weapons to pool
             LEVELS.forEach(l => {
                 if (state.completedLevels.includes(l.id) && l.unlock) possibleDrops.push(l.unlock);
             });
             
             const type = possibleDrops[Math.floor(Math.random()*possibleDrops.length)];
             const x = state.player.x + fxRand(-500, 500);
             state.crates.push(new Crate(`drop_${Date.now()}`, x, -500, type));
        }
    }

    levelComplete(levelData) {
        this.levelActive = false;
        state.gameActive = false;
        log("MISSION SUCCESSFUL");
        
        createExplosion(state.flag.x, state.flag.y, 'heal'); // Celebration fx
        
        state.centralMsg.text = "SECTOR SECURED";
        state.centralMsg.color = "#0f0";
        state.centralMsg.timer = 180;

        // Save Progress
        if (!state.completedLevels.includes(levelData.id)) {
            state.completedLevels.push(levelData.id);
        }

        setTimeout(() => {
            if (levelData.id === 20) { // Final Level
                state.centralMsg.text = "CAMPAIGN VICTORY!";
                setTimeout(() => {
                    this.showMap();
                }, 4000);
            } else {
                this.showMap();
            }
        }, 3000);
    }
}