'use strict';

// Versión 3D del mismo juego (ver game.js para la versión 2D original).
// A diferencia del 2D, la arena aquí es acotada (con paredes invisibles):
// la nave y los asteroides rebotan/chocan en los bordes en vez de dar la
// vuelta al mundo. Colisiones por círculo/esfera, estado global directo,
// renderizado con Three.js en vez de Canvas 2D.

const W = 800;   // ancho lógico de la arena (eje X)
const H = 600;   // "alto" lógico de la arena (eje Z en el mundo 3D)

const keys = {};
const justPressed = {};

function pressed(code) {
  const val = justPressed[code];
  justPressed[code] = false;
  return val;
}

window.addEventListener('keydown', (e) => {
  if (!keys[e.code]) justPressed[e.code] = true;
  keys[e.code] = true;
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

// ── Utils ─────────────────────────────────────────────────────────────────────
const dist  = (a, b)   => Math.hypot(a.x - b.x, a.z - b.z);
const rand  = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));

// ── Escena Three.js ───────────────────────────────────────────────────────────
const container = document.getElementById('container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000006);
scene.fog = new THREE.Fog(0x000006, 180, 700);

// Vista en tercera persona: cámara tipo "persecución" detrás y encima de la
// nave, orbitando según hacia dónde mira (ángulo = mouse X, inclinación =
// mouse Y). Así se ve el propio modelo de la nave y más alrededor de ella.
const SHIP_EYE_HEIGHT = 10;
const CHASE_DIST   = 70;
const CHASE_HEIGHT = 28;
const LOOK_AHEAD    = 60;

const camera = new THREE.PerspectiveCamera(65, 900 / 700, 0.5, 3000);

let pitch = 0;      // inclinación de cámara (solo visual, no afecta el movimiento)
let lookBack = false; // clic derecho: voltea la cámara para mirar hacia atrás

function updateCamera() {
  const wx = ship.x - W / 2;
  const wz = ship.z - H / 2;
  const cp = Math.cos(pitch);
  let fx = Math.cos(ship.angle) * cp;
  let fz = Math.sin(ship.angle) * cp;
  let fy = Math.sin(pitch);

  // Mirar atrás no cambia hacia dónde apunta/dispara/se mueve la nave (eso
  // sigue siendo ship.angle) — solo invierte a dónde mira la cámara.
  if (lookBack) { fx = -fx; fz = -fz; fy = -fy; }

  camera.position.set(
    wx - fx * CHASE_DIST,
    SHIP_EYE_HEIGHT + CHASE_HEIGHT - fy * CHASE_DIST * 0.6,
    wz - fz * CHASE_DIST
  );
  camera.lookAt(
    wx + fx * LOOK_AHEAD,
    SHIP_EYE_HEIGHT + fy * LOOK_AHEAD,
    wz + fz * LOOK_AHEAD
  );
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(900, 700);
container.insertBefore(renderer.domElement, document.getElementById('hud'));

// ── Mouse look + disparo con clic ──────────────────────────────────────────
const canvasEl = renderer.domElement;
let mouseDown = false;
const MOUSE_SENS = 0.0022;
const PITCH_LIMIT = 0.9;
const lockHint = document.getElementById('lockHint');

function requestLock() {
  if (document.pointerLockElement !== canvasEl) {
    const p = canvasEl.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  }
}

// El hint queda por encima del canvas (para poder mostrar el mensaje), así
// que el clic hay que capturarlo ahí también, no solo en el canvas.
canvasEl.addEventListener('click', requestLock);
lockHint.addEventListener('click', requestLock);

document.addEventListener('pointerlockerror', () => {
  console.warn('No se pudo activar el bloqueo de puntero.');
});

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvasEl;
  lockHint.style.display = locked ? 'none' : 'flex';
  if (!locked) { mouseDown = false; lookBack = false; }
});

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvasEl || !ship) return;
  ship.angle += e.movementX * MOUSE_SENS;
  pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch - e.movementY * MOUSE_SENS));
});

canvasEl.addEventListener('contextmenu', (e) => e.preventDefault());

document.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvasEl) return;
  if (e.button === 0) mouseDown = true;      // clic izquierdo: disparar
  else if (e.button === 2) lookBack = true;  // clic derecho: mirar atrás
});

document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
  else if (e.button === 2) lookBack = false;
});

scene.add(new THREE.AmbientLight(0x556677, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(200, 500, 300);
scene.add(sun);

// Suelo de referencia (rejilla) para dar noción de la arena y de sus bordes.
const grid = new THREE.GridHelper(Math.max(W, H), 20, 0x224444, 0x112233);
grid.position.y = -1;
scene.add(grid);

// Campo de estrellas de fondo (puramente decorativo).
{
  const starGeo = new THREE.BufferGeometry();
  const starCount = 400;
  const pos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    pos[i * 3]     = rand(-1600, 1600);
    pos[i * 3 + 1] = rand(50, 700);
    pos[i * 3 + 2] = rand(-1600, 1600);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xaaaaee, size: 2.2, sizeAttenuation: true });
  scene.add(new THREE.Points(starGeo, starMat));
}

// Convierte coordenadas lógicas (x en [0,W), z en [0,H)) a posición de mundo,
// centrando la arena en el origen.
function toWorld(obj) {
  return [obj.x - W / 2, obj.y ?? 0, obj.z - H / 2];
}

function placeMesh(mesh, obj) {
  const [wx, wy, wz] = toWorld(obj);
  mesh.position.set(wx, wy, wz);
}

// ── Bullet ────────────────────────────────────────────────────────────────────
const bulletGeo = new THREE.SphereGeometry(3, 8, 8);
const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

class Bullet {
  constructor(x, z, angle) {
    this.x = x;
    this.z = z;
    this.y = 6;
    const SPEED = 520;
    this.vx = Math.cos(angle) * SPEED;
    this.vz = Math.sin(angle) * SPEED;
    this.ttl = 1.1;
    this.radius = 4;
    this.dead = false;

    this.mesh = new THREE.Mesh(bulletGeo, bulletMat);
    placeMesh(this.mesh, this);
    scene.add(this.mesh);
  }

  update(dt) {
    const nx = this.x + this.vx * dt;
    const nz = this.z + this.vz * dt;

    // Las balas ya no dan la vuelta al mundo: al llegar al borde de la
    // arena explotan (desaparecen), no se teletransportan al otro lado.
    if (nx < 0 || nx > W || nz < 0 || nz > H) {
      this.dead = true;
      explode(Math.min(Math.max(nx, 0), W), Math.min(Math.max(nz, 0), H), 3);
      return;
    }

    this.x = nx;
    this.z = nz;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
    placeMesh(this.mesh, this);
  }

  remove() { scene.remove(this.mesh); }
}

// ── Asteroid ──────────────────────────────────────────────────────────────────
const RADII  = [0, 16, 30, 50];   // por tamaño 1, 2, 3
const SPEEDS = [0, 85, 55, 32];
const POINTS = [0, 100, 50, 20];
const asteroidMat = new THREE.MeshStandardMaterial({ color: 0x9a9aa2, roughness: 0.9, flatShading: true });

function makeAsteroidGeometry(radius) {
  const geo = new THREE.IcosahedronGeometry(radius, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const f = rand(0.75, 1.15);
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f, pos.getZ(i) * f);
  }
  geo.computeVertexNormals();
  return geo;
}

class Asteroid {
  constructor(x, z, size = 3) {
    this.x = x;
    this.z = z;
    this.y = RADII[size] * 0.4;
    this.size = size;
    this.radius = RADII[size];
    this.dead = false;

    const angle = rand(0, Math.PI * 2);
    const speed = SPEEDS[size] + rand(-15, 15);
    this.vx = Math.cos(angle) * speed;
    this.vz = Math.sin(angle) * speed;
    this.rotSpeed = { x: rand(-1, 1), y: rand(-1, 1), z: rand(-1, 1) };

    this.mesh = new THREE.Mesh(makeAsteroidGeometry(this.radius), asteroidMat);
    this.mesh.rotation.set(rand(0, Math.PI * 2), rand(0, Math.PI * 2), rand(0, Math.PI * 2));
    placeMesh(this.mesh, this);
    scene.add(this.mesh);
  }

  update(dt) {
    // A diferencia de antes, los asteroides ya no dan la vuelta al mundo:
    // rebotan contra el borde de la arena (como si fuera una pared) en vez
    // de teletransportarse al lado opuesto.
    let nx = this.x + this.vx * dt;
    let nz = this.z + this.vz * dt;
    const r = this.radius;
    if (nx < r)     { nx = r;     this.vx = -this.vx; }
    if (nx > W - r) { nx = W - r; this.vx = -this.vx; }
    if (nz < r)     { nz = r;     this.vz = -this.vz; }
    if (nz > H - r) { nz = H - r; this.vz = -this.vz; }
    this.x = nx;
    this.z = nz;

    this.mesh.rotation.x += this.rotSpeed.x * dt;
    this.mesh.rotation.y += this.rotSpeed.y * dt;
    this.mesh.rotation.z += this.rotSpeed.z * dt;
    placeMesh(this.mesh, this);
  }

  split() {
    if (this.size <= 1) return [];
    return [
      new Asteroid(this.x, this.z, this.size - 1),
      new Asteroid(this.x, this.z, this.size - 1),
    ];
  }

  remove() { scene.remove(this.mesh); }
}

// ── Íconos de power-up (imágenes dibujadas a mano, estilo del juego) ─────────
// Cada tipo de power-up se distingue con una imagen (sprite que siempre mira
// a la cámara) dibujada sobre un canvas: el disparo triple muestra el
// abanico de 3 balas, la bomba nova muestra una estrella/explosión.
function makeIconTexture(draw) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

const tripleIconTexture = makeIconTexture((ctx, s) => {
  const c = s / 2;
  const glow = ctx.createRadialGradient(c, c, 8, c, c, s * 0.42);
  glow.addColorStop(0, 'rgba(0,255,255,0.55)');
  glow.addColorStop(1, 'rgba(0,255,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(c, c, s * 0.42, 0, Math.PI * 2); ctx.fill();

  const originY = s * 0.82;
  const tips = [[c - s * 0.22, s * 0.20], [c, s * 0.12], [c + s * 0.22, s * 0.20]];
  ctx.strokeStyle = '#eafcff';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (const [tx, ty] of tips) {
    ctx.beginPath();
    ctx.moveTo(c, originY);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.fillStyle = '#00eaff';
    ctx.beginPath();
    ctx.arc(tx, ty, 7, 0, Math.PI * 2);
    ctx.fill();
  }
});

const novaIconTexture = makeIconTexture((ctx, s) => {
  const c = s / 2;
  const glow = ctx.createRadialGradient(c, c, 8, c, c, s * 0.46);
  glow.addColorStop(0, 'rgba(255,120,40,0.6)');
  glow.addColorStop(1, 'rgba(255,80,20,0)');
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.arc(c, c, s * 0.46, 0, Math.PI * 2); ctx.fill();

  const spikes = 8, outerR = s * 0.36, innerR = s * 0.15;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const px = c + Math.cos(a) * r, py = c + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#ff6a2e';
  ctx.fill();
  ctx.strokeStyle = '#fff2e6';
  ctx.lineWidth = 3;
  ctx.stroke();
});

function makeIconSprite(texture) {
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(22, 22, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// ── PowerUp (disparo triple) ──────────────────────────────────────────────────
const powerUpGeo = new THREE.OctahedronGeometry(10, 0);
const powerUpMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00aaaa, roughness: 0.4 });

class PowerUp {
  constructor(x, z) {
    this.x = x;
    this.z = z;
    this.y = 14;
    this.radius = 10;
    this.ttl = 12;
    this.dead = false;

    this.mesh = new THREE.Group();
    this.gem = new THREE.Mesh(powerUpGeo, powerUpMat);
    this.mesh.add(this.gem);
    this.icon = makeIconSprite(tripleIconTexture);
    this.mesh.add(this.icon);

    placeMesh(this.mesh, this);
    scene.add(this.mesh);
  }

  update(dt) {
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
    this.gem.rotation.y += dt * 2.4;
    this.gem.rotation.x += dt * 1.1;
    this.icon.material.rotation += dt * 1.1;
    this.mesh.visible = !(this.ttl < 3 && Math.floor(this.ttl * 8) % 2 === 0);
    placeMesh(this.mesh, this);
  }

  remove() { scene.remove(this.mesh); }
}

// ── NovaPickup (bomba nova, ítem escaso) ──────────────────────────────────────
const novaGeo = new THREE.IcosahedronGeometry(11, 0);
const novaMat = new THREE.MeshStandardMaterial({ color: 0xff5522, emissive: 0xaa2200, roughness: 0.3 });

class NovaPickup {
  constructor(x, z) {
    this.x = x;
    this.z = z;
    this.y = 14;
    this.radius = 11;
    this.ttl = 14;
    this.dead = false;

    this.mesh = new THREE.Group();
    this.gem = new THREE.Mesh(novaGeo, novaMat);
    this.mesh.add(this.gem);
    this.icon = makeIconSprite(novaIconTexture);
    this.mesh.add(this.icon);

    placeMesh(this.mesh, this);
    scene.add(this.mesh);
  }

  update(dt) {
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
    this.gem.rotation.y += dt * 1.6;
    this.gem.rotation.x += dt * 2.1;
    this.icon.material.rotation -= dt * 1.4;
    const pulse = 1 + Math.sin(this.ttl * 6) * 0.08;
    this.mesh.scale.setScalar(pulse);
    this.mesh.visible = !(this.ttl < 3 && Math.floor(this.ttl * 8) % 2 === 0);
    placeMesh(this.mesh, this);
  }

  remove() { scene.remove(this.mesh); }
}

// ── Ship ──────────────────────────────────────────────────────────────────────
function buildShipMesh() {
  const group = new THREE.Group();

  const bodyGeo = new THREE.ConeGeometry(9, 30, 10);
  bodyGeo.rotateZ(-Math.PI / 2); // el ápice del cono queda apuntando hacia +X (nariz)
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);

  const flameGeo = new THREE.ConeGeometry(4, 16, 8);
  flameGeo.rotateZ(Math.PI / 2); // apunta hacia -X (cola)
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8800 });
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.set(-16, 0, 0);
  flame.visible = false;
  group.add(flame);
  group.userData.flame = flame;

  // Burbuja de escudo: visible solo mientras hay invencibilidad (al reaparecer).
  const bubbleGeo = new THREE.SphereGeometry(22, 20, 16);
  const bubbleMat = new THREE.MeshBasicMaterial({
    color: 0x3fa9ff,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
  bubble.visible = false;
  group.add(bubble);
  group.userData.bubble = bubble;

  return group;
}

class Ship {
  constructor() {
    this.mesh = buildShipMesh();
    scene.add(this.mesh);
    this.novaBombs = 0; // persiste entre respawns/niveles, solo se limpia en initGame()
    this.novaFlash = 0;
    this.reset();
  }

  reset() {
    this.x = W / 2;
    this.z = H / 2;
    this.y = 10;
    this.angle = 0;
    this.vx = 0;
    this.vz = 0;
    this.radius = 12;
    this.thrusting = false;
    this.invincible = 3;
    this.shootCooldown = 0;
    this.tripleShotTimer = 0;
    this.boost = 100;
    this.boosting = false;
    this.dead = false;
    this.mesh.visible = true;
  }

  update(dt) {
    if (this.dead) return;
    if (this.invincible      > 0) this.invincible      -= dt;
    if (this.shootCooldown   > 0) this.shootCooldown   -= dt;
    if (this.tripleShotTimer > 0) this.tripleShotTimer -= dt;
    if (this.novaFlash       > 0) this.novaFlash       -= dt;

    const THRUST      = 340;   // px/s²
    const DRAG        = 0.987;
    const BOOST_MULT   = 2.2;
    const BOOST_DRAIN  = 45;   // por segundo de uso
    const BOOST_REGEN  = 18;   // por segundo en reposo

    // Movimiento tipo personaje: WASD mueve el cuerpo en relación a hacia
    // dónde mira (adelante/atrás/strafe), la mirada la controla solo el mouse.
    const fx =  Math.cos(this.angle), fz = Math.sin(this.angle); // adelante
    const rx = -Math.sin(this.angle), rz = Math.cos(this.angle); // derecha

    let mx = 0, mz = 0;
    if (keys['KeyW']) { mx += fx; mz += fz; }
    if (keys['KeyS']) { mx -= fx; mz -= fz; }
    if (keys['KeyD']) { mx += rx; mz += rz; }
    if (keys['KeyA']) { mx -= rx; mz -= rz; }

    this.thrusting = mx !== 0 || mz !== 0;
    this.boosting = this.thrusting && this.boost > 0 && (keys['ShiftLeft'] || keys['ShiftRight']);

    if (this.boosting) {
      this.boost = Math.max(0, this.boost - BOOST_DRAIN * dt);
    } else {
      this.boost = Math.min(100, this.boost + BOOST_REGEN * dt);
    }

    if (this.thrusting) {
      const len = Math.hypot(mx, mz);
      const power = THRUST * (this.boosting ? BOOST_MULT : 1);
      this.vx += (mx / len) * power * dt;
      this.vz += (mz / len) * power * dt;
    }

    this.vx *= DRAG;
    this.vz *= DRAG;

    // A diferencia de asteroides/balas (que sí dan la vuelta al mundo), la
    // nave choca con un borde invisible: en primera persona, teletransportar
    // la cámara al otro lado se siente como un salto brusco y desorienta.
    const MARGIN = 20;
    let nx = this.x + this.vx * dt;
    let nz = this.z + this.vz * dt;
    if (nx < MARGIN)     { nx = MARGIN;     this.vx = 0; }
    if (nx > W - MARGIN) { nx = W - MARGIN; this.vx = 0; }
    if (nz < MARGIN)     { nz = MARGIN;     this.vz = 0; }
    if (nz > H - MARGIN) { nz = H - MARGIN; this.vz = 0; }
    this.x = nx;
    this.z = nz;

    placeMesh(this.mesh, this);
    this.mesh.rotation.y = -this.angle;

    const flame = this.mesh.userData.flame;
    flame.visible = this.thrusting && Math.random() > 0.35;

    const bubble = this.mesh.userData.bubble;
    bubble.visible = this.invincible > 0;
    if (bubble.visible) {
      bubble.material.opacity = 0.18 + Math.abs(Math.sin(this.invincible * 6)) * 0.15;
    }
  }

  tryShoot() {
    if (this.shootCooldown > 0 || this.dead) return [];
    this.shootCooldown = 0.2;
    const NOSE = 21;
    const ox = this.x + Math.cos(this.angle) * NOSE;
    const oz = this.z + Math.sin(this.angle) * NOSE;

    if (this.tripleShotTimer > 0) {
      const SPREAD = 0.18;
      return [
        new Bullet(ox, oz, this.angle - SPREAD),
        new Bullet(ox, oz, this.angle),
        new Bullet(ox, oz, this.angle + SPREAD),
      ];
    }
    return [new Bullet(ox, oz, this.angle)];
  }
}

// ── Partículas (explosión) ────────────────────────────────────────────────────
const particleGeo = new THREE.SphereGeometry(2, 6, 6);

class Particle {
  constructor(x, z) {
    this.x = x;
    this.z = z;
    this.y = rand(4, 20);
    const angle = rand(0, Math.PI * 2);
    const speed = rand(30, 130);
    this.vx = Math.cos(angle) * speed;
    this.vz = Math.sin(angle) * speed;
    this.life = rand(0.4, 1.1);
    this.ttl = this.life;
    this.dead = false;

    this.mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 });
    this.mesh = new THREE.Mesh(particleGeo, this.mat);
    placeMesh(this.mesh, this);
    scene.add(this.mesh);
  }

  update(dt) {
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.ttl -= dt;
    if (this.ttl <= 0) this.dead = true;
    this.mat.opacity = Math.max(this.ttl / this.life, 0);
    placeMesh(this.mesh, this);
  }

  remove() { scene.remove(this.mesh); this.mat.dispose(); }
}

// ── Estado del juego ──────────────────────────────────────────────────────────
let ship, bullets, asteroids, particles, powerUps, novaPickups;
let score, lives, level;
let state;      // 'playing' | 'dead' | 'gameover'
let deadTimer;

function spawnAsteroids(count) {
  const SAFE_DIST = 130;
  for (let i = 0; i < count; i++) {
    let x, z;
    do {
      x = rand(0, W);
      z = rand(0, H);
    } while (Math.hypot(x - W / 2, z - H / 2) < SAFE_DIST);
    asteroids.push(new Asteroid(x, z, 3));
  }
}

function clearGroup(arr) { arr.forEach(e => e.remove()); }

function initGame() {
  if (ship) scene.remove(ship.mesh);
  if (bullets)   clearGroup(bullets);
  if (asteroids) clearGroup(asteroids);
  if (particles) clearGroup(particles);
  if (powerUps)  clearGroup(powerUps);
  if (novaPickups) clearGroup(novaPickups);

  ship      = new Ship();
  bullets   = [];
  asteroids = [];
  particles = [];
  powerUps  = [];
  novaPickups = [];
  score = 0;
  lives = 3;
  level = 1;
  state = 'playing';
  spawnAsteroids(4);

  document.getElementById('overlay').classList.remove('show');
}

function nextLevel() {
  level++;
  clearGroup(bullets);
  clearGroup(particles);
  clearGroup(powerUps);
  clearGroup(novaPickups);
  bullets   = [];
  particles = [];
  powerUps  = [];
  novaPickups = [];
  ship.reset();
  spawnAsteroids(3 + level);
}

function explode(x, z, count = 8) {
  for (let i = 0; i < count; i++) particles.push(new Particle(x, z));
}

// ── Bomba Nova ─────────────────────────────────────────────────────────────
// Un solo uso, se recoge como ítem escaso (NovaPickup). Al activarla destruye
// de inmediato todos los asteroides que en ese instante estén dentro del
// campo visual de la cámara (no todos los del nivel, solo los visibles).
const novaFrustum = new THREE.Frustum();
const novaMatrix  = new THREE.Matrix4();

function activateNovaBomb() {
  if (!ship || ship.novaBombs <= 0 || ship.dead) return;

  updateCamera();
  camera.updateMatrixWorld(true);
  novaMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  novaFrustum.setFromProjectionMatrix(novaMatrix);

  for (const a of asteroids) {
    if (a.dead) continue;
    const inView = novaFrustum.intersectsSphere(new THREE.Sphere(a.mesh.position, a.radius));
    if (!inView) continue;
    a.dead = true;
    score += POINTS[a.size];
    explode(a.x, a.z, a.size * 8);
  }
  asteroids.filter(a => a.dead).forEach(a => a.remove());
  asteroids = asteroids.filter(a => !a.dead);

  ship.novaBombs -= 1;
  ship.novaFlash = 0.35;
}

function killShip() {
  explode(ship.x, ship.z, 14);
  ship.dead = true;
  ship.mesh.visible = false;
  lives--;
  if (lives <= 0) {
    state = 'gameover';
    document.getElementById('overlay').classList.add('show');
  } else {
    state = 'dead';
    deadTimer = 2;
  }
}

// ── Update ────────────────────────────────────────────────────────────────────
function update(dt) {
  if (state === 'gameover') {
    if (pressed('Space')) initGame();
    particles.forEach(p => p.update(dt));
    particles.filter(p => p.dead).forEach(p => p.remove());
    particles = particles.filter(p => !p.dead);
    return;
  }

  if (state === 'dead') {
    deadTimer -= dt;
    particles.forEach(p => p.update(dt));
    particles.filter(p => p.dead).forEach(p => p.remove());
    particles = particles.filter(p => !p.dead);
    asteroids.forEach(a => a.update(dt));
    if (deadTimer <= 0) { state = 'playing'; ship.reset(); }
    return;
  }

  // Disparar (mantener espacio o clic izquierdo dispara sin parar, según el cooldown)
  if (keys['Space'] || mouseDown) {
    bullets.push(...ship.tryShoot());
  }

  ship.update(dt);
  bullets.forEach(b => b.update(dt));
  asteroids.forEach(a => a.update(dt));
  particles.forEach(p => p.update(dt));
  powerUps.forEach(p => p.update(dt));
  novaPickups.forEach(p => p.update(dt));

  // Activar la bomba nova (tecla F): destruye todos los asteroides que estén
  // en ese instante dentro del campo visual de la cámara.
  if (pressed('KeyF')) activateNovaBomb();

  bullets.filter(b => b.dead).forEach(b => b.remove());
  particles.filter(p => p.dead).forEach(p => p.remove());
  bullets   = bullets.filter(b => !b.dead);
  particles = particles.filter(p => !p.dead);

  // Bala vs asteroide
  const newAsteroids = [];
  const newPowerUps  = [];
  const newNovaPickups = [];
  for (const b of bullets) {
    for (const a of asteroids) {
      if (!a.dead && !b.dead && dist(b, a) < a.radius) {
        b.dead = true;
        a.dead = true;
        score += POINTS[a.size];
        explode(a.x, a.z, a.size * 5);
        newAsteroids.push(...a.split());
        if (Math.random() < 0.10) newPowerUps.push(new PowerUp(a.x, a.z));
        if (Math.random() < 0.025) newNovaPickups.push(new NovaPickup(a.x, a.z));
      }
    }
  }
  asteroids.filter(a => a.dead).forEach(a => a.remove());
  bullets.filter(b => b.dead).forEach(b => b.remove());
  asteroids = asteroids.filter(a => !a.dead).concat(newAsteroids);
  bullets   = bullets.filter(b => !b.dead);
  powerUps  = powerUps.concat(newPowerUps);
  novaPickups = novaPickups.concat(newNovaPickups);

  // Nave vs power-up
  for (const p of powerUps) {
    if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
      p.dead = true;
      ship.tripleShotTimer = 10;
    }
  }
  powerUps.filter(p => p.dead).forEach(p => p.remove());
  powerUps = powerUps.filter(p => !p.dead);

  // Nave vs ítem de bomba nova
  for (const p of novaPickups) {
    if (!p.dead && dist(ship, p) < ship.radius + p.radius) {
      p.dead = true;
      ship.novaBombs += 1;
    }
  }
  novaPickups.filter(p => p.dead).forEach(p => p.remove());
  novaPickups = novaPickups.filter(p => !p.dead);

  // Nave vs asteroide
  if (ship.invincible <= 0) {
    for (const a of asteroids) {
      if (dist(ship, a) < ship.radius + a.radius * 0.82) {
        killShip();
        break;
      }
    }
  }

  // Nivel completado
  if (asteroids.length === 0) nextLevel();
}

// ── HUD (overlay DOM en vez de dibujado en canvas) ────────────────────────────
const hudScore  = document.querySelector('#hud .score');
const hudLevel  = document.querySelector('#hud .level');
const hudLives  = document.querySelector('#hud .lives');
const hudTriple = document.querySelector('#hud .triple');
const hudShield = document.querySelector('#hud .shield');
const hudBoostFill = document.querySelector('#hud .boost-fill');
const hudNova = document.querySelector('#hud .nova');
const novaFlashEl = document.getElementById('novaFlash');
const overlaySub = document.querySelector('#overlay .sub');

// ── Minimapa / radar ───────────────────────────────────────────────────────
const minimapEl = document.getElementById('minimap');
const mctx = minimapEl.getContext('2d');
const MAP_SIZE  = minimapEl.width;
const MAP_CX    = MAP_SIZE / 2;
const MAP_CY    = MAP_SIZE / 2;
const MAP_RADIUS = MAP_SIZE / 2 - 4;
const MAP_RANGE  = 320; // radio en unidades lógicas que abarca el radar

// Proyecta una posición del mundo a coordenadas del radar, relativas a la
// nave y orientadas según hacia dónde mira (arriba del radar = adelante).
// Usa la distancia más corta considerando que el mundo da la vuelta
// (toroidal) para que los asteroides que "envuelven" el borde no salgan mal.
function projectToMap(x, z) {
  const dx = x - ship.x;
  const dz = z - ship.z;

  const cosA = Math.cos(ship.angle), sinA = Math.sin(ship.angle);
  const forward = dx * cosA + dz * sinA;
  const right   = dx * -sinA + dz * cosA;
  const d = Math.hypot(dx, dz);
  const scale = MAP_RADIUS / MAP_RANGE;
  return { x: MAP_CX + right * scale, y: MAP_CY - forward * scale, d };
}

function drawMinimap() {
  mctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
  mctx.save();
  mctx.beginPath();
  mctx.arc(MAP_CX, MAP_CY, MAP_RADIUS, 0, Math.PI * 2);
  mctx.clip();

  // anillos de referencia
  mctx.strokeStyle = 'rgba(120,200,255,0.18)';
  mctx.lineWidth = 1;
  for (const f of [0.33, 0.66, 1]) {
    mctx.beginPath();
    mctx.arc(MAP_CX, MAP_CY, MAP_RADIUS * f, 0, Math.PI * 2);
    mctx.stroke();
  }

  for (const a of asteroids) {
    const p = projectToMap(a.x, a.z);
    if (p.d > MAP_RANGE) continue;
    mctx.fillStyle = 'rgba(210,210,220,0.9)';
    mctx.beginPath();
    mctx.arc(p.x, p.y, 1.5 + a.size * 1.1, 0, Math.PI * 2);
    mctx.fill();
  }

  for (const pu of powerUps) {
    const p = projectToMap(pu.x, pu.z);
    if (p.d > MAP_RANGE) continue;
    mctx.fillStyle = '#00eaff';
    mctx.beginPath();
    mctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    mctx.fill();
  }

  for (const np of novaPickups) {
    const p = projectToMap(np.x, np.z);
    if (p.d > MAP_RANGE) continue;
    mctx.fillStyle = '#ff5522';
    mctx.beginPath();
    mctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    mctx.fill();
  }

  mctx.restore();

  // nave: siempre fija en el centro apuntando "hacia arriba" (radar orientado
  // según hacia dónde mira, no según el norte del mapa).
  mctx.save();
  mctx.translate(MAP_CX, MAP_CY);
  mctx.fillStyle = '#fff';
  mctx.beginPath();
  mctx.moveTo(0, -7);
  mctx.lineTo(5, 6);
  mctx.lineTo(0, 3);
  mctx.lineTo(-5, 6);
  mctx.closePath();
  mctx.fill();
  mctx.restore();
}

function drawHUD() {
  hudScore.textContent = `SCORE ${score}`;
  hudLevel.textContent = `NIVEL ${level}`;
  hudLives.textContent = '▲ '.repeat(Math.max(lives, 0)).trim();
  hudTriple.textContent = ship.tripleShotTimer > 0 ? `TRIPLE ${ship.tripleShotTimer.toFixed(1)}s` : '';
  hudShield.style.display = ship.invincible > 0 ? 'block' : 'none';
  hudBoostFill.style.width = `${ship.boost}%`;
  hudBoostFill.style.background = ship.boosting ? '#ffaa00' : (ship.boost < 30 ? '#a33' : '#6cf');
  hudNova.textContent = ship.novaBombs > 0 ? `BOMBA NOVA ×${ship.novaBombs} [F]` : '';
  novaFlashEl.style.opacity = ship.novaFlash > 0 ? (ship.novaFlash / 0.35) * 0.8 : 0;
  if (state === 'gameover') overlaySub.textContent = `PUNTAJE: ${score}   —   ESPACIO PARA REINICIAR`;
}

// ── Loop principal ────────────────────────────────────────────────────────────
let lastTime = null;

function loop(ts) {
  const dt = lastTime === null ? 0 : Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  update(dt);
  updateCamera();
  drawHUD();
  drawMinimap();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

initGame();
requestAnimationFrame(loop);
