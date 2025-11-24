import { state } from './state.js';
import { TERRAIN_WIDTH, SEGMENT_SIZE, WORLD_HEIGHT } from './config.js';
import { rand, seededRandom } from './utils.js';
import { Block } from './entities/Block.js';

export function generateTerrain(destroyedPlatformIds = [], destroyedBlockIds = []) {
    state.terrainPoints.length = 0;
    state.platforms.length = 0;
    state.blocks.length = 0;
    
    const jaggedness = 1.1;
    const amplitude = 150;
    
    for (let x = 0; x <= TERRAIN_WIDTH; x += SEGMENT_SIZE) {
        let y = WORLD_HEIGHT * 0.8; 
        y += Math.sin(x * 0.002) * amplitude;
        y += Math.sin(x * 0.01) * (amplitude * 0.3 * jaggedness);
        state.terrainPoints.push({x, y});
    }

    // Generate Platforms
    const platCount = 25;
    let currentX = 400;
    for(let i=0; i<platCount; i++) {
        const w = rand(100, 600, state.seed);
        const x = currentX + rand(100, 400, state.seed);
        let y = getTerrainHeight(x) - rand(100, 300, state.seed);
        if (y < 0) y = 100;
        
        const id = `static_${i}`;
        
        if (!destroyedPlatformIds.includes(id)) {
            const isUnbreakable = rand(0, 1, state.seed) > 0.8;
            state.platforms.push({ 
                id: id,
                x, y, width: w, height: 20, 
                angle: rand(-15, 15, state.seed),
                hp: isUnbreakable ? Infinity : 200,
                maxHp: 200,
                type: isUnbreakable ? 'unbreakable' : 'standard'
            });
        }
        
        currentX = x + w;
        if (currentX > TERRAIN_WIDTH - 500) break;
    }
    
    generateBlocks(destroyedBlockIds);
}

function generateBlocks(destroyedBlockIds) {
    const blockSize = 30;
    const structuresCount = 6;
    
    for(let i=0; i<structuresCount; i++) {
        const centerX = rand(600, TERRAIN_WIDTH - 600, state.seed);
        const type = rand(0, 1, state.seed) > 0.5 ? 'pyramid' : 'tower';
        
        // Start high up, let gravity settle them
        const startY = -1200; 

        if (type === 'pyramid') {
            const baseSize = Math.floor(rand(4, 7, state.seed));
            for(let row=0; row<baseSize; row++) {
                const cols = baseSize - row;
                // Center the row
                const rowWidth = cols * blockSize;
                const startRowX = centerX - rowWidth / 2;
                
                for(let col=0; col<cols; col++) {
                    const id = `blk_p${i}_r${row}_c${col}`;
                    if (destroyedBlockIds.includes(id)) continue;
                    
                    const x = startRowX + col * blockSize;
                    const y = startY - (row * blockSize); 
                    state.blocks.push(new Block(id, x, y, blockSize));
                }
            }
        } else {
            // Irregular Mountain/Tower
            const width = Math.floor(rand(3, 5, state.seed));
            const maxHeight = Math.floor(rand(5, 12, state.seed));
            
            for(let col=0; col<width; col++) {
                // Varying height per column for "mountain" look
                const colHeight = Math.floor(rand(maxHeight/2, maxHeight, state.seed));
                for(let row=0; row<colHeight; row++) {
                    const id = `blk_t${i}_c${col}_r${row}`;
                    if (destroyedBlockIds.includes(id)) continue;
                    
                    const x = centerX + (col * blockSize);
                    const y = startY - (row * blockSize);
                    state.blocks.push(new Block(id, x, y, blockSize));
                }
            }
        }
    }
}

export function getTerrainHeight(x) {
    if (x < 0 || x > TERRAIN_WIDTH) return WORLD_HEIGHT + 1000;
    const index = Math.floor(x / SEGMENT_SIZE);
    if (index >= state.terrainPoints.length - 1) return state.terrainPoints[state.terrainPoints.length-1].y;
    const p1 = state.terrainPoints[index];
    const p2 = state.terrainPoints[index+1];
    const ratio = (x - p1.x) / SEGMENT_SIZE;
    return p1.y + (p2.y - p1.y) * ratio;
}

export function drawTerrain(ctx) {
    ctx.save();
    ctx.fillStyle = '#001520';
    ctx.beginPath();
    
    const viewX = state.camera.x;
    const viewW = state.width / state.camera.zoom;
    const startIdx = Math.max(0, Math.floor(viewX / SEGMENT_SIZE));
    const endIdx = Math.min(state.terrainPoints.length - 1, Math.ceil((viewX + viewW) / SEGMENT_SIZE));

    if(state.terrainPoints[startIdx]) {
        ctx.moveTo(state.terrainPoints[startIdx].x, WORLD_HEIGHT + 1000); 
        for(let i=startIdx; i<=endIdx; i++) {
             if(state.terrainPoints[i]) ctx.lineTo(state.terrainPoints[i].x, state.terrainPoints[i].y);
        }
        if(state.terrainPoints[endIdx]) ctx.lineTo(state.terrainPoints[endIdx].x, WORLD_HEIGHT + 1000);
    }
    ctx.fill();

    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 10; ctx.shadowColor = '#0ff';
    ctx.stroke();
    
    state.platforms.forEach(p => {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle * Math.PI/180);
        
        if(p.type === 'unbreakable') {
            ctx.fillStyle = '#111'; 
            ctx.strokeStyle = '#555';
        } else {
            const dmgPct = p.hp / p.maxHp;
            ctx.fillStyle = `rgba(${255 * (1-dmgPct)}, 0, 50, 0.5)`; 
            ctx.strokeStyle = '#0ff';
        }
        
        ctx.fillRect(0,0,p.width,p.height);
        ctx.strokeRect(0,0,p.width,p.height);
        
        // Draw cracks if damaged
        if (p.type !== 'unbreakable' && p.hp < p.maxHp) {
            const damageLevel = 1 - (p.hp / p.maxHp);
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            // Simple deterministic pseudo-random cracks based on platform props
            let seed = p.width + p.x; 
            const crackCount = Math.floor(p.width / 20 * damageLevel);
            for(let k=0; k<crackCount; k++) {
                seed = (seed * 9301 + 49297) % 233280;
                const sx = (seed / 233280) * p.width;
                const sy = (k % 2 === 0) ? 0 : p.height;
                ctx.moveTo(sx, sy);
                ctx.lineTo(sx + ((seed % 20) - 10), p.height / 2);
            }
            ctx.stroke();
        }

        if (p.hp < p.maxHp && p.type !== 'unbreakable') {
            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.fillText(Math.ceil(p.hp), p.width/2 - 10, p.height/2 + 4);
        }

        ctx.restore();
    });

    ctx.restore();
}