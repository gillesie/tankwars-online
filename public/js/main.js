import { init } from './game.js';
import { connectSocket, joinGame } from './network.js';
import { state } from './state.js';
import { updateHUD } from './ui.js';
import { SinglePlayerManager } from './singleplayer.js';
import { CampaignManager } from './campaign.js'; // FIX: ADDED THIS IMPORT

// Expose global functions for HTML buttons
window.initGame = function() {
    const weps = document.getElementById('cfg-weapons').value;
    state.gameConfig.unlockWeapons = (weps === 'loaded');
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('mp-lobby-screen').classList.remove('hidden');
    window.setTeam(1);
    connectSocket();
};

// NEW FUNCTION
window.initSinglePlayer = function() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('mp-lobby-screen').classList.add('hidden');
    
    const sp = new SinglePlayerManager();
    sp.init();
};

// NEW FUNCTION
window.initCampaign = function() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('mp-lobby-screen').classList.add('hidden');
    
    const cm = new CampaignManager();
    cm.init();
};

window.setTeam = function(t) {
    state.selectedTeam = t;
    document.getElementById('btn-team-1').className = t===1 ? 'team-select-btn selected-blue' : 'team-select-btn';
    document.getElementById('btn-team-2').className = t===2 ? 'team-select-btn selected-red' : 'team-select-btn';
};

window.joinGame = function() {
    joinGame();
};

window.requestStart = function() {
    state.socket.emit('requestStartGame');
};

window.selectWeapon = function(type) {
    if (state.player) {
        if (type === 'builder') {
            state.player.currentWeapon = type;
            updateHUD();
            return;
        }
        if (state.player.ammo[type] > 0) {
            state.player.currentWeapon = type;
            updateHUD();
        }
    }
};

// Start
init();