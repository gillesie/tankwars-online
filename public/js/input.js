import { state } from './state.js';

export function initInput() {
    window.addEventListener('resize', () => {
        state.width = state.canvas.width = window.innerWidth;
        state.height = state.canvas.height = window.innerHeight;
    });

    state.canvas.addEventListener('mousemove', e => {
        const rect = state.canvas.getBoundingClientRect();
        state.mousePos.x = e.clientX - rect.left;
        state.mousePos.y = e.clientY - rect.top;
    });

    state.canvas.addEventListener('mousedown', e => {
        if (e.button === 0 && state.gameActive && state.player && !state.player.dead) { 
            if (state.player.currentWeapon === 'builder') {
                state.isDrawing = true;
                const trueWorldX = state.mousePos.x / state.camera.zoom + state.camera.x;
                const trueWorldY = state.mousePos.y / state.camera.zoom + state.camera.y;
                state.drawStart = { x: trueWorldX, y: trueWorldY };
            } else {
                state.isCharging = true; state.mousePressedTime = Date.now();
            }
        }
    });

    state.canvas.addEventListener('mouseup', e => {
        if (e.button === 0 && state.gameActive && state.player && !state.player.dead) {
            if (state.isDrawing) {
                state.isDrawing = false;
                const endX = state.mousePos.x / state.camera.zoom + state.camera.x;
                const endY = state.mousePos.y / state.camera.zoom + state.camera.y;
                
                const dX = endX - state.drawStart.x;
                const dY = endY - state.drawStart.y;
                const width = Math.sqrt(dX*dX + dY*dY);
                if (width > 20) {
                    const angle = Math.atan2(dY, dX) * 180 / Math.PI;
                    const newPlat = {
                        id: `dyn_${Math.random().toString(36).substr(2,9)}`,
                        x: state.drawStart.x, y: state.drawStart.y, 
                        width: width, height: 20,
                        angle: angle, hp: 200, maxHp: 200, type: 'standard'
                    };
                    state.socket.emit('createPlatform', newPlat);
                }
            } else if (state.isCharging) {
                const duration = Date.now() - state.mousePressedTime;
                let pwr = Math.min(duration / 40, 25);
                pwr = Math.max(pwr, 2);
                state.player.fire(pwr);
                state.isCharging = false;
                document.getElementById('hud-power').style.width = '0%';
            }
        }
    });

    state.canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const zoomSpeed = 0.05;
        state.camera.targetZoom = Math.min(Math.max(state.camera.targetZoom + (e.deltaY < 0 ? zoomSpeed : -zoomSpeed), 0.5), 2.0);
    }, { passive: false });

    document.addEventListener('keydown', e => state.keys[e.key] = true);
    document.addEventListener('keyup', e => state.keys[e.key] = false);
}