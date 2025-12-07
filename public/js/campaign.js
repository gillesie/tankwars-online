import { state } from './state.js';
import { Tank } from './entities/Tank.js';
import { Crate } from './entities/Crate.js';
import { generateCampaignTerrain } from './world.js';
import { startGameClient } from './game.js';
import { updateHUD, log, createExplosion } from './ui.js';
import { dist, fxRand } from './utils.js';
import { FloatingText } from './entities/FloatingText.js';

// Configuration for the World Map with Weapon Unlocks
const LEVELS = [
    { id: 1, x: 150, y: 450, name: "NORMANDY BEACH", type: 'linear', difficulty: 1, length: 4000, unlock: null },
    { id: 2, x: 250, y: 400, name: "PARIS RUINS", type: 'linear', difficulty: 2, length: 5000, unlock: 'scatter' },
    { id: 3, x: 380, y: 350, name: "ALPS PASS", type: 'linear', difficulty: 3, length: 5000, unlock: 'seeker' }, 
    { id: 4, x: 450, y: 280, name: "BERLIN OUTSKIRTS", type: 'linear', difficulty: 4, length: 6000, unlock: 'laser' },
    { id: 5, x: 550, y: 250, name: "WARSAW GATE", type: 'boss', difficulty: 5, length: 2000, unlock: 'nuke' }, 
    { id: 6, x: 650, y: 220, name: "MINSK FACTORY", type: 'linear', difficulty: 6, length: 6000, unlock: 'builder' },
    { id: 7, x: 750, y: 180, name: "MOSCOW CITADEL", type: 'boss', difficulty: 8, length: 3000, unlock: null } 
];

export class CampaignManager {
    constructor() {
        this.inMap = true;
        this.mapCanvas = document.getElementById('world-map-canvas');
        this.mapCtx = this.mapCanvas.getContext('2d');
        this.levelActive = false;
        
        // Expose levels for game loop access
        this.LEVELS = LEVELS;
        
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
        
        // Draw Background (Ocean)
        ctx.fillStyle = '#001020';
        ctx.fillRect(0, 0, w, h);

        // --- DRAW EUROPE (Simplified) ---
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = '#0a2a40';
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 2;
        
        // Simple shape approximating Europe coords scaled to canvas
        const scaleX = w / 1000; 
        const scaleY = h / 600;
        
        ctx.moveTo(100 * scaleX, 450 * scaleY); // Spain
        ctx.lineTo(200 * scaleX, 400 * scaleY); // France
        ctx.lineTo(250 * scaleX, 300 * scaleY); // UK/North
        ctx.lineTo(400 * scaleX, 280 * scaleY); // Germany/North
        ctx.lineTo(500 * scaleX, 200 * scaleY); // Scandinavia
        ctx.lineTo(700 * scaleX, 220 * scaleY); // Russia North
        ctx.lineTo(800 * scaleX, 400 * scaleY); // Russia South
        ctx.lineTo(600 * scaleX, 450 * scaleY); // Black Sea area
        ctx.lineTo(500 * scaleX, 500 * scaleY); // Italy/Balkans
        ctx.lineTo(300 * scaleX, 480 * scaleY); // Italy
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        
        // Draw Grid Overlay
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.05)';
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
            // Scale points based on fixed design resolution (800x600 ref) if needed, 
            // but LEVELS coords are fixed pixels in the prompt. We'll assume fixed layout or simple scaling.
            // Using the raw coordinates from LEVELS for simplicity as requested.
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
        ctx.textAlign = 'center';
        ctx.fillText("CAMPAIGN MAP: OPERATION EUROPE", w/2, 50);
        
        ctx.font = '14px Orbitron';
        ctx.fillStyle = '#aaa';
        ctx.fillText("CLICK A FLASHING NODE TO DEPLOY", w/2, 80);
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
        state.flag.active = false;
        state.flag.raised = false;
        state.flag.currentHeight = 0;
        state.flag.raising = false;
        
        // Generate Level Terrain
        generateCampaignTerrain(levelData);
        
        // Setup Player
        state.player = new Tank(true, 1, 'player');
        state.player.name = "COMMANDER";
        state.player.x = 200; // Start at left
        state.player.y = -500;
        
        // --- WEAPON LOADOUT LOGIC ---
        // Reset Ammo
        state.player.ammo = { 'standard': Infinity, 'scatter': 0, 'laser': 0, 'nuke': 0, 'seeker': 0, 'builder': 0 };
        state.player.currentWeapon = 'standard';
        
        // Check previously unlocked weapons (all levels before this one)
        LEVELS.forEach(l => {
            if (l.id < levelData.id && l.unlock) {
                // Give some starter ammo for unlocked weapons
                state.player.ammo[l.unlock] += 5; 
            }
        });
        
        // Announce current level unlock
        if (levelData.unlock) {
            setTimeout(() => {
                log(`INTEL: ${levelData.unlock.toUpperCase()} WEAPON AVAILABLE IN CRATES`);
                state.floatingTexts.push(new FloatingText(state.player.x, state.player.y - 100, `UNLOCK: ${levelData.unlock.toUpperCase()}`, '#ff0', 20));
            }, 2000);
        }

        // Populate Enemies based on Difficulty
        this.spawnLevelEnemies(levelData);

        // Update HUD
        document.getElementById('hud-level').innerText = levelData.name.toUpperCase();
        updateHUD();
        
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

        // Check Flag Interaction
        if (state.flag.active && !state.flag.raised && !state.flag.raising) {
            // Check collision with flag pole area
            if (Math.abs(state.player.x - state.flag.x) < 50) {
                // Count enemies
                const enemies = Object.values(state.remotePlayers).filter(e => !e.dead);
                if (enemies.length > 0) {
                     // Warn player
                     if (Math.floor(Date.now() / 1000) % 2 === 0) { // Throttle messages
                        state.floatingTexts.push(new FloatingText(state.player.x, state.player.y - 60, "ELIMINATE ALL HOSTILES!", '#f00', 16));
                     }
                } else {
                    // Start Raising Flag
                    state.flag.raising = true;
                    log("SECURING SECTOR...");
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
             // Only spawn ammo for weapons unlocked SO FAR
             const levelData = LEVELS.find(l => l.id === state.currentLevelId);
             let possibleDrops = ['repair', 'ammo'];
             
             // Add unlocked weapons to pool
             LEVELS.forEach(l => {
                 if (l.id <= levelData.id && l.unlock) possibleDrops.push(l.unlock);
             });
             
             const type = possibleDrops[Math.floor(Math.random()*possibleDrops.length)];
             const x = state.player.x + fxRand(-500, 500);
             state.crates.push(new Crate(`drop_${Date.now()}`, x, -500, type));
        }
    }

    levelComplete(levelData) {
        this.levelActive = false;
        state.gameActive = false;
        log("MISSION ACCOMPLISHED!");
        
        createExplosion(state.flag.x, state.flag.y, 'heal'); // Celebration fx
        
        setTimeout(() => {
            if (state.currentLevelId === state.campaignProgress) {
                state.campaignProgress++;
            }
            if (state.campaignProgress > LEVELS.length) {
                alert("CONGRATULATIONS! EUROPE IS FREE!");
                state.campaignProgress = 1;
            } else {
                alert(`SECTOR ${levelData.name} SECURED!`);
            }
            this.showMap();
        }, 3000);
    }
}