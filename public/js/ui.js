import { state } from './state.js';
import { Particle } from './entities/Particle.js';
import { fxRand } from './utils.js';

export function log(msg) {
    const div = document.getElementById('battle-log');
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerText = "> " + msg;
    div.appendChild(entry);
    if(div.children.length > 5) div.removeChild(div.firstChild);
}

export function updateHUD() {
    if (!state.player) return;
    const p = state.player;
    document.getElementById('hud-hp').style.width = (p.hp / p.maxHp * 100) + "%";
    document.getElementById('hud-hp-text').innerText = Math.ceil(p.hp) + "%";
    document.getElementById('hud-shield').style.width = (p.shield / 50 * 100) + "%"; 
    document.getElementById('hud-lives').innerText = p.lives;
    
    const weapons = ['standard', 'scatter', 'laser', 'seeker', 'nuke', 'builder'];
    weapons.forEach(w => {
        const btn = document.getElementById('btn-'+w);
        const ammoSpan = document.getElementById('ammo-'+w);
        if(btn) {
            let val = p.ammo[w] === Infinity ? '∞' : p.ammo[w];
            ammoSpan.innerText = val;
            if (p.currentWeapon === w) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });

    // CAMPAIGN FIX: Hide power overlay in campaign mode
    if (state.gameMode === 'campaign') {
        document.getElementById('power-overlay').style.display = 'none';
    } else {
        document.getElementById('power-overlay').style.display = 'block';
        if(state.isCharging) {
            const duration = Date.now() - state.mousePressedTime;
            const pct = Math.min((duration / 1000) * 100, 100);
            document.getElementById('hud-power').style.width = pct + "%";
            document.getElementById('power-text').innerText = Math.floor(pct) + "%";
        } else {
            document.getElementById('power-text').innerText = "0%";
        }
    }
}

export function updateScoreboard() {
    if (!state.player) return;
    
    // CAMPAIGN FIX: Hide Scoreboard (Blue/Red box)
    if (state.gameMode === 'campaign') {
        document.getElementById('scoreboard').style.display = 'none';
        return;
    }
    
    document.getElementById('scoreboard').style.display = 'block';

    const blueList = document.getElementById('sb-list-1');
    const redList = document.getElementById('sb-list-2');
    blueList.innerHTML = ''; redList.innerHTML = '';

    const allPlayers = [state.player, ...Object.values(state.remotePlayers)]; 
    let blueCount = 0; let redCount = 0;

    allPlayers.forEach(p => {
        // Single Player: Hide dead enemies
        if (state.gameMode === 'sp' && p.dead && p.team !== state.player.team) return;

        const div = document.createElement('div');
        div.className = 'sb-row ' + (p.team === 1 ? 'sb-blue' : 'sb-red');
        const status = p.dead ? (p.lives > 0 ? "(RESPAWNING)" : "(K.I.A.)") : "";
        div.innerText = `${p.name} [${p.lives}] ${status}`;
        
        if(p.team === 1) { blueList.appendChild(div); blueCount++; }
        else { redList.appendChild(div); redCount++; }
    });

    document.getElementById('sb-count-1').innerText = blueCount;
    document.getElementById('sb-count-2').innerText = redCount;
}

export function updateLobbyStatus() {
    const count = Object.keys(state.remotePlayers).length + 1;
    document.getElementById('waiting-player-list').innerHTML = 
       `PILOTS READY: ${count}<br><span style="font-size:12px; color:#555;">WAITING FOR HOST TO START...</span>`;
}

export function createExplosion(x, y, type) {
    const count = type === 'nuke' ? 50 : 15;
    const color = type === 'nuke' ? '#ff0' : (type === 'heal' ? '#0f0' : '#f60');
    state.screenShake = type === 'nuke' ? 20 : 5;
    for(let i=0; i<count; i++) state.particles.push(new Particle(x, y, color, 'fire'));
}

export function createDebris(x, y, w, h) {
    const count = Math.min(w/5, 20);
    for(let i=0; i<count; i++) {
        const px = x + fxRand(0, w);
        const py = y + fxRand(0, h);
        const color = Math.random() > 0.5 ? '#555' : '#333';
        state.particles.push(new Particle(px, py, color, 'smoke'));
    }
}