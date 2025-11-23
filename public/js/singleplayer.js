import { state } from './state.js';
import { Tank } from './entities/Tank.js';
import { Crate } from './entities/Crate.js';
import { generateTerrain } from './world.js';
import { startGameClient } from './game.js';
import { updateHUD, log, updateScoreboard } from './ui.js';
import { rand, fxRand } from './utils.js'; 

export class SinglePlayerManager {
    constructor() {
        this.wave = 1;
        this.spawnTimer = 0;
        this.waveInProgress = false;
    }

    init() {
        state.isMultiplayer = false;
        state.gameMode = 'sp';
        state.spManager = this;
        state.myId = 'player';
        state.myTeam = 1;
        state.remotePlayers = {}; 
        state.projectiles = [];
        state.crates = [];
        state.planes = [];
        
        // Setup Player
        generateTerrain([]);
        state.player = new Tank(true, 1, 'player');
        state.player.name = "HERO";
        
        // Override Socket logic in UI
        document.getElementById('hud-level').innerText = "WAVE 1";
        
        startGameClient();
        this.startWave(1);
    }

    startWave(num) {
        this.wave = num;
        this.waveInProgress = true;
        log(`WARNING: WAVE ${num} APPROACHING`);
        document.getElementById('hud-level').innerText = `WAVE ${num}`;

        const enemyCount = Math.min(3 + num, 10);
        let spawned = 0;
        
        // Spawn interval
        const interval = setInterval(() => {
            if (!state.gameActive) { clearInterval(interval); return; }
            this.spawnEnemy();
            spawned++;
            if(spawned >= enemyCount) clearInterval(interval);
        }, 1000);
    }

    spawnEnemy() {
        const id = `cpu_${Date.now()}_${Math.random()}`;
        
        const x = fxRand(1000, 5000); 
        
        const tank = new Tank(false, 2, id, true); 
        tank.isLocal = false; 
        tank.isAI = true;
        tank.team = 2;
        tank.x = x;
        tank.y = -500;
        
        // Set Difficulty based on Wave
        tank.difficulty = this.wave; 
        
        // Difficulty scaling for HP
        tank.maxHp = 50 + (this.wave * 10);
        tank.hp = tank.maxHp;
        
        state.remotePlayers[id] = tank;
        updateScoreboard();
    }

    update() {
        if (!state.gameActive) return;

        // Check Wave Clear
        const enemies = Object.values(state.remotePlayers);
        // In SP, we might keep dead tanks in the array briefly for animations, 
        // but logic counts only alive ones.
        const aliveEnemies = enemies.filter(e => !e.dead).length;

        if (this.waveInProgress && enemies.length > 0 && aliveEnemies === 0) {
            this.waveInProgress = false;
            log("SECTOR CLEAR. REINFORCEMENTS IN 5s...");
            state.player.hp = Math.min(state.player.hp + 50, state.player.maxHp);
            updateHUD();
            
            setTimeout(() => {
                if(state.gameActive) this.startWave(this.wave + 1);
            }, 5000);
        }
    }

    onEnemyKilled(tank) {
        log(`DESTROYED ${tank.name}`);
        state.enemiesKilled++;
        
        // Drop Crate (50% chance)
        if (Math.random() < 0.5) {
            const type = ['repair', 'ammo', 'shield', 'scatter', 'seeker', 'nuke'][Math.floor(Math.random() * 6)];
            const crate = new Crate(`crate_${Date.now()}`, tank.x, tank.y, type);
            state.crates.push(crate);
        }
        
        updateScoreboard();
    }

    endGame() {
        state.gameActive = false;
        document.getElementById('game-over-screen').classList.remove('hidden');
        document.getElementById('go-score').innerText = `SURVIVED ${this.wave} WAVES`;
    }
}