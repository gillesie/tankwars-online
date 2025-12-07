import { state } from './state.js';
import { TERRAIN_WIDTH, WORLD_HEIGHT, GRAVITY } from './config.js';
import { drawTerrain, getTerrainHeight } from './world.js';
import { clamp, fxRand } from './utils.js';
import { log } from './ui.js';
import { initInput } from './input.js';

let lastTime = 0;

export function init() {
    state.canvas = document.getElementById('gameCanvas');
    state.ctx = state.canvas.getContext('2d');
    state.minimapCanvas = document.getElementById('minimapCanvas');
    state.minimapCtx = state.minimapCanvas.getContext('2d');
    
    state.width = state.canvas.width = window.innerWidth;
    state.height = state.canvas.height = window.innerHeight;
    state.minimapCanvas.width = 300; 
    state.minimapCanvas.height = 180;

    initInput();
    animate();
}

export function startGameClient() {
    document.getElementById('mp-lobby-screen').classList.add('hidden');
    document.getElementById('scoreboard').style.display = 'block';
    
    if (state.isMultiplayer && state.socket && state.socket.data) {
        document.getElementById('hud-level').innerText = "SECTOR: " + (state.socket.data.room || "ONLINE");
    }
    
    state.gameActive = true;
    log("MISSION START");
}

function drawTrajectory(ctx, tank, scaleX = 1, scaleY = 1, offsetX = 0, offsetY = 0) {
    const duration = Date.now() - state.mousePressedTime;
    let power = Math.min(duration / 40, 25);
    power = Math.max(power, 2);

    const rad = tank.turretAngle * (Math.PI / 180);
    let startX = tank.x + Math.cos(rad) * 20;
    let startY = (tank.y - 15) + Math.sin(rad) * 20;

    ctx.beginPath();
    // Apply scale/offset only for drawing
    ctx.moveTo(startX * scaleX + offsetX, startY * scaleY + offsetY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2 * scaleX; // Scale line width too roughly
    if(scaleX === 1) ctx.setLineDash([5, 5]);

    let simX = startX;
    let simY = startY;
    let simVx = Math.cos(rad) * power;
    let simVy = Math.sin(rad) * power;
    
    if (tank.currentWeapon === 'laser') {
        simVx *= 2; simVy *= 2;
        ctx.lineTo((simX + simVx * 200) * scaleX + offsetX, (simY + simVy * 200) * scaleY + offsetY);
        ctx.stroke(); if(scaleX === 1) ctx.setLineDash([]); return;
    }

    for(let i=0; i<100; i++) {
        simVy += GRAVITY;
        if (tank.currentWeapon !== 'seeker') simVx += state.wind;
        simX += simVx; simY += simVy;
        
        // Draw point mapped to context
        ctx.lineTo(simX * scaleX + offsetX, simY * scaleY + offsetY);
        
        if (simY >= getTerrainHeight(simX)) break;
    }
    ctx.stroke(); 
    if(scaleX === 1) ctx.setLineDash([]);
}

function drawMinimap() {
    const ctx = state.minimapCtx;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 300, 180);
    const scaleX = 300 / TERRAIN_WIDTH;
    const scaleY = 180 / WORLD_HEIGHT; 
    
    ctx.strokeStyle = '#055';
    ctx.beginPath(); ctx.moveTo(0, 180);
    for(let p of state.terrainPoints) { if (p.x % 100 < 20) ctx.lineTo(p.x * scaleX, p.y * scaleY); }
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.beginPath();
    state.platforms.forEach(p => {
         if(p.type === 'unbreakable') ctx.strokeStyle = '#555';
         else ctx.strokeStyle = '#aaa';
         ctx.moveTo(p.x * scaleX, p.y * scaleY);
         ctx.lineTo((p.x + p.width) * scaleX, (p.y + (p.width * Math.tan(p.angle * Math.PI/180))) * scaleY);
    });
    ctx.stroke();

    if (state.player) {
        ctx.fillStyle = state.player.team === 1 ? '#0ff' : '#f00';
        ctx.fillRect(state.player.x * scaleX, state.player.y * scaleY, 4, 4);
        
        // Show Trajectory on Minimap
        if (state.isCharging && state.gameActive && !state.isDrawing) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            drawTrajectory(ctx, state.player, scaleX, scaleY);
        }
    }
    
    Object.values(state.remotePlayers).forEach(e => {
        if(!e.dead) {
            ctx.fillStyle = e.team === 1 ? '#0ff' : '#f00';
            ctx.fillRect(e.x * scaleX, e.y * scaleY, 4, 4);
        }
    });

    // Show Projectiles on Minimap (Fixed: Only show active)
    ctx.fillStyle = '#ff0';
    state.projectiles.forEach(p => {
        if (p.active) {
            ctx.fillRect(p.x * scaleX, p.y * scaleY, 2, 2);
        }
    });

    // Show Blocks on Minimap
    ctx.fillStyle = '#667';
    state.blocks.forEach(b => {
        ctx.fillRect(b.x * scaleX, b.y * scaleY, 2, 2);
    });

    ctx.fillStyle = '#fff';
    state.planes.forEach(p => {
         ctx.fillRect(p.x * scaleX, p.y * scaleY, 5, 3);
    });

    ctx.fillStyle = '#0f0';
    state.crates.forEach(c => {
         ctx.fillRect((c.x * scaleX)-1, (c.y * scaleY)-1, 3, 3);
    });
}

function animate() {
    requestAnimationFrame(animate);
    
    const now = Date.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    if (state.gameActive && state.player) {
        if (state.gameMode === 'sp' && state.spManager) {
            state.spManager.update();
        }

        state.player.update();
        Object.values(state.remotePlayers).forEach(p => p.update());
        
        // Update Projectiles and Filter Inactive
        state.projectiles.forEach(p => p.update());
        state.projectiles = state.projectiles.filter(p => p.active);

        state.particles.forEach(p => p.update());
        state.crates.forEach(c => c.update());
        state.planes.forEach(p => p.update());
        
        // Update Blocks
        state.blocks.forEach(b => b.update());

        state.floatingTexts.forEach(t => t.update());
        state.floatingTexts = state.floatingTexts.filter(t => t.life > 0);

        let targetCamX = state.player.x - (state.width / 2 / state.camera.zoom);
        let targetCamY = state.player.y - (state.height / 2 / state.camera.zoom); 
        // UPDATE: Modify Clamp for Campaign length
        let maxW = 6000;
        if (state.gameMode === 'campaign' && state.campaignManager) {
             const lvl = state.campaignManager.LEVELS?.find(l => l.id === state.currentLevelId); // Accessing logic locally if needed, but state logic suffices
             // For simplicity, stick to generic or update dynamically
        }
        
        targetCamX = clamp(targetCamX, 0, maxW); // Keep existing clamp for now, effectively infinite if terrain is huge
        state.camera.x += (targetCamX - state.camera.x) * 0.1;
        state.camera.y += (targetCamY - state.camera.y) * 0.1;
    } else if (state.player) {
        state.camera.x += 0.5;
        if (state.camera.x > 5000) state.camera.x = 0;
    }

    state.camera.zoom += (state.camera.targetZoom - state.camera.zoom) * 0.1;

    if (state.screenShake > 0) {
        state.camera.x += fxRand(-state.screenShake, state.screenShake);
        state.camera.y += fxRand(-state.screenShake, state.screenShake);
        state.screenShake *= 0.9;
    }

    const ctx = state.ctx;
    ctx.clearRect(0, 0, state.width, state.height);
    ctx.save();
    ctx.scale(state.camera.zoom, state.camera.zoom);
    ctx.translate(-state.camera.x, -state.camera.y);

    ctx.fillStyle = "#050510";
    ctx.fillRect(state.camera.x, state.camera.y, state.width/state.camera.zoom, state.height/state.camera.zoom);

    drawTerrain(ctx);
    
    // Draw Blocks
    state.blocks.forEach(b => b.draw(ctx));

    if (state.isDrawing && state.gameActive) {
        const trueX = state.mousePos.x / state.camera.zoom + state.camera.x;
        const trueY = state.mousePos.y / state.camera.zoom + state.camera.y;
        
        ctx.strokeStyle = '#f0f';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(state.drawStart.x, state.drawStart.y);
        ctx.lineTo(trueX, trueY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.save();
        const dx = trueX - state.drawStart.x;
        const dy = trueY - state.drawStart.y;
        const angle = Math.atan2(dy, dx);
        const len = Math.sqrt(dx*dx + dy*dy);
        ctx.translate(state.drawStart.x, state.drawStart.y);
        ctx.rotate(angle);
        ctx.strokeRect(0, 0, len, 20);
        ctx.restore();
    }

    state.crates.forEach(c => c.draw(ctx));

    if (state.player && state.gameActive) state.player.draw(ctx);
    
    Object.values(state.remotePlayers).forEach(p => p.draw(ctx));
    state.planes.forEach(p => p.draw(ctx)); 
    state.projectiles.forEach(p => p.draw(ctx));
    state.particles.forEach(p => p.draw(ctx));
    state.floatingTexts.forEach(t => t.draw(ctx));

    if (state.isCharging && state.player && state.gameActive && !state.isDrawing) drawTrajectory(ctx, state.player);

    ctx.restore();
    if(state.gameActive) drawMinimap();
}