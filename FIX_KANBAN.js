// Quick Fix Script for Kanban Board
// This replaces the renderTasks ending to use Kanban columns

// Find this code block (approximately lines 1036-1061) and replace with the code below:

// DELETE FROM HERE:
/*
    const container = document.getElementById('tasks-list');

    // Build header with project filter indicator
    let headerHtml = '';
    if (selectedProjectId) {
      const project = this.dataManager.getProject(selectedProjectId);
      headerHtml = `
        <div class="filter-header" style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; padding: 0.75rem 1rem; background: var(--surface-color); border-radius: 8px; border: 1px solid var(--border-color);">
          <span>📁 Mostrando tareas de: <strong>${this.escapeHtml(project?.name || 'Proyecto')}</strong></span>
          <button class="btn btn-secondary" onclick="ui.clearProjectFilter()" style="margin-left: auto;">✕ Ver todas</button>
        </div>
      `;
    }

    if (tasks.length === 0) {
      container.innerHTML = headerHtml + `
        <div class="empty-state">
          <div class="empty-state-icon">✓</div>
          <div class="empty-state-text">No se encontraron tareas</div>
        </div>
      `;
      return;
    }

    container.innerHTML = headerHtml + tasks.map(task => this.renderTaskItem(task)).join('');
  }
*/
// TO HERE

// AND REPLACE WITH THIS:

// Split tasks by status for Kanban columns
const pendingTasks = tasks.filter(t => t.status === 'pending');
const progressTasks = tasks.filter(t => t.status === 'progress');
const completedTasks = tasks.filter(t => t.status === 'completed');

// Render in Kanban columns
const pendingContainer = document.getElementById('tasks-pending');
const progressContainer = document.getElementById('tasks-progress');
const completedContainer = document.getElementById('tasks-completed');

if (pendingContainer) {
    pendingContainer.innerHTML = pendingTasks.length > 0
        ? pendingTasks.map(task => this.renderKanbanCard ? this.renderKanbanCard(task) : this.renderTaskItem(task)).join('')
        : '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Sin tareas</div>';
}

if (progressContainer) {
    progressContainer.innerHTML = progressTasks.length > 0
        ? progressTasks.map(task => this.renderKanbanCard ? this.renderKanbanCard(task) : this.renderTaskItem(task)).join('')
        : '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Sin tareas</div>';
}

if (completedContainer) {
    completedContainer.innerHTML = completedTasks.length > 0
        ? completedTasks.map(task => this.renderKanbanCard ? this.renderKanbanCard(task) : this.renderTaskItem(task)).join('')
        : '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Sin tareas</div>';
}

// Update counters
const countPending = document.getElementById('count-pending');
const countProgress = document.getElementById('count-progress');
const countCompleted = document.getElementById('count-completed');

if (countPending) countPending.textContent = pendingTasks.length;
if (countProgress) countProgress.textContent = progressTasks.length;
if (countCompleted) countCompleted.textContent = completedTasks.length;

// Setup drag-and-drop if function exists
if (this.setupDragAndDrop) {
    this.setupDragAndDrop();
}
  }
