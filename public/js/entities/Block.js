import { state } from '../state.js';
import { GRAVITY } from '../config.js';
import { getTerrainHeight } from '../world.js';

export class Block {
    constructor(id, x, y, size) {
        this.id = id;
        this.x = x; 
        this.y = y;
        this.size = size;
        this.width = size; // For compatibility with collision logic
        this.height = size;
        this.vy = 0;
        this.hp = 30; // 1-2 hits
        this.color = '#556';
    }

    update() {
        // Gravity
        this.vy += GRAVITY;
        this.y += this.vy;

        // 1. Terrain Collision
        const floorY = getTerrainHeight(this.x + this.size / 2);
        if (this.y + this.size > floorY) {
            this.y = floorY - this.size;
            this.vy = 0;
        }

        // 2. Platform Collision (FIXED)
        state.platforms.forEach(p => {
            // Check if block is horizontally within platform bounds
            if (this.x + this.size > p.x && this.x < p.x + p.width) {
               // Calculate platform Y at the block's center X
               const rad = p.angle * (Math.PI / 180);
               const relX = (this.x + this.size/2) - p.x; 
               const platY = p.y + (relX * Math.tan(rad));
               
               // Check if we are falling onto it
               // Allow a small threshold for velocity
               if (this.y + this.size >= platY - 10 && this.y + this.size <= platY + 15 && this.vy >= 0) {
                   this.y = platY - this.size;
                   this.vy = 0;
               }
            }
        });

        // 3. Block Stacking Collision
        // We check against other blocks. If we fall onto one, we stop.
        state.blocks.forEach(b => {
            if (b === this) return;
            
            // Simple column check (assuming grid alignment for stability)
            if (Math.abs(b.x - this.x) < this.size * 0.8) { 
                // Check vertical overlap
                if (this.y + this.size > b.y && this.y < b.y + b.size) {
                    // Falling down onto b
                    if (this.vy >= 0 && this.y + this.size <= b.y + this.size/2 + this.vy + 5) {
                        this.y = b.y - this.size;
                        this.vy = 0;
                    }
                }
            }
        });
    }

    draw(ctx) {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        
        // Bevel / Border effect
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#334';
        ctx.strokeRect(this.x, this.y, this.size, this.size);
        
        // Inner highlight
        ctx.fillStyle = '#667';
        ctx.fillRect(this.x + 4, this.y + 4, this.size - 8, this.size - 8);
        
        ctx.restore();
    }
}