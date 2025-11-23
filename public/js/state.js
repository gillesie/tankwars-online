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
    wind: 0,
    screenShake: 0,
    
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
    gameConfig: { unlockWeapons: false }
	
	//game mode & single player related
	gameMode: 'menu', // 'menu', 'mp', 'sp'
    wave: 1,
    enemiesKilled: 0,
    spManager: null // Reference to the single player logic
};