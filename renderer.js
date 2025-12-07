const { ipcRenderer } = require('electron')
const Sortable = require('sortablejs');

const input = document.getElementById('taskInput')
const pendingList = document.getElementById('pendingList')
const doneList = document.getElementById('doneList')
const pinBtn = document.getElementById('pinBtn')

// 时钟与战绩
const clockBtn = document.getElementById('clockBtn')
const hourHand = document.getElementById('hourHand')
const minHand = document.getElementById('minHand')
const secHand = document.getElementById('secHand')

// 弹窗元素
const modalOverlay = document.getElementById('customModal')
const modalMsg = document.getElementById('modalMsg')
const confirmBtn = document.getElementById('confirmBtn')
const statsModal = document.getElementById('statsModal')

let currentConfirmAction = null;
let isPinned = false;

// 🔥 核心战绩数据 (独立于列表存在，只增不减)
let sessionStats = {
    big: 0,
    small: 0
};

loadData(); 
startClock(); // 启动时钟

// --- 拖拽 ---
new Sortable(pendingList, {
    animation: 150,
    ghostClass: 'sortable-ghost',
    dragClass: 'sortable-drag',
    onEnd: function() { saveData(); }
});

// --- 基础功能 ---
function closeApp() { ipcRenderer.send('close-app') }

function togglePin() {
    isPinned = !isPinned;
    ipcRenderer.send('toggle-top', isPinned);
    pinBtn.classList.toggle('active', isPinned);
}

input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addSimpleTask();
})

// --- Modal 通用逻辑 ---
function showModal(message, onConfirm) {
    modalMsg.innerText = message;
    currentConfirmAction = onConfirm;
    modalOverlay.classList.add('show');
}
function closeModal() {
    modalOverlay.classList.remove('show');
    currentConfirmAction = null;
}
confirmBtn.addEventListener('click', () => {
    if (currentConfirmAction) currentConfirmAction();
    closeModal();
});

// ---⌚️ 时钟驱动逻辑 (新) ---
function startClock() {
    function updateClock() {
        const now = new Date();
        const seconds = now.getSeconds();
        const mins = now.getMinutes();
        const hour = now.getHours();

        const secDeg = ((seconds / 60) * 360); 
        const minDeg = ((mins / 60) * 360) + ((seconds/60)*6);
        const hourDeg = ((hour / 12) * 360) + ((mins/60)*30);

        secHand.style.transform = `rotate(${secDeg}deg)`;
        minHand.style.transform = `rotate(${minDeg}deg)`;
        hourHand.style.transform = `rotate(${hourDeg}deg)`;
    }
    setInterval(updateClock, 1000);
    updateClock(); // 立即执行一次
}

// --- 🏆 战绩统计逻辑 (新) ---

// 点击时钟打开弹窗
clockBtn.addEventListener('click', () => {
    // 更新界面数字
    document.getElementById('statsBig').innerText = sessionStats.big;
    document.getElementById('statsSmall').innerText = sessionStats.small;
    statsModal.classList.add('show');
});

// 关闭战绩弹窗 (isReset=true 表示要归零)
function closeStats(isReset) {
    statsModal.classList.remove('show');
    if (isReset) {
        // 归零
        sessionStats.big = 0;
        sessionStats.small = 0;
        saveData(); // 保存归零状态
    }
}

// 🔥 加分逻辑：任务完成时调用
function incrementStats(type, isGroup, subCount = 0) {
    if (isGroup) {
        sessionStats.big++;
        sessionStats.small += subCount;
    } else {
        sessionStats.small++;
    }
    saveData();
}

// 🔥 减分逻辑：任务撤销完成时调用（防止刷分，可选，这里加上）
function decrementStats(type, isGroup, subCount = 0) {
    if (isGroup) {
        if (sessionStats.big > 0) sessionStats.big--;
        if (sessionStats.small >= subCount) sessionStats.small -= subCount;
    } else {
        if (sessionStats.small > 0) sessionStats.small--;
    }
    saveData();
}

// --- 辅助函数 ---
function getNowTimestamp() { return new Date().getTime(); }
function formatDateStr(timestamp) {
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}年${month}月${day}日`;
}
function formatTimeStr(timestamp) {
    const d = new Date(timestamp);
    const hour = d.getHours().toString().padStart(2, '0');
    const minute = d.getMinutes().toString().padStart(2, '0');
    return `${hour}:${minute}`;
}

// --- 添加任务 ---
function addSimpleTask() {
    const text = input.value.trim();
    if (!text) return;
    const task = createSimpleTaskElement(text, false);
    pendingList.prepend(task);
    input.value = "";
    saveData();
}

function addGroupTask() {
    const text = input.value.trim();
    if (!text) return;
    const group = createGroupElement(text, [], false);
    pendingList.prepend(group);
    input.value = "";
    saveData();
}

// --- DOM 创建 ---

function getOrCreateDateGroup(timestamp) {
    const dateStr = formatDateStr(timestamp);
    let group = Array.from(doneList.children).find(div => div.dataset.date === dateStr);
    
    if (!group) {
        group = document.createElement('div');
        group.className = 'done-date-group';
        group.dataset.date = dateStr;
        group.innerHTML = `
            <div class="done-date-header">
                <span>📅 ${dateStr}</span>
                <button class="btn-delete" title="清空当天记录" style="font-size:12px">
                    <i class="fas fa-trash-alt"></i> 清空
                </button>
            </div>
            <div class="date-tasks-container"></div>
        `;
        group.querySelector('.btn-delete').addEventListener('click', () => {
            showModal(`确定要清空 ${dateStr} 的所有记录吗？`, () => {
                group.classList.add('collapsing');
                // 删除不影响 sessionStats，只删界面
                setTimeout(() => { group.remove(); saveData(); }, 500); 
            });
        });
        doneList.prepend(group);
    }
    return group;
}

function createSimpleTaskElement(text, isDone, completedAt = null) {
    const div = document.createElement('div');
    div.className = 'task-item';
    div.dataset.type = 'simple';
    div.dataset.text = text;
    if (isDone && !completedAt) completedAt = getNowTimestamp();
    if (isDone) div.dataset.completedAt = completedAt;

    let timeHtml = '';
    if (isDone && completedAt) timeHtml = `<span class="task-time-tag">${formatTimeStr(completedAt)}</span>`;

    div.innerHTML = `
        <div class="checkbox ${isDone ? 'checked' : ''}"></div>
        <span style="text-decoration: ${isDone ? 'line-through' : 'none'}; color: ${isDone ? 'var(--text-light)' : 'inherit'}">${text}</span>
        ${timeHtml}
        <button class="btn-delete" title="删除任务"><i class="fas fa-trash-alt"></i></button>
    `;

    div.querySelector('.checkbox').addEventListener('click', (e) => {
        e.stopPropagation();
        const nowDone = !isDone;
        // 如果变成了完成，加分；如果变成了未完成，减分
        if (nowDone) incrementStats('simple', false);
        else decrementStats('simple', false);
        
        moveItem(div, text, nowDone, 'simple');
    });

    div.querySelector('.btn-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        showModal('确定要删除这个任务吗？', () => { 
            div.remove(); 
            cleanupEmptyDateGroups();
            saveData(); 
            // 删除不扣分！
        });
    });

    return div;
}

function createGroupElement(title, subtasks = [], isDone = false, completedAt = null) {
    const div = document.createElement('div');
    div.className = 'task-item';
    div.dataset.type = 'group';
    div.dataset.title = title;
    div.style.flexDirection = 'column';
    div.style.alignItems = 'flex-start';

    if (isDone && !completedAt) completedAt = getNowTimestamp();
    if (isDone) div.dataset.completedAt = completedAt;
    
    const titleClass = isDone ? 'group-title-done' : '';
    let timeHtml = '';
    if (isDone && completedAt) timeHtml = `<span class="task-time-tag" style="margin-right:10px">${formatTimeStr(completedAt)}</span>`;
    
    div.innerHTML = `
        <div class="group-header">
            <span class="${titleClass}">📂 ${title}</span>
            ${timeHtml}
            <button class="btn-delete" title="删除整组"><i class="fas fa-trash-alt"></i></button>
        </div>
        <div class="sub-list"></div>
        <input type="text" class="sub-input" placeholder="添加子步骤 +" style="display: ${isDone ? 'none' : 'block'}">
    `;

    const subListDiv = div.querySelector('.sub-list');
    const subInput = div.querySelector('.sub-input');

    subtasks.forEach(sub => {
        subListDiv.appendChild(createSubTaskHTML(sub.text, sub.done, div));
    });

    div.querySelector('.btn-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        showModal(`确定删除分组 "${title}" 吗？`, () => { 
            div.remove(); 
            cleanupEmptyDateGroups();
            saveData(); 
            // 删除不扣分
        });
    });

    subInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && subInput.value.trim()) {
            const newSub = createSubTaskHTML(subInput.value, false, div);
            subListDiv.appendChild(newSub);
            subInput.value = "";
            checkGroupStatus(div); 
        }
    });

    return div;
}

function createSubTaskHTML(text, isDone, parentGroupDiv) {
    const subDiv = document.createElement('div');
    subDiv.classList.add('sub-task-anim');
    subDiv.style.marginBottom = '5px';
    subDiv.style.display = 'flex';
    subDiv.style.alignItems = 'center';
    subDiv.style.width = '100%';
    
    subDiv.innerHTML = `
        <div class="checkbox ${isDone ? 'checked' : ''}" style="width:14px; height:14px;"></div>
        <span style="font-size:12px; margin-left:5px; color:${isDone ? 'var(--text-light)' : 'inherit'}">${text}</span>
        <button class="btn-delete" style="font-size:12px; padding:2px;"><i class="fas fa-times"></i></button>
    `;

    subDiv.querySelector('.checkbox').addEventListener('click', () => {
        const checkbox = subDiv.querySelector('.checkbox');
        const isNowDone = !checkbox.classList.contains('checked');
        checkbox.classList.toggle('checked', isNowDone);
        subDiv.querySelector('span').style.color = isNowDone ? 'var(--text-light)' : 'inherit';
        
        // 子任务状态改变，只影响保存，统计分数的逻辑由 checkGroupStatus -> moveItem 统一处理吗？
        // 不，子任务也算小任务分。
        // 这里需要判断：如果这导致了父组移动，父组移动逻辑里会处理。
        // 但如果只是子任务勾选了，父组没动（因为没全完），这里也要加减小任务分。
        
        // 为了简化逻辑：
        // 1. 小任务分数 = 单项任务 + 组内子任务。
        // 2. 我们在这里直接处理分数的加减
        if (isNowDone) incrementStats('sub', false); 
        else decrementStats('sub', false);
        
        saveData();
        checkGroupStatus(parentGroupDiv);
    });

    subDiv.querySelector('.btn-delete').addEventListener('click', () => {
        subDiv.remove();
        saveData();
        // 删除不扣分
        checkGroupStatus(parentGroupDiv);
    });

    return subDiv;
}

function checkGroupStatus(groupDiv) {
    const allSubs = groupDiv.querySelectorAll('.sub-list > div');
    
    if (allSubs.length === 0) { saveData(); return; }

    let allDone = true;
    const subData = [];
    allSubs.forEach(sub => {
        const isChecked = sub.querySelector('.checkbox').classList.contains('checked');
        const text = sub.querySelector('span').innerText;
        if (!isChecked) allDone = false;
        subData.push({ text: text, done: isChecked });
    });

    let titleText = groupDiv.querySelector('.group-header span').innerText.replace('📂 ', '');
    if (groupDiv.dataset.title) titleText = groupDiv.dataset.title;

    const isInPending = groupDiv.parentElement.id === 'pendingList';
    
    // 如果全完了，并且还在 Pending，就移动
    if (allDone && isInPending) {
        // 触发移动，并在移动时加“大任务”分
        // 注意：小任务分在子任务勾选时已经加上了，这里只负责加“大任务”分
        incrementStats('group', true, 0); // subCount传0，因为子任务分已经加过了
        moveItem(groupDiv, titleText, true, 'group', subData);
    } else if (!allDone && !isInPending) {
        // 撤回 Pending
        decrementStats('group', true, 0);
        moveItem(groupDiv, titleText, false, 'group', subData);
    } else {
        saveData();
    }
}

function moveItem(oldDiv, textOrTitle, toDone, type, subData = []) {
    if (toDone) oldDiv.classList.add('exploding');
    
    setTimeout(() => {
        oldDiv.remove();
        cleanupEmptyDateGroups();

        let newDiv;
        const completedAt = toDone ? getNowTimestamp() : null;

        if (type === 'simple') {
            newDiv = createSimpleTaskElement(textOrTitle, toDone, completedAt);
        } else {
            newDiv = createGroupElement(textOrTitle, subData, toDone, completedAt);
        }

        if (toDone) {
            const container = getOrCreateDateGroup(completedAt);
            container.querySelector('.date-tasks-container').prepend(newDiv);
        } else {
            pendingList.prepend(newDiv);
        }
        
        saveData();
    }, toDone ? 600 : 0);
}

function cleanupEmptyDateGroups() {
    const groups = document.querySelectorAll('.done-date-group');
    groups.forEach(group => {
        const container = group.querySelector('.date-tasks-container');
        if (container.children.length === 0) group.remove();
    });
}

function saveData() {
    const data = { 
        pending: [], 
        done: [],
        // 🔥 保存分数
        stats: sessionStats 
    };
    
    pendingList.childNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        data.pending.push(serializeNode(node, false));
    });
    data.pending.reverse();

    const dateGroups = doneList.querySelectorAll('.done-date-group');
    dateGroups.forEach(group => {
        const tasks = group.querySelectorAll('.task-item');
        tasks.forEach(task => data.done.push(serializeNode(task, true)));
    });
    localStorage.setItem('todoData', JSON.stringify(data));
}

function serializeNode(node, isDone) {
    const type = node.dataset.type;
    const base = {
        type: type,
        completedAt: node.dataset.completedAt ? parseInt(node.dataset.completedAt) : null,
        done: isDone
    };
    if (type === 'simple') {
        base.text = node.dataset.text;
    } else {
        base.title = node.dataset.title;
        base.subtasks = [];
        node.querySelectorAll('.sub-list > div').forEach(sub => {
            base.subtasks.push({
                text: sub.querySelector('span').innerText,
                done: sub.querySelector('.checkbox').classList.contains('checked')
            });
        });
    }
    return base;
}

function loadData() {
    const json = localStorage.getItem('todoData');
    if (!json) return;
    const data = JSON.parse(json);

    // 恢复分数
    if (data.stats) sessionStats = data.stats;

    if (data.pending) {
        data.pending.forEach(item => {
            if (item.type === 'simple') pendingList.prepend(createSimpleTaskElement(item.text, false));
            else if (item.type === 'group') pendingList.prepend(createGroupElement(item.title, item.subtasks, false));
        });
    }

    if (data.done && data.done.length > 0) {
        data.done.sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));
        data.done.forEach(item => {
            const ts = item.completedAt || getNowTimestamp();
            let el;
            if (item.type === 'simple') el = createSimpleTaskElement(item.text, true, ts);
            else if (item.type === 'group') el = createGroupElement(item.title, item.subtasks, true, ts);
            
            getOrCreateDateGroup(ts).querySelector('.date-tasks-container').prepend(el);
        });
    }
}