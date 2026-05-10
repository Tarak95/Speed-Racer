/* ============================
   SPEED RACER X — game.js
   ============================ */

// ── DOM REFS ──
const canvas       = document.getElementById('gameCanvas');
const ctx          = canvas.getContext('2d');
const startScreen  = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const startBtn     = document.getElementById('startBtn');
const restartBtn   = document.getElementById('restartBtn');
const scoreEl      = document.getElementById('score');
const speedValEl   = document.getElementById('speedVal');
const speedBar     = document.getElementById('speedBar');
const livesEl      = document.getElementById('lives');
const finalScoreEl = document.getElementById('finalScore');
const bestScoreEl  = document.getElementById('bestScore');
const leftBtn      = document.getElementById('leftBtn');
const rightBtn     = document.getElementById('rightBtn');
const bgStars      = document.getElementById('bgStars');

// ── STARS BACKGROUND ──
(function spawnStars() {
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('span');
    const size = Math.random() * 2.5 + 0.5;
    s.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random()*100}%;
      top:${Math.random()*100}%;
      animation-delay:${Math.random()*3}s;
      animation-duration:${2+Math.random()*3}s;
    `;
    bgStars.appendChild(s);
  }
})();

// ── GAME STATE ──
let gameRunning  = false;
let animId       = null;
let score        = 0;
let bestScore    = parseInt(localStorage.getItem('srx_best') || '0');
let lives        = 3;
let frameCount   = 0;
let speed        = 3;          // road scroll speed
let MAX_SPEED    = 14;
let spawnRate    = 80;         // frames between enemy spawns
let invincible   = false;      // brief post-collision grace
let invTimer     = 0;

// ── PLAYER ──
const player = {
  x: 0, y: 0,
  w: 0, h: 0,
  lane: 1,       // 0 left | 1 mid | 2 right
  targetX: 0,
  color: '#ff2244',
};

// ── ROAD ──
const road = {
  x: 0, y: 0, w: 0, h: 0,
  laneCount: 3,
  lineH: 60,
  lineW: 6,
  lineGap: 40,
  lineOffset: 0,
  lines: [],
  edges: [],
};

// ── ENEMIES & COINS ──
let enemies = [];
let coins   = [];
let particles = [];

// ── INPUT ──
const keys = {};
window.addEventListener('keydown', e => { keys[e.key] = true;  });
window.addEventListener('keyup',   e => { keys[e.key] = false; });

let leftHeld  = false;
let rightHeld = false;
let lastLaneChange = 0;

leftBtn.addEventListener('pointerdown',  e => { e.preventDefault(); leftHeld  = true; });
leftBtn.addEventListener('pointerup',    () => leftHeld  = false);
leftBtn.addEventListener('pointerleave', () => leftHeld  = false);
rightBtn.addEventListener('pointerdown', e => { e.preventDefault(); rightHeld = true; });
rightBtn.addEventListener('pointerup',   () => rightHeld = false);
rightBtn.addEventListener('pointerleave',() => rightHeld = false);

// Touch swipe on canvas
let touchStartX = 0;
canvas.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
canvas.addEventListener('touchend',   e => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(dx) > 30) movePlayer(dx > 0 ? 1 : -1);
}, { passive: true });

// ── BUTTONS ──
startBtn.addEventListener('click',   () => startGame());
restartBtn.addEventListener('click', () => startGame());

bestScoreEl.textContent = bestScore;

// ── RESIZE & SETUP ──
function resize() {
  const wrapper = canvas.parentElement;
  canvas.width  = wrapper.clientWidth;
  canvas.height = canvas.clientHeight || window.innerHeight * 0.75;

  const cw = canvas.width;
  const ch = canvas.height;

  // Road occupies center 80% width, max 380px
  road.w = Math.min(cw * 0.82, 380);
  road.x = (cw - road.w) / 2;
  road.y = 0;
  road.h = ch;

  // Player size
  player.w = road.w / 6;
  player.h = player.w * 1.8;
  player.y = ch - player.h - 20;

  repositionPlayer(false);
}

window.addEventListener('resize', () => { resize(); });
resize();

// ── LANE HELPERS ──
function laneX(lane) {
  const laneW = road.w / road.laneCount;
  return road.x + laneW * lane + laneW / 2;
}

function repositionPlayer(animate = true) {
  player.targetX = laneX(player.lane) - player.w / 2;
  if (!animate) player.x = player.targetX;
}

function movePlayer(dir) {
  const now = Date.now();
  if (now - lastLaneChange < 200) return; // debounce
  lastLaneChange = now;
  const newLane = player.lane + dir;
  if (newLane < 0 || newLane >= road.laneCount) return;
  player.lane = newLane;
  repositionPlayer(true);
}

// ── START GAME ──
function startGame() {
  score      = 0;
  lives      = 3;
  speed      = 3;
  frameCount = 0;
  spawnRate  = 80;
  enemies    = [];
  coins      = [];
  particles  = [];
  player.lane = 1;
  invincible  = false;
  invTimer    = 0;

  road.lineOffset = 0;

  resize();

  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');

  updateHUD();

  gameRunning = true;
  cancelAnimationFrame(animId);
  loop();
}

// ── MAIN LOOP ──
function loop() {
  if (!gameRunning) return;
  frameCount++;

  handleInput();
  update();
  draw();
  updateHUD();

  animId = requestAnimationFrame(loop);
}

// ── INPUT HANDLING ──
let keyLaneCooldown = 0;
function handleInput() {
  keyLaneCooldown--;
  if (keyLaneCooldown > 0) return;

  if (keys['ArrowLeft']  || keys['a'] || leftHeld) {
    movePlayer(-1);
    keyLaneCooldown = 12;
  }
  if (keys['ArrowRight'] || keys['d'] || rightHeld) {
    movePlayer(1);
    keyLaneCooldown = 12;
  }
}

// ── UPDATE ──
function update() {
  // Smooth player x
  player.x += (player.targetX - player.x) * 0.2;

  // Increase speed & difficulty over time
  speed = Math.min(MAX_SPEED, 3 + score * 0.003);
  spawnRate = Math.max(30, 80 - score * 0.04);

  // Road lines scroll
  road.lineOffset = (road.lineOffset + speed) % (road.lineH + road.lineGap);

  // Spawn enemies
  if (frameCount % Math.floor(spawnRate) === 0) spawnEnemy();

  // Spawn coins
  if (frameCount % 55 === 0) spawnCoin();

  // Move enemies
  enemies = enemies.filter(e => {
    e.y += speed * 1.1;
    return e.y < canvas.height + 100;
  });

  // Move coins
  coins = coins.filter(c => {
    c.y += speed * 0.9;
    c.spin += 0.08;
    return c.y < canvas.height + 50;
  });

  // Invincibility countdown
  if (invincible) {
    invTimer--;
    if (invTimer <= 0) invincible = false;
  }

  // Collision: player vs enemies
  if (!invincible) {
    for (let e of enemies) {
      if (rectsOverlap(player, e, 0.6)) {
        hitPlayer(e);
        break;
      }
    }
  }

  // Collect coins
  coins = coins.filter(c => {
    if (circleRectOverlap(c, player)) {
      score += 10;
      spawnCoinEffect(c.x, c.y);
      return false;
    }
    return true;
  });

  // Increment score by distance
  score += 1;

  // Update particles
  particles = particles.filter(p => {
    p.life--;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15;
    p.r *= 0.93;
    return p.life > 0;
  });
}

// ── SPAWN HELPERS ──
function spawnEnemy() {
  const lane = Math.floor(Math.random() * road.laneCount);
  const laneW = road.w / road.laneCount;
  const ew = player.w * (0.9 + Math.random() * 0.3);
  const eh = ew * 1.7;
  const ex = road.x + laneW * lane + (laneW - ew) / 2;
  const colors = ['#00e5ff','#a855f7','#22c55e','#f59e0b'];
  enemies.push({
    x: ex, y: -eh - 10,
    w: ew, h: eh,
    color: colors[Math.floor(Math.random() * colors.length)],
    lane,
  });
}

function spawnCoin() {
  const lane = Math.floor(Math.random() * road.laneCount);
  const laneW = road.w / road.laneCount;
  coins.push({
    x: road.x + laneW * lane + laneW / 2,
    y: -30,
    r: 14,
    spin: 0,
  });
}

// ── COLLISION HELPERS ──
function rectsOverlap(a, b, shrink = 1) {
  const sw = (b.w * (1 - shrink)) / 2;
  const sh = (b.h * (1 - shrink)) / 2;
  return (
    a.x < b.x + b.w - sw &&
    a.x + a.w > b.x + sw &&
    a.y < b.y + b.h - sh &&
    a.y + a.h > b.y + sh
  );
}

function circleRectOverlap(c, r) {
  const cx = Math.max(r.x, Math.min(c.x, r.x + r.w));
  const cy = Math.max(r.y, Math.min(c.y, r.y + r.h));
  return (cx - c.x) ** 2 + (cy - c.y) ** 2 < c.r ** 2;
}

// ── HIT PLAYER ──
function hitPlayer(enemy) {
  lives--;
  spawnExplosion(player.x + player.w / 2, player.y + player.h / 2);
  // Remove the enemy
  enemies = enemies.filter(e => e !== enemy);

  if (lives <= 0) {
    endGame();
    return;
  }

  invincible = true;
  invTimer   = 120; // 2 seconds grace
}

// ── END GAME ──
function endGame() {
  gameRunning = false;
  cancelAnimationFrame(animId);

  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem('srx_best', bestScore);
  }

  finalScoreEl.textContent = score;
  bestScoreEl.textContent  = bestScore;
  gameOverScreen.classList.remove('hidden');
}

// ── PARTICLES ──
function spawnExplosion(cx, cy) {
  const colors = ['#ff2244','#ff6600','#ffe600','#fff'];
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = 2 + Math.random() * 5;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - 2,
      r: 3 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 30 + Math.floor(Math.random() * 20),
    });
  }
}

function spawnCoinEffect(cx, cy) {
  for (let i = 0; i < 8; i++) {
    const angle = Math.random() * Math.PI * 2;
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * 3,
      vy: Math.sin(angle) * 3 - 1,
      r: 4,
      color: '#ffe600',
      life: 20,
    });
  }
}

// ── DRAW ──
function draw() {
  const cw = canvas.width, ch = canvas.height;

  // Clear
  ctx.clearRect(0, 0, cw, ch);

  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, ch);
  sky.addColorStop(0, '#05070f');
  sky.addColorStop(1, '#0a0e1a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cw, ch);

  drawRoad();
  drawCoins();
  drawEnemies();
  drawPlayer();
  drawParticles();
}

// ── DRAW ROAD ──
function drawRoad() {
  const { x, y, w, h } = road;

  // Road base
  ctx.fillStyle = '#12141f';
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, 0);
  ctx.fill();

  // Road edge glow left
  const edgeGradL = ctx.createLinearGradient(x, 0, x + 12, 0);
  edgeGradL.addColorStop(0, 'rgba(255,34,68,0.5)');
  edgeGradL.addColorStop(1, 'transparent');
  ctx.fillStyle = edgeGradL;
  ctx.fillRect(x, 0, 10, h);

  // Road edge glow right
  const edgeGradR = ctx.createLinearGradient(x + w - 12, 0, x + w, 0);
  edgeGradR.addColorStop(0, 'transparent');
  edgeGradR.addColorStop(1, 'rgba(255,34,68,0.5)');
  ctx.fillStyle = edgeGradR;
  ctx.fillRect(x + w - 10, 0, 10, h);

  // Lane dividers
  const laneW = w / road.laneCount;
  for (let i = 1; i < road.laneCount; i++) {
    const lx = x + laneW * i;
    let ly = -road.lineGap + road.lineOffset;
    while (ly < h) {
      ctx.fillStyle = 'rgba(255,230,0,0.55)';
      ctx.fillRect(lx - road.lineW / 2, ly, road.lineW, road.lineH);
      ly += road.lineH + road.lineGap;
    }
  }

  // Side kerbs (striped)
  drawKerb(x - 16, h);
  drawKerb(x + w, h);
}

function drawKerb(kx, ch) {
  const kw = 16;
  const segH = 30;
  const colors = ['#ff2244', '#fff'];
  let ky = road.lineOffset % (segH * 2) - segH * 2;
  let ci = 0;
  while (ky < ch + segH * 2) {
    ctx.fillStyle = colors[ci % 2];
    ctx.fillRect(kx, ky, kw, segH);
    ky += segH;
    ci++;
  }
}

// ── DRAW CAR (generic) ──
function drawCar(x, y, w, h, color, isPlayer, blink) {
  if (isPlayer && blink) return; // flicker during invincibility

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);

  // Body shadow
  ctx.shadowColor = color;
  ctx.shadowBlur  = isPlayer ? 20 : 12;

  // Main body
  const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  if (isPlayer) {
    grad.addColorStop(0, '#ff4466');
    grad.addColorStop(0.5, '#cc1133');
    grad.addColorStop(1, '#880022');
  } else {
    grad.addColorStop(0, lighten(color, 40));
    grad.addColorStop(1, color);
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.15);
  ctx.fill();

  // Windshield
  ctx.fillStyle = isPlayer ? 'rgba(0,230,255,0.35)' : 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  roundRect(ctx, -w * 0.28, -h * 0.35, w * 0.56, h * 0.25, 4);
  ctx.fill();

  // Headlights
  const hlY = isPlayer ? h * 0.44 : -h * 0.44;
  [[-w * 0.25, hlY], [w * 0.25, hlY]].forEach(([hx, hy]) => {
    ctx.beginPath();
    ctx.arc(hx, hy, w * 0.09, 0, Math.PI * 2);
    ctx.fillStyle = isPlayer ? '#ffe600' : '#fff';
    ctx.shadowColor = isPlayer ? '#ffe600' : '#fff';
    ctx.shadowBlur  = 15;
    ctx.fill();
  });

  // Wheels
  ctx.shadowBlur = 0;
  const wheelW = w * 0.22, wheelH = h * 0.12;
  const wPos = [
    [-w * 0.5 - wheelW * 0.3, -h * 0.32],
    [ w * 0.5 - wheelW * 0.7, -h * 0.32],
    [-w * 0.5 - wheelW * 0.3,  h * 0.22],
    [ w * 0.5 - wheelW * 0.7,  h * 0.22],
  ];
  wPos.forEach(([wx, wy]) => {
    ctx.fillStyle = '#111';
    ctx.beginPath();
    roundRect(ctx, wx, wy, wheelW, wheelH, 3);
    ctx.fill();
    ctx.fillStyle = '#333';
    ctx.beginPath();
    roundRect(ctx, wx + wheelW * 0.2, wy + 1, wheelW * 0.6, wheelH - 2, 2);
    ctx.fill();
  });

  ctx.restore();
}

// ── DRAW ENEMIES ──
function drawEnemies() {
  enemies.forEach(e => {
    drawCar(e.x, e.y, e.w, e.h, e.color, false, false);
  });
}

// ── DRAW PLAYER ──
function drawPlayer() {
  const blink = invincible && Math.floor(Date.now() / 100) % 2 === 0;
  drawCar(player.x, player.y, player.w, player.h, player.color, true, blink);
}

// ── DRAW COINS ──
function drawCoins() {
  coins.forEach(c => {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(Math.abs(Math.cos(c.spin)), 1);  // spin effect

    ctx.beginPath();
    ctx.arc(0, 0, c.r, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-c.r * 0.3, -c.r * 0.3, 0, 0, 0, c.r);
    g.addColorStop(0, '#fff7aa');
    g.addColorStop(0.5, '#ffe600');
    g.addColorStop(1, '#cc8800');
    ctx.fillStyle = g;
    ctx.shadowColor = '#ffe600';
    ctx.shadowBlur  = 12;
    ctx.fill();

    // $ sign
    ctx.shadowBlur = 0;
    ctx.fillStyle  = 'rgba(0,0,0,0.5)';
    ctx.font       = `bold ${c.r}px Orbitron, sans-serif`;
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);

    ctx.restore();
  });
}

// ── DRAW PARTICLES ──
function drawParticles() {
  particles.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.life / 50;
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

// ── UPDATE HUD ──
function updateHUD() {
  scoreEl.textContent = score;
  const kmh = Math.floor((speed / MAX_SPEED) * 320);
  speedValEl.textContent = kmh;
  speedBar.style.width = `${(speed / MAX_SPEED) * 100}%`;
  const hearts = '❤️'.repeat(lives) + '🖤'.repeat(Math.max(0, 3 - lives));
  livesEl.textContent = hearts;
}

// ── UTILS ──
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function lighten(hex, amount) {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  r = Math.min(255, r + amount);
  g = Math.min(255, g + amount);
  b = Math.min(255, b + amount);
  return `rgb(${r},${g},${b})`;
}
