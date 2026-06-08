const canvas = document.getElementById('game')
const ctx = canvas.getContext('2d')
const W = canvas.width, H = canvas.height
const useThree = false

let keys = {}
document.addEventListener('keydown', e=>{keys[e.key]=true})
document.addEventListener('keyup', e=>{keys[e.key]=false})

const restartBtn = document.getElementById('restart')
const statusEl = document.getElementById('status')
const leftBtn = document.getElementById('left-btn')
const upBtn = document.getElementById('up-btn')
const rightBtn = document.getElementById('right-btn')
const goalScreenEl = document.getElementById('goal-screen')
const retryBtn = document.getElementById('retry-btn')

const GRAVITY = 0.8

let renderer = null
let scene = null
let camera = null
let worldGroup = null
const platformMeshes = []
const pipeMeshes = []
const obstacleMeshes = []
const enemyMeshes = []
let playerMesh = null
let goalMesh = null
let materials = null

if(useThree){
	renderer = new THREE.WebGLRenderer({canvas, antialias:true})
	renderer.setPixelRatio(window.devicePixelRatio || 1)
	renderer.setSize(W, H)
	renderer.setClearColor(0x87ceeb)

	scene = new THREE.Scene()

	camera = new THREE.OrthographicCamera(0, W, 0, H, -1000, 1000)
	camera.position.set(W / 2, H / 2, 100)
	camera.lookAt(new THREE.Vector3(W / 2, H / 2, 0))

	materials = {
		ground: new THREE.MeshBasicMaterial({color: 0x6bbf3d}),
		platform: new THREE.MeshBasicMaterial({color: 0x8b5a2b}),
		pipe: new THREE.MeshBasicMaterial({color: 0x2ecc71}),
		pipeTop: new THREE.MeshBasicMaterial({color: 0x27ae60}),
		obstacle: new THREE.MeshBasicMaterial({color: 0xe74c3c}),
		enemy: new THREE.MeshBasicMaterial({color: 0x229954}),
		player: new THREE.MeshBasicMaterial({color: 0xff6b6b}),
		goalPole: new THREE.MeshBasicMaterial({color: 0x8b4513}),
		goalFlag: new THREE.MeshBasicMaterial({color: 0xffcc00}),
		goalAccent: new THREE.MeshBasicMaterial({color: 0xffd700})
	}

	worldGroup = new THREE.Group()
	scene.add(worldGroup)
}

function createMesh(geometry, material){
	if(!useThree) return null
	return new THREE.Mesh(geometry, material)
}

function worldYFromCanvas(y, h){
	return y + h / 2
}

const audioContext = new (window.AudioContext || window.webkitAudioContext)()
const bgmGain = audioContext.createGain()
let bgmStarted = false
let bgmIntervalId = null
bgmGain.gain.value = 0.35
bgmGain.connect(audioContext.destination)

function playBGMNote(startTime, freq, duration, type='sine', volume=0.05, pan=0){
	// Create a smoother, warmer voice by combining two oscillators and a gentle low-pass filter
	const osc1 = audioContext.createOscillator()
	const osc2 = audioContext.createOscillator()
	const filter = audioContext.createBiquadFilter()
	const gain = audioContext.createGain()
	const panner = audioContext.createStereoPanner()

	osc1.type = 'sine'
	osc2.type = 'sawtooth'
	osc1.frequency.value = freq
	// slight detune for warmth
	osc2.frequency.value = freq * 0.997
	osc2.detune.value = -8

	filter.type = 'lowpass'
	filter.frequency.value = Math.min(1400, Math.max(600, freq * 2))
	filter.Q.value = 0.7

	// smoother envelope: slightly longer attack and release
	gain.gain.setValueAtTime(0.0001, startTime)
	gain.gain.linearRampToValueAtTime(volume, startTime + 0.06)
	gain.gain.setValueAtTime(volume * 0.95, startTime + duration - 0.06)
	gain.gain.linearRampToValueAtTime(0.0001, startTime + duration)

	panner.pan.value = pan

	osc1.connect(filter)
	osc2.connect(filter)
	filter.connect(gain)
	gain.connect(panner)
	panner.connect(bgmGain)

	osc1.start(startTime)
	osc2.start(startTime)
	osc1.stop(startTime + duration + 0.05)
	osc2.stop(startTime + duration + 0.05)
}

// Smooth evolving pad for ambient background
function playPad(startTime, duration, baseFreq=220, volume=0.08, pan=0){
	const oscA = audioContext.createOscillator()
	const oscB = audioContext.createOscillator()
	const oscC = audioContext.createOscillator()
	const filter = audioContext.createBiquadFilter()
	const gain = audioContext.createGain()
	const panner = audioContext.createStereoPanner()

	oscA.type = 'sine'
	oscB.type = 'sawtooth'
	oscC.type = 'sine'
	oscA.frequency.value = baseFreq
	oscB.frequency.value = baseFreq * 2.001
	oscC.frequency.value = baseFreq * 0.5
	oscB.detune.value = 6
	oscC.detune.value = -4

	// gentle lowpass that evolves
	filter.type = 'lowpass'
	filter.frequency.setValueAtTime(800, startTime)
	filter.frequency.linearRampToValueAtTime(1600, startTime + duration * 0.5)
	filter.frequency.linearRampToValueAtTime(700, startTime + duration)
	filter.Q.value = 0.8

	// slow LFO on detune for movement
	const lfo = audioContext.createOscillator()
	const lfoGain = audioContext.createGain()
	lfo.type = 'sine'
	lfo.frequency.value = 0.05
	lfoGain.gain.value = 6
	lfo.connect(lfoGain)
	lfoGain.connect(oscA.detune)

	// smooth pad envelope
	gain.gain.setValueAtTime(0.0001, startTime)
	gain.gain.linearRampToValueAtTime(volume, startTime + 0.8)
	gain.gain.setValueAtTime(volume * 0.95, startTime + duration - 0.8)
	gain.gain.linearRampToValueAtTime(0.0001, startTime + duration)

	panner.pan.value = pan

	oscA.connect(filter)
	oscB.connect(filter)
	oscC.connect(filter)
	filter.connect(gain)
	gain.connect(panner)
	panner.connect(bgmGain)

	lfo.start(startTime)
	oscA.start(startTime)
	oscB.start(startTime)
	oscC.start(startTime)
	oscA.stop(startTime + duration + 0.1)
	oscB.stop(startTime + duration + 0.1)
	oscC.stop(startTime + duration + 0.1)
	lfo.stop(startTime + duration + 0.1)
}

function scheduleBGM(){
	if(audioContext.state === 'suspended') return
	const start = audioContext.currentTime + 0.05
	const total = 20.0 // 20 seconds loop

	// Main evolving pad spanning the whole loop
	playPad(start, total, 110, 0.12, -0.1)
	playPad(start, total, 176, 0.09, 0.12)

	// Sparse arpeggio for interest (gentle)
	const arpeggio = [220, 277.18, 329.63, 392.00, 440.00, 349.23, 293.66, 246.94]
	for(let i=0;i<arpeggio.length;i++){
		const t = (i / arpeggio.length) * total
		playBGMNote(start + t, arpeggio[i], 0.6, 'sine', 0.08, (i % 2 ? -0.15 : 0.15))
	}

	// Gentle bass pulses
	for(let i=0;i<6;i++){
		const t = (i / 6) * total
		playBGMNote(start + t, 82.41, 1.2, 'sine', 0.06, -0.2)
	}
}

function startBGM(){
	if(bgmStarted) return
	bgmStarted = true
	if(audioContext.state === 'suspended') audioContext.resume()
	scheduleBGM()
	bgmIntervalId = setInterval(scheduleBGM, 20000)
}

function initAudio(){
	if(bgmStarted) return
	if(audioContext.state === 'suspended') audioContext.resume()
	startBGM()
}

window.addEventListener('pointerdown', initAudio, {once:true})
window.addEventListener('keydown', initAudio, {once:true})

function playJumpSound(){
	if(audioContext.state === 'suspended') audioContext.resume()
	if(!bgmStarted) startBGM()
	const osc = audioContext.createOscillator()
	const gain = audioContext.createGain()
	const panner = audioContext.createStereoPanner()
	osc.type = 'triangle'
	osc.frequency.value = 520
	gain.gain.value = 0.08
	panner.pan.value = 0.15
	osc.connect(gain)
	gain.connect(panner)
	panner.connect(audioContext.destination)
	osc.start()
	osc.stop(audioContext.currentTime + 0.18)
	gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.18)
}

let level = {
	width: 3000,
	platforms: [],
	pipes: [],
	obstacles: [],
	enemies: [],
	goal: {x: 2700, y: 80, w: 40, h: 340}
}

function buildLevel(){
	level.platforms = []
	// ground
	level.platforms.push({x:0,y:420,w:level.width,h:60})
	// some platforms
	level.platforms.push({x:300,y:340,w:140,h:20})
	level.platforms.push({x:520,y:280,w:120,h:20})
	level.platforms.push({x:700,y:220,w:100,h:20})
	level.platforms.push({x:980,y:300,w:160,h:20})
	level.platforms.push({x:1300,y:360,w:200,h:20})
	level.platforms.push({x:1650,y:300,w:140,h:20})
	level.platforms.push({x:2000,y:340,w:120,h:20})
	level.platforms.push({x:2350,y:280,w:140,h:20})

	// pipes (as tall platforms with green)
	level.pipes = [
		{x:420,y:360,w:60,h:60},
		{x:1500,y:360,w:60,h:100},
		{x:2200,y:360,w:60,h:80}
	]

	// obstacles (spikes)
	level.obstacles = [
		{x:850,y:400,w:40,h:20},
		{x:1080,y:400,w:40,h:20},
		{x:1800,y:400,w:40,h:20}
	]

	// enemies (koopa-like)
	level.enemies = [
		{x:500,y:300,w:30,h:30,vx:-2,dir:-1},
		{x:1200,y:320,w:30,h:30,vx:2.5,dir:1},
		{x:1900,y:280,w:30,h:30,vx:-2.2,dir:-1}
	]
	buildScene()
}

const player = {
	x: 60, y: 360, w: 28, h: 40,
	vx:0, vy:0,
	speed:5.2, jump:18, onGround:false,
	fallingToGoal: false, fallTarget: 0
}

let cameraX = 0
let won = false
let wonTime = 0

function reset(){
	player.x = 60; player.y = 360; player.vx=0; player.vy=0; won=false; wonTime=0; statusEl.textContent=''; goalScreenEl.style.display='none'
	player.fallingToGoal = false
}

restartBtn.addEventListener('click', ()=>{reset()})
retryBtn.addEventListener('click', ()=>{reset()})

function bindTouchButton(button, keyName){
	const setDown = ()=>{keys[keyName] = true}
	const setUp = ()=>{keys[keyName] = false}
	button.addEventListener('pointerdown', e=>{e.preventDefault(); setDown()})
	button.addEventListener('pointerup', e=>{e.preventDefault(); setUp()})
	button.addEventListener('pointercancel', setUp)
	button.addEventListener('pointerleave', setUp)
}

bindTouchButton(leftBtn, 'ArrowLeft')
bindTouchButton(upBtn, 'ArrowUp')
bindTouchButton(rightBtn, 'ArrowRight')

function rectsOverlap(a,b){
	return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y
}

function update(){
	if(won && !player.fallingToGoal){
		wonTime++
		if(wonTime > 20){
			player.fallingToGoal = true
			player.fallTarget = level.goal.y + 320
		}
		return
	}

	if(player.fallingToGoal){
		player.vy += GRAVITY
		player.y += player.vy
		if(player.y >= player.fallTarget){ player.y = player.fallTarget; goalScreenEl.style.display='flex' }
		return
	}

	// input
	let left = keys['ArrowLeft'] || keys['a']
	let right = keys['ArrowRight'] || keys['d']
	let up = keys['ArrowUp'] || keys['w'] || keys[' ']

	if(left) player.vx = -player.speed
	else if(right) player.vx = player.speed
	else player.vx = 0

	if(up && player.onGround){
		player.vy = -player.jump
		player.onGround = false
		playJumpSound()
	}

	// gravity
	player.vy += GRAVITY

	// move horizontally, check collisions
	player.x += player.vx
	resolveCollisions('x')

	// move vertically
	player.y += player.vy
	player.onGround = false
	resolveCollisions('y')

	// obstacles
	for(const o of level.obstacles){ if(rectsOverlap(player,o)){ reset(); break } }

	// enemies
	for(const e of level.enemies){ 
		e.x += e.vx
		if(e.x < 0 || e.x > level.width) e.vx *= -1
		if(rectsOverlap(player,e)){ reset(); break }
	}

	// goal - flag collision (x: 2680-2760, y: 80-420)
	if(player.x + player.w > level.goal.x - 40 && player.x < level.goal.x + 40 && player.y < level.goal.y + level.goal.h){
		won = true; wonTime = 0
	}

	// camera
	cameraX = player.x - W*0.3
	if(cameraX < 0) cameraX = 0
	if(cameraX > level.width - W) cameraX = level.width - W
}

function resolveCollisions(axis){
	const boxes = level.platforms.concat(level.pipes)
	for(const p of boxes){
		const plat = {x:p.x, y:p.y, w:p.w, h:p.h}
		if(rectsOverlap(player,plat)){
			if(axis==='y'){
				if(player.vy > 0){ // falling
					player.y = plat.y - player.h; player.vy = 0; player.onGround = true
				} else if(player.vy < 0){ // moving up
					player.y = plat.y + plat.h; player.vy = 0
				}
			} else if(axis==='x'){
				if(player.vx > 0){ player.x = plat.x - player.w; }
				else if(player.vx < 0){ player.x = plat.x + plat.w; }
				player.vx = 0
			}
		}
	}
}

function buildScene(){
	if(!useThree) return
	while(worldGroup.children.length) worldGroup.remove(worldGroup.children[0])
	platformMeshes.length = 0
	pipeMeshes.length = 0
	obstacleMeshes.length = 0
	enemyMeshes.length = 0

	const groundMesh = createMesh(new THREE.PlaneGeometry(level.width, 60), materials.ground)
	groundMesh.position.set(level.width / 2, 450, 0)
	worldGroup.add(groundMesh)

	for(const p of level.platforms){
		const mesh = createMesh(new THREE.PlaneGeometry(p.w, p.h), materials.platform)
		mesh.position.set(p.x + p.w / 2, p.y + p.h / 2, 0)
		platformMeshes.push(mesh)
		worldGroup.add(mesh)
	}

	for(const p of level.pipes){
		const pipeBody = createMesh(new THREE.PlaneGeometry(p.w, p.h), materials.pipe)
		pipeBody.position.set(p.x + p.w / 2, p.y + p.h / 2, 0)
		worldGroup.add(pipeBody)

		const pipeTop = createMesh(new THREE.PlaneGeometry(p.w + 12, 12), materials.pipeTop)
		pipeTop.position.set(p.x + p.w / 2, p.y + 6, 0.1)
		worldGroup.add(pipeTop)
		pipeMeshes.push(pipeBody)
	}

	for(const o of level.obstacles){
		const mesh = createMesh(new THREE.PlaneGeometry(o.w, o.h), materials.obstacle)
		mesh.position.set(o.x + o.w / 2, o.y + o.h / 2, 0)
		obstacleMeshes.push(mesh)
		worldGroup.add(mesh)
	}

	for(const e of level.enemies){
		const mesh = createMesh(new THREE.PlaneGeometry(e.w, e.h), materials.enemy)
		mesh.position.set(e.x + e.w / 2, e.y + e.h / 2, 0)
		enemyMeshes.push(mesh)
		worldGroup.add(mesh)
	}

	const goalPole = createMesh(new THREE.PlaneGeometry(8, level.goal.h), materials.goalPole)
	goalPole.position.set(level.goal.x + 24, level.goal.y + level.goal.h / 2, 0)
	worldGroup.add(goalPole)

	const goalFlag = createMesh(new THREE.PlaneGeometry(80, 50), materials.goalFlag)
	goalFlag.position.set(level.goal.x, level.goal.y + 45, 0)
	goalFlag.rotation.z = -0.05
	worldGroup.add(goalFlag)

	const goalAccent = createMesh(new THREE.PlaneGeometry(20, 20), materials.goalAccent)
	goalAccent.position.set(level.goal.x + 13, level.goal.y + 45, 0.1)
	worldGroup.add(goalAccent)

	if(playerMesh){ worldGroup.remove(playerMesh) }
	playerMesh = createMesh(new THREE.CircleGeometry(14, 32), materials.player)
	playerMesh.position.set(player.x + player.w / 2, player.y + player.h / 2, 0)
	worldGroup.add(playerMesh)
}

function updateScene(){
	if(!useThree) return
	playerMesh.position.set(player.x + player.w / 2, player.y + player.h / 2, 0)
	for(let i = 0; i < level.enemies.length; i++){
		enemyMeshes[i].position.set(level.enemies[i].x + level.enemies[i].w / 2, level.enemies[i].y + level.enemies[i].h / 2, 0)
	}
	const camX = Math.min(Math.max(player.x - W * 0.3, 0), level.width - W)
	camera.position.set(camX + W / 2, H / 2, 100)
	camera.updateProjectionMatrix()
}

function draw(){
	if(useThree){
		updateScene()
		renderer.render(scene, camera)
		return
	}

	// Fallback 2D rendering
	ctx.clearRect(0,0,W,H)
	ctx.fillStyle = '#87ceeb'
	ctx.fillRect(0,0,W,H)

	ctx.save()
	ctx.translate(-cameraX,0)

	for(const p of level.platforms){ ctx.fillStyle = '#654321'; ctx.fillRect(p.x,p.y,p.w,p.h) }
	for(const p of level.pipes){ ctx.fillStyle = '#2ecc71'; ctx.fillRect(p.x,p.y,p.w,p.h); ctx.fillStyle='#1e7f3b'; ctx.fillRect(p.x-6,p.y-8,p.w+12,8) }
	for(const o of level.obstacles){ ctx.fillStyle = '#e74c3c'; ctx.fillRect(o.x,o.y,o.w,o.h); drawSpikes(o.x,o.y,o.w,o.h) }
	for(const e of level.enemies){ drawEnemy(e.x, e.y, e.dir) }
	drawGoal()
	drawPlayer(player.x, player.y)

	ctx.restore()
}

function drawSpikes(x,y,w,h){
	ctx.fillStyle = '#ffffff'
	const spikeW = w/4
	for(let i=0;i<4;i++){
		const sx = x + i*spikeW
		ctx.beginPath(); ctx.moveTo(sx, y+h); ctx.lineTo(sx+spikeW/2, y); ctx.lineTo(sx+spikeW, y+h); ctx.closePath(); ctx.fill();
		ctx.strokeStyle='#b30000'; ctx.stroke();
	}
}

function drawPlayer(px, py){
	// body
	ctx.fillStyle = '#ff6b6b'
	ctx.beginPath(); ctx.arc(px+14, py+12, 10, 0, Math.PI*2); ctx.fill()
	// legs
	ctx.fillStyle = '#ff6b6b'; ctx.fillRect(px+8, py+22, 5, 10); ctx.fillRect(px+15, py+22, 5, 10)
	// eyes
	ctx.fillStyle = '#000'; ctx.fillRect(px+10, py+8, 2, 2); ctx.fillRect(px+16, py+8, 2, 2)
	// smile
	ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px+13, py+12, 2.5, 0, Math.PI); ctx.stroke()
}

function drawGoal(){
	const gx = level.goal.x, gy = level.goal.y
	// pole (long)
	ctx.fillStyle = '#8b4513'; ctx.fillRect(gx+16, gy, 8, 340)
	// flag (larger)
	ctx.fillStyle = '#ffcc00'; ctx.fillRect(gx-40, gy+20, 80, 50)
	ctx.strokeStyle = '#cc9900'; ctx.lineWidth = 2; ctx.strokeRect(gx-40, gy+20, 80, 50)
	// flag wave effect
	ctx.fillStyle = '#ffd700'; ctx.fillRect(gx+15, gy+30, 20, 20)
}

function drawEnemy(ex, ey, dir){
	// shell (Koopa-like)
	ctx.fillStyle = '#27ae60'
	ctx.fillRect(ex, ey, 30, 20)
	ctx.fillStyle = '#229954'; ctx.fillRect(ex+2, ey+2, 10, 12); ctx.fillRect(ex+18, ey+2, 10, 12)
	// head
	ctx.fillStyle = '#1abc9c'; ctx.beginPath(); ctx.arc(ex+15, ey-6, 8, 0, Math.PI*2); ctx.fill()
	// eyes
	ctx.fillStyle = '#000'; ctx.fillRect(ex+12, ey-8, 2, 2); ctx.fillRect(ex+18, ey-8, 2, 2)
	// direction indicator
	if(dir > 0) { ctx.fillStyle = '#fff'; ctx.fillRect(ex+26, ey+6, 4, 2) }
	else { ctx.fillStyle = '#fff'; ctx.fillRect(ex, ey+6, 4, 2) }
}

function loop(){ update(); draw(); requestAnimationFrame(loop) }

buildLevel(); reset(); loop();


