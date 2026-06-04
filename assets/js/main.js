const STORAGE_KEY = 'todos-v1'
let todos = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
let filter = 'all'

const $form = document.getElementById('todo-form')
const $input = document.getElementById('todo-input')
const $list = document.getElementById('todo-list')
const $count = document.getElementById('count')
const $filters = document.querySelectorAll('.filter')
const $clear = document.getElementById('clear-completed')

function save(){localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))}

function render(){
	$list.innerHTML = ''
	const shown = todos.filter(t => filter === 'all' || (filter === 'active' && !t.done) || (filter === 'completed' && t.done))
	shown.forEach(t => {
		const li = document.createElement('li')
		const left = document.createElement('div')
		left.className = 'todo-left'
		const cb = document.createElement('input')
		cb.type = 'checkbox'
		cb.checked = t.done
		cb.addEventListener('change', ()=>{toggleDone(t.id)})
		const span = document.createElement('span')
		span.className = 'todo-text' + (t.done? ' completed':'')
		span.textContent = t.text
		left.appendChild(cb)
		left.appendChild(span)

		const del = document.createElement('button')
		del.textContent = '削除'
		del.style.background = '#e74c3c'
		del.addEventListener('click', ()=>{removeTodo(t.id)})

		li.appendChild(left)
		li.appendChild(del)
		$list.appendChild(li)
	})
	const remaining = todos.filter(t=>!t.done).length
	$count.textContent = `${remaining} 件`
}

function addTodo(text){
	if(!text.trim()) return
	todos.push({id:Date.now(),text: text.trim(),done:false})
	save(); render()
}

function toggleDone(id){
	todos = todos.map(t => t.id===id? {...t,done:!t.done}: t)
	save(); render()
}

function removeTodo(id){
	todos = todos.filter(t=>t.id!==id)
	save(); render()
}

function clearCompleted(){
	todos = todos.filter(t=>!t.done)
	save(); render()
}

function setFilter(f){filter = f; $filters.forEach(b=>b.classList.toggle('active', b.dataset.filter===f)); render()}

$form.addEventListener('submit', e=>{e.preventDefault(); addTodo($input.value); $input.value='';})
$filters.forEach(b=>b.addEventListener('click', ()=>setFilter(b.dataset.filter)))
$clear.addEventListener('click', clearCompleted)

render()

