import { state } from '../state.js';
import { GRAVITY, JUMP_FORCE, JUMP_SUSTAIN, TERRAIN_WIDTH } from '../config.js';
import { getTerrainHeight } from '../world.js';
import { clamp, dist, fxRand } from '../utils.js'; 
import { Projectile } from './Projectile.js';
import { createExplosion, updateHUD } from '../ui.js';
import { FloatingText } from './FloatingText.js';

// --- ASSET LOADING ---
const blueTankSVG = `<svg width="100" height="60" viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#0055aa;stop-opacity:1" /><stop offset="100%" style="stop-color:#00ffff;stop-opacity:1" /></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="2.5" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="M10,40 L90,40 L85,55 L15,55 Z" fill="#222" stroke="#0ff" stroke-width="2"/><path d="M15,40 L25,25 L75,25 L85,40 Z" fill="url(#blueGrad)" stroke="#fff" stroke-width="1"/><circle cx="50" cy="25" r="15" fill="#003366" stroke="#0ff" stroke-width="2"/><rect x="50" y="20" width="45" height="10" fill="#000" stroke="#0ff" stroke-width="1"/><rect x="90" y="18" width="5" height="14" fill="#0ff" filter="url(#glow)"/></svg>`;

const redTankSVG = `<svg width="100" height="60" viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="redGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#aa0000;stop-opacity:1" /><stop offset="100%" style="stop-color:#ff5500;stop-opacity:1" /></linearGradient><filter id="glowRed"><feGaussianBlur stdDeviation="2.5" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="M10,40 L90,40 L85,55 L15,55 Z" fill="#222" stroke="#f00" stroke-width="2"/><path d="M15,40 L25,25 L75,25 L85,40 Z" fill="url(#redGrad)" stroke="#fff" stroke-width="1"/><circle cx="50" cy="25" r="15" fill="#660000" stroke="#f00" stroke-width="2"/><rect x="50" y="20" width="45" height="10" fill="#000" stroke="#f00" stroke-width="1"/><rect x="90" y="18" width="5" height="14" fill="#f00" filter="url(#glowRed)"/></svg>`;

const blueImg = new Image();
blueImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(blueTankSVG);

const redImg = new Image();
redImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(redTankSVG);

export class Tank {
    constructor(isLocal, team, id, isAI = false) {
        this.id = id;
        this.isLocal = isLocal;
        this.isAI = isAI;
        this.team = team; 
        this.width = 30; this.height = 15;
        this.x = isLocal ? (team === 1 ? 200 : TERRAIN_WIDTH - 200) : 0;
        this.y = -500; 
        this.vx = 0; this.vy = 0;
        this.targetX = this.x; this.targetY = this.y;
        this.angle = 0; this.turretAngle = team === 1 ? 315 : 225;
        this.hp = 100; this.maxHp = 100;
        this.shield = 0; 
        this.lives = 5;
        this.name = isAI ? "CPU TANK" : (isLocal ? "YOU" : "ENEMY");
        this.dead = false;
        
        this.ammo = { 'standard': Infinity, 'scatter': 5, 'laser': 3, 'nuke': 0, 'seeker': 3, 'builder': Infinity };
        if (state.gameConfig.unlockWeapons) this.ammo = { 'standard': Infinity, 'scatter': 99, 'laser': 99, 'nuke': 99, 'seeker': 99, 'builder': Infinity };
        
        this.currentWeapon = 'standard';
        this.onGround = false;
        this.groundStartHeight = 0;
        this.hitFlashTimer = 0;

        this.isAI = isAI;
        this.difficulty = 1;
        this.aiTimer = 0;
        this.aiState = 'idle'; 
        this.nextMoveTime = 0;
    }

    update() {
        if (this.dead) return;

        if (this.isLocal || this.isAI) {
            // Fix: Only reset velocity for human players
            if (!this.isAI) {
                this.vx = 0;
            }
            
            if (!this.isAI && state.gameActive) {
                if (state.keys['ArrowLeft'] || state.keys['a']) this.vx = -4;
                if (state.keys['ArrowRight'] || state.keys['d']) this.vx = 4;
                
                if ((state.keys['ArrowUp'] || state.keys[' '] || state.keys['Space'])) {
                    if (this.onGround) {
                        this.vy = JUMP_FORCE; 
                        this.groundStartHeight = this.y;
                        this.onGround = false;
                    } else if (this.vy < 0) {
                        if (Math.abs(this.y - this.groundStartHeight) < 200) {
                            this.vy += JUMP_SUSTAIN; 
                        }
                    }
                }
                
                const trueWorldX = state.mousePos.x / state.camera.zoom + state.camera.x;
                const trueWorldY = state.mousePos.y / state.camera.zoom + state.camera.y;
                this.turretAngle = Math.atan2(trueWorldY - (this.y - 10), trueWorldX - this.x) * 180 / Math.PI;
            } else if (this.isAI && state.gameActive) {
                this.updateAI();
            }

            this.vy += GRAVITY;
            this.x += this.vx; this.y += this.vy;
            
            this.handleCollisions();

            if (!this.isAI && state.isMultiplayer && state.socket) {
                state.socket.emit('updateState', { 
                    x: this.x, y: this.y, 
                    angle: this.angle, 
                    turretAngle: this.turretAngle,
                    hp: this.hp,
                    shield: this.shield
                });
            }
        } else {
            if(dist(this.x, this.y, this.targetX, this.targetY) > 500) {
                this.x = this.targetX;
                this.y = this.targetY;
            } else {
                this.x += (this.targetX - this.x) * 0.2;
                this.y += (this.targetY - this.y) * 0.2;
            }
        }
    }

    updateAI() {
        if (!state.player || state.player.dead) return;

        const distToPlayer = dist(this.x, this.y, state.player.x, state.player.y);
        const dx = state.player.x - this.x;
        const dy = (state.player.y - 20) - this.y;
        
        let targetAngle = Math.atan2(dy, dx) * 180 / Math.PI;
        targetAngle -= (distToPlayer / 45); 

        const turnSpeed = 0.05 + (this.difficulty * 0.01); 
        this.turretAngle += (targetAngle - this.turretAngle) * clamp(turnSpeed, 0.05, 0.3);

        this.aiTimer++;
        const fireInterval = Math.max(60, 150 - (this.difficulty * 8));

        if (this.aiTimer > fireInterval && distToPlayer < 1500) { 
             const inaccuracy = Math.max(0.2, 4.0 - (this.difficulty * 0.4));
             if (Math.abs(targetAngle - this.turretAngle) < 15) {
                 const power = Math.min(distToPlayer / 30, 25);
                 this.fire(power + fxRand(-inaccuracy, inaccuracy));
                 this.aiTimer = 0;
                 this.nextMoveTime = Date.now() + fxRand(500, 1500);
             }
        }

        if (Date.now() > this.nextMoveTime) {
             const optimalRange = 600; 
             if (distToPlayer < optimalRange - 150) this.vx = (dx > 0) ? -2 : 2;
             else if (distToPlayer > optimalRange + 150) this.vx = (dx > 0) ? 2 : -2;
             else {
                 if (Math.random() < 0.3) this.vx = 0;
                 else this.vx = (Math.random() > 0.5 ? 2 : -2);
             }

             if (this.onGround && Math.random() < (0.05 + this.difficulty * 0.02)) {
                 this.vy = -10;
             }
             this.nextMoveTime = Date.now() + fxRand(1000, 3000);
        }
    }

    handleCollisions() {
        this.x = clamp(this.x, 20, TERRAIN_WIDTH - 20);
        this.onGround = false;
        const floorY = getTerrainHeight(this.x);
        
        // Terrain Collision
        if (this.y >= floorY - 10) {
            this.y = floorY - 10; this.vy = 0; this.onGround = true;
            this.groundStartHeight = this.y;
            const h1 = getTerrainHeight(this.x - 10);
            const h2 = getTerrainHeight(this.x + 10);
            this.angle = Math.atan2(h2 - h1, 20);
        }
        
        // Platform Collision
        state.platforms.forEach(p => {
            const rad = p.angle * (Math.PI / 180);
            const relX = this.x - p.x;
            const platYAtX = p.y + (relX * Math.tan(rad));

            if (this.x > p.x && this.x < p.x + p.width && this.vy >= 0) {
                if (this.y > platYAtX - 25 && this.y < platYAtX + 10) {
                    this.y = platYAtX - 10; 
                    this.vy = 0;
                    this.onGround = true;
                    this.groundStartHeight = this.y;
                    this.angle = rad; 
                }
            }
        });

        // Block Collision (FIXED)
        // Tank Hitbox approx: x-15 to x+15, y-15 to y
        const tLeft = this.x - 12; 
        const tRight = this.x + 12;
        const tTop = this.y - 20;
        const tBottom = this.y;

        state.blocks.forEach(b => {
            const bLeft = b.x;
            const bRight = b.x + b.size;
            const bTop = b.y;
            const bBottom = b.y + b.size;

            if (tRight > bLeft && tLeft < bRight && tBottom > bTop && tTop < bBottom) {
                // Determine Overlap
                const overlapX = (Math.min(tRight, bRight) - Math.max(tLeft, bLeft));
                const overlapY = (Math.min(tBottom, bBottom) - Math.max(tTop, bTop));

                if (overlapX < overlapY) {
                    // Horizontal Collision
                    if (this.x < b.x + b.size/2) {
                        this.x -= overlapX;
                    } else {
                        this.x += overlapX;
                    }
                    this.vx = 0;
                } else {
                    // Vertical Collision
                    if (this.y < b.y + b.size/2) {
                        // Landed on top
                        this.y -= overlapY;
                        this.vy = 0;
                        this.onGround = true;
                        this.groundStartHeight = this.y;
                        this.angle = 0; // Flat surface
                    } else {
                        // Hit bottom (head bump)
                        this.y += overlapY;
                        this.vy = 0;
                    }
                }
            }
        });
    }

    fire(power) {
        if (!state.gameActive) return;
        if (this.currentWeapon === 'builder') return;

        const rad = this.turretAngle * (Math.PI / 180);
        const bx = this.x + Math.cos(rad) * 20;
        const by = (this.y - 15) + Math.sin(rad) * 20;
        
        if (this.isLocal && !this.isAI && state.isMultiplayer) {
            state.socket.emit('fire', { 
                x: bx, y: by, angle: this.turretAngle, 
                power: power, type: this.currentWeapon 
            });
        }

        this.spawnProjectile(bx, by, this.turretAngle, power, this.currentWeapon);
        if (this.isLocal && !this.isAI) this.useAmmo();
    }

    spawnProjectile(x, y, angle, power, type) {
        const owner = this.isAI ? 'enemy' : (this.isLocal ? 'player' : 'enemy');
        const p = new Projectile(x, y, angle, power, owner, type, this.team);
        state.projectiles.push(p);
        if(!this.isAI) state.screenShake = 5;
    }

    useAmmo() {
        if (this.currentWeapon !== 'standard' && this.currentWeapon !== 'builder') {
            this.ammo[this.currentWeapon]--;
            if (this.ammo[this.currentWeapon] <= 0) this.currentWeapon = 'standard';
            updateHUD();
        }
    }

    takeDamage(amount) {
        if (this.dead || !state.gameActive) return;
        const size = 10 + (amount / 2);
        state.floatingTexts.push(new FloatingText(this.x, this.y - 30, "-" + Math.ceil(amount), '#f00', size));
        this.hitFlashTimer = 10; 

        if (this.shield > 0) {
            this.shield -= amount;
            if (this.shield < 0) {
                this.hp += this.shield; 
                this.shield = 0;
            }
        } else {
            this.hp -= amount;
        }

        if (this.hp <= 0) {
            createExplosion(this.x, this.y, 'nuke');
            
            if (this.isLocal && !this.isAI) {
                if (state.isMultiplayer) state.socket.emit('died');
                else {
                    this.lives--;
                    this.dead = true;
                    if(this.lives <= 0) {
                         state.spManager.endGame();
                    } else {
                         setTimeout(() => {
                             this.dead = false;
                             this.hp = 100;
                             this.y = -500; 
                             this.x = 200;
                         }, 2000);
                    }
                }
            } else if (this.isAI) {
                this.dead = true;
                this.lives = 0;
                if (state.spManager) state.spManager.onEnemyKilled(this);
            }
        }
        if(!this.isAI) updateHUD();
    }
    
    draw(ctx) {
        if(this.dead) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#555';
            ctx.font = "12px Orbitron";
            ctx.fillText("K.I.A.", -15, -10);
            ctx.restore();
            return;
        }

        // --- DRAW BODY (SVG) ---
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer--;
            if (Math.floor(Date.now() / 50) % 2 === 0) {
                ctx.globalCompositeOperation = 'lighter'; 
            }
        }

        // Decide which image to draw based on team
        const img = (this.team === 1) ? blueImg : redImg;
        
        // Draw Image centered (scaled down from 100x60 to 40x24 approx)
        // Original pivot was at bottom center (x, y). 
        // We shift drawing up by height to align tracks with (0,0)
        // 36 width, 22 height keeps roughly the proportions
        ctx.drawImage(img, -18, -22, 36, 22);

        if (this.shield > 0) {
            ctx.strokeStyle = '#ff0'; ctx.beginPath();
            ctx.arc(0, -7, 25, 0, Math.PI*2); ctx.stroke();
        }

        if (!this.isLocal) {
            ctx.shadowBlur = 0;
            ctx.fillStyle = this.team === 1 ? '#0ff' : '#f00';
            ctx.font = "10px Orbitron";
            ctx.textAlign = "center";
            ctx.fillText(this.name, 0, -30);
        }
        ctx.restore();

        // --- DRAW TURRET (Aim Indicator) ---
        // We keep this so players know where they are shooting.
        ctx.save();
        ctx.translate(this.x, this.y - 7); // Turret pivot point
        ctx.rotate(this.turretAngle * Math.PI / 180);
        
        ctx.shadowBlur = 5; 
        ctx.shadowColor = this.team === 1 ? '#0ff' : '#f00';
        ctx.fillStyle = this.team === 1 ? '#0ff' : '#f00';
        
        // Draw a simpler barrel line to overlap the SVG's static barrel
        ctx.fillRect(0, -2, 25, 4);
        
        ctx.restore();

        // --- HEALTH BARS ---
        ctx.fillStyle = '#f00'; ctx.fillRect(this.x - 20, this.y - 50, 40, 4);
        const drawHp = Math.min(this.hp, this.maxHp); 
        const hpPct = drawHp / this.maxHp; 
        ctx.fillStyle = '#0f0'; ctx.fillRect(this.x - 20, this.y - 50, 40 * hpPct, 4);
        
        if (this.hp > this.maxHp) {
            ctx.fillStyle = '#0ff'; ctx.fillRect(this.x - 20, this.y - 50, 40, 4); 
        }

        if(this.shield > 0) {
            ctx.fillStyle = '#ff0'; ctx.fillRect(this.x - 20, this.y - 56, 40 * (this.shield / 50), 2);
        }
    }
}