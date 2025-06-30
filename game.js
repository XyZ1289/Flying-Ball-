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

const homeTopAdBanner = document.getElementById('home-top-ad-banner');
const homeBottomAdBanner = document.getElementById('home-bottom-ad-banner');
const profileTopAdBanner = document.getElementById('profile-top-ad-banner');
const inGameBottomAdBanner = document.getElementById('in-game-bottom-ad-banner');
const gameOverAdDisplay = document.getElementById('game-over-ad-display');


// Function to push AdSense ads
function pushAd(adElement) {
    if (typeof (adsbygoogle) === 'undefined') return;
    try {
        // Clear existing ad content to prevent duplicates/issues
        adElement.innerHTML = ''; 
        const ins = adElement.querySelector('ins.adsbygoogle');
        if (ins) {
            (adsbygoogle = window.adsbygoogle || []).push({});
        }
    } catch (e) {
        console.error("Error pushing ad:", e);
    }
}


// --- Helper Functions for UI Management ---
function showScreen(screenElement) {
    const screens = [homeScreen, profileScreen, gameOverScreen];
    const adBanners = [homeTopAdBanner, homeBottomAdBanner, profileTopAdBanner, inGameBottomAdBanner, gameOverAdDisplay];

    // Hide all UI screens
    screens.forEach(s => s.classList.remove('active'));
    // Hide all ad banners
    adBanners.forEach(a => a.style.display = 'none');
    // Always hide game container initially when switching screens
    gameContainer.style.display = 'none';

    // Activate the requested screen
    screenElement.classList.add('active');

    // Show specific ads and game container based on the screen
    if (screenElement === homeScreen) {
        homeTopAdBanner.style.display = 'flex';
        homeBottomAdBanner.style.display = 'flex';
        pushAd(homeTopAdBanner);
        pushAd(homeBottomAdBanner);
    } else if (screenElement === profileScreen) {
        profileTopAdBanner.style.display = 'flex';
        pushAd(profileTopAdBanner);
    } else if (screenElement === gameContainer) {
        gameContainer.style.display = 'block'; // Show game canvas
        inGameBottomAdBanner.style.display = 'flex';
        pushAd(inGameBottomAdBanner);
    } else if (screenElement === gameOverScreen) {
        gameOverAdDisplay.style.display = 'flex';
        pushAd(gameOverAdDisplay);
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
    if (xpFromPlaytime > 0) {
        xpGainedMessages.push(`${xpFromPlaytime} XP for ${Math.floor(gameRunTimeSeconds / 60)} minutes played`);
    } else {
        xpGainedMessages.push(`No XP from time played in this short run.`);
    }

    // Get total XP from pipes awarded during this run for display (awardPipeXP already added to totalXP)
    let pipeXPAwardedThisRunForDisplay = 0;
    for (const key in milestonePipesAwardedThisRun) {
        if (milestonePipesAwardedThisRun[key]) {
            // Sum up XP from thresholds met (using hardcoded values for simplicity here)
            if (key === '10') pipeXPAwardedThisRunForDisplay += 10;
            else if (key === '20') pipeXPAwardedThisRunForDisplay += 25;
            else if (key === '50') pipeXPAwardedThisRunForDisplay += 75;
            else if (key === '100') pipeXPAwardedThisRunForDisplay += 200;
            else if (key === '200') pipeXPAwardedThisRunForDisplay += 500;
            else if (key === '350') pipeXPAwardedThisRunForDisplay += 1000;
            else if (key === '500') pipeXPAwardedThisRunForDisplay += 1500;
        }
    }

    if (pipeXPAwardedThisRunForDisplay > 0) {
        xpGainedMessages.push(`${pipeXPAwardedThisRunForDisplay} XP from pipes crossed in this game!`);
    }
    
    // Update game over screen details
    document.getElementById('final-score').textContent = currentScore;
    document.getElementById('game-over-playtime').textContent = `${Math.floor(gameRunTimeSeconds / 60)} minutes ${gameRunTimeSeconds % 60} seconds`;
    document.getElementById('game-over-pipes').textContent = pipesCrossed;
    document.getElementById('xp-gained-info').innerHTML = xpGainedMessages.join('<br>'); // Use <br> for new lines

    // Check for Level Up and Rank Up
    let levelUpOccurred = false;
    let newRankAchieved = null;
    while (playerData.currentLevel < 100 && playerData.totalXP >= cumulativeXPRequiredToReachLevel[playerData.currentLevel + 1]) { // Limit auto-level up check if beyond Level 100
        playerData.currentLevel++;
        levelUpOccurred = true;
        const rankForNewLevel = getCurrentRank(playerData.currentLevel);
        if (!playerData.achievedRanks[rankForNewLevel]) {
            playerData.achievedRanks[rankForNewLevel] = true;
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
    
    // Show game over ad
    showScreen(gameOverScreen);
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
    // Load assets here
    // Base64 encoded vibrant blue circle for the ball (round and clear)
    this.load.image('ball', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABz51ERAAAAAXNSR0IArs4c6QAAAHdJREFUWAntVkEOwCAIg1P1/x+z/tKmlrY0jXlJjZqR8760jRzFfX+gXGuwX2ycBwo44AwYgP9gB9chPK+CqgJ/4AM/kJ9NAX4G3PMvHPEXgH4NszNf3mB/jVjK7B21y+B8Lp+g7+4g8gA/x+tT8AAAAASUVORK5CYII='); 
    
    // Base64 encoded solid green pipe image (will be tinted for glow/milestone colors)
    this.load.image('pipe', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAxCAYAAACTg2LqAAAAAXNSR0IArs4c6QAAAHBJREFUWAntmO0JgCAQg1u8/2/qQ8+gD0N04eQ1W4R7n9L2Fq7t1625tHn8kC1oD3Bq5fO/F08CugxYgAFsABuA/4kH/vP7J/a/r1c784M/dD/Z/gXoAbYBdgAfgAvADpAHGfP3A3wAbACbAGP/vQdwAfABvgAXAO3gDvgAvADPgO0AP/R/7Fv6x72rA14GzAP2AX8A1gFvYAbYAPYA24B9wB8A+wA/gH2AfYD/gAb4v95wAP8A9gALAG8AXAD7AGwAegAfAP0DAPgG3gP/AO4A8wAPgLwG0f3+8AAAAASUVORK5CYII=');
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

    // Initial difficulty (first 5 pipes)
    const easyPipesCount = 5;
    if (initialPipesSpawned < easyPipesCount) {
        gap = 200; // Wider gap
        const centerOffset = Phaser.Math.Between(-50, 50); // Keep near center
        const middlePipeY = gameConfig.height / 2 + centerOffset;
        const topPipeHeightFixed = middlePipeY - (gap / 2);
        const bottomPipeHeightFixed = gameConfig.height - middlePipeY - (gap / 2);

        // Ensure minimum height for pipes
        const minPipeSectionHeight = 50; // Minimum height for top or bottom pipe section
        if (topPipeHeightFixed < minPipeSectionHeight || bottomPipeHeightFixed < minPipeSectionHeight) {
            // Readjust if too small, effectively widening the gap a bit or nudging to valid range
            // For simplicity, we just ensure it's not below min, could also recalculate middle
            const adjustedTop = Math.max(topPipeHeightFixed, minPipeSectionHeight);
            const adjustedBottom = Math.max(bottomPipeHeightFixed, minPipeSectionHeight);
            
            topPipeHeight = adjustedTop;
            bottomPipeHeight = gameConfig.height - adjustedTop - gap; // Recalculate bottom based on adjusted top and fixed gap
            if(bottomPipeHeight < minPipeSectionHeight) bottomPipeHeight = minPipeSectionHeight; // Ensure bottom is also min
        } else {
             topPipeHeight = topPipeHeightFixed;
             bottomPipeHeight = bottomPipeHeightFixed;
        }

        initialPipesSpawned++;
    } else {
        // Normal difficulty scaling after initial easy pipes
        const difficultyLevel = playerData.currentLevel;
        const maxLevelInfluence = 100; // After this level, difficulty caps

        let dynamicGap = Math.max(gap - (difficultyLevel / maxLevelInfluence) * (gap * 0.7), 80); // Min gap 80
        let dynamicPipeSpeed = pipeSpeed - (difficultyLevel / maxLevelInfluence) * (pipeSpeed * 0.5); // Max speed increase 50%

        gap = dynamicGap;
        pipeSpeed = dynamicPipeSpeed;

        topPipeHeight = Phaser.Math.Between(50, gameConfig.height - 50 - gap);
        bottomPipeHeight = gameConfig.height - topPipeHeight - gap;
    }


    // Top pipe
    const topPipe = pipes.create(gameConfig.width + 50, topPipeHeight / 2, 'pipe');
    topPipe.setDisplaySize(50, topPipeHeight); // Width 50, height calculated
    topPipe.setOrigin(0.5); // Center origin
    topPipe.body.allowGravity = false;
    topPipe.setImmovable(true);
    topPipe.setVelocityX(pipeSpeed); // Use adjusted pipeSpeed
    topPipe.setData('scored', false); // Flag to check if this pipe pair has given score
    topPipe.setData('isTopPipe', true); // Flag to identify top pipe of a pair

    // Bottom pipe
    const bottomPipe = pipes.create(gameConfig.width + 50, gameConfig.height - (bottomPipeHeight / 2), 'pipe');
    bottomPipe.setDisplaySize(50, bottomPipeHeight);
    bottomPipe.setOrigin(0.5);
    bottomPipe.body.allowGravity = false;
    bottomPipe.setImmovable(true);
    bottomPipe.setVelocityX(pipeSpeed); // Use adjusted pipeSpeed
    bottomPipe.setData('scored', false);
    bottomPipe.setData('isTopPipe', false);

    // Apply glowing effect and check for milestone pipes
    const currentPipeCount = pipesPassedInCurrentRun + 1; // This will be the score if this pipe is passed

    let pipeColor = 0x00FF00; // Default glowing green
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
        pipeTextTop.setVelocityX(pipeSpeed);
        pipeTextBottom.setVelocityX(pipeSpeed);

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
                
