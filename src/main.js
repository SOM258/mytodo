import { getCurrentWindow } from '@tauri-apps/api/window';
import Sortable from 'sortablejs';

const appWindow = getCurrentWindow();

// 引入 DOM 元素
const input = document.getElementById('taskInput')
const pendingList = document.getElementById('pendingList')
const doneList = document.getElementById('doneList')
const pinBtn = document.getElementById('pinBtn')
const headerDate = document.getElementById('headerDate')
const clockBtn = document.getElementById('clockBtn')
const hourHand = document.getElementById('hourHand')
const minHand = document.getElementById('minHand')
const secHand = document.getElementById('secHand')
const modalOverlay = document.getElementById('customModal')
const modalMsg = document.getElementById('modalMsg')
const confirmBtn = document.getElementById('confirmBtn')
const cancelBtn = document.getElementById('cancelBtn')
const statsModal = document.getElementById('statsModal')
const statsCloseBtn = document.getElementById('statsCloseBtn')
const statsResetBtn = document.getElementById('statsResetBtn')
const backupBtn = document.getElementById('backupBtn') // ✅ 新按钮
const importInput = document.getElementById('importInput') // ✅ 新输入框

// 按钮绑定
document.getElementById('closeBtn').addEventListener('click', () => appWindow.close());
document.getElementById('minBtn').addEventListener('click', () => appWindow.minimize());
document.getElementById('pinBtn').addEventListener('click', togglePin);
document.getElementById('addSimpleBtn').addEventListener('click', addSimpleTask);
document.getElementById('addGroupBtn').addEventListener('click', addGroupTask);
cancelBtn.addEventListener('click', closeModal);
confirmBtn.addEventListener('click', () => {
    if (currentConfirmAction) currentConfirmAction();
    closeModal();
});
statsCloseBtn.addEventListener('click', () => closeStats(false));
statsResetBtn.addEventListener('click', () => closeStats(true));

// ✅ 数据备份与恢复逻辑
backupBtn.addEventListener('click', () => {
    // 弹窗询问
    showModal('请选择操作：\n[确定] = 导出数据到文件\n[取消] = 从文件恢复数据', () => {
        // 用户点了确定 -> 导出
        exportData();
    });
    // 稍微魔改一下 modal 的按钮文字，让它符合语境
    confirmBtn.innerText = "📤 导出";
    cancelBtn.innerText = "📥 导入";
    
    // 因为这是一个特殊的 Modal，我们需要劫持一下取消按钮的行为（原本是直接关闭）
    const originalCancel = cancelBtn.onclick;
    cancelBtn.onclick = () => {
        importInput.click(); // 触发文件选择
        closeModal();
    };
    
    // 恢复默认行为的清理函数（当 Modal 关闭时）
    const restoreModal = () => {
        confirmBtn.innerText = "确定";
        cancelBtn.innerText = "取消";
        cancelBtn.onclick = originalCancel;
    }
    // 监听一下 modal 关闭（这步比较粗糙，简单点就是在 closeModal 里恢复）
    // 这里我们简单处理：下次 open modal 时文字会被重置吗？不会，所以要在 closeModal 里重置
});

// 处理文件导入
importInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            if (data.pending && data.done) {
                localStorage.setItem('todoData', JSON.stringify(data));
                location.reload(); // 刷新页面
            } else {
                alert('数据格式不正确！');
            }
        } catch (err) {
            alert('读取文件失败！');
        }
    };
    reader.readAsText(file);
    e.target.value = ''; // 清空，允许重复选同一个文件
});

function exportData() {
    const data = localStorage.getItem('todoData');
    if (!data) return;
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // 文件名带上时间
    const d = new Date();
    const dateStr = `${d.getFullYear()}${d.getMonth()+1}${d.getDate()}`;
    a.download = `mytasks_backup_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
}


// 禁用右键
document.addEventListener('contextmenu', event => event.preventDefault());

let currentConfirmAction = null;
let isPinned = false;
let sessionStats = { big: 0, small: 0 };

loadData(); 
startClock(); 

new Sortable(pendingList, {
    animation: 150,
    ghostClass: 'sortable-ghost',
    dragClass: 'sortable-drag',
    forceFallback: true, 
    fallbackClass: 'sortable-fallback',
    handle: '.drag-handle', 
    filter: '.checkbox, .btn-delete, .sub-input', 
    preventOnFilter: false,
    onEnd: function() { saveData(); }
});

async function togglePin() {
    isPinned = !isPinned;
    await appWindow.setAlwaysOnTop(isPinned);
    pinBtn.classList.toggle('active', isPinned);
}

function addSimpleTask() {
    const text = input.value.trim();
    if (!text) return;
    const task = createSimpleTaskElement(text, false);
    pendingList.appendChild(task);
    input.value = "";
    saveData();
    input.focus();
}

function addGroupTask() {
    const text = input.value.trim();
    if (!text) return;
    const group = createGroupElement(text, [], false);
    pendingList.appendChild(group);
    input.value = "";
    saveData();
    input.focus();
}

input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addSimpleTask();
})

// Modal Logic
function showModal(message, onConfirm) {
    modalMsg.innerText = message;
    currentConfirmAction = onConfirm;
    modalOverlay.classList.add('show');
}
function closeModal() {
    modalOverlay.classList.remove('show');
    currentConfirmAction = null;
    
    // ✅ 修复：每次关闭弹窗后，把按钮文字恢复成默认，防止影响其他删除操作
    confirmBtn.innerText = "删除";
    cancelBtn.innerText = "取消";
    // 恢复 cancelBtn 的默认点击行为（虽然 HTML 里没写 onclick，但 JS 绑定的事件还在）
    // 其实只要把我们在 backupBtn 里绑定的 onclick 覆盖回去就行，或者简单点：
    // 因为 backupBtn 里是直接修改了 onclick 属性，这里我们需要把它改回默认逻辑：
    cancelBtn.onclick = closeModal; 
}

function deleteItemWithAnimation(element) {
    element.classList.add('sliding-out');
    setTimeout(() => {
        element.remove();
        cleanupEmptyDateGroups();
        saveData();
    }, 250);
}

// ✅ 修复完善版：双击编辑 (解决卡死、无法操作问题)
function makeEditable(textSpan, onUpdate) {
    textSpan.addEventListener('dblclick', () => {
        // 防止重复创建输入框
        if (textSpan.style.display === 'none') return;

        const currentText = textSpan.innerText;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentText;
        input.className = 'sub-input';
        
        // 样式微调，让它看起来像在原地编辑
        input.style.width = 'calc(100% - 60px)'; 
        input.style.fontSize = 'inherit';
        input.style.color = 'var(--text-main)';
        
        textSpan.style.display = 'none';
        textSpan.parentNode.insertBefore(input, textSpan);
        input.focus();

        // 🔒 锁：防止 blur 和 enter 同时触发导致执行两次
        let isSaving = false;

        const finishEditing = (save) => {
            if (isSaving) return; // 如果正在保存中，直接退出
            isSaving = true;

            if (save) {
                const newText = input.value.trim();
                if (newText) {
                    textSpan.innerText = newText;
                    onUpdate(newText);
                    saveData();
                }
            }
            // 无论保存与否，都要移除输入框，显示原文本
            input.remove();
            textSpan.style.display = '';
        };

        // 监听按键
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                finishEditing(true); // 保存
            } else if (e.key === 'Escape') {
                finishEditing(false); // 取消，不保存
            }
        });

        // 监听失焦 (点击别处)
        input.addEventListener('blur', () => {
            finishEditing(true); // 默认失焦也是保存
        });
    });
}

// Clock Logic
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
        const m = (now.getMonth() + 1).toString().padStart(2, '0');
        const d = now.getDate().toString().padStart(2, '0');
        const h = hour.toString().padStart(2, '0');
        const mi = mins.toString().padStart(2, '0');
        const s = seconds.toString().padStart(2, '0'); 
        const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()];
        if(headerDate) headerDate.innerText = `${m}-${d} ${weekday} ${h}:${mi}:${s}`;
    }
    setInterval(updateClock, 1000);
    updateClock(); 
}

// Stats Logic
clockBtn.addEventListener('click', () => {
    document.getElementById('statsBig').innerText = sessionStats.big;
    document.getElementById('statsSmall').innerText = sessionStats.small;
    statsModal.classList.add('show');
});

function closeStats(isReset) {
    statsModal.classList.remove('show');
    if (isReset) {
        sessionStats.big = 0;
        sessionStats.small = 0;
        saveData();
    }
}

function incrementStats(type, isGroup, subCount = 0) {
    if (isGroup) { sessionStats.big++; sessionStats.small += subCount; } 
    else { sessionStats.small++; }
    saveData();
}
function decrementStats(type, isGroup, subCount = 0) {
    if (isGroup) { if (sessionStats.big > 0) sessionStats.big--; if (sessionStats.small >= subCount) sessionStats.small -= subCount; } 
    else { if (sessionStats.small > 0) sessionStats.small--; }
    saveData();
}

function getNowTimestamp() { return new Date().getTime(); }
function formatDateStr(timestamp) {
    const d = new Date(timestamp);
    return `${d.getFullYear()}年${(d.getMonth()+1).toString().padStart(2,'0')}月${d.getDate().toString().padStart(2,'0')}日`;
}
function formatTimeStr(timestamp) {
    const d = new Date(timestamp);
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

function getOrCreateDateGroup(timestamp) {
    const dateStr = formatDateStr(timestamp);
    let group = Array.from(doneList.children).find(div => div.dataset.date === dateStr);
    if (!group) {
        group = document.createElement('div');
        group.className = 'done-date-group';
        group.dataset.date = dateStr;
        group.innerHTML = `<div class="done-date-header"><span>📅 ${dateStr}</span><button class="btn-delete" title="清空"><i class="fas fa-trash-alt"></i> 清空</button></div><div class="date-tasks-container"></div>`;
        group.querySelector('.btn-delete').addEventListener('click', () => {
            group.classList.add('collapsing');
            setTimeout(() => { group.remove(); saveData(); }, 500); 
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
        <i class="fas fa-grip-vertical drag-handle" title="拖拽排序"></i>
        <button class="btn-delete"><i class="fas fa-trash-alt"></i></button>
    `;
    
    // 绑定编辑
    if (!isDone) {
        makeEditable(div.querySelector('span'), (newText) => {
            div.dataset.text = newText;
        });
    }

    div.querySelector('.checkbox').addEventListener('click', (e) => {
        e.stopPropagation();
        const nowDone = !isDone;
        if (nowDone) incrementStats('simple', false); else decrementStats('simple', false);
        moveItem(div, text, nowDone, 'simple');
    });
    div.querySelector('.btn-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        if (isDone) { deleteItemWithAnimation(div); }
        else { showModal('确定要删除这个任务吗？', () => { deleteItemWithAnimation(div); }); }
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
            <i class="fas fa-grip-vertical drag-handle" title="拖拽排序"></i>
            <button class="btn-delete"><i class="fas fa-trash-alt"></i></button>
        </div>
        <div class="sub-list"></div>
        <input type="text" class="sub-input" placeholder="添加子步骤 +" style="display: ${isDone ? 'none' : 'block'}">
    `;

    // 绑定标题编辑
    if (!isDone) {
        makeEditable(div.querySelector('.group-header span'), (newText) => {
            div.dataset.title = newText; 
        });
    }

    const subListDiv = div.querySelector('.sub-list');
    const subInput = div.querySelector('.sub-input');
    subtasks.forEach(sub => subListDiv.appendChild(createSubTaskHTML(sub.text, sub.done, div)));
    
    div.querySelector('.btn-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        if (isDone) { deleteItemWithAnimation(div); }
        else { showModal(`确定删除分组 "${title}" 吗？`, () => { deleteItemWithAnimation(div); }); }
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
    subDiv.innerHTML = `<div class="checkbox ${isDone ? 'checked' : ''}" style="width:14px; height:14px;"></div><span style="font-size:12px; margin-left:5px; color:${isDone ? 'var(--text-light)' : 'inherit'}">${text}</span><button class="btn-delete" style="font-size:12px; padding:2px;"><i class="fas fa-times"></i></button>`;
    
    // 绑定子任务编辑
    if (!isDone) {
        makeEditable(subDiv.querySelector('span'), (newText) => {
        });
    }

    subDiv.querySelector('.checkbox').addEventListener('click', () => {
        const checkbox = subDiv.querySelector('.checkbox');
        const isNowDone = !checkbox.classList.contains('checked');
        checkbox.classList.toggle('checked', isNowDone);
        subDiv.querySelector('span').style.color = isNowDone ? 'var(--text-light)' : 'inherit';
        if (isNowDone) incrementStats('sub', false); else decrementStats('sub', false);
        saveData();
        checkGroupStatus(parentGroupDiv);
    });
    subDiv.querySelector('.btn-delete').addEventListener('click', () => { subDiv.remove(); saveData(); checkGroupStatus(parentGroupDiv); });
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
    
    let titleSpan = groupDiv.querySelector('.group-header span');
    let titleText = titleSpan.innerText.replace('📂 ', '');
    if (groupDiv.dataset.title) titleText = groupDiv.dataset.title;

    const isInPending = groupDiv.parentElement.id === 'pendingList';
    if (allDone && isInPending) { incrementStats('group', true, 0); moveItem(groupDiv, titleText, true, 'group', subData); }
    else if (!allDone && !isInPending) { decrementStats('group', true, 0); moveItem(groupDiv, titleText, false, 'group', subData); }
    else { saveData(); }
}

function moveItem(oldDiv, textOrTitle, toDone, type, subData = []) {
    if (toDone) oldDiv.classList.add('sliding-out');
    setTimeout(() => {
        oldDiv.remove();
        cleanupEmptyDateGroups();
        let newDiv;
        const completedAt = toDone ? getNowTimestamp() : null;
        if (type === 'simple') newDiv = createSimpleTaskElement(textOrTitle, toDone, completedAt);
        else newDiv = createGroupElement(textOrTitle, subData, toDone, completedAt);
        if (toDone) getOrCreateDateGroup(completedAt).querySelector('.date-tasks-container').prepend(newDiv);
        else pendingList.appendChild(newDiv);
        saveData();
    }, toDone ? 400 : 0);
}

function cleanupEmptyDateGroups() {
    const groups = document.querySelectorAll('.done-date-group');
    groups.forEach(group => { if (group.querySelector('.date-tasks-container').children.length === 0) group.remove(); });
}

function saveData() {
    const data = { pending: [], done: [], stats: sessionStats };
    pendingList.childNodes.forEach(node => { if (node.nodeType === 1) data.pending.push(serializeNode(node, false)); });
    const dateGroups = doneList.querySelectorAll('.done-date-group');
    dateGroups.forEach(group => group.querySelectorAll('.task-item').forEach(task => data.done.push(serializeNode(task, true))));
    localStorage.setItem('todoData', JSON.stringify(data));
}

function serializeNode(node, isDone) {
    const type = node.dataset.type;
    const base = { type: type, completedAt: node.dataset.completedAt ? parseInt(node.dataset.completedAt) : null, done: isDone };
    if (type === 'simple') {
        base.text = node.dataset.text; 
        if (!base.text) base.text = node.querySelector('span').innerText;
    } else {
        base.title = node.dataset.title;
        if (!base.title) base.title = node.querySelector('.group-header span').innerText.replace('📂 ', '');
        base.subtasks = [];
        node.querySelectorAll('.sub-list > div').forEach(sub => base.subtasks.push({ text: sub.querySelector('span').innerText, done: sub.querySelector('.checkbox').classList.contains('checked') }));
    }
    return base;
}

function loadData() {
    const json = localStorage.getItem('todoData');
    if (!json) return;
    const data = JSON.parse(json);
    if (data.stats) sessionStats = data.stats;
    if (data.pending) data.pending.forEach(item => { if (item.type === 'simple') pendingList.appendChild(createSimpleTaskElement(item.text, false)); else pendingList.appendChild(createGroupElement(item.title, item.subtasks, false)); });
    if (data.done) {
        data.done.sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));
        data.done.forEach(item => {
            const ts = item.completedAt || getNowTimestamp();
            let el;
            if (item.type === 'simple') el = createSimpleTaskElement(item.text, true, ts); else el = createGroupElement(item.title, item.subtasks, true, ts);
            getOrCreateDateGroup(ts).querySelector('.date-tasks-container').prepend(el);
        });
    }
}