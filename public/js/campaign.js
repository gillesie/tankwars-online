import { state } from './state.js';
import { Tank } from './entities/Tank.js';
import { Crate } from './entities/Crate.js';
import { generateCampaignTerrain } from './world.js';
import { startGameClient } from './game.js';
import { updateHUD, log, createExplosion } from './ui.js';
import { dist, fxRand } from './utils.js';

// Configuration for the World Map
const LEVELS = [
    { id: 1, x: 150, y: 450, name: "NORMANDY BEACH", type: 'linear', difficulty: 1, length: 4000 },
    { id: 2, x: 250, y: 400, name: "PARIS RUINS", type: 'linear', difficulty: 2, length: 5000 },
    { id: 3, x: 380, y: 350, name: "ALPS PASS", type: 'linear', difficulty: 3, length: 5000 }, // High altitude
    { id: 4, x: 450, y: 280, name: "BERLIN OUTSKIRTS", type: 'linear', difficulty: 4, length: 6000 },
    { id: 5, x: 550, y: 250, name: "WARSAW GATE", type: 'boss', difficulty: 5, length: 2000 }, // BOSS 1
    { id: 6, x: 650, y: 220, name: "MINSK FACTORY", type: 'linear', difficulty: 6, length: 6000 },
    { id: 7, x: 750, y: 180, name: "MOSCOW CITADEL", type: 'boss', difficulty: 8, length: 3000 } // FINAL BOSS
];

export class CampaignManager {
    constructor() {
        this.inMap = true;
        this.mapCanvas = document.getElementById('world-map-canvas');
        this.mapCtx = this.mapCanvas.getContext('2d');
        this.levelActive = false;
        
        // Listen for map clicks
        this.mapCanvas.addEventListener('click', (e) => this.handleMapClick(e));
        
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
        
        this.showMap();
    }

    showMap() {
        this.inMap = true;
        this.levelActive = false;
        state.gameActive = false;
        document.getElementById('ui-layer').classList.add('hidden'); // Hide HUD
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

    drawMap() {
        const ctx = this.mapCtx;
        const w = this.mapCanvas.width;
        const h = this.mapCanvas.height;
        
        // Draw Background (Abstract Euro Map)
        ctx.fillStyle = '#001020';
        ctx.fillRect(0, 0, w, h);
        
        // Draw Grid
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        for(let i=0; i<w; i+=50) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,h); ctx.stroke(); }
        for(let i=0; i<h; i+=50) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(w,i); ctx.stroke(); }

        // Draw Connections
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();
        for(let i=0; i<LEVELS.length-1; i++) {
            const cur = LEVELS[i];
            const next = LEVELS[i+1];
            ctx.moveTo(cur.x, cur.y);
            ctx.lineTo(next.x, next.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw Nodes
        LEVELS.forEach(l => {
            const isUnlocked = l.id <= state.campaignProgress;
            const isCompleted = l.id < state.campaignProgress;
            
            // Halo
            if (isUnlocked && !isCompleted) {
                const pulse = Math.sin(Date.now() * 0.005) * 5;
                ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
                ctx.beginPath(); ctx.arc(l.x, l.y, 15 + pulse, 0, Math.PI*2); ctx.fill();
            }

            // Dot
            ctx.fillStyle = isCompleted ? '#0f0' : (isUnlocked ? '#0ff' : '#555');
            if (l.type === 'boss') ctx.fillStyle = isCompleted ? '#0f0' : (isUnlocked ? '#f00' : '#500');
            
            ctx.beginPath(); ctx.arc(l.x, l.y, 10, 0, Math.PI*2); ctx.fill();
            
            // Text
            ctx.fillStyle = '#fff';
            ctx.font = '12px Orbitron';
            ctx.textAlign = 'center';
            ctx.fillText(l.name, l.x, l.y + 25);
            if(l.type === 'boss') ctx.fillText("(BOSS)", l.x, l.y + 38);
        });
        
        // Title
        ctx.fillStyle = '#0ff';
        ctx.font = '30px Orbitron';
        ctx.fillText("CAMPAIGN MAP: OPERATION EUROPE", w/2, 50);
    }

    handleMapClick(e) {
        if(!this.inMap) return;
        const rect = this.mapCanvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        LEVELS.forEach(l => {
            if (l.id <= state.campaignProgress) {
                if (dist(mx, my, l.x, l.y) < 20) {
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
        
        // Generate Level Terrain
        generateCampaignTerrain(levelData);
        
        // Setup Player
        state.player = new Tank(true, 1, 'player');
        state.player.name = "COMMANDER";
        state.player.x = 200; // Start at left
        state.player.y = -500;
        
        // Populate Enemies based on Difficulty
        this.spawnLevelEnemies(levelData);

        // Update HUD
        document.getElementById('hud-level').innerText = levelData.name.toUpperCase();
        
        this.levelActive = true;
        startGameClient();
    }

    spawnLevelEnemies(levelData) {
        const count = levelData.difficulty * 3;
        const len = levelData.length;
        
        if (levelData.type === 'boss') {
            // Spawn Boss
            const boss = new Tank(false, 2, 'boss_1', true);
            boss.x = len - 500;
            boss.y = -500;
            boss.maxHp = 500 * levelData.difficulty;
            boss.hp = boss.maxHp;
            boss.name = "MEGA TANK";
            boss.behavior = 'boss';
            boss.difficulty = 10;
            state.remotePlayers[boss.id] = boss;
            return;
        }

        // Standard Linear Level Spawns
        for(let i=0; i<count; i++) {
            const xPos = fxRand(800, len - 800);
            const id = `enemy_${i}`;
            const t = new Tank(false, 2, id, true);
            t.x = xPos;
            t.y = -500;
            t.hp = 50 + (levelData.difficulty * 10);
            t.maxHp = t.hp;
            t.difficulty = levelData.difficulty;
            
            // Random Behaviors
            const r = Math.random();
            if (r < 0.3) t.behavior = 'static'; // Turret
            else if (r < 0.6) t.behavior = 'patrol'; // Back and forth
            else t.behavior = 'chase'; // Standard
            
            state.remotePlayers[id] = t;
        }
    }

    update() {
        if (!state.gameActive || !this.levelActive) return;

        // Check Win Condition: Reach the right side
        const levelData = LEVELS.find(l => l.id === state.currentLevelId);
        if (!levelData) return;

        // Check if boss is dead for boss levels
        if (levelData.type === 'boss') {
            const boss = Object.values(state.remotePlayers).find(p => p.behavior === 'boss');
            if (!boss || boss.dead) {
                this.levelComplete(levelData);
            }
        } else {
            // Linear level: Reach end bunker
            if (state.player.x > levelData.length - 300) {
                this.levelComplete(levelData);
            }
        }
        
        // Spawn help crates occasionally
        if (Math.random() < 0.001) {
             const type = ['repair', 'ammo'][Math.floor(Math.random()*2)];
             const x = state.player.x + fxRand(-500, 500);
             state.crates.push(new Crate(`drop_${Date.now()}`, x, -500, type));
        }
    }

    levelComplete(levelData) {
        this.levelActive = false;
        state.gameActive = false;
        log("MISSION ACCOMPLISHED!");
        
        createExplosion(state.player.x, state.player.y, 'heal'); // Celebration fx
        
        setTimeout(() => {
            alert(`SECTOR ${levelData.name} SECURED!`);
            if (state.currentLevelId === state.campaignProgress) {
                state.campaignProgress++;
            }
            if (state.campaignProgress > LEVELS.length) {
                alert("CONGRATULATIONS! EUROPE IS FREE!");
                state.campaignProgress = 1;
            }
            this.showMap();
        }, 2000);
    }
}