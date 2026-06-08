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
const coinMeshes = []
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
		goalAccent: new THREE.MeshBasicMaterial({color: 0xffd700}),
		coin: new THREE.MeshBasicMaterial({color: 0xffd700})
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

// External BGM support
let externalBuffer = null
let externalSource = null
let useExternalBGM = false

async function loadExternalBGM(url){
	try{
		statusEl.textContent = '外部BGMを読み込み中…'
		const res = await fetch(url)
		if(!res.ok) throw new Error('fetch failed')
		const ab = await res.arrayBuffer()
		const decoded = await audioContext.decodeAudioData(ab)
		externalBuffer = decoded
		statusEl.textContent = '外部BGM準備完了'
		return true
	}catch(e){
		console.warn('外部BGM読み込み失敗', e)
		statusEl.textContent = ''
		return false
	}
}

function playExternalBGMLoop(){
	if(!externalBuffer) return false
	stopBGM()
	externalSource = audioContext.createBufferSource()
	externalSource.buffer = externalBuffer
	externalSource.loop = true
	externalSource.connect(bgmGain)
	if(audioContext.state === 'suspended') audioContext.resume()
	externalSource.start()
	useExternalBGM = true
	return true
}

function stopExternalBGM(){
	try{ if(externalSource){ externalSource.stop(); externalSource.disconnect() } }catch(e){}
	externalSource = null
	useExternalBGM = false
}

function stopBGM(){
	if(bgmIntervalId) { clearInterval(bgmIntervalId); bgmIntervalId = null }
	stopExternalBGM()
}

// Try a small list of free example URLs (fallback to synth if none work)
async function attemptLoadExternalBGM(){
	if(externalBuffer) return true
	const candidates = [
		'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
		'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3'
	]
	for(const url of candidates){
		// try load (do not throw on first failure)
		const ok = await loadExternalBGM(url)
		if(ok) return true
	}
	return false
}

function playBGMNote(startTime, freq, duration, type='square', volume=0.08, pan=0){
	const osc1 = audioContext.createOscillator()
	const osc2 = audioContext.createOscillator()
	const filter = audioContext.createBiquadFilter()
	const gain = audioContext.createGain()
	const panner = audioContext.createStereoPanner()

	osc1.type = type
	osc2.type = type
	osc1.frequency.value = freq
	osc2.frequency.value = freq * 0.998
	osc2.detune.value = -10

	filter.type = 'lowpass'
	filter.frequency.value = 1200
	filter.Q.value = 1.0

	gain.gain.setValueAtTime(0.0001, startTime)
	gain.gain.linearRampToValueAtTime(volume, startTime + 0.01)
	gain.gain.setValueAtTime(volume * 0.8, startTime + duration - 0.03)
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

	const melody = [
		[659.25, 0.16], [523.25, 0.16], [659.25, 0.16], [783.99, 0.48],
		[0, 0.12], [391.99, 0.16], [523.25, 0.16], [0, 0.12],
		[392.00, 0.16], [0, 0.12], [329.63, 0.16], [0, 0.12],
		[261.63, 0.16], [0, 0.12], [329.63, 0.16], [0.24]
	]

	let offset = 0
	for(const [freq, dur] of melody){
		if(freq > 0) playBGMNote(start + offset, freq, dur, 'square', 0.12, (offset % 0.4) - 0.2)
		offset += dur
	}

	const bass = [
		[130.81, 0.4], [130.81, 0.4], [130.81, 0.4], [0, 0.2],
		[164.81, 0.4], [164.81, 0.4], [164.81, 0.4], [0, 0.2],
		[196.00, 0.4], [196.00, 0.4], [196.00, 0.4], [0, 0.2]
	]

	offset = 0
	for(const [freq, dur] of bass){
		if(freq > 0) playBGMNote(start + offset, freq, dur, 'square', 0.06, -0.25)
		offset += dur
	}

	const flourishes = [
		[523.25, 0.1], [587.33, 0.1], [659.25, 0.1], [783.99, 0.24]
	]
	offset = 8.5
	for(const [freq, dur] of flourishes){
		playBGMNote(start + offset, freq, dur, 'square', 0.07, 0.2)
		offset += dur
	}
}

async function startBGM(){
	if(bgmStarted) return
	bgmStarted = true
	if(audioContext.state === 'suspended') await audioContext.resume()

	// Always use the built-in Mario-style synth BGM
	scheduleBGM()
	bgmIntervalId = setInterval(scheduleBGM, 16000)
}

function playVictoryBGM(){
	// stop current BGM while victory plays
	stopBGM()
	stopExternalBGM()
	if(audioContext.state === 'suspended') audioContext.resume()
	const start = audioContext.currentTime + 0.05
	const chords = [
		[523.25, 659.25, 783.99],
		[659.25, 783.99, 987.77],
		[783.99, 987.77, 1174.66]
	]
	let offset = 0
	for(const ch of chords){
		for(const f of ch){
			playBGMNote(start + offset, f, 0.6, 'sine', 0.26, 0)
		}
		offset += 0.7
	}

	// short flourish
	playBGMNote(start + offset, 1318.51, 0.18, 'sine', 0.22, 0.1)
	playBGMNote(start + offset + 0.18, 1174.66, 0.2, 'sine', 0.18, -0.1)

	// resume previous BGM after victory
	const resumeAfter = offset + 0.7
	setTimeout(()=>{
		// restart BGM (external preferred)
		if(externalBuffer){ playExternalBGMLoop() }
		else { scheduleBGM(); bgmIntervalId = setInterval(scheduleBGM, 20000) }
	}, resumeAfter * 1000)
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
	width: 9000,
	platforms: [],
	pipes: [],
	obstacles: [],
	enemies: [],
	coins: [],
	goal: {x: 8700, y: 80, w: 40, h: 340}
}

function buildLevel(){
	level.platforms = []
	// ground segments with cliffs/gaps
	level.platforms.push({x:0,y:420,w:800,h:60})
	level.platforms.push({x:950,y:420,w:700,h:60})
	level.platforms.push({x:1750,y:420,w:900,h:60})
	level.platforms.push({x:2800,y:420,w:650,h:60})
	level.platforms.push({x:3600,y:420,w:800,h:60})
	level.platforms.push({x:4550,y:420,w:600,h:60})
	level.platforms.push({x:5250,y:420,w:850,h:60})
	level.platforms.push({x:6200,y:420,w:700,h:60})
	level.platforms.push({x:7050,y:420,w:900,h:60})
	level.platforms.push({x:8150,y:420,w:700,h:60})

	// raised platforms and cliffs
	level.platforms.push({x:600,y:360,w:140,h:20})
	level.platforms.push({x:920,y:300,w:120,h:20})
	level.platforms.push({x:1250,y:260,w:100,h:20})
	level.platforms.push({x:1580,y:320,w:180,h:20})
	level.platforms.push({x:2100,y:280,w:120,h:20})
	level.platforms.push({x:2450,y:220,w:140,h:20})
	level.platforms.push({x:3000,y:340,w:160,h:20})
	level.platforms.push({x:3450,y:280,w:100,h:20})
	level.platforms.push({x:3900,y:240,w:120,h:20})
	level.platforms.push({x:4300,y:300,w:140,h:20})
	level.platforms.push({x:4700,y:260,w:100,h:20})
	level.platforms.push({x:5100,y:320,w:180,h:20})
	level.platforms.push({x:5600,y:280,w:120,h:20})
	level.platforms.push({x:6000,y:240,w:140,h:20})
	level.platforms.push({x:6500,y:300,w:160,h:20})
	level.platforms.push({x:7000,y:260,w:120,h:20})
	level.platforms.push({x:7450,y:320,w:140,h:20})
	level.platforms.push({x:7800,y:280,w:120,h:20})
	level.platforms.push({x:8200,y:240,w:140,h:20})

	// pipes (as tall platforms with green)
	level.pipes = [
		{x:420,y:360,w:60,h:60},
		{x:1600,y:360,w:60,h:100},
		{x:2900,y:360,w:60,h:80},
		{x:5400,y:360,w:60,h:90},
		{x:7600,y:360,w:60,h:90}
	]

	// obstacles (spikes and cliff edges)
	level.obstacles = [
		{x:850,y:400,w:40,h:20},
		{x:1080,y:400,w:40,h:20},
		{x:1850,y:400,w:40,h:20},
		{x:3250,y:400,w:40,h:20},
		{x:5550,y:400,w:40,h:20},
		{x:6950,y:400,w:40,h:20}
	]

	// enemies (ground walking Goomba-like)
	level.enemies = [
		{x:700,y:390,w:28,h:24,vx:2,dir:1,minX:650,maxX:940},
		{x:1800,y:390,w:28,h:24,vx:-2.2,dir:-1,minX:1750,maxX:2080},
		{x:2550,y:390,w:28,h:24,vx:2.5,dir:1,minX:2500,maxX:2680},
		{x:3700,y:390,w:28,h:24,vx:-2,dir:-1,minX:3600,maxX:3950},
		{x:4850,y:390,w:28,h:24,vx:2,dir:1,minX:4800,maxX:5000},
		{x:6400,y:390,w:28,h:24,vx:-2.3,dir:-1,minX:6350,maxX:6650},
		{x:7900,y:390,w:28,h:24,vx:2.3,dir:1,minX:7850,maxX:8180}
	]

	level.coins = [
		{x:680,y:330,w:16,h:16},
		{x:960,y:260,w:16,h:16},
		{x:1270,y:220,w:16,h:16},
		{x:2100,y:240,w:16,h:16},
		{x:3040,y:300,w:16,h:16},
		{x:4720,y:220,w:16,h:16},
		{x:5560,y:240,w:16,h:16},
		{x:6500,y:260,w:16,h:16},
		{x:7830,y:240,w:16,h:16},
		{x:8550,y:360,w:16,h:16}
	]

	buildScene()
}

const player = {
	x: 60, y: 360, w: 28, h: 40,
	vx:0, vy:0,
	speed:5.2, jump:18, onGround:false,
	fallingToGoal: false, fallTarget: 0,
	coins: 0
}

let cameraX = 0
let won = false
let wonTime = 0

function reset(){
	player.x = 60; player.y = 360; player.vx=0; player.vy=0; won=false; wonTime=0; player.coins = 0; statusEl.textContent='COINS: 0'; goalScreenEl.style.display='none'
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

	// cliff fall reset
	if(player.y > H + 120){ reset(); return }

	// obstacles
	for(const o of level.obstacles){ if(rectsOverlap(player,o)){ reset(); return } }

	// coins
	for(let i = level.coins.length - 1; i >= 0; i--){
		const c = level.coins[i]
		if(rectsOverlap(player,c)){
			level.coins.splice(i,1)
			if(worldGroup && coinMeshes[i]){ worldGroup.remove(coinMeshes[i]); coinMeshes.splice(i,1) }
			player.coins += 1
			statusEl.textContent = `COINS: ${player.coins}`
		}
	}

	// enemies
	for(const e of level.enemies){ 
		e.x += e.vx
		if(e.x < e.minX || e.x + e.w > e.maxX){ e.vx *= -1; e.dir = e.vx > 0 ? 1 : -1 }
		if(rectsOverlap(player,e)){ reset(); return }
	}

	// goal - flag collision (x: 2680-2760, y: 80-420)
	if(player.x + player.w > level.goal.x - 40 && player.x < level.goal.x + 40 && player.y < level.goal.y + level.goal.h){
		if(!won){
			won = true; wonTime = 0
			playVictoryBGM()
		}
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
	coinMeshes.length = 0

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

	for(const c of level.coins){
		const mesh = createMesh(new THREE.CircleGeometry(8, 16), materials.coin)
		mesh.position.set(c.x + c.w / 2, c.y + c.h / 2, 0)
		coinMeshes.push(mesh)
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
	for(let i = 0; i < level.coins.length; i++){
		coinMeshes[i].position.set(level.coins[i].x + level.coins[i].w / 2, level.coins[i].y + level.coins[i].h / 2, 0)
	}
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
	for(const c of level.coins){ ctx.fillStyle = '#ffcc00'; ctx.beginPath(); ctx.arc(c.x + c.w/2, c.y + c.h/2, c.w/2, 0, Math.PI*2); ctx.fill(); ctx.strokeStyle='#cc9900'; ctx.stroke() }
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
	// Goomba-like body
	ctx.fillStyle = '#8b4513'
	ctx.fillRect(ex, ey, 28, 18)
	ctx.fillStyle = '#a0522d'; ctx.fillRect(ex+2, ey+2, 10, 12); ctx.fillRect(ex+16, ey+2, 10, 12)
	// feet
	ctx.fillStyle = '#000'; ctx.fillRect(ex+2, ey+18, 8, 4); ctx.fillRect(ex+18, ey+18, 8, 4)
	// eyes
	ctx.fillStyle = '#fff'; ctx.fillRect(ex+6, ey+4, 5, 5); ctx.fillRect(ex+16, ey+4, 5, 5)
	ctx.fillStyle = '#000'; ctx.fillRect(ex+8, ey+6, 2, 2); ctx.fillRect(ex+18, ey+6, 2, 2)
	// eyebrows
	ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ex+6, ey+4); ctx.lineTo(ex+10, ey+2); ctx.moveTo(ex+18, ey+4); ctx.lineTo(ex+22, ey+2); ctx.stroke()
}

function loop(){ update(); draw(); requestAnimationFrame(loop) }

buildLevel(); reset(); loop();


