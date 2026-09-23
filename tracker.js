// Global State Variables
let tasks = [];
let activeTaskId = null;
let currentUser = null;
let connectSourceIndex = null;
let draggedTaskIndex = null;
let showingFinishedTasks = false;

// Custom Popup Typing Box replacing standard prompt()
function customPrompt(titleText, defaultValue = '') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    
    overlay.innerHTML = `
      <div class="custom-modal-box">
        <h3>${titleText}</h3>
        <input type="text" id="customModalInput" value="${defaultValue}" autocomplete="off" />
        <div class="custom-modal-actions">
          <button id="customModalCancel" class="modal-btn cancel-btn">Cancel</button>
          <button id="customModalConfirm" class="modal-btn confirm-btn">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector('#customModalInput');
    const confirmBtn = overlay.querySelector('#customModalConfirm');
    const cancelBtn = overlay.querySelector('#customModalCancel');

    input.focus();
    input.select();

    const cleanup = (value) => {
      document.body.removeChild(overlay);
      resolve(value);
    };

    confirmBtn.onclick = () => cleanup(input.value.trim());
    cancelBtn.onclick = () => cleanup(null);

    input.onkeydown = (e) => {
      if (e.key === 'Enter') cleanup(input.value.trim());
      if (e.key === 'Escape') cleanup(null);
    };
  });
}

// Authentication Listener
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    document.getElementById('userBadge').textContent = user.displayName || user.email || 'Guest User';
    setupCanvasDropZone();
    setupDraggableTopButtons();
    subscribeToTasks();
  } else {
    window.location.href = 'login.html';
  }
});

function setupDraggableTopButtons() {
  const buttons = document.querySelectorAll('.top-btn');
  buttons.forEach(btn => {
    // Make both "Create New Task" and "Create New Note" buttons draggable
    if (btn.textContent.includes('Create New')) {
      btn.draggable = true;
      btn.classList.add('draggable-btn');
      
      btn.ondragstart = (e) => {
        if (btn.textContent.includes('Task') && !btn.textContent.includes('Note')) {
          e.dataTransfer.setData('text/plain', 'create-quick-task');
        } else {
          e.dataTransfer.setData('text/plain', 'create-note');
        }
      };
    }
  });
}

function setupCanvasDropZone() {
  const notesContainer = document.getElementById('notesContainer');
  if (!notesContainer) return;

  notesContainer.ondragover = (e) => e.preventDefault();
  
  notesContainer.ondrop = async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const dragDataType = e.dataTransfer.getData('text/plain');

    if (dragDataType === 'create-quick-task') {
      // Auto-create Quick Task #X
      const quickTasksCount = tasks.filter(t => t.title.startsWith('Quick Task')).length + 1;
      const taskTitle = `Quick Task #${quickTasksCount}`;
      const activeTasks = tasks.filter(t => !t.completed);

      const newTask = {
        title: taskTitle,
        completed: false,
        notes: [],
        connections: [],
        order: activeTasks.length,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      const docRef = await db.collection('users').doc(currentUser.uid).collection('tasks').add(newTask);
      activeTaskId = docRef.id;
      
    } else if (dragDataType === 'create-note') {
      // Create a new Note inside the active task at drop location
      if (!activeTaskId) return alert('Please select a task first!');

      const rect = notesContainer.getBoundingClientRect();
      const x = Math.max(10, e.clientX - rect.left - 150);
      const y = Math.max(10, e.clientY - rect.top - 60);

      const noteText = await customPrompt('Enter note contents:');
      if (!noteText) return;

      const task = tasks.find(t => t.id === activeTaskId);
      const newNoteObj = { text: noteText, x: Math.round(x), y: Math.round(y), w: 300, h: 120 };
      const updatedNotes = [...(task.notes || []), newNoteObj];

      await db.collection('users').doc(currentUser.uid).collection('tasks').doc(activeTaskId).update({
        notes: updatedNotes
      });
    }
  };
}

function subscribeToTasks() {
  db.collection('users')
    .doc(currentUser.uid)
    .collection('tasks')
    .onSnapshot((snapshot) => {
      tasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Sort tasks by custom 'order' property if present, falling back to creation timestamp
      tasks.sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) {
          return a.order - b.order;
        }
        const timeA = a.createdAt ? a.createdAt.seconds || 0 : 0;
        const timeB = b.createdAt ? b.createdAt.seconds || 0 : 0;
        return timeA - timeB;
      });

      if (!activeTaskId && tasks.length > 0) {
        activeTaskId = tasks[0].id;
      }

      renderTasks();
      renderNotes();
    }, (error) => {
      console.error("Firestore subscription error:", error);
    });
}

// Render Sidebar Tasks (Active vs Finished Mode)
function renderTasks() {
  const taskList = document.getElementById('taskList');
  const sidebarHeader = document.querySelector('.sidebar-header');
  
  const activeTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);

  taskList.innerHTML = '';

  if (showingFinishedTasks) {
    sidebarHeader.innerHTML = `
      <button class="back-btn" onclick="toggleFinishedTasksView(false)">← Back to Tasks</button>
      <h2>Finished Tasks</h2>
    `;

    if (completedTasks.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'empty-tasks-msg';
      emptyLi.textContent = 'No completed tasks yet.';
      taskList.appendChild(emptyLi);
      return;
    }

    completedTasks.forEach(task => {
      const li = document.createElement('li');
      li.className = `task-item completed ${task.id === activeTaskId ? 'active' : ''}`;
      
      li.innerHTML = `
        <span class="task-title-text" onclick="selectTask('${task.id}')">✔ ${task.title}</span>
        <div class="task-item-actions">
          <button class="rename-task-btn" title="Rename Task" onclick="renameTask(event, '${task.id}', '${task.title.replace(/'/g, "\\'")}')">✏️</button>
          <button class="delete-task-btn" title="Permanently Delete Task" onclick="deleteTask(event, '${task.id}')">🗑️</button>
        </div>
      `;
      
      taskList.appendChild(li);
    });

  } else {
    sidebarHeader.innerHTML = `<h2>Tasks</h2>`;

    activeTasks.forEach((task, index) => {
      const li = document.createElement('li');
      li.className = `task-item ${task.id === activeTaskId ? 'active' : ''}`;
      li.draggable = true;

      li.innerHTML = `
        <span class="task-drag-handle">⋮⋮</span>
        <span class="task-title-text" onclick="selectTask('${task.id}')">${task.title}</span>
        <div class="task-item-actions">
          <button class="rename-task-btn" title="Rename Task" onclick="renameTask(event, '${task.id}', '${task.title.replace(/'/g, "\\'")}')">✏️</button>
        </div>
      `;

      li.ondragstart = (e) => {
        draggedTaskIndex = index;
        e.dataTransfer.effectAllowed = 'move';
        li.classList.add('dragging');
      };

      li.ondragend = () => {
        li.classList.remove('dragging');
        draggedTaskIndex = null;
      };

      li.ondragover = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      };

      li.ondrop = async (e) => {
        e.preventDefault();
        if (draggedTaskIndex === null || draggedTaskIndex === index) return;

        const reorderedActive = [...activeTasks];
        const [movedTask] = reorderedActive.splice(draggedTaskIndex, 1);
        reorderedActive.splice(index, 0, movedTask);

        await saveTasksOrder(reorderedActive);
      };

      taskList.appendChild(li);
    });

    const folderBtn = document.createElement('div');
    folderBtn.className = 'finished-tasks-folder-btn';
    folderBtn.innerHTML = `📁 Finished Tasks (${completedTasks.length})`;
    folderBtn.onclick = () => toggleFinishedTasksView(true);
    
    taskList.appendChild(folderBtn);
  }
}

function toggleFinishedTasksView(showFinished) {
  showingFinishedTasks = showFinished;
  renderTasks();
}

async function saveTasksOrder(orderedActiveTasks) {
  if (!currentUser) return;
  const batch = db.batch();

  orderedActiveTasks.forEach((task, newIndex) => {
    const docRef = db.collection('users').doc(currentUser.uid).collection('tasks').doc(task.id);
    batch.update(docRef, { order: newIndex });
  });

  await batch.commit();
}

// Rename Task Function
async function renameTask(event, taskId, currentTitle) {
  event.stopPropagation();
  if (!currentUser) return;

  const newTitle = await customPrompt('Rename task:', currentTitle);
  if (!newTitle) return;

  try {
    await db.collection('users').doc(currentUser.uid).collection('tasks').doc(taskId).update({
      title: newTitle
    });
  } catch (error) {
    console.error("Error renaming task: ", error);
    alert("Could not rename task. Please try again.");
  }
}

// Permanently Delete Task Function
async function deleteTask(event, taskId) {
  event.stopPropagation();
  if (!currentUser) return;

  if (!confirm("Are you sure you want to permanently delete this task?")) {
    return;
  }

  try {
    await db.collection('users').doc(currentUser.uid).collection('tasks').doc(taskId).delete();
    
    if (activeTaskId === taskId) {
      const remainingTasks = tasks.filter(t => t.id !== taskId);
      activeTaskId = remainingTasks.length > 0 ? remainingTasks[0].id : null;
    }
  } catch (error) {
    console.error("Error deleting task: ", error);
    alert("Could not delete task. Please try again.");
  }
}

function renderNotes() {
  const activeTask = tasks.find(t => t.id === activeTaskId);
  const notesContainer = document.getElementById('notesContainer');
  const activeTaskTitle = document.getElementById('activeTaskTitle');
  const activeTaskStatus = document.getElementById('activeTaskStatus');

  notesContainer.innerHTML = '';

  if (!activeTask) {
    activeTaskTitle.textContent = 'No Task Selected';
    activeTaskStatus.textContent = '';
    return;
  }

  activeTaskTitle.textContent = activeTask.title;
  activeTaskStatus.textContent = activeTask.completed ? 'Status: Completed ✅' : 'Status: In Progress ⏳';

  // SVG Container for Connecting Lines
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'connections-svg');
  notesContainer.appendChild(svg);

  if (!activeTask.notes || activeTask.notes.length === 0) {
    const emptyCard = document.createElement('div');
    emptyCard.className = 'note-card';
    emptyCard.style.top = '40px';
    emptyCard.style.left = '50%';
    emptyCard.style.transform = 'translateX(-50%)';
    emptyCard.textContent = 'Drag buttons here or click them to get started!';
    notesContainer.appendChild(emptyCard);
    return;
  }

  // Draw Existing Connections
  const connections = activeTask.connections || [];
  connections.forEach((conn, connIdx) => {
    const fromNote = activeTask.notes[conn.from];
    const toNote = activeTask.notes[conn.to];
    if (fromNote && toNote) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      
      const x1 = (fromNote.x || 50) + ((fromNote.w || 300) / 2);
      const y1 = (fromNote.y || 20) + ((fromNote.h || 120) / 2);
      const x2 = (toNote.x || 50) + ((toNote.w || 300) / 2);
      const y2 = (toNote.y || 20) + ((toNote.h || 120) / 2);

      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      line.title = "Click line to remove connection";
      line.onclick = (e) => {
        e.stopPropagation();
        deleteConnection(connIdx);
      };
      svg.appendChild(line);
    }
  });

  // Render Resizable & Draggable Cards
  activeTask.notes.forEach((noteObj, index) => {
    const noteText = typeof noteObj === 'string' ? noteObj : noteObj.text;
    const posX = (typeof noteObj === 'object' && noteObj.x !== undefined) ? noteObj.x : 50 + (index * 20);
    const posY = (typeof noteObj === 'object' && noteObj.y !== undefined) ? noteObj.y : 20 + (index * 140);
    const posW = (typeof noteObj === 'object' && noteObj.w !== undefined) ? noteObj.w : 300;
    const posH = (typeof noteObj === 'object' && noteObj.h !== undefined) ? noteObj.h : 120;

    const card = document.createElement('div');
    card.className = `note-card ${connectSourceIndex === index ? 'connect-selected' : ''}`;
    card.style.left = `${posX}px`;
    card.style.top = `${posY}px`;
    card.style.width = `${posW}px`;
    card.style.height = `${posH}px`;

    const textSpan = document.createElement('span');
    textSpan.textContent = noteText;
    card.appendChild(textSpan);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'note-actions';

    const connectBtn = document.createElement('button');
    connectBtn.className = `action-btn connect-btn ${connectSourceIndex === index ? 'active' : ''}`;
    connectBtn.innerHTML = '🔗';
    connectBtn.title = connectSourceIndex === index ? 'Cancel Connection' : 'Connect to another note';
    connectBtn.onclick = (e) => {
      e.stopPropagation();
      handleConnectButtonClick(index);
    };

    const renameBtn = document.createElement('button');
    renameBtn.className = 'action-btn rename-btn';
    renameBtn.innerHTML = '✏️';
    renameBtn.title = 'Rename Note';
    renameBtn.onclick = (e) => {
      e.stopPropagation();
      renameNote(index, noteText);
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn delete-btn';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Delete Note';
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      deleteNote(index);
    };

    actionsDiv.appendChild(connectBtn);
    actionsDiv.appendChild(renameBtn);
    actionsDiv.appendChild(deleteBtn);
    card.appendChild(actionsDiv);

    card.onclick = (e) => {
      if (connectSourceIndex !== null && connectSourceIndex !== index) {
        e.stopPropagation();
        addConnection(connectSourceIndex, index);
        connectSourceIndex = null;
        renderNotes();
      }
    };

    makeElementDraggableAndResizable(card, index);
    notesContainer.appendChild(card);
  });
}

function handleConnectButtonClick(index) {
  if (connectSourceIndex === index) {
    connectSourceIndex = null;
  } else if (connectSourceIndex !== null) {
    addConnection(connectSourceIndex, index);
    connectSourceIndex = null;
  } else {
    connectSourceIndex = index;
  }
  renderNotes();
}

async function addConnection(fromIdx, toIdx) {
  if (!activeTaskId || !currentUser) return;
  const task = tasks.find(t => t.id === activeTaskId);
  if (!task) return;

  const currentConnections = task.connections || [];
  const exists = currentConnections.some(c => (c.from === fromIdx && c.to === toIdx) || (c.from === toIdx && c.to === fromIdx));
  
  if (!exists) {
    const updated = [...currentConnections, { from: fromIdx, to: toIdx }];
    await db.collection('users').doc(currentUser.uid).collection('tasks').doc(activeTaskId).update({
      connections: updated
    });
  }
}

async function deleteConnection(connIdx) {
  if (!activeTaskId || !currentUser) return;
  const task = tasks.find(t => t.id === activeTaskId);
  if (!task) return;

  const updatedConnections = (task.connections || []).filter((_, i) => i !== connIdx);
  await db.collection('users').doc(currentUser.uid).collection('tasks').doc(activeTaskId).update({
    connections: updatedConnections
  });
}

function selectTask(id) {
  activeTaskId = id;
  connectSourceIndex = null;
  renderTasks();
  renderNotes();
}

function makeElementDraggableAndResizable(elmnt, noteIndex) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

  elmnt.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    const rect = elmnt.getBoundingClientRect();
    const isResizeArea = (e.clientX > rect.right - 25) && (e.clientY > rect.bottom - 25);

    if (e.target.closest('.note-actions') || isResizeArea) return;

    e = e || window.event;
    pos3 = e.clientX;
    pos4 = e.clientY;

    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();

    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;

    elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
    elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";

    redrawLinesInRealtime();
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;

    saveNoteDimensions(noteIndex, parseInt(elmnt.style.left), parseInt(elmnt.style.top), elmnt.offsetWidth, elmnt.offsetHeight);
  }

  const resizeObserver = new ResizeObserver(() => {
    redrawLinesInRealtime();
  });
  resizeObserver.observe(elmnt);

  elmnt.onmouseup = () => {
    saveNoteDimensions(noteIndex, parseInt(elmnt.style.left), parseInt(elmnt.style.top), elmnt.offsetWidth, elmnt.offsetHeight);
  };
}

function redrawLinesInRealtime() {
  const activeTask = tasks.find(t => t.id === activeTaskId);
  if (!activeTask || !activeTask.connections) return;

  const cards = document.querySelectorAll('.note-card');
  const lines = document.querySelectorAll('.connections-svg line');

  activeTask.connections.forEach((conn, idx) => {
    const fromCard = cards[conn.from];
    const toCard = cards[conn.to];
    const line = lines[idx];

    if (fromCard && toCard && line) {
      const x1 = fromCard.offsetLeft + (fromCard.offsetWidth / 2);
      const y1 = fromCard.offsetTop + (fromCard.offsetHeight / 2);
      const x2 = toCard.offsetLeft + (toCard.offsetWidth / 2);
      const y2 = toCard.offsetTop + (toCard.offsetHeight / 2);

      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
    }
  });
}

async function saveNoteDimensions(index, x, y, w, h) {
  if (!activeTaskId || !currentUser) return;
  const task = tasks.find(t => t.id === activeTaskId);
  if (!task) return;

  const updatedNotes = [...task.notes];
  const currentNote = updatedNotes[index];

  if (typeof currentNote === 'string') {
    updatedNotes[index] = { text: currentNote, x: x, y: y, w: w, h: h };
  } else {
    updatedNotes[index] = { ...currentNote, x: x, y: y, w: w, h: h };
  }

  await db.collection('users').doc(currentUser.uid).collection('tasks').doc(activeTaskId).update({
    notes: updatedNotes
  });
}

async function renameNote(index, oldText) {
  if (!activeTaskId || !currentUser) return;
  const newText = await customPrompt('Rename task note:', oldText);
  if (!newText) return;

  const task = tasks.find(t => t.id === activeTaskId);
  if (!task) return;

  const updatedNotes = [...task.notes];
  const currentNote = updatedNotes[index];

  if (typeof currentNote === 'string') {
    updatedNotes[index] = { text: newText, x: 50, y: 50, w: 300, h: 120 };
  } else {
    updatedNotes[index] = { ...currentNote, text: newText };
  }

  await db.collection('users').doc(currentUser.uid).collection('tasks').doc(activeTaskId).update({
    notes: updatedNotes
  });
}

async function deleteNote(index) {
  if (!activeTaskId || !currentUser) return;
  if (!confirm('Are you sure you want to delete this note?')) return;

  const task = tasks.find(t => t.id === activeTaskId);
  if (!task) return;

  const updatedNotes = task.notes.filter((_, i) => i !== index);
  const updatedConnections = (task.connections || [])
    .filter(c => c.from !== index && c.to !== index)
    .map(c => ({
      from: c.from > index ? c.from - 1 : c.from,
      to: c.to > index ? c.to - 1 : c.to
    }));

  await db.collection('users').doc(currentUser.uid).collection('tasks').doc(activeTaskId).update({
    notes: updatedNotes,
    connections: updatedConnections
  });
}

// Click behavior: prompts user for custom task name
async function openNewTaskModal() {
  const title = await customPrompt('Enter new task name:');
  if (title && currentUser) {
    const activeTasks = tasks.filter(t => !t.completed);
    const newTask = {
      title: title,
      completed: false,
      notes: [],
      connections: [],
      order: activeTasks.length,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    
    const docRef = await db.collection('users').doc(currentUser.uid).collection('tasks').add(newTask);
    activeTaskId = docRef.id;
  }
}

async function openNewNoteModal() {
  if (!activeTaskId) return alert('Please select a task first!');
  const noteText = await customPrompt('Enter note contents:');
  if (noteText && currentUser) {
    const task = tasks.find(t => t.id === activeTaskId);
    const newNoteObj = { text: noteText, x: 100, y: 50, w: 300, h: 120 };
    const updatedNotes = [...(task.notes || []), newNoteObj];

    await db.collection('users').doc(currentUser.uid).collection('tasks').doc(activeTaskId).update({
      notes: updatedNotes
    });
  }
}

async function markCurrentTaskComplete() {
  if (!activeTaskId || !currentUser) return;
  const task = tasks.find(t => t.id === activeTaskId);
  if (task) {
    await db.collection('users').doc(currentUser.uid).collection('tasks').doc(activeTaskId).update({
      completed: !task.completed
    });
  }
}

function handleLogout(event) {
  event.preventDefault();
  auth.signOut().then(() => {
    window.location.href = 'login.html';
  });
}