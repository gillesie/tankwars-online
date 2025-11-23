import { fxRand } from '../utils.js';
import { GRAVITY } from '../config.js'; // FIXED: Importing from correct file

export class Particle {
    constructor(x, y, color, type) {
        this.x = x; this.y = y;
        this.vx = fxRand(-5, 5); this.vy = fxRand(-5, 5);
        this.life = 1.0; this.decay = fxRand(0.01, 0.03);
        this.color = color; this.type = type;
        this.size = fxRand(2, 5);
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.life -= this.decay;
        if(this.type === 'smoke') { this.vy -= 0.05; this.size += 0.1; } 
        else { this.vy += GRAVITY * 0.5; }
    }
    draw(ctx) {
        ctx.globalAlpha = this.life; ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
    }
}