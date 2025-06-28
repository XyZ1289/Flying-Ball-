// --- Game Configuration ---
const gameConfig = {
    type: Phaser.AUTO, // Auto-detect WebGL or Canvas
    width: 375, // Standard mobile width (e.g., iPhone X)
    height: 667, // Standard mobile height
    parent: 'game-container', // ID of the div where the game canvas will be injected
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 }, // No gravity initially, we'll control it
            debug: false // Set to true to see physics bodies
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

let game = new Phaser.Game(gameConfig);

// --- Game Variables (will be used later) ---
let playerBall;
let pipes;
let score = 0;
let scoreText;
let isGameOver = false;
let gameTimer = 0; // In milliseconds
let pipesPassedInCurrentRun = 0; // For milestone XP
let milestonePipesAwardedThisRun = {}; // To track XP for specific pipes in current run

// --- Player Data Storage (will be expanded) ---
let playerData = {
    name: "Player 1",
    totalXP: 0,
    currentLevel: 1,
    totalPlaytimeSeconds: 0,
    totalPipesCrossed: 0,
    highestPipesInRun: 0,
    achievedRanks: { // Keep track of achieved ranks (based on level)
        'Bronze': true // Player starts at Level 1, so Bronze is achieved
    }
    // We will add more data like cumulative XP to reach each level later
};

// --- XP and Leveling Configuration ---
const XP_GROWTH_FACTOR = 1.206;
const BASE_XP_REQUIRED = 10; // XP from L1 to L2

// Pre-calculate cumulative XP needed to reach each level (for XP bar display)
const cumulativeXPRequiredToReachLevel = {};
function calculateCumulativeXP() {
    cumulativeXPRequiredToReachLevel[1] = 0;
    for (let level = 1; level <= 1000; level++) { // Calculate far enough for "unlimited" levels
        const xpNeededForNext = Math.round(BASE_XP_REQUIRED * Math.pow(XP_GROWTH_FACTOR, level));
        cumulativeXPRequiredToReachLevel[level + 1] = cumulativeXPRequiredToReachLevel[level] + xpNeededForNext;
    }
}
calculateCumulativeXP(); // Call this once on script load

function getXPRequiredForNextLevel(currentLevel) {
    return Math.round(BASE_XP_REQUIRED * Math.pow(XP_GROWTH_FACTOR, currentLevel));
}

const RANK_THRESHOLDS = {
    'Bronze': 1,
    'Silver': 5,
    'Gold': 10,
    'Platinum': 20,
    'Diamond Pilot': 30,
    'Master Fighter': 50,
    'Grand Glider': 75,
    'Legend': 100
};

// --- UI Elements (Caching DOM references) ---
const homeScreen = document.getElementById('home-screen');
const profileScreen = document.getElementById('profile-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const gameContainer = document.getElementById('game-container'); // The Phaser canvas container

const playButton = document.getElementById('play-button');
const profileButton = document.getElementById('profile-button');
const profileBackButton = document.getElementById('profile-back-button');
const playAgainButton = document.getElementById('play-again-button');
const gameOverHomeButton = document.getElementById('game-over-home-button');

// Ad containers (will be used later with AdSense code)
const homeAdBanner = document.getElementById('home-ad-banner');
const inGameAdBanner = document.getElementById('in-game-ad-banner');
const gameOverAdDisplay = document.getElementById('game-over-ad-display');

// --- Helper Functions for UI Management ---
function showScreen(screenElement) {
    const screens = [homeScreen, profileScreen, gameOverScreen, gameContainer];
    const adBanners = [homeAdBanner, inGameAdBanner, gameOverAdDisplay];

    // Hide all UI screens and ads initially
    screens.forEach(s => s.classList.remove('active'));
    adBanners.forEach(a => a.style.display = 'none');

    // Activate the requested screen
    screenElement.classList.add('active');

    // Show specific ads based on screen
    if (screenElement === homeScreen) {
        homeAdBanner.style.display = 'flex'; // Use flex for centering ad content
        gameContainer.style.display = 'none'; // Ensure game canvas is hidden when on UI screen
    } else if (screenElement === profileScreen) {
        homeAdBanner.style.display = 'flex'; // Keep home ad visible on profile
        gameContainer.style.display = 'none';
    } else if (screenElement === gameContainer) {
        inGameAdBanner.style.display = 'flex';
        gameContainer.style.display = 'block'; // Show game canvas
    } else if (screenElement === gameOverScreen) {
        gameOverAdDisplay.style.display = 'flex';
        gameContainer.style.display = 'none'; // Hide game canvas
    }
}

// --- Event Listeners for UI Buttons ---
playButton.addEventListener('click', () => {
    startGame();
});

profileButton.addEventListener('click', () => {
    loadPlayerData(); // Ensure latest data is loaded before updating UI
    updateProfileUI(); // Function to populate profile details
    showScreen(profileScreen);
});

profileBackButton.addEventListener('click', () => {
    showScreen(homeScreen);
});

playAgainButton.addEventListener('click', () => {
    startGame();
});

gameOverHomeButton.addEventListener('click', () => {
    showScreen(homeScreen);
});

// --- Player Data Management (Local Storage) ---
function savePlayerData() {
    localStorage.setItem('flappyBallPlayerData', JSON.stringify(playerData));
}

function loadPlayerData() {
    const savedData = localStorage.getItem('flappyBallPlayerData');
    if (savedData) {
        playerData = JSON.parse(savedData);
        // Ensure new properties are added if loading old data
        playerData.achievedRanks = playerData.achievedRanks || { 'Bronze': true };
    }
}

// --- Game State Functions ---
function startGame() {
    // Reset game variables for new run
    score = 0;
    gameTimer = 0; // Milliseconds
    pipesPassedInCurrentRun = 0;
    milestonePipesAwardedThisRun = {}; // Reset tracking for pipe XP
    isGameOver = false;

    // Start (or restart) the Phaser scene
    game.scene.getScene('default').scene.restart();

    // Show the game container and in-game ad
    showScreen(gameContainer);
}

function endGame(currentScore, gameRunTimeSeconds, pipesCrossed) {
    isGameOver = true;

    // Calculate XP from playtime
    const xpFromPlaytime = Math.floor(gameRunTimeSeconds / 60);
    playerData.totalXP += xpFromPlaytime;

    // Update total stats
    playerData.totalPlaytimeSeconds += gameRunTimeSeconds;
    playerData.totalPipesCrossed += pipesCrossed;
    if (pipesCrossed > playerData.highestPipesInRun) {
        playerData.highestPipesInRun = pipesCrossed;
    }

    let xpGainedMessages = [];
    let totalXPGainedThisGame = xpFromPlaytime;

    if (xpFromPlaytime > 0) {
        xpGainedMessages.push(`${xpFromPlaytime} XP for ${Math.floor(gameRunTimeSeconds / 60)} minutes played`);
    } else {
        xpGainedMessages.push(`No XP from time played in this short run.`);
    }

    // Display XP for pipes
    const milestoneXPDetails = getXpForPipesMilestones(pipesCrossed); // Function to get details for display
    if (milestoneXPDetails.xp > 0) {
        xpGainedMessages.push(`${milestoneXPDetails.xp} XP for pipes (${milestoneXPDetails.message})`);
    }

    // Update game over screen details
    document.getElementById('final-score').textContent = currentScore;
    document.getElementById('game-over-playtime').textContent = `${Math.floor(gameRunTimeSeconds / 60)} minutes ${gameRunTimeSeconds % 60} seconds`;
    document.getElementById('game-over-pipes').textContent = pipesCrossed;
    document.getElementById('xp-gained-info').innerHTML = xpGainedMessages.join('<br>'); // Use <br> for new lines

    // Check for Level Up and Rank Up
    let levelUpOccurred = false;
    let newRankAchieved = null;
    while (playerData.totalXP >= cumulativeXPRequiredToReachLevel[playerData.currentLevel + 1]) {
        playerData.currentLevel++;
        levelUpOccurred = true;
        const rankForNewLevel = getCurrentRank(playerData.currentLevel);
        if (!playerData.achievedRanks[rankForNewLevel]) {
            playerData.achievedRanks[rankForNewLevel] = true;
            newRankAchieved = rankForNewLevel;
        }
    }

    if (levelUpOccurred) {
        document.getElementById('level-up-info').textContent = `🎉 Congratulations! You reached Level ${playerData.currentLevel}!`;
    } else {
        document.getElementById('level-up-info').textContent = '';
    }

    if (newRankAchieved) {
        document.getElementById('rank-up-info').textContent = `🏅 You are now a ${newRankAchieved}!`;
    } else {
        document.getElementById('rank-up-info').textContent = '';
    }

    savePlayerData(); // Save all updated player data

    // Hide in-game ad, show game over ad
    inGameAdBanner.style.display = 'none';
    showScreen(gameOverScreen);
}

// --- XP & Level System Functions ---
// This function runs during the game when a pipe is passed
function awardPipeXP(pipesPassedCount) {
    let xpAwarded = 0;
    let message = [];

    // Note: The logic here awards XP if the specific pipe threshold hasn't been awarded YET in THIS run.
    // It's checked in descending order so only the highest applicable award for a specific number is considered
    // if we decide on non-additive. But user wants additive here. So just if not awarded.

    if (pipesPassedCount >= 500 && !milestonePipesAwardedThisRun['500']) {
        xpAwarded = 1500;
        message.push('500 Pipes');
        milestonePipesAwardedThisRun['500'] = true;
    } else if (pipesPassedCount >= 350 && !milestonePipesAwardedThisRun['350']) {
        xpAwarded = 1000;
        message.push('350 Pipes');
        milestonePipesAwardedThisRun['350'] = true;
    } else if (pipesPassedCount >= 200 && !milestonePipesAwardedThisRun['200']) {
        xpAwarded = 500;
        message.push('200 Pipes');
        milestonePipesAwardedThisRun['200'] = true;
    } else if (pipesPassedCount >= 100 && !milestonePipesAwardedThisRun['100']) {
        xpAwarded = 200;
        message.push('100 Pipes');
        milestonePipesAwardedThisRun['100'] = true;
    } else if (pipesPassedCount >= 50 && !milestonePipesAwardedThisRun['50']) {
        xpAwarded = 75;
        message.push('50 Pipes');
        milestonePipesAwardedThisRun['50'] = true;
    } else if (pipesPassedCount >= 20 && !milestonePipesAwardedThisRun['20']) {
        xpAwarded = 25;
        message.push('20 Pipes');
        milestonePipesAwardedThisRun['20'] = true;
    } else if (pipesPassedCount >= 10 && !milestonePipesAwardedThisRun['10']) {
        xpAwarded = 10;
        message.push('10 Pipes');
        milestonePipesAwardedThisRun['10'] = true;
    }

    if (xpAwarded > 0) {
        playerData.totalXP += xpAwarded;
        // Potentially show a small in-game pop-up for XP gain
        // console.log(`Awarded ${xpAwarded} XP for ${message.join(', ')} milestone! Total XP: ${playerData.totalXP}`);
        savePlayerData(); // Save immediately after awarding XP from pipes
        return { xp: xpAwarded, message: `+${xpAwarded} XP (${message.join(', ')})` };
    }
    return { xp: 0, message: '' };
}

// This function gets details for Game Over screen display
function getXpForPipesMilestones(pipesPassedCount) {
    let xpTotalForDisplay = 0;
    let messageParts = [];

    if (pipesPassedCount >= 10) { xpTotalForDisplay += 10; messageParts.push('10+ pipes'); }
    if (pipesPassedCount >= 20) { xpTotalForDisplay += 25; messageParts.push('20+ pipes'); }
    if (pipesPassedCount >= 50) { xpTotalForDisplay += 75; messageParts.push('50+ pipes'); }
    if (pipesPassedCount >= 100) { xpTotalForDisplay += 200; messageParts.push('100+ pipes'); }
    if (pipesPassedCount >= 200) { xpTotalForDisplay += 500; messageParts.push('200+ pipes'); }
    if (pipesPassedCount >= 350) { xpTotalForDisplay += 1000; messageParts.push('350+ pipes'); }
    if (pipesPassedCount >= 500) { xpTotalForDisplay += 1500; messageParts.push('500+ pipes'); }

    return { xp: xpTotalForDisplay, message: messageParts.join(', ') };
}


function updateProfileUI() {
    document.getElementById('player-name').textContent = playerData.name;
    document.getElementById('player-rank').textContent = getCurrentRank(playerData.currentLevel);
    document.getElementById('player-level').textContent = playerData.currentLevel;

    const currentXPInLevel = playerData.totalXP - cumulativeXPRequiredToReachLevel[playerData.currentLevel];
    const neededXPForNextLevel = getXPRequiredForNextLevel(playerData.currentLevel);

    document.getElementById('current-xp').textContent = currentXPInLevel;

    // Handle XP display for Level 100+
    if (playerData.currentLevel >= 100) {
        document.getElementById('needed-xp').textContent = '∞'; // Infinity symbol
    } else {
        document.getElementById('needed-xp').textContent = neededXPForNextLevel;
    }

    const xpBarFill = document.querySelector('.xp-bar-fill');
    if (playerData.currentLevel >= 100 || neededXPForNextLevel === 0) { // If max level, or error
        xpBarFill.style.width = '100%'; // Always full for max level
    } else {
        const percentage = (currentXPInLevel / neededXPForNextLevel) * 100;
        xpBarFill.style.width = `${Math.min(percentage, 100)}%`; // Cap at 100%
    }

    document.getElementById('total-playtime').textContent = `${Math.floor(playerData.totalPlaytimeSeconds / 60)} minutes`;
    document.getElementById('total-pipes-crossed').textContent = playerData.totalPipesCrossed;

    const milestonesList = document.getElementById('milestones-list');
    milestonesList.innerHTML = ''; // Clear previous entries

    const sortedRanks = Object.keys(RANK_THRESHOLDS).sort((a, b) => RANK_THRESHOLDS[a] - RANK_THRESHOLDS[b]);

    sortedRanks.forEach(rankName => {
        const li = document.createElement('li');
        const achieved = playerData.currentLevel >= RANK_THRESHOLDS[rankName];
        li.textContent = `${rankName}: ${achieved ? 'Achieved' : 'Reach Level ' + RANK_THRESHOLDS[rankName]} ${achieved ? '✅' : ''}`;
        milestonesList.appendChild(li);
    });
}

function getCurrentRank(level) {
    let rank = 'Unknown'; // Default
    const levels = Object.keys(RANK_THRESHOLDS).sort((a, b) => RANK_THRESHOLDS[a] - RANK_THRESHOLDS[b]);
    for (let i = levels.length - 1; i >= 0; i--) {
        const r = levels[i];
        if (level >= RANK_THRESHOLDS[r]) {
            rank = r;
            break;
        }
    }
    return rank;
}

// --- Phaser Scene Functions ---
function preload() {
    // Load assets here
    // Base64 encoded white circle for the ball
    this.load.image('ball', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABz51ERAAAAAXNSR0IArs4c6QAAAHBJREFUWAntlkEOgCAMBMFp5xWk5zWcwf8mF1IqVlIpq/R91D0E0n77V6jXGvQW23cBA44wBzyB/3gH1yE8r4KqA1/gAT+Qn00Bfgbc8y8c8QfAfg2zNf3mB/jVjK7B21y+B8Lp+g7+4g8gA/x+tT8AAAAASUVORK5CYII=');

    // Simple pixel art for pipes (will make them glowing later in create)
    this.load.image('pipe', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAABCAYAAADuJ3oFAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAH0lEQVR4nGJgYGDYyMjIQAExMDJgYJgYGPQxAwBvHggD8+8aAAAAAElFTkSuQmCC'); // A simple horizontal line for pipe top/bottom
}

function create() {
    // --- Game Background (Subtle stars and moon) ---
    this.cameras.main.setBackgroundColor('#000000'); // Deep black background

    // Basic starry background (using graphics for simplicity, can be textures later)
    const graphics = this.add.graphics();
    graphics.fillStyle(0xFFFFFF, 0.5); // White stars, 50% opacity
    for (let i = 0; i < 100; i++) {
        const x = Phaser.Math.Between(0, gameConfig.width);
        const y = Phaser.Math.Between(0, gameConfig.height);
        graphics.fillCircle(x, y, Phaser.Math.Between(0.5, 1.5)); // Tiny circles for stars
    }
    // Subtle moon (simple circle for now)
    graphics.fillStyle(0xF0F0F0, 0.7); // Light gray moon, 70% opacity
    graphics.fillCircle(gameConfig.width - 50, 50, 20); // Top right corner

    // --- Player Ball ---
    playerBall = this.physics.add.image(gameConfig.width / 2, gameConfig.height / 2, 'ball');
    playerBall.setCircle();
    playerBall.setScale(1.5); // Slightly larger ball
    playerBall.setCollideWorldBounds(true);
    playerBall.body.setGravityY(700); // Increased gravity for classic Flappy feel

    // Input handling
    this.input.on('pointerdown', () => {
        if (!isGameOver) {
            playerBall.setVelocityY(-350); // Make it jump
        }
    });

    // --- Score Text ---
    scoreText = this.add.text(gameConfig.width / 2, 50, 'Score: 0', {
        fontSize: '32px',
        fill: '#fff',
        fontStyle: 'bold'
    }).setOrigin(0.5).setDepth(10); // Center and bring to front

    // --- Pipes ---
    pipes = this.physics.add.group();
    this.time.addEvent({
        delay: 1700, // Time between pipe spawns
        callback: addPipeRow,
        callbackScope: this,
        loop: true
    });

    // --- Colliders ---
    this.physics.add.collider(playerBall, pipes, hitPipe, null, this);
    this.physics.add.collider(playerBall, this.physics.world.bounds.bottom, hitGround, null, this);

    // --- Set current screen to game container ---
    // This is handled by startGame() now, which is called by button click
}

function update() {
    if (isGameOver) {
        return;
    }

    // Increment game timer
    gameTimer += this.game.loop.delta; // delta is time since last frame in ms

    // Check if pipes have passed the player and award score/XP
    pipes.children.each(function(pipe) {
        if (pipe.x < playerBall.x && !pipe.getData('scored')) {
            // Ensure only one pipe (top or bottom) triggers the score and XP
            if (pipe.getData('isTopPipe')) { // Only check for top pipe to avoid double count
                pipesPassedInCurrentRun++;
                scoreText.setText('Score: ' + pipesPassedInCurrentRun);
                pipe.setData('scored', true); // Mark as scored

                // Award XP for milestone pipes immediately
                const xpDetails = awardPipeXP(pipesPassedInCurrentRun);
                if (xpDetails.xp > 0) {
                    // Display a temporary text indicating XP gain
                    const xpGainText = this.add.text(playerBall.x, playerBall.y - 50, xpDetails.message, {
                        fontSize: '24px',
                        fill: '#0f0', // Green color for XP
                        stroke: '#000',
                        strokeThickness: 4
                    }).setOrigin(0.5);
                    this.tweens.add({
                        targets: xpGainText,
                        y: xpGainText.y - 70,
                        alpha: 0,
                        duration: 1500,
                        ease: 'Power1',
                        onComplete: () => xpGainText.destroy()
                    });
                }
            }
        }
        // Remove pipes that are off-screen to the left
        if (pipe.x < -pipe.width) {
            pipe.destroy();
        }
    }.bind(this)); // Bind 'this' context for pipes.children.each
}

// --- Game Logic Functions ---
function addPipeRow() {
    if (isGameOver) return;

    const gap = 150; // Gap size between top and bottom pipe
    const pipeSpeed = -150; // Speed pipes move left

    // Adjust gap and speed based on level for difficulty scaling
    const difficultyLevel = playerData.currentLevel;
    const maxLevelInfluence = 100; // After this level, difficulty caps

    let currentGap = Math.max(gap - (difficultyLevel / maxLevelInfluence) * (gap * 0.7), 80); // Min gap 80
    let currentPipeSpeed = pipeSpeed - (difficultyLevel / maxLevelInfluence) * (pipeSpeed * 0.5); // Max speed increase 50%

    const topPipeHeight = Phaser.Math.Between(50, gameConfig.height - 50 - currentGap);
    const bottomPipeHeight = gameConfig.height - topPipeHeight - currentGap;

    // Top pipe
    const topPipe = pipes.create(gameConfig.width + 50, topPipeHeight / 2, 'pipe'); // Position for top half
      topPipe.setDisplaySize(50, topPipeHeight); // Width 50, height calculated
    topPipe.setOrigin(0.5); // Center origin
    topPipe.body.allowGravity = false;
    topPipe.setImmovable(true);
    topPipe.setVelocityX(currentPipeSpeed);
    topPipe.setData('scored', false); // Flag to check if this pipe pair has given score
    topPipe.setData('isTopPipe', true); // Flag to identify top pipe of a pair

    // Bottom pipe
    const bottomPipe = pipes.create(gameConfig.width + 50, gameConfig.height - (bottomPipeHeight / 2), 'pipe'); // Position for bottom half
    bottomPipe.setDisplaySize(50, bottomPipeHeight);
    bottomPipe.setOrigin(0.5);
    bottomPipe.body.allowGravity = false;
    bottomPipe.setImmovable(true);
    bottomPipe.setVelocityX(currentPipeSpeed);
    bottomPipe.setData('scored', false);
    bottomPipe.setData('isTopPipe', false);

    // Apply glowing effect and check for milestone pipes
    const currentPipeCount = pipesPassedInCurrentRun + 1; // This will be the score if this pipe is passed

    let pipeColor = 0x00FF00; // Default glowing green
    let textColor = 0x000000; // Black text for normal pipes (not visible yet)
    let displayNumber = '';

    if (currentPipeCount === 10) {
        pipeColor = 0xFF0000; // Red for 10th
        displayNumber = '10';
        textColor = 0xFFFFFF;
    } else if (currentPipeCount === 20) {
        pipeColor = 0xFF00FF; // Magenta for 20th
        displayNumber = '20';
        textColor = 0xFFFFFF;
    } else if (currentPipeCount === 50) {
        pipeColor = 0xFFFF00; // Yellow for 50th
        displayNumber = '50';
        textColor = 0x000000;
    } else if (currentPipeCount === 100) {
        pipeColor = 0xFF8800; // Orange for 100th
        displayNumber = '100';
        textColor = 0xFFFFFF;
    } else if (currentPipeCount === 200) {
        pipeColor = 0x00FFFF; // Cyan for 200th
        displayNumber = '200';
        textColor = 0x000000;
    } else if (currentPipeCount === 350) { // New 350th milestone
        pipeColor = 0x8A2BE2; // Blue Violet for 350th
        displayNumber = '350';
        textColor = 0xFFFFFF;
    } else if (currentPipeCount === 500) {
        pipeColor = 0xFFD700; // Gold for 500th
        displayNumber = '500';
        textColor = 0x000000;
    }

    topPipe.setTint(pipeColor);
    bottomPipe.setTint(pipeColor);

    // Add text to milestone pipes
    if (displayNumber !== '') {
        const pipeTextTop = this.add.text(topPipe.x, topPipe.y, displayNumber, {
            fontSize: '20px',
            fill: `#${textColor.toString(16)}`,
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(11);
        const pipeTextBottom = this.add.text(bottomPipe.x, bottomPipe.y, displayNumber, {
            fontSize: '20px',
            fill: `#${textColor.toString(16)}`,
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(11);

        // Make the text move with the pipes
        pipeTextTop.setVelocityX(currentPipeSpeed);
        pipeTextBottom.setVelocityX(currentPipeSpeed);

        // Add text to pipes group so they are managed together
        pipes.add(pipeTextTop);
        pipes.add(pipeTextBottom);
    }
}


function hitPipe(player, pipe) {
    if (isGameOver) return;
    endGame(pipesPassedInCurrentRun, Math.floor(gameTimer / 1000), pipesPassedInCurrentRun); // Pass score, time, pipes crossed
}

function hitGround(player, ground) {
    if (isGameOver) return;
    endGame(pipesPassedInCurrentRun, Math.floor(gameTimer / 1000), pipesPassedInCurrentRun);
}

// --- Initial Setup ---
loadPlayerData(); // Load any existing data
showScreen(homeScreen); // Show the home screen when the page loads
        
  
   
