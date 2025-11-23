import { state } from '../state.js';
import { GRAVITY } from '../config.js';
import { getTerrainHeight } from '../world.js';
import { dist, clamp } from '../utils.js';
import { createExplosion } from '../ui.js';

export class Projectile {
    constructor(x, y, angle, power, ownerType, type, team) {
        this.x = x; this.y = y;
        const rad = angle * (Math.PI / 180);
        this.vx = Math.cos(rad) * power;
        this.vy = Math.sin(rad) * power;
        this.ownerType = ownerType;
        this.team = team;
        this.type = type;
        this.active = true;
        this.trail = [];
        this.radius = (type === 'nuke') ? 6 : 3;
        if (type === 'laser') { this.vx *= 2; this.vy *= 2; }
        if (type === 'seeker') { this.vx *= 0.5; this.vy *= 0.5; } 
        this.age = 0;
    }

    update() {
        if (!this.active) return;
        this.age++;

        if (this.type === 'seeker') {
            let targets = [];
            if (state.player && state.player.team !== this.team && !state.player.dead) targets.push(state.player);
            Object.values(state.remotePlayers).forEach(p => {
                    if(p.team !== this.team && !p.dead) targets.push(p);
            });

            let nearest = null; let minDist = 2000;
            targets.forEach(t => {
                let d = dist(this.x, this.y, t.x, t.y);
                if (d < minDist) { minDist = d; nearest = t; }
            });

            if (nearest) {
                let angleToTarget = Math.atan2((nearest.y - 10) - this.y, nearest.x - this.x);
                let currentAngle = Math.atan2(this.vy, this.vx);
                let diff = angleToTarget - currentAngle;
                while (diff < -Math.PI) diff += Math.PI*2;
                while (diff > Math.PI) diff -= Math.PI*2;
                currentAngle += clamp(diff, -0.1, 0.1);
                let speed = Math.sqrt(this.vx**2 + this.vy**2);
                this.vx = Math.cos(currentAngle) * speed;
                this.vy = Math.sin(currentAngle) * speed;
            }
        } else if (this.type !== 'laser') {
            this.vy += GRAVITY;
        }

        if (this.type !== 'seeker') this.vx += state.wind;

        const speed = Math.sqrt(this.vx**2 + this.vy**2);
        const steps = Math.ceil(speed / 5) + 1; 
        const stepVx = this.vx / steps;
        const stepVy = this.vy / steps;

        for(let i = 0; i < steps; i++) {
            this.x += stepVx;
            this.y += stepVy;

            // Plane Collision
            if (this.ownerType === 'player') {
                for(let plane of state.planes) {
                    if (dist(this.x, this.y, plane.x, plane.y) < 30) {
                        this.explode();
                        state.socket.emit('planeHit', { planeId: plane.id, damage: 10 });
                        createExplosion(this.x, this.y, 'standard');
                        return;
                    }
                }
            }

            if (this.y >= getTerrainHeight(this.x)) { 
                this.explode(); return; 
            }
            
            if (this.age > 10 || this.ownerType !== 'player') {
                for (let p of state.platforms) {
                    const dx = this.x - p.x;
                    const dy = this.y - p.y;
                    const rad = -p.angle * (Math.PI / 180);
                    const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
                    const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

                    if (localX >= 0 && localX <= p.width && localY >= 0 && localY <= p.height) {
                        this.explode();
                        if (this.ownerType === 'player' && p.type !== 'unbreakable') {
                            const dmg = (this.type === 'nuke') ? 100 : 25;
                            state.socket.emit('platformDamage', { id: p.id, damage: dmg });
                            p.hp -= dmg;
                            if(p.hp <= 0) {
                                state.socket.emit('platformDestroyed', p.id);
                            }
                        }
                        return;
                    }
                }
            }

            if (state.player && state.player.team !== this.team && !state.player.dead) {
                if (dist(this.x, this.y, state.player.x, state.player.y) < 30) {
                    this.explode(); return;
                }
            }
        }
        this.trail.push({x: this.x, y: this.y});
        if (this.trail.length > 10) this.trail.shift();
    }

    draw(ctx) {
        if(!this.active) return;
        ctx.beginPath();
        ctx.moveTo(this.trail[0]?.x || this.x, this.trail[0]?.y || this.y);
        for (let t of this.trail) ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = this.team === 1 ? '#0ff' : '#f00';
        if (this.type === 'nuke') ctx.strokeStyle = '#ff0';
        if (this.type === 'cluster') ctx.strokeStyle = '#f60';
        ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2); ctx.fill();
    }

    explode() {
        if (!this.active) return;
        this.active = false;
        createExplosion(this.x, this.y, this.type);
        
        let radius = 80, damage = 20;
        if (this.type === 'nuke') { radius = 300; damage = 100; }
        if (this.type === 'laser') { damage = 30; }
        if (this.type === 'cluster') { radius = 100; damage = 15; } 
        
        if (state.player && state.player.team !== this.team && !state.player.dead) {
                if (dist(this.x, this.y, state.player.x, state.player.y) < radius) {
                    state.player.takeDamage(damage);
                    state.socket.emit('hit', { 
                        damage: damage, x: state.player.x, y: state.player.y, victimId: state.myId 
                    });
                }
        }
    }
}