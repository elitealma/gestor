// ===== KANBAN BOARD EXTENSION =====
// This file extends UIController with Kanban board functionality

// Render Kanban Card (replaces renderTaskItem for Kanban view)
UIController.prototype.renderKanbanCard = function (task) {
    const project = this.dataManager.getProject(task.projectId);
    const assignedUser = task.assignedTo ? this.dataManager.getUserById(task.assignedTo) : null;
    const canEdit = auth.canEditTasks();
    const isLeader = auth.isAreaLeader() || auth.isSuperManager() || auth.isAdmin();

    // Check approval status
    const isCompleted = task.status === 'completed';
    const approvalBadge = isCompleted ? this.getApprovalBadge(task) : '';
    const approvalActions = isCompleted && task.approved === null && isLeader ? this.getApprovalActions(task) : '';

    return `
    <div class="kanban-task-card" draggable="${canEdit ? 'true' : 'false'}" data-task-id="${task.id}" data-task-status="${task.status}">
      <div class="kanban-task-title">${this.escapeHtml(task.title)}</div>
      <div class="kanban-task-meta">
        ${project ? `<span>📁 ${this.escapeHtml(project.name)}</span>` : ''}
        <span>📅 ${task.dueDate}</span>
        ${assignedUser ? `<span>👤 ${this.escapeHtml((assignedUser.username || assignedUser.email || 'Usuario').split('@')[0])}</span>` : ''}
      </div>
      ${approvalBadge}
      ${approvalActions}
      ${canEdit ? `
        <div class="task-actions editor-only" style="display: flex; gap: 0.5rem; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color);">
          <button class="btn-icon btn-secondary" onclick="ui.editTask('${task.id}')" title="Editar tarea" style="font-size: 16px;">✏️</button>
          <button class="btn-icon btn-secondary" onclick="ui.deleteTask('${task.id}')" title="Eliminar tarea" style="font-size: 16px;">🗑️</button>
        </div>
      ` : ''}
    </div>
  `;
};

// Get approval badge based on task approval status
UIController.prototype.getApprovalBadge = function (task) {
    if (task.approved === null) {
        return '<div class="approval-badge pending">⏳ Pendiente aprobación</div>';
    } else if (task.approved === true) {
        return '<div class="approval-badge approved">✓ Aprobada</div>';
    } else if (task.approved === false) {
        return '<div class="approval-badge rejected">✗ Rechazada</div>';
    }
    return '';
};

// Get approval action buttons for leaders
UIController.prototype.getApprovalActions = function (task) {
    return `
    <div class="approval-actions">
      <button class="btn-approve" onclick="ui.approveTask('${task.id}', true)">✓ Aprobar</button>
      <button class="btn-reject" onclick="ui.approveTask('${task.id}', false)">✗ Rechazar</button>
    </div>
  `;
};

// Approve or reject a completed task
UIController.prototype.approveTask = async function (taskId, approved) {
    if (!auth.isAreaLeader() && !auth.isSuperManager() && !auth.isAdmin()) {
        alert('Solo los líderes de área pueden aprobar/rechazar tareas.');
        return;
    }

    try {
        const task = this.dataManager.getTask(taskId);
        if (!task) throw new Error('Tarea no encontrada');

        // Update task approval status
        const updateData = {
            approved: approved,
            approved_by: auth.user.id,
            approved_at: new Date().toISOString(),
            // If rejected, move back to progress
            status: approved ? 'completed' : 'progress'
        };

        await this.dataManager.updateTask(taskId, updateData);
        this.refreshCurrentView();

        const message = approved ? 'Tarea aprobada exitosamente' : 'Tarea rechazada. Regresó a "En Progreso".';
        alert(message);
    } catch (error) {
        console.error('Error al aprobar/rechazar tarea:', error);
        alert('Error: ' + error.message);
    }
};

// Setup Drag and Drop functionality
UIController.prototype.setupDragAndDrop = function () {
    const cards = document.querySelectorAll('.kanban-task-card[draggable="true"]');
    const columns = document.querySelectorAll('.kanban-column-content');

    cards.forEach(card => {
        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', card.dataset.taskId);
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });
    });

    columns.forEach(column => {
        column.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            column.classList.add('drag-over');
        });

        column.addEventListener('dragleave', () => {
            column.classList.remove('drag-over');
        });

        column.addEventListener('drop', async (e) => {
            e.preventDefault();
            column.classList.remove('drag-over');

            const taskId = e.dataTransfer.getData('text/plain');
            const newStatus = column.dataset.status;

            if (taskId && newStatus) {
                await this.handleTaskDrop(taskId, newStatus);
            }
        });
    });
};

// Handle task drop (update status)
UIController.prototype.handleTaskDrop = async function (taskId, newStatus) {
    try {
        const task = this.dataManager.getTask(taskId);
        if (!task) throw new Error('Tarea no encontrada');

        // Don't allow moving if task is pending approval (completed but not approved)
        if (task.status === 'completed' && task.approved === null) {
            alert('No puedes mover una tarea que está pendiente de aprobación.');
            return;
        }

        // If moving to completed, set approved to null (pending approval)
        const updateData = {
            status: newStatus
        };

        if (newStatus === 'completed') {
            updateData.approved = null;  // Pending approval
            updateData.approved_by = null;
            updateData.approved_at = null;
        }

        await this.dataManager.updateTask(taskId, updateData);
        this.refreshCurrentView();
    } catch (error) {
        console.error('Error al mover tarea:', error);
        alert('Error: ' + error.message);
    }
};

// Initialize Kanban when tasks view is loaded
const originalSwitchView = UIController.prototype.switchView;
UIController.prototype.switchView = function (view) {
    originalSwitchView.call(this, view);

    if (view === 'tasks') {
        // Give the DOM time to render, then setup drag-drop
        setTimeout(() => {
            this.setupDragAndDrop();
        }, 100);
    }
};
