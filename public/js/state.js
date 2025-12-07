export const state = {
    canvas: null,
    ctx: null,
    minimapCanvas: null,
    minimapCtx: null,
    width: 0,
    height: 0,
    
    // Networking & User
    socket: null,
    isMultiplayer: true,
    myId: null,
    myTeam: 1,
    isHost: false,
    gameActive: false,
    selectedTeam: 1,
    
    // World
    seed: { val: 1 },
    terrainPoints: [],
    platforms: [],
    blocks: [],
    wind: 0,
    screenShake: 0,
    
    // Flag for Campaign End
    flag: { x: 0, y: 0, poleHeight: 80, currentHeight: 0, raising: false, raised: false, active: false },
    
    // NEW: Central Message System (for notifications)
    centralMsg: { text: '', color: '#fff', timer: 0 },

    // Camera
    camera: { x: 0, y: 0, zoom: 1, targetZoom: 1 },
    
    // Entities
    player: null,
    remotePlayers: {},
    crates: [],
    planes: [],
    projectiles: [],
    particles: [],
    floatingTexts: [],
    
    // Inputs
    keys: {},
    mousePos: { x: 0, y: 0 },
    mousePressedTime: 0,
    isCharging: false,
    isDrawing: false,
    drawStart: { x: 0, y: 0 },
    
    // Config
    gameConfig: { unlockWeapons: false },
	
	// Game Modes
	gameMode: 'menu', // 'menu', 'mp', 'sp', 'campaign'
    wave: 1,
    enemiesKilled: 0,
    spManager: null,
    
    // Campaign
    campaignManager: null,
    campaignProgress: 1,
    currentLevelId: 0
};