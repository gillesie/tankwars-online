import { state } from '../state.js';
import { GRAVITY, JUMP_FORCE, JUMP_SUSTAIN, TERRAIN_WIDTH } from '../config.js';
import { getTerrainHeight } from '../world.js';
import { clamp, dist, fxRand } from '../utils.js'; // Added fxRand
import { Projectile } from './Projectile.js';
import { createExplosion, updateHUD } from '../ui.js';
import { FloatingText } from './FloatingText.js';

export class Tank {
    // Added isAI parameter, default false
    constructor(isLocal, team, id, isAI = false) {
        this.id = id;
        this.isLocal = isLocal;
        this.isAI = isAI; // New Flag
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

        // AI Specifics
        this.isAI = isAI;
        this.difficulty = 1; // Default difficulty
        this.aiTimer = 0;
        this.aiState = 'idle'; 
        this.nextMoveTime = 0;
    }

    update() {
        if (this.dead) return;

        // Run physics if it's our player OR an AI bot running locally
        if (this.isLocal || this.isAI) {
            this.vx = 0;
            
            // --- INPUT HANDLING ---
            if (!this.isAI && state.gameActive) {
                // Human Input
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
                // --- AI LOGIC ---
                this.updateAI();
            }

            // Physics
            this.vy += GRAVITY;
            this.x += this.vx; this.y += this.vy;
            
            this.handleCollisions();

            // Network Sync (Only if Human and Multiplayer)
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
            // Remote player interpolation
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
        
        // --- 1. AIMING LOGIC ---
        // Calculate direct angle
        let targetAngle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        // Gravity Compensation (Heuristic)
        // Adjust aim upward based on distance
        targetAngle -= (distToPlayer / 45); 

        // Smooth Turret Movement
        // Speed increases slightly with difficulty
        const turnSpeed = 0.05 + (this.difficulty * 0.01); 
        this.turretAngle += (targetAngle - this.turretAngle) * clamp(turnSpeed, 0.05, 0.3);

        // --- 2. FIRING LOGIC ---
        this.aiTimer++;
        
        // Fire Interval decreases with difficulty (Faster shooting)
        // Wave 1: ~5 seconds, Wave 10: ~2 seconds
        const fireInterval = Math.max(60, 150 - (this.difficulty * 8));

        if (this.aiTimer > fireInterval && distToPlayer < 1500) { 
             // Accuracy: Spread decreases with difficulty
             const inaccuracy = Math.max(0.2, 4.0 - (this.difficulty * 0.4));
             
             // Only fire if roughly facing the target
             if (Math.abs(targetAngle - this.turretAngle) < 15) {
                 // Charge power based on distance
                 const power = Math.min(distToPlayer / 30, 25);
                 
                 // Fire with random error based on difficulty
                 this.fire(power + fxRand(-inaccuracy, inaccuracy));
                 
                 this.aiTimer = 0;
                 // Plan next move after firing
                 this.nextMoveTime = Date.now() + fxRand(500, 1500);
             }
        }

        // --- 3. MOVEMENT LOGIC ---
        if (Date.now() > this.nextMoveTime) {
             const optimalRange = 600; // Try to stay at this distance
             
             if (distToPlayer < optimalRange - 150) {
                 // Too close: Back away
                 this.vx = (dx > 0) ? -2 : 2;
             } else if (distToPlayer > optimalRange + 150) {
                 // Too far: Advance
                 this.vx = (dx > 0) ? 2 : -2;
             } else {
                 // Good range: Random strafe or stop
                 const randMove = Math.random();
                 if (randMove < 0.3) this.vx = 0;
                 else this.vx = (Math.random() > 0.5 ? 2 : -2);
             }

             // Jump logic: Jump over obstacles or erratically
             // Chance increases with difficulty
             if (this.onGround && Math.random() < (0.05 + this.difficulty * 0.02)) {
                 this.vy = -10;
             }
             
             // Reset move timer
             this.nextMoveTime = Date.now() + fxRand(1000, 3000);
        }
    }

    handleCollisions() {
        // ... (Existing code matches provided file exactly, no changes needed inside) ...
        this.x = clamp(this.x, 20, TERRAIN_WIDTH - 20);
        this.onGround = false;
        const floorY = getTerrainHeight(this.x);
        
        if (this.y >= floorY - 10) {
            this.y = floorY - 10; this.vy = 0; this.onGround = true;
            this.groundStartHeight = this.y;
            const h1 = getTerrainHeight(this.x - 10);
            const h2 = getTerrainHeight(this.x + 10);
            this.angle = Math.atan2(h2 - h1, 20);
        }
        
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
    }

    fire(power) {
        if (!state.gameActive) return;
        if (this.currentWeapon === 'builder') return;

        const rad = this.turretAngle * (Math.PI / 180);
        const bx = this.x + Math.cos(rad) * 20;
        const by = (this.y - 15) + Math.sin(rad) * 20;
        
        // Only emit if this is a human player in multiplayer
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
        // For AI, ownerType is 'enemy'. For Player, 'player'.
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
                // Human Player Died
                if (state.isMultiplayer) state.socket.emit('died');
                else {
                    // SP Logic: Game Over immediately or reduce lives?
                    this.lives--;
                    this.dead = true;
                    if(this.lives <= 0) {
                         // End SP Game
                         state.spManager.endGame();
                    } else {
                         // Respawn logic for SP
                         setTimeout(() => {
                             this.dead = false;
                             this.hp = 100;
                             this.y = -500; 
                             this.x = 200;
                         }, 2000);
                    }
                }
            } else if (this.isAI) {
                // AI Died
                this.dead = true;
                this.lives = 0;
                // Add Score
                if (state.spManager) state.spManager.onEnemyKilled(this);
            }
        }
        if(!this.isAI) updateHUD();
    }
    
    // ... draw method remains unchanged ...
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

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer--;
            if (Math.floor(Date.now() / 50) % 2 === 0) {
                ctx.globalCompositeOperation = 'lighter'; 
            }
        }

        const color = this.team === 1 ? '#0ff' : '#f00';
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.fillStyle = '#000';

        ctx.beginPath();
        ctx.moveTo(-15, 0); ctx.lineTo(15, 0);
        ctx.lineTo(10, -15); ctx.lineTo(-10, -15);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        
        if (this.shield > 0) {
            ctx.strokeStyle = '#ff0'; ctx.beginPath();
            ctx.arc(0, -7, 25, 0, Math.PI*2); ctx.stroke();
        }

        if (!this.isLocal) {
            ctx.shadowBlur = 0;
            ctx.fillStyle = color;
            ctx.font = "10px Orbitron";
            ctx.textAlign = "center";
            ctx.fillText(this.name, 0, -30);
        }

        ctx.restore();

        ctx.save();
        ctx.translate(this.x, this.y - 7);
        ctx.rotate(this.turretAngle * Math.PI / 180);
        ctx.shadowBlur = 10; ctx.shadowColor = color;
        ctx.fillStyle = color;
        ctx.fillRect(0, -3, 30, 6);
        ctx.restore();

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