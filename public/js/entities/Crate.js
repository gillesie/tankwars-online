import { state } from '../state.js';
import { getTerrainHeight } from '../world.js';
import { dist } from '../utils.js';
import { createExplosion, updateHUD, log, blinkWeapon } from '../ui.js';

export class Crate {
    constructor(id, x, y, type) {
        this.id = id; this.x = x; this.y = y; this.type = type; this.landed = false;
    }
    update() {
        if (!this.landed) {
            this.y += 2; 
            this.x += Math.sin(Date.now() * 0.005) * 1;
            const tH = getTerrainHeight(this.x);
            if (this.y >= tH - 15) { this.y = tH - 15; this.landed = true; }
            state.platforms.forEach(p => {
                if(this.x > p.x && this.x < p.x+p.width && Math.abs(this.y - p.y) < 50) {
                    this.y = p.y - 15; this.landed = true; 
                }
            });
        }
        if (state.player && !state.player.dead && dist(this.x, this.y, state.player.x, state.player.y) < 40) {
            this.collect();
        }
    }
    collect() {
        if (state.isMultiplayer && state.socket) {
            state.socket.emit('crateCollected', this.id);
        }
        
        this.applyEffect(state.player);
        state.crates = state.crates.filter(c => c.id !== this.id);
        createExplosion(this.x, this.y, 'heal');
    }
    applyEffect(tank) {
        // --- NEW: UI Feedback ---
        log(`ACQUIRED: ${this.type.toUpperCase()}`);
        
        // Blink weapon icon if it's ammo or weapon
        if (this.type !== 'repair' && this.type !== 'extra_life' && this.type !== 'shield') {
            blinkWeapon(this.type);
        }
        // Specific feedback for extra life
        if (this.type === 'extra_life') blinkWeapon('standard'); // Fallback or distinct effect

        switch(this.type) {
            case 'repair': tank.hp = Math.min(tank.maxHp, tank.hp + 30); break;
            case 'extra_life': tank.lives++; break; // NEW
            case 'ammo': tank.ammo['standard'] = Infinity; tank.ammo['scatter']+=5; tank.ammo['laser']+=3; tank.ammo['seeker']+=3; blinkWeapon('standard'); break;
            case 'shield': tank.shield = 50; break;
            case 'scatter': tank.ammo['scatter'] += 10; break;
            case 'seeker': tank.ammo['seeker'] += 5; break;
            case 'nuke': tank.ammo['nuke'] += 1; break;
        }
        updateHUD();
    }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y);
        if (!this.landed) {
            ctx.strokeStyle = '#fff'; ctx.beginPath();
            ctx.moveTo(-10, -15); ctx.lineTo(0, -40); ctx.moveTo(10, -15); ctx.lineTo(0, -40); ctx.stroke();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'; ctx.beginPath(); ctx.arc(0, -45, 20, Math.PI, 0); ctx.fill();
        }
        
        // --- NEW: Crate Colors ---
        ctx.fillStyle = '#000'; // Default backing
        ctx.strokeStyle = '#0f0'; // Default stroke
        
        let color = '#0f0'; // Repair (Green)
        if (this.type === 'extra_life') color = '#000'; 
        else if (this.type === 'ammo') color = '#0ff';
        else if (this.type === 'shield') color = '#fff';
        else if (this.type === 'scatter') color = '#f60';
        else if (this.type === 'nuke') color = '#ff0';
        else if (this.type === 'seeker') color = '#f0f';

        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 5;
        
        if (this.type === 'extra_life') {
            ctx.fillStyle = '#333';
            ctx.strokeStyle = '#fff';
            ctx.shadowColor = '#fff';
        }

        ctx.lineWidth = 2;
        ctx.fillRect(-10, -10, 20, 20); 
        ctx.strokeRect(-10, -10, 20, 20);
        
        ctx.fillStyle = color; 
        ctx.font = '12px Arial'; ctx.textAlign = 'center';
        let icon = '?';
        if(this.type === 'repair') icon = '+'; 
        if(this.type === 'nuke') icon = '☢'; 
        if(this.type === 'ammo') icon = 'iii';
        if(this.type === 'seeker') icon = 'S';
        if(this.type === 'shield') icon = 'O';
        if(this.type === 'extra_life') { icon = '♥'; ctx.fillStyle = '#f00'; }
        
        ctx.fillText(icon, 0, 5);
        ctx.restore();
    }
}