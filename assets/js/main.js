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

const GRAVITY = 0.8

let level = {
	width: 3000,
	platforms: [],
	pipes: [],
	obstacles: [],
	goal: {x: 2700, y: 340, w: 40, h: 80}
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
}

const player = {
	x: 60, y: 360, w: 28, h: 40,
	vx:0, vy:0,
	speed:3.2, jump:18, onGround:false
}

let cameraX = 0
let won = false

function reset(){
	player.x = 60; player.y = 360; player.vx=0; player.vy=0; won=false; statusEl.textContent=''
}

restartBtn.addEventListener('click', ()=>{reset()})

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
	if(won) return
	// input
	let left = keys['ArrowLeft'] || keys['a']
	let right = keys['ArrowRight'] || keys['d']
	let up = keys['ArrowUp'] || keys['w'] || keys[' ']

	if(left) player.vx = -player.speed
	else if(right) player.vx = player.speed
	else player.vx = 0

	if(up && player.onGround){ player.vy = -player.jump; player.onGround=false }

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

	// goal
	if(player.x + player.w >= level.goal.x && player.y + player.h <= level.goal.y + level.goal.h){
		won = true; statusEl.textContent = 'ゴール！おめでとう！'
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

	// draw goal
	ctx.fillStyle = '#ffd700'; ctx.fillRect(level.goal.x, level.goal.y, level.goal.w, level.goal.h)
	ctx.fillStyle = '#c49a00'; ctx.fillRect(level.goal.x+level.goal.w, level.goal.y-30,6,30)

	// draw player
	ctx.fillStyle = '#ff4d4d'; ctx.fillRect(player.x, player.y, player.w, player.h)

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

function loop(){ update(); draw(); requestAnimationFrame(loop) }

buildLevel(); reset(); loop();


