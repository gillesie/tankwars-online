export class Plane {
    constructor(data) {
        this.id = data.id;
        this.x = data.x; this.y = data.y;
        this.vx = data.vx;
        this.direction = data.direction;
        this.active = true;
    }
    update() {
        this.x += this.vx; 
        this.y += Math.sin(Date.now() * 0.01) * 0.5;
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(this.direction, 1);
        ctx.fillStyle = '#aaa';
        ctx.beginPath();
        ctx.moveTo(20, 0); ctx.lineTo(-20, 0);
        ctx.lineTo(-25, -10); ctx.lineTo(-10, -5); 
        ctx.lineTo(10, -5); ctx.lineTo(5, 5); ctx.lineTo(-10, 5);
        ctx.fill();
        ctx.fillStyle = '#f00'; 
        ctx.beginPath(); ctx.arc(20, 0, 2, 0, Math.PI*2); ctx.fill();
        ctx.restore();
    }
}