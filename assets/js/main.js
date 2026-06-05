const canvas = document.getElementById('game')
const ctx = canvas.getContext('2d')
const W = canvas.width, H = canvas.height

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

const audioContext = new (window.AudioContext || window.webkitAudioContext)()
const bgmGain = audioContext.createGain()
let bgmStarted = false
let bgmIntervalId = null
bgmGain.gain.value = 0.06
bgmGain.connect(audioContext.destination)

function playBGMNote(startTime, freq, duration, type='triangle', volume=0.06){
	const osc = audioContext.createOscillator()
	const gain = audioContext.createGain()
	osc.type = type
	osc.frequency.value = freq
	gain.gain.setValueAtTime(0.0, startTime)
	gain.gain.linearRampToValueAtTime(volume, startTime + 0.02)
	gain.gain.setValueAtTime(volume, startTime + duration - 0.03)
	gain.gain.linearRampToValueAtTime(0.001, startTime + duration)
	osc.connect(gain)
	gain.connect(bgmGain)
	osc.start(startTime)
	osc.stop(startTime + duration + 0.02)
}

function scheduleBGM(){
	if(audioContext.state === 'suspended') return
	const start = audioContext.currentTime + 0.05
	const melody = [440, 494, 523, 587, 659, 587, 523, 494]
	const durations = [0.24, 0.24, 0.24, 0.24, 0.24, 0.24, 0.24, 0.24]
	const bass = [220, 220, 196, 196, 165, 165, 196, 196]
	let t = 0
	for(let i = 0; i < melody.length; i++){
		playBGMNote(start + t, melody[i], durations[i], 'triangle', 0.06)
		playBGMNote(start + t, bass[i], durations[i] * 2, 'square', 0.035)
		t += durations[i]
	}
}

function startBGM(){
	if(bgmStarted) return
	bgmStarted = true
	if(audioContext.state === 'suspended') audioContext.resume()
	scheduleBGM()
	bgmIntervalId = setInterval(scheduleBGM, 1920)
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
	osc.type = 'square'
	osc.frequency.value = 520
	gain.gain.value = 0.18
	osc.connect(gain)
	gain.connect(audioContext.destination)
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

function draw(){
	// background
	ctx.clearRect(0,0,W,H)
	ctx.fillStyle = '#87ceeb'
	ctx.fillRect(0,0,W,H)

	ctx.save()
	ctx.translate(-cameraX,0)

	// draw platforms
	for(const p of level.platforms){ ctx.fillStyle = '#654321'; ctx.fillRect(p.x,p.y,p.w,p.h) }

	// draw pipes
	for(const p of level.pipes){ ctx.fillStyle = '#2ecc71'; ctx.fillRect(p.x,p.y,p.w,p.h); ctx.fillStyle='#1e7f3b'; ctx.fillRect(p.x-6,p.y-8,p.w+12,8) }

	// draw obstacles
	for(const o of level.obstacles){ ctx.fillStyle = '#e74c3c'; ctx.fillRect(o.x,o.y,o.w,o.h); drawSpikes(o.x,o.y,o.w,o.h) }

	// draw enemies
	for(const e of level.enemies){ drawEnemy(e.x, e.y, e.dir) }

	// draw goal
	drawGoal()

	// draw player
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


