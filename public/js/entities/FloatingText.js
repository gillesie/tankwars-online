export class FloatingText {
    constructor(x, y, text, color, size) {
        this.x = x; this.y = y; 
        this.text = text; this.color = color;
        this.life = 1.0;
        this.size = size || 14;
    }
    update() {
        this.y -= 1;
        this.life -= 0.02;
    }
    draw(ctx) {
        if(this.life <= 0) return;
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.font = `bold ${this.size}px Orbitron`;
        ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x, this.y);
        ctx.globalAlpha = 1;
    }
}