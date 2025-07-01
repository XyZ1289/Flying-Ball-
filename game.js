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
            debug: false // Set to true to see physics bodies (set to false for final game)
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

let game = new Phaser.Game(gameConfig);

// --- Game Variables ---
let playerBall;
let pipes;
let score = 0; // Pipes passed in current run
let scoreText;
let isGameOver = false;
let gameTimer = 0; // In milliseconds
let pipesPassedInCurrentRun = 0;
let milestonePipesAwardedThisRun = {}; // To track XP for specific pipes in current run
let initialPipesSpawned = 0; // To track initial easy pipes

// --- Player Data Storage ---
let playerData = {
    name: "Player 1",
    totalXP: 0,
    currentLevel: 1,
    totalPlaytimeSeconds: 0,
    totalPipesCrossed: 0,
    highestPipesInRun: 0,
    achievedRanks: { 'Bronze': true } // Player starts at Level 1, so Bronze is achieved
};

// --- XP and Leveling Configuration ---
const XP_GROWTH_FACTOR = 1.206;
const BASE_XP_REQUIRED = 10; // Base XP from L1 to L2

// Pre-calculate cumulative XP needed to reach each level (for XP bar display and level up checks)
const cumulativeXPRequiredToReachLevel = {};
function calculateCumulativeXP() {
    cumulativeXPRequiredToReachLevel[1] = 0; // XP needed to REACH Level 1 is 0
    for (let level = 1; level <= 200; level++) { // Calculate up to level 200 for now, can extend if needed
        const xpNeededForNext = Math.round(BASE_XP_REQUIRED * Math.pow(XP_GROWTH_FACTOR, level));
        cumulativeXPRequiredToReachLevel[level + 1] = cumulativeXPRequiredToReachLevel[level] + xpNeededForNext;
    }
}
calculateCumulativeXP(); // Call this once on script load

function getXPRequiredForNextLevel(currentLevel) {
    if (currentLevel >= 100) return Infinity; // For display past Level 100
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
const gameContainer = document.getElementById('game-container');

const playButton = document.getElementById('play-button');
const profileButton = document.getElementById('profile-button');
const profileBackButton = document.getElementById('profile-back-button');
const playAgainButton = document.getElementById('play-again-button');
const gameOverHomeButton = document.getElementById('game-over-home-button');

// Direct Link Button references
const rewardButton = document.getElementById('reward-button'); // On Home Screen
const gameOverRewardButton = document.getElementById('game-over-reward-button'); // On Game Over Screen

// --- Monetag Direct Link URL ---
const MONETAG_DIRECT_LINK = "https://otieu.com/4/9512729"; // Your copied Direct Link

// --- Helper Functions for UI Management ---
function showScreen(screenElement) {
    const screens = [homeScreen, profileScreen, gameOverScreen];

    // Hide all UI screens
    screens.forEach(s => s.classList.remove('active'));
    // Always hide game container when switching to UI screens
    gameContainer.style.display = 'none';

    // Activate the requested screen
    screenElement.classList.add('active');

    // Show game container only when game is active
    if (screenElement === gameContainer) {
        gameContainer.style.display = 'block'; // Show game canvas
    }
}

// --- Event Listeners for UI Buttons ---
playButton.addEventListener('click', () => {
    startGame();
});

profileButton.addEventListener('click', () => {
    loadPlayerData(); // Ensure latest data is loaded before updating UI
    updateProfileUI(); // Populate profile details
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

// Event listeners for the Direct Link buttons
if (rewardButton) { // Check if the button exists
    rewardButton.addEventListener('click', () => {
        window.open(MONETAG_DIRECT_LINK, '_blank'); // Open ad in new tab
        // Give random XP on click for "Get Random XP!" button
        const randomXP = Phaser.Math.Between(1, 50);
        playerData.totalXP += randomXP;
        savePlayerData();
        // Optionally, show a small temporary message on screen
        // this.add.text(gameConfig.width / 2, gameConfig.height / 2, `+${randomXP} XP!`, { fontSize: '32px', fill: '#0f0' }).setOrigin(0.5);
    });
}

if (gameOverRewardButton) { // Check if the button exists
    gameOverRewardButton.addEventListener('click', () => {
        window.open(MONETAG_DIRECT_LINK, '_blank'); // Open ad in new tab
        
        // Award 2X XP from the LAST game score on this click
        // This is a direct reward, as verification of ad watch is not possible.
        const lastGameTimeSeconds = Math.floor(gameTimer / 1000);
        const xpFromTime = lastGameTimeSeconds * 0.1; // 0.1 XP per second
        const xpFromRegularPipes = pipesPassedInCurrentRun * 0.5; // 0.5 XP per pipe

        const lastGameMilestoneXP = getXpForPipesMilestones(pipesPassedInCurrentRun).xp; // Total milestone XP for that run

        const baseXPThisGame = xpFromTime + xpFromRegularPipes + lastGameMilestoneXP;
        const bonusXP = baseXPThisGame; // This makes it 2X total XP for the game if claimed

        playerData.totalXP += bonusXP; // Add the bonus XP
        savePlayerData();
        
        // Update the Game Over screen dynamically to show new XP
        document.getElementById('xp-gained-info').innerHTML += `<br>+${Math.floor(bonusXP)} BONUS XP (2X)!`;
        
        // Also update the level/rank info if it caused a level up
        let levelUpOccurred = false;
        let newRankAchieved = null;
        while (playerData.currentLevel < 100 && playerData.totalXP >= cumulativeXPRequiredToReachLevel[playerData.currentLevel + 1]) { // Limit auto-level up check if beyond Level 100
            playerData.currentLevel++;
            levelUpOccurred = true;
            const rankForNewLevel = getCurrentRank(playerData.currentLevel);
            if (!playerData.achievedRanks[rankForNewLevel]) {
                playerData.achievedRanks[rankForNewLevel] = true; // Corrected typo
                newRankAchieved = rankForNewLevel;
            }
        }
        if (levelUpOccurred) {
            document.getElementById('level-up-info').textContent = `🎉 Congratulations! You reached Level ${playerData.currentLevel}!`;
        }
        if (newRankAchieved) {
            document.getElementById('rank-up-info').textContent = `🏅 You are now a ${newRankAchieved}!`;
        }
        gameOverRewardButton.style.display = 'none'; // Hide button after claiming reward
    });
}


// --- Player Data Management (Local Storage) ---
function savePlayerData() {
    localStorage.setItem('bouncyBallPlayerData', JSON.stringify(playerData)); // Changed key to match game name
}

function loadPlayerData() {
    const savedData = localStorage.getItem('bouncyBallPlayerData'); // Changed key
    if (savedData) {
        playerData = JSON.parse(savedData);
        // Ensure new properties are added if loading old data from previous versions
        playerData.achievedRanks = playerData.achievedRanks || { 'Bronze': true };
        playerData.totalXP = playerData.totalXP || 0;
        playerData.currentLevel = playerData.currentLevel || 1;
        playerData.totalPlaytimeSeconds = playerData.totalPlaytimeSeconds || 0;
        playerData.totalPipesCrossed = playerData.totalPipesCrossed || 0;
        playerData.highestPipesInRun = playerData.highestPipesInRun || 0;
    }
}

// --- Game State Functions ---
function startGame() {
    // Reset game variables for new run
    score = 0; // Pipes passed in current game
    gameTimer = 0; // Milliseconds played in current game
    pipesPassedInCurrentRun = 0;
    milestonePipesAwardedThisRun = {}; // Reset tracking for pipe XP
    initialPipesSpawned = 0; // Reset initial pipes count
    isGameOver = false;

    // Start (or restart) the Phaser scene
    game.scene.getScene('default').scene.restart();

    // Show the game container
    showScreen(gameContainer);
}

function endGame(currentScore, gameRunTimeSeconds, pipesCrossed) {
    isGameOver = true;
    
    // Calculate XP from playtime
    const xpFromPlaytime = gameRunTimeSeconds * 0.1; // 0.1 XP per second
    const xpFromRegularPipes = pipesCrossed * 0.5; // 0.5 XP per pipe

    playerData.totalXP += xpFromPlaytime;
    playerData.totalXP += xpFromRegularPipes; // Add XP from regular pipes

    // Update total stats
    playerData.totalPlaytimeSeconds += gameRunTimeSeconds;
    playerData.totalPipesCrossed += pipesCrossed;
    if (pipesCrossed > playerData.highestPipesInRun) {
        playerData.highestPipesInRun = pipesCrossed;
    }

    let xpGainedMessages = [];
    if (xpFromPlaytime > 0) {
        xpGainedMessages.push(`${xpFromPlaytime.toFixed(1)} XP for ${Math.floor(gameRunTimeSeconds / 60)} minutes ${gameRunTimeSeconds % 60} seconds played`);
    }
    if (xpFromRegularPipes > 0) {
        xpGainedMessages.push(`${xpFromRegularPipes.toFixed(1)} XP for ${pipesCrossed} pipes crossed`);
    }

    // Get total XP from milestone pipes awarded during this run for display (awardPipeXP already added to totalXP)
    let pipeXPAwardedThisRunForDisplay = 0;
    for (const key in milestonePipesAwardedThisRun) {
        if (milestonePipesAwardedThisRun[key]) {
            if (key === '10') pipeXPAwardedThisRunForDisplay += 10;
            else if (key === '20') pipeXPAwardedThisRunForDisplay += 25;
            else if (key === '50') pipeXPAwardedThisRunForDisplay += 75;
            else if (key === '100') pipeXPAwardedThisRunForDisplay += 200;
            else if (key === '200') pipeXPAwardedThisRunForDisplay += 500;
            else if (key === '350') pipeXPAwardedThisRunForDisplay += 1000;
            else if (key === '500') xpXPAwardedThisRunForDisplay += 1500;
        }
    }

    if (pipeXPAwardedThisRunForDisplay > 0) {
        xpGainedMessages.push(`${pipeXPAwardedThisRunForDisplay} XP from milestone pipes!`);
    }
    
    // Update game over screen details
    document.getElementById('final-score').textContent = currentScore;
    document.getElementById('game-over-playtime').textContent = `${Math.floor(gameRunTimeSeconds / 60)} minutes ${gameRunTimeSeconds % 60} seconds`;
    document.getElementById('game-over-pipes').textContent = pipesCrossed;
    document.getElementById('xp-gained-info').innerHTML = xpGainedMessages.length > 0 ? xpGainedMessages.join('<br>') : "No XP earned in this run.";

    // Check for Level Up and Rank Up
    let levelUpOccurred = false;
    let newRankAchieved = null;
    while (playerData.currentLevel < 100 && playerData.totalXP >= cumulativeXPRequiredToReachLevel[playerData.currentLevel + 1]) { // Limit auto-level up check if beyond Level 100
        playerData.currentLevel++;
        levelUpOccurred = true;
        const rankForNewLevel = getCurrentRank(playerData.currentLevel);
        if (!playerData.achievedRanks[rankForNewLevel]) {
            playerData.achievedRanks[rankForNewLevel] = true; // Corrected typo
            newRankAchieved = rankForNewLevel;
        }
    }
    // If currentLevel is >=100, XP still accumulates but display will show ∞ for XP needed.

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
    
    // Show game over screen
    showScreen(gameOverScreen);
    // Ensure the reward button is visible for the next game over
    if (gameOverRewardButton) {
        gameOverRewardButton.style.display = 'block'; 
    }
}

// --- XP & Level System Functions (continued) ---
// This function runs during the game when a pipe is passed
function awardPipeXP(pipesPassedCount) {
    let xpAwarded = 0;
    let message = [];

    // Note: The logic here awards XP if the specific pipe threshold hasn't been awarded YET in THIS run.
    if (pipesPassedCount === 500 && !milestonePipesAwardedThisRun['500']) {
        xpAwarded = 1500;
        message.push('500 Pipes');
        milestonePipesAwardedThisRun['500'] = true;
    } else if (pipesPassedCount === 350 && !milestonePipesAwardedThisRun['350']) {
        xpAwarded = 1000;
        message.push('350 Pipes');
        milestonePipesAwardedThisRun['350'] = true;
    } else if (pipesPassedCount === 200 && !milestonePipesAwardedThisRun['200']) {
        xpAwarded = 500;
        message.push('200 Pipes');
        milestonePipesAwardedThisRun['200'] = true;
    } else if (pipesPassedCount === 100 && !milestonePipesAwardedThisRun['100']) {
        xpAwarded = 200;
        message.push('100 Pipes');
        milestonePipesAwardedThisRun['100'] = true;
    } else if (pipesPassedCount === 50 && !milestonePipesAwardedThisRun['50']) {
        xpAwarded = 75;
        message.push('50 Pipes');
        milestonePipesAwardedThisRun['50'] = true;
    } else if (pipesPassedCount === 20 && !milestonePipesAwardedThisRun['20']) {
        xpAwarded = 25;
        message.push('20 Pipes');
        milestonePipesAwardedThisRun['20'] = true;
    } else if (pipesPassedCount === 10 && !milestonePipesAwardedThisRun['10']) {
        xpAwarded = 10;
        message.push('10 Pipes');
        milestonePipesAwardedThisRun['10'] = true;
    }
    
    if (xpAwarded > 0) {
        playerData.totalXP += xpAwarded;
        savePlayerData(); // Save immediately after awarding XP from pipes
        return { xp: xpAwarded, message: `+${xpAwarded} XP (${message.join(', ')})` };
    }
    return { xp: 0, message: '' };
}

// This function gets details for Game Over screen display (sum of all additive XP)
function getXpForPipesMilestones(pipesPassedCount) {
    let xpTotalForDisplay = 0;
    let messageParts = [];

    // These values must match the awardPipeXP amounts for display consistency
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

    const totalXPReachedPreviousLevels = cumulativeXPRequiredToReachLevel[playerData.currentLevel] || 0;
    const currentXPInLevel = playerData.totalXP - totalXPReachedPreviousLevels;
    const neededXPForNextLevel = getXPRequiredForNextLevel(playerData.currentLevel);

    document.getElementById('current-xp').textContent = Math.floor(currentXPInLevel); // Use floor for display
    
    // Handle XP display for Level 100+
    if (playerData.currentLevel >= 100) { // Assuming 100 is effectively the "max" level for XP requirement scaling
        document.getElementById('needed-xp').textContent = '∞'; // Infinity symbol
    } else {
        document.getElementById('needed-xp').textContent = Math.round(neededXPForNextLevel); // Round for cleaner display
    }

    const xpBarFill = document.querySelector('.xp-bar-fill');
    if (playerData.currentLevel >= 100 || neededXPForNextLevel <= 0) { // If max level, or no XP needed for next
        xpBarFill.style.width = '100%'; // Always full for max level or when target is 0
    } else {
        const percentage = (currentXPInLevel / neededXPForNextLevel) * 100;
        xpBarFill.style.width = `${Math.min(percentage, 100)}%`; // Cap at 100%
    }

    // Display total playtime in minutes (and optionally hours/minutes)
    const totalMinutes = Math.floor(playerData.totalPlaytimeSeconds / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    let playtimeString = `${totalMinutes} minutes`;
    if (totalHours > 0) {
        playtimeString = `${totalHours} hours ${remainingMinutes} minutes`;
    }
    document.getElementById('total-playtime').textContent = playtimeString;
    document.getElementById('total-pipes-crossed').textContent = playerData.totalPipesCrossed;

    // Populate milestones/ranks
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
    // No image loading here anymore for ball and pipes, they are drawn with graphics.
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

    // --- Player Ball (Drawn with Graphics) ---
    // Create a graphics object specifically for the player ball
        playerBall.body.setCircle(15); // Set physics body as a circle with radius 15
    playerBall.body.setCollideWorldBounds(true);
    playerBall.body.setGravityY(700); // Increased gravity for classic Flappy feel

    // Input handling
    this.input.on('pointerdown', () => {
        if (!isGameOver) {
            playerBall.body.setVelocityY(-350); // Make it jump
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
        delay: 2000, // Increased time between pipe spawns for more adjustment time
        callback: addPipeRow,
        callbackScope: this,
        loop: true
    });

    // --- Colliders ---
    this.physics.add.collider(playerBall, pipes, hitPipe, null, this);
    this.physics.add.collider(playerBall, this.physics.world.bounds.bottom, hitGround, null, this);
}

function update() {
    if (isGameOver) {
        return;
    }

    // Increment game timer
    gameTimer += this.game.loop.delta; // delta is time since last frame in ms

    // Check if pipes have passed the player and award score/XP
    pipes.children.each(function(pipe) {
        // Only trigger score/XP if it's a graphical pipe, not the text
        if (pipe.type === 'Graphics' && pipe.x < playerBall.x && !pipe.getData('scored')) {
            if (pipe.getData('isTopPipe')) { // Only check for top pipe of the pair
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
        // Remove pipes (and their associated text) that are off-screen to the left
        if (pipe.x < -100) { // Check slightly further off-screen to ensure text is gone too
            pipe.destroy();
        }
    }.bind(this)); // Bind 'this' context for pipes.children.each
}

// --- Game Logic Functions ---
function addPipeRow() {
    if (isGameOver) return;

    let pipeGap = 150; // Default gap
    let pipeHorizontalSpeed = -150; // Default speed
    let pipeVerticalPosition; // Y position of the gap center
    let topPipeHeight; 
    let bottomPipeHeight;

    const defaultMinPipeSectionHeight = 50; // Minimum visual height for a pipe section

    // Initial difficulty (first 5 pipes)
    const easyPipesCount = 5;
    if (initialPipesSpawned < easyPipesCount) {
        pipeGap = 200; // Wider gap for initial ease
        pipeHorizontalSpeed = -100; // Slower speed
        
        // Keep initial pipes near center
        pipeVerticalPosition = gameConfig.height / 2 + Phaser.Math.Between(-30, 30); 
        initialPipesSpawned++;
    } else {
        // Difficulty scaling after initial easy pipes
        const difficultyLevel = playerData.currentLevel;
        // Max influence increased for gentler curve
        const maxLevelInfluence = 500; 

        pipeGap = Math.max(defaultGap - (difficultyLevel / maxLevelInfluence) * (defaultGap * 0.7), 80); // Min gap 80
        pipeHorizontalSpeed = Math.min(defaultPipeSpeed - (difficultyLevel / maxLevelInfluence) * (defaultPipeSpeed * 0.5), -300); // Max speed -300

        pipeVerticalPosition = Phaser.Math.Between(defaultMinPipeSectionHeight + (pipeGap / 2), gameConfig.height - defaultMinPipeSectionHeight - (pipeGap / 2));
    }

    topPipeHeight = pipeVerticalPosition - (pipeGap / 2);
    bottomPipeHeight = gameConfig.height - (pipeVerticalPosition + (pipeGap / 2));

    // Ensure calculated heights meet minimum visual requirements
    if (topPipeHeight < defaultMinPipeSectionHeight) topPipeHeight = defaultMinPipeSectionHeight;
    if (bottomPipeHeight < defaultMinPipeSectionHeight) bottomPipeHeight = defaultMinPipeSectionHeight;

    // --- Pipe Graphics ---
    const pipeWidth = 50;
    const pipeX = gameConfig.width + 50; // Start off-screen

    // Top Pipe
    const topPipeGraphic = this.add.graphics({ fillStyle: { color: 0x00FF00 } }); // Default glowing green
    topPipeGraphic.fillRect(0, 0, pipeWidth, topPipeHeight); // Draw filled rectangle
    this.physics.add.existing(topPipeGraphic, true); // Add physics, static body
    topPipeGraphic.body.setSize(pipeWidth, topPipeHeight); // Set physics body size
    topPipeGraphic.x = pipeX;
    topPipeGraphic.y = topPipeHeight / 2; // Position center of graphic for visual rendering
    topPipeGraphic.body.setImmovable(true);
    topPipeGraphic.body.setVelocityX(pipeHorizontalSpeed);
    topPipeGraphic.setData('scored', false);
    topPipeGraphic.setData('isTopPipe', true);

    // Bottom Pipe
    const bottomPipeGraphic = this.add.graphics({ fillStyle: { color: 0x00FF00 } }); // Default glowing green
    bottomPipeGraphic.fillRect(0, 0, pipeWidth, bottomPipeHeight); // Draw filled rectangle
    this.physics.add.existing(bottomPipeGraphic, true); // Add physics, static body
    bottomPipeGraphic.body.setSize(pipeWidth, bottomPipeHeight); // Set physics body size
    bottomPipeGraphic.x = pipeX;
    bottomPipeGraphic.y = gameConfig.height - (bottomPipeHeight / 2); // Position center of graphic for visual rendering
    bottomPipeGraphic.body.setImmovable(true);
    bottomPipeGraphic.body.setVelocityX(pipeHorizontalSpeed);
    bottomPipeGraphic.setData('scored', false);
    bottomPipeGraphic.setData('isTopPipe', false);

    // Add graphics objects to the pipes group
    pipes.add(topPipeGraphic);
    pipes.add(bottomPipeGraphic);


    // Apply glowing effect and check for milestone pipes
    const currentPipeCount = pipesPassedInCurrentRun + 1; // This will be the score if this pipe is passed

    let pipeColor = 0x00FF00; // Default glowing green for normal pipes
    let textColor = 0x000000; // Black text for numbers on pipes
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

    // Redraw the graphics with the correct color
    topPipeGraphic.clear();
    topPipeGraphic.fillStyle(pipeColor);
    topPipeGraphic.fillRect(0, 0, pipeWidth, pipeHeight); 

    bottomPipeGraphic.clear();
    bottomPipeGraphic.fillStyle(pipeColor);
    bottomPipeGraphic.fillRect(0, 0, pipeWidth, bottomPipeHeight); 


    // Add text to milestone pipes
    if (displayNumber !== '') {
        const pipeTextTop = this.add.text(topPipeGraphic.x, topPipeGraphic.y, displayNumber, {
            fontSize: '20px',
            fill: `#${textColor.toString(16)}`,
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(11);
        const pipeTextBottom = this.add.text(bottomPipeGraphic.x, bottomPipeGraphic.y, displayNumber, {
            fontSize: '20px',
            fill: `#${textColor.toString(16)}`,
            fontStyle: 'bold'
        }).setOrigin(0.5).setDepth(11);

        // Make the text move with the pipes
        pipeTextTop.setVelocityX(pipeHorizontalSpeed);
        pipeTextBottom.setVelocityX(pipeHorizontalSpeed);

        // Add text to pipes group so they are managed together (though they are not physics bodies)
        pipes.add(pipeTextTop);
        pipes.add(pipeTextBottom);
    }
}


function hitPipe(player, pipe) {
    // Only trigger game over if the hit object is a graphics pipe, not text
    if (isGameOver || pipe.type !== 'Graphics') return; 
    endGame(pipesPassedInCurrentRun, Math.floor(gameTimer / 1000), pipesPassedInCurrentRun); // Pass score, time, pipes crossed
}

function hitGround(player, ground) {
    if (isGameOver) return;
    endGame(pipesPassedInCurrentRun, Math.floor(gameTimer / 1000), pipesPassedInCurrentRun);
}

// --- Initial Setup ---
loadPlayerData(); // Load any existing data
showScreen(homeScreen); // Show the home screen when the page loads
