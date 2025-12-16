// ===== DATA MODEL =====
class DataManager {
  constructor() {
    this.projects = this.loadProjects();
    this.tasks = this.loadTasks();
    this.currentView = 'dashboard';
  }

  // LocalStorage Management
  loadProjects() {
    const data = localStorage.getItem('projects');
    return data ? JSON.parse(data) : [];
  }

  loadTasks() {
    const data = localStorage.getItem('tasks');
    return data ? JSON.parse(data) : [];
  }

  saveProjects() {
    localStorage.setItem('projects', JSON.stringify(this.projects));
  }

  saveTasks() {
    localStorage.setItem('tasks', JSON.stringify(this.tasks));
  }

  // Project CRUD
  createProject(projectData) {
    const project = {
      id: Date.now().toString(),
      name: projectData.name,
      description: projectData.description,
      status: projectData.status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.projects.push(project);
    this.saveProjects();
    return project;
  }

  updateProject(id, projectData) {
    const index = this.projects.findIndex(p => p.id === id);
    if (index !== -1) {
      this.projects[index] = {
        ...this.projects[index],
        ...projectData,
        updatedAt: new Date().toISOString()
      };
      this.saveProjects();
      return this.projects[index];
    }
    return null;
  }

  deleteProject(id) {
    this.projects = this.projects.filter(p => p.id !== id);
    this.tasks = this.tasks.filter(t => t.projectId !== id);
    this.saveProjects();
    this.saveTasks();
  }

  getProject(id) {
    return this.projects.find(p => p.id === id);
  }

  // Task CRUD
  createTask(taskData) {
    const task = {
      id: Date.now().toString(),
      title: taskData.title,
      description: taskData.description,
      projectId: taskData.projectId,
      status: taskData.status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.tasks.push(task);
    this.saveTasks();
    return task;
  }

  updateTask(id, taskData) {
    const index = this.tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      this.tasks[index] = {
        ...this.tasks[index],
        ...taskData,
        updatedAt: new Date().toISOString()
      };
      this.saveTasks();
      return this.tasks[index];
    }
    return null;
  }

  deleteTask(id) {
    this.tasks = this.tasks.filter(t => t.id !== id);
    this.saveTasks();
  }

  getTask(id) {
    return this.tasks.find(t => t.id === id);
  }

  getTasksByProject(projectId) {
    return this.tasks.filter(t => t.projectId === projectId);
  }

  // Statistics
  getStats() {
    return {
      totalProjects: this.projects.length,
      activeProjects: this.projects.filter(p => p.status !== 'completed').length,
      completedTasks: this.tasks.filter(t => t.status === 'completed').length,
      pendingTasks: this.tasks.filter(t => t.status !== 'completed').length
    };
  }

  getProjectProgress(projectId) {
    const tasks = this.getTasksByProject(projectId);
    if (tasks.length === 0) return 0;
    const completed = tasks.filter(t => t.status === 'completed').length;
    return Math.round((completed / tasks.length) * 100);
  }
}

// ===== UI CONTROLLER =====
class UIController {
  constructor(dataManager) {
    this.dataManager = dataManager;
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.renderDashboard();
    this.updateStats();
  }

  setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const view = e.currentTarget.getAttribute('data-view');
        this.switchView(view);
      });
    });

    // Project Modal
    document.getElementById('btn-new-project').addEventListener('click', () => this.openProjectModal());
    document.getElementById('close-project-modal').addEventListener('click', () => this.closeProjectModal());
    document.getElementById('cancel-project').addEventListener('click', () => this.closeProjectModal());
    document.getElementById('project-form').addEventListener('submit', (e) => this.handleProjectSubmit(e));

    // Task Modal
    document.getElementById('close-task-modal').addEventListener('click', () => this.closeTaskModal());
    document.getElementById('cancel-task').addEventListener('click', () => this.closeTaskModal());
    document.getElementById('task-form').addEventListener('submit', (e) => this.handleTaskSubmit(e));

    // Search and Filter
    document.getElementById('search-projects').addEventListener('input', (e) => this.handleSearchProjects(e));
    document.getElementById('filter-projects').addEventListener('change', (e) => this.handleFilterProjects(e));
    document.getElementById('search-tasks').addEventListener('input', (e) => this.handleSearchTasks(e));
    document.getElementById('filter-tasks').addEventListener('change', (e) => this.handleFilterTasks(e));

    // Close modals on overlay click
    document.getElementById('project-modal').addEventListener('click', (e) => {
      if (e.target.id === 'project-modal') this.closeProjectModal();
    });
    document.getElementById('task-modal').addEventListener('click', (e) => {
      if (e.target.id === 'task-modal') this.closeTaskModal();
    });
  }

  // View Management
  switchView(view) {
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
    });
    document.querySelector(`[data-view="${view}"]`).classList.add('active');

    // Update views
    document.querySelectorAll('.view').forEach(v => {
      v.classList.add('hidden');
    });
    document.getElementById(`${view}-view`).classList.remove('hidden');

    // Render content
    this.dataManager.currentView = view;
    if (view === 'dashboard') {
      this.renderDashboard();
    } else if (view === 'projects') {
      this.renderProjects();
    } else if (view === 'tasks') {
      this.renderTasks();
    }
    this.updateStats();
  }

  // Dashboard Rendering
  renderDashboard() {
    const recentProjects = this.dataManager.projects.slice(-3).reverse();
    const container = document.getElementById('recent-projects');

    if (recentProjects.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📁</div>
          <div class="empty-state-text">No hay proyectos aún</div>
          <button class="btn btn-primary mt-xl" onclick="ui.switchView('projects'); ui.openProjectModal();">
            <span>➕</span>
            <span>Crear Primer Proyecto</span>
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = recentProjects.map(project => this.renderProjectCard(project)).join('');
  }

  // Projects Rendering
  renderProjects(filter = 'all', search = '') {
    let projects = this.dataManager.projects;

    // Apply filter
    if (filter !== 'all') {
      projects = projects.filter(p => p.status === filter);
    }

    // Apply search
    if (search) {
      projects = projects.filter(p => 
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase())
      );
    }

    const container = document.getElementById('projects-list');

    if (projects.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <div class="empty-state-text">No se encontraron proyectos</div>
        </div>
      `;
      return;
    }

    container.innerHTML = projects.map(project => this.renderProjectCard(project)).join('');
  }

  renderProjectCard(project) {
    const tasks = this.dataManager.getTasksByProject(project.id);
    const progress = this.dataManager.getProjectProgress(project.id);
    const statusBadge = this.getStatusBadge(project.status);

    return `
      <div class="project-card" data-project-id="${project.id}">
        <div class="project-header">
          <div>
            <h3 class="project-title">${this.escapeHtml(project.name)}</h3>
            ${statusBadge}
          </div>
          <div class="project-actions">
            <button class="btn-icon btn-secondary" onclick="ui.openTaskModal('${project.id}')" title="Agregar tarea">
              ➕
            </button>
            <button class="btn-icon btn-secondary" onclick="ui.editProject('${project.id}')" title="Editar proyecto">
              ✏️
            </button>
            <button class="btn-icon btn-secondary" onclick="ui.deleteProject('${project.id}')" title="Eliminar proyecto">
              🗑️
            </button>
          </div>
        </div>
        <p class="project-description">${this.escapeHtml(project.description)}</p>
        <div class="project-meta">
          <div class="project-progress">
            <div class="progress-label">
              <span>Progreso</span>
              <span><strong>${progress}%</strong></span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
          </div>
          <div class="project-stats">
            <div class="project-stat">
              <span>📋</span>
              <span>${tasks.length} tareas</span>
            </div>
            <div class="project-stat">
              <span>✓</span>
              <span>${tasks.filter(t => t.status === 'completed').length} completadas</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Tasks Rendering
  renderTasks(filter = 'all', search = '') {
    let tasks = this.dataManager.tasks;

    // Apply filter
    if (filter !== 'all') {
      tasks = tasks.filter(t => t.status === filter);
    }

    // Apply search
    if (search) {
      tasks = tasks.filter(t => 
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase())
      );
    }

    const container = document.getElementById('tasks-list');

    if (tasks.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">✓</div>
          <div class="empty-state-text">No se encontraron tareas</div>
        </div>
      `;
      return;
    }

    container.innerHTML = tasks.map(task => this.renderTaskItem(task)).join('');
  }

  renderTaskItem(task) {
    const project = this.dataManager.getProject(task.projectId);
    const statusBadge = this.getStatusBadge(task.status);
    const isCompleted = task.status === 'completed';

    return `
      <div class="task-item">
        <div class="task-checkbox ${isCompleted ? 'checked' : ''}" onclick="ui.toggleTaskStatus('${task.id}')"></div>
        <div class="task-content">
          <div class="task-title ${isCompleted ? 'completed' : ''}">${this.escapeHtml(task.title)}</div>
          <div class="task-meta">
            <span>📁 ${project ? this.escapeHtml(project.name) : 'Sin proyecto'}</span>
            ${statusBadge}
          </div>
        </div>
        <div class="task-actions">
          <button class="btn-icon btn-secondary" onclick="ui.editTask('${task.id}')" title="Editar tarea">
            ✏️
          </button>
          <button class="btn-icon btn-secondary" onclick="ui.deleteTask('${task.id}')" title="Eliminar tarea">
            🗑️
          </button>
        </div>
      </div>
    `;
  }

  // Statistics
  updateStats() {
    const stats = this.dataManager.getStats();
    document.getElementById('stat-total-projects').textContent = stats.totalProjects;
    document.getElementById('stat-active-projects').textContent = stats.activeProjects;
    document.getElementById('stat-completed-tasks').textContent = stats.completedTasks;
    document.getElementById('stat-pending-tasks').textContent = stats.pendingTasks;
  }

  // Project Modal
  openProjectModal(projectId = null) {
    const modal = document.getElementById('project-modal');
    const form = document.getElementById('project-form');
    const title = document.getElementById('project-modal-title');
    const submitText = document.getElementById('project-submit-text');

    form.reset();

    if (projectId) {
      const project = this.dataManager.getProject(projectId);
      if (project) {
        document.getElementById('project-id').value = project.id;
        document.getElementById('project-name').value = project.name;
        document.getElementById('project-description').value = project.description;
        document.getElementById('project-status').value = project.status;
        title.textContent = 'Editar Proyecto';
        submitText.textContent = 'Guardar Cambios';
      }
    } else {
      document.getElementById('project-id').value = '';
      title.textContent = 'Nuevo Proyecto';
      submitText.textContent = 'Crear Proyecto';
    }

    modal.classList.remove('hidden');
  }

  closeProjectModal() {
    document.getElementById('project-modal').classList.add('hidden');
  }

  handleProjectSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('project-id').value;
    const projectData = {
      name: document.getElementById('project-name').value,
      description: document.getElementById('project-description').value,
      status: document.getElementById('project-status').value
    };

    if (id) {
      this.dataManager.updateProject(id, projectData);
    } else {
      this.dataManager.createProject(projectData);
    }

    this.closeProjectModal();
    this.refreshCurrentView();
  }

  editProject(id) {
    this.openProjectModal(id);
  }

  deleteProject(id) {
    if (confirm('¿Estás seguro de que quieres eliminar este proyecto? Se eliminarán todas sus tareas.')) {
      this.dataManager.deleteProject(id);
      this.refreshCurrentView();
    }
  }

  // Task Modal
  openTaskModal(projectId = null) {
    const modal = document.getElementById('task-modal');
    const form = document.getElementById('task-form');
    const title = document.getElementById('task-modal-title');
    const submitText = document.getElementById('task-submit-text');
    const projectSelect = document.getElementById('task-project');

    form.reset();

    // Populate project select
    projectSelect.innerHTML = '<option value="">Selecciona un proyecto</option>' +
      this.dataManager.projects.map(p => 
        `<option value="${p.id}" ${projectId === p.id ? 'selected' : ''}>${this.escapeHtml(p.name)}</option>`
      ).join('');

    document.getElementById('task-id').value = '';
    if (projectId) {
      document.getElementById('task-project-id').value = projectId;
      projectSelect.value = projectId;
    }
    title.textContent = 'Nueva Tarea';
    submitText.textContent = 'Crear Tarea';

    modal.classList.remove('hidden');
  }

  closeTaskModal() {
    document.getElementById('task-modal').classList.add('hidden');
  }

  handleTaskSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('task-id').value;
    const taskData = {
      title: document.getElementById('task-title').value,
      description: document.getElementById('task-description').value,
      projectId: document.getElementById('task-project').value,
      status: document.getElementById('task-status').value
    };

    if (id) {
      this.dataManager.updateTask(id, taskData);
    } else {
      this.dataManager.createTask(taskData);
    }

    this.closeTaskModal();
    this.refreshCurrentView();
  }

  editTask(id) {
    const task = this.dataManager.getTask(id);
    if (!task) return;

    const modal = document.getElementById('task-modal');
    const title = document.getElementById('task-modal-title');
    const submitText = document.getElementById('task-submit-text');
    const projectSelect = document.getElementById('task-project');

    // Populate project select
    projectSelect.innerHTML = '<option value="">Selecciona un proyecto</option>' +
      this.dataManager.projects.map(p => 
        `<option value="${p.id}">${this.escapeHtml(p.name)}</option>`
      ).join('');

    document.getElementById('task-id').value = task.id;
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-description').value = task.description || '';
    document.getElementById('task-project').value = task.projectId;
    document.getElementById('task-status').value = task.status;

    title.textContent = 'Editar Tarea';
    submitText.textContent = 'Guardar Cambios';

    modal.classList.remove('hidden');
  }

  deleteTask(id) {
    if (confirm('¿Estás seguro de que quieres eliminar esta tarea?')) {
      this.dataManager.deleteTask(id);
      this.refreshCurrentView();
    }
  }

  toggleTaskStatus(id) {
    const task = this.dataManager.getTask(id);
    if (!task) return;

    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    this.dataManager.updateTask(id, { status: newStatus });
    this.refreshCurrentView();
  }

  // Search and Filter
  handleSearchProjects(e) {
    const search = e.target.value;
    const filter = document.getElementById('filter-projects').value;
    this.renderProjects(filter, search);
  }

  handleFilterProjects(e) {
    const filter = e.target.value;
    const search = document.getElementById('search-projects').value;
    this.renderProjects(filter, search);
  }

  handleSearchTasks(e) {
    const search = e.target.value;
    const filter = document.getElementById('filter-tasks').value;
    this.renderTasks(filter, search);
  }

  handleFilterTasks(e) {
    const filter = e.target.value;
    const search = document.getElementById('search-tasks').value;
    this.renderTasks(filter, search);
  }

  // Utilities
  refreshCurrentView() {
    const view = this.dataManager.currentView;
    if (view === 'dashboard') {
      this.renderDashboard();
    } else if (view === 'projects') {
      const filter = document.getElementById('filter-projects').value;
      const search = document.getElementById('search-projects').value;
      this.renderProjects(filter, search);
    } else if (view === 'tasks') {
      const filter = document.getElementById('filter-tasks').value;
      const search = document.getElementById('search-tasks').value;
      this.renderTasks(filter, search);
    }
    this.updateStats();
  }

  getStatusBadge(status) {
    const badges = {
      pending: '<span class="badge badge-pending">⏱️ Pendiente</span>',
      progress: '<span class="badge badge-progress">🚀 En Progreso</span>',
      completed: '<span class="badge badge-completed">✓ Completado</span>'
    };
    return badges[status] || '';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// ===== INITIALIZE APP =====
const dataManager = new DataManager();
const ui = new UIController(dataManager);

// Add some demo data if the app is empty
if (dataManager.projects.length === 0) {
  const demoProject1 = dataManager.createProject({
    name: 'Proyecto de Ejemplo',
    description: 'Este es un proyecto de demostración para que veas cómo funciona ProManager',
    status: 'progress'
  });

  dataManager.createTask({
    title: 'Crear diseño inicial',
    description: 'Diseñar la interfaz de usuario',
    projectId: demoProject1.id,
    status: 'completed'
  });

  dataManager.createTask({
    title: 'Implementar funcionalidades',
    description: 'Desarrollar las características principales',
    projectId: demoProject1.id,
    status: 'progress'
  });

  dataManager.createTask({
    title: 'Realizar pruebas',
    description: 'Probar todas las funcionalidades',
    projectId: demoProject1.id,
    status: 'pending'
  });

  const demoProject2 = dataManager.createProject({
    name: 'Documentación',
    description: 'Crear la documentación del proyecto',
    status: 'pending'
  });

  dataManager.createTask({
    title: 'Escribir README',
    description: 'Documentar cómo usar la aplicación',
    projectId: demoProject2.id,
    status: 'pending'
  });

  ui.refreshCurrentView();
}
