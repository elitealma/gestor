const SUPABASE_URL = 'https://vwlfyautuvioxfzvogah.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3bGZ5YXV0dXZpb3hmenZvZ2FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0MzA0NDYsImV4cCI6MjA3ODAwNjQ0Nn0.4OjTvjf6HfilcdjFZaLHOkTqcjvMBEU7nRG5QWLWj-Y';
const clientSB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== DATA MODEL =====
class DataManager {
  constructor() {
    this.projects = [];
    this.tasks = [];
    this.areas = [];
    this.profile = null;
    this.currentView = 'dashboard';
  }

  // Supabase Data Fetching
  async loadInitialData() {
    try {
      if (!auth.user) return false;

      // Fetch Profile
      let { data: profile } = await clientSB
        .from('profiles')
        .select('*, areas(*)')
        .eq('id', auth.user.id)
        .maybeSingle();

      // JIT Profile Creation if missing (Fallback for trigger failures)
      if (!profile && auth.user) {
        const { data: newProfile, error: insertError } = await clientSB
          .from('profiles')
          .insert([{
            id: auth.user.id,
            email: auth.user.email,
            role: auth.user.email === 'elitealmaia@gmail.com' ? 'super_admin' : 'user'
          }])
          .select('*, areas(*)')
          .maybeSingle();

        if (!insertError) {
          profile = newProfile;
        } else {
          console.error('Error creating JIT profile:', insertError);
        }
      }

      this.profile = profile;

      let projectsQuery = clientSB.from('projects').select('*').order('created_at', { ascending: false });
      let tasksQuery = clientSB.from('tasks').select('*').order('created_at', { ascending: false });

      // Partition by area if not super_admin (and profile exists)
      if (this.profile && this.profile.role !== 'super_admin') {
        projectsQuery = projectsQuery.eq('area_id', this.profile.area_id);
        tasksQuery = tasksQuery.eq('area_id', this.profile.area_id);
      }

      const [{ data: projects }, { data: tasks }] = await Promise.all([
        projectsQuery,
        tasksQuery
      ]);

      this.projects = (projects || []).map(p => ({
        ...p,
        createdAt: p.created_at,
        updatedAt: p.updated_at
      }));

      this.tasks = (tasks || []).map(t => ({
        ...t,
        projectId: t.project_id,
        dueDate: t.due_date,
        createdAt: t.created_at,
        updatedAt: t.updated_at
      }));

      if (this.profile && this.profile.role === 'super_admin') {
        const { data: areas } = await clientSB.from('areas').select('*');
        this.areas = areas || [];
      }

      return true;
    } catch (error) {
      console.error('Error cargando datos de Supabase:', error);
      return false;
    }
  }

  // Project CRUD
  async createProject(projectData) {
    const { data, error } = await clientSB
      .from('projects')
      .insert([{
        name: projectData.name,
        description: projectData.description,
        status: projectData.status,
        area_id: this.profile?.area_id || null
      }])
      .select();

    if (error) throw error;
    const project = { ...data[0], createdAt: data[0].created_at, updatedAt: data[0].updated_at };
    this.projects.unshift(project);
    return project;
  }

  async updateProject(id, projectData) {
    const { data, error } = await clientSB
      .from('projects')
      .update({
        name: projectData.name,
        description: projectData.description,
        status: projectData.status,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();

    if (error) throw error;
    const project = { ...data[0], createdAt: data[0].created_at, updatedAt: data[0].updated_at };
    const index = this.projects.findIndex(p => p.id === id);
    if (index !== -1) this.projects[index] = project;
    return project;
  }

  async deleteProject(id) {
    const { error } = await clientSB.from('projects').delete().eq('id', id);
    if (error) throw error;
    this.projects = this.projects.filter(p => p.id !== id);
    this.tasks = this.tasks.filter(t => t.projectId !== id);
  }

  getProject(id) {
    return this.projects.find(p => p.id === id);
  }

  // Task CRUD
  async createTask(taskData) {
    const { data, error } = await clientSB
      .from('tasks')
      .insert([{
        title: taskData.title,
        description: taskData.description,
        project_id: taskData.projectId,
        status: taskData.status,
        due_date: taskData.dueDate || new Date().toISOString().split('T')[0],
        area_id: this.profile?.area_id || null
      }])
      .select();

    if (error) throw error;
    const task = {
      ...data[0],
      projectId: data[0].project_id,
      dueDate: data[0].due_date,
      createdAt: data[0].created_at,
      updatedAt: data[0].updated_at
    };
    this.tasks.unshift(task);
    return task;
  }

  async updateTask(id, taskData) {
    const updatePayload = {};
    if (taskData.title) updatePayload.title = taskData.title;
    if (taskData.description) updatePayload.description = taskData.description;
    if (taskData.projectId) updatePayload.project_id = taskData.projectId;
    if (taskData.status) updatePayload.status = taskData.status;
    if (taskData.dueDate) updatePayload.due_date = taskData.dueDate;
    updatePayload.updated_at = new Date().toISOString();

    const { data, error } = await clientSB
      .from('tasks')
      .update(updatePayload)
      .eq('id', id)
      .select();

    if (error) throw error;
    const task = {
      ...data[0],
      projectId: data[0].project_id,
      dueDate: data[0].due_date,
      createdAt: data[0].created_at,
      updatedAt: data[0].updated_at
    };
    const index = this.tasks.findIndex(t => t.id === id);
    if (index !== -1) this.tasks[index] = task;
    return task;
  }

  async deleteTask(id) {
    const { error } = await clientSB.from('tasks').delete().eq('id', id);
    if (error) throw error;
    this.tasks = this.tasks.filter(t => t.id !== id);
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

  getTodayTasks() {
    const today = new Date().toISOString().split('T')[0];
    return this.tasks.filter(task => task.dueDate === today);
  }

  getTasksByDate(date) {
    return this.tasks.filter(task => task.dueDate === date);
  }
}

// ===== AUTH CONTROLLER =====
class AuthController {
  constructor(uiController) {
    this.ui = uiController;
    this.user = null;
    this.init();
  }

  async init() {
    const { data: { session } } = await clientSB.auth.getSession();
    this.user = session?.user || null;
    this.updateUIState();

    clientSB.auth.onAuthStateChange(async (_event, session) => {
      this.user = session?.user || null;
      this.updateUIState();
      await this.ui.dataManager.loadInitialData();
      this.ui.refreshCurrentView();
    });
  }

  async login(email, password) {
    const { error } = await clientSB.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async register(email, password) {
    const { error } = await clientSB.auth.signUp({ email, password });
    if (error) throw error;
  }

  async logout() {
    await clientSB.auth.signOut();
  }

  isAdmin() {
    return this.ui.dataManager.profile?.role === 'super_admin';
  }

  isAreaLeader() {
    return this.ui.dataManager.profile?.role === 'area_leader';
  }

  updateUIState() {
    const profile = this.ui.dataManager.profile;
    const isSuperAdmin = this.isAdmin();
    const isAreaLeader = this.isAreaLeader();
    const canEdit = isSuperAdmin || isAreaLeader;

    document.body.classList.toggle('guest-mode', !this.user);
    document.getElementById('nav-login').classList.toggle('hidden', !!this.user);
    document.getElementById('nav-logout').classList.toggle('hidden', !this.user);

    // Multi-tenant visibility
    document.getElementById('nav-management').classList.toggle('hidden', !isSuperAdmin);
    document.getElementById('nav-team').classList.toggle('hidden', !isAreaLeader);

    // Sidebar text update
    const areaName = profile?.areas?.name || 'Invitado';
    const roleLabel = isSuperAdmin ? 'Super Admin' : (profile ? areaName : 'Invitado');
    document.getElementById('user-area-tag').textContent = roleLabel;

    // Control visibility of admin actions
    document.querySelectorAll('.admin-only').forEach(el => {
      el.classList.toggle('hidden', !canEdit);
    });
  }
}


// ===== UI CONTROLLER =====
class UIController {
  constructor(dataManager) {
    this.dataManager = dataManager;
    this.currentAuthTab = 'login';
    this.init();
  }

  init() {
    this.currentDate = new Date();
    this.setupEventListeners();
    this.dataManager.loadInitialData().then(() => {
      this.refreshCurrentView();
    });
  }

  setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const view = e.currentTarget.getAttribute('data-view');
        if (view) this.switchView(view);
      });
    });

    document.getElementById('nav-settings').addEventListener('click', () => this.switchView('settings'));

    document.getElementById('nav-logout').addEventListener('click', () => auth.logout());
    document.getElementById('nav-login').addEventListener('click', () => this.openAuthModal());

    // Auth Modal
    document.getElementById('close-auth-modal').addEventListener('click', () => this.closeAuthModal());
    document.getElementById('auth-form').addEventListener('submit', (e) => this.handleAuthSubmit(e));
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', (e) => this.switchAuthTab(e.target.getAttribute('data-tab')));
    });

    // Project Modal
    document.getElementById('btn-new-project').addEventListener('click', () => {
      if (!auth.isAdmin()) return this.openAuthModal();
      this.openProjectModal();
    });
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

    // Calendar Nav
    document.getElementById('prev-month').addEventListener('click', () => this.changeMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => this.changeMonth(1));
    document.getElementById('today-btn').addEventListener('click', () => {
      this.currentDate = new Date();
      this.renderCalendar();
    });

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
    } else if (view === 'calendar') {
      this.renderCalendar();
    }
    this.updateStats();
  }

  // Dashboard Rendering
  renderDashboard() {
    this.renderRecentProjects();
    this.renderTodayTasks();
    this.updateCurrentDateBadge();
  }

  renderRecentProjects() {
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

  renderTodayTasks() {
    const todayTasks = this.dataManager.getTodayTasks();
    const container = document.getElementById('today-tasks-list');

    if (todayTasks.length === 0) {
      container.innerHTML = '<div class="empty-state">No hay tareas para hoy</div>';
      return;
    }

    container.innerHTML = todayTasks.map(task => `
      <div class="task-item" onclick="ui.editTask('${task.id}')" style="cursor: pointer;">
        <div class="task-checkbox ${task.status === 'completed' ? 'checked' : ''}" 
             onclick="event.stopPropagation(); ui.toggleTaskStatus('${task.id}')"></div>
        <div class="task-content">
          <div class="task-title ${task.status === 'completed' ? 'completed' : ''}">${this.escapeHtml(task.title)}</div>
        </div>
      </div>
    `).join('');
  }

  updateCurrentDateBadge() {
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    document.getElementById('current-date-badge').textContent = new Date().toLocaleDateString('es-ES', options);
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
          <div class="project-actions admin-only">
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
            <span>📅 ${task.dueDate}</span>
            ${statusBadge}
          </div>
        </div>
        <div class="task-actions admin-only">
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

  // Calendar Rendering
  renderCalendar() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    document.getElementById('calendar-month-year').textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    // Previous month days
    for (let i = firstDay; i > 0; i--) {
      const day = daysInPrevMonth - i + 1;
      grid.appendChild(this.createCalendarDay(day, month - 1, year, true));
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      grid.appendChild(this.createCalendarDay(i, month, year));
    }

    // Next month days
    const totalDays = grid.children.length;
    for (let i = 1; i <= (42 - totalDays); i++) {
      grid.appendChild(this.createCalendarDay(i, month + 1, year, true));
    }
  }

  createCalendarDay(day, month, year, isOtherMonth = false) {
    const date = new Date(year, month, day);
    const dateStr = date.toISOString().split('T')[0];
    const tasks = this.dataManager.getTasksByDate(dateStr);
    const isToday = dateStr === new Date().toISOString().split('T')[0];

    const dayEl = document.createElement('div');
    dayEl.className = `calendar-day ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''}`;
    dayEl.onclick = () => this.openTaskModalForDate(dateStr);

    dayEl.innerHTML = `
      <div class="day-number">${day}</div>
      <div class="day-tasks">
        ${tasks.map(t => `<div class="calendar-task-dot ${t.status === 'completed' ? 'completed' : ''}">${this.escapeHtml(t.title)}</div>`).join('')}
      </div>
    `;

    return dayEl;
  }

  changeMonth(delta) {
    this.currentDate.setMonth(this.currentDate.getMonth() + delta);
    this.renderCalendar();
  }

  openTaskModalForDate(date) {
    this.openTaskModal();
    document.getElementById('task-date').value = date;
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

  async handleProjectSubmit(e) {
    e.preventDefault();
    if (!auth.isAdmin()) return this.openAuthModal();

    const id = document.getElementById('project-id').value;
    const projectData = {
      name: document.getElementById('project-name').value,
      description: document.getElementById('project-description').value,
      status: document.getElementById('project-status').value
    };

    try {
      if (id) {
        await this.dataManager.updateProject(id, projectData);
      } else {
        await this.dataManager.createProject(projectData);
      }
      this.closeProjectModal();
      this.refreshCurrentView();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  }

  editProject(id) {
    if (!auth.isAdmin()) return this.openAuthModal();
    this.openProjectModal(id);
  }

  async deleteProject(id) {
    if (!auth.isAdmin()) return this.openAuthModal();
    if (confirm('¿Estás seguro de que quieres eliminar este proyecto? Se eliminarán todas sus tareas.')) {
      await this.dataManager.deleteProject(id);
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
    document.getElementById('task-date').value = new Date().toISOString().split('T')[0];
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

  async handleTaskSubmit(e) {
    e.preventDefault();
    if (!auth.isAdmin()) return this.openAuthModal();

    const id = document.getElementById('task-id').value;
    const taskData = {
      title: document.getElementById('task-title').value,
      description: document.getElementById('task-description').value,
      projectId: document.getElementById('task-project').value,
      status: document.getElementById('task-status').value,
      dueDate: document.getElementById('task-date').value
    };

    try {
      if (id) {
        await this.dataManager.updateTask(id, taskData);
      } else {
        await this.dataManager.createTask(taskData);
      }
      this.closeTaskModal();
      this.refreshCurrentView();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  }

  editTask(id) {
    if (!auth.isAdmin()) return this.openAuthModal();
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
    document.getElementById('task-date').value = task.dueDate;
    document.getElementById('task-status').value = task.status;

    title.textContent = 'Editar Tarea';
    submitText.textContent = 'Guardar Cambios';

    modal.classList.remove('hidden');
  }

  async deleteTask(id) {
    if (!auth.isAdmin()) return this.openAuthModal();
    if (confirm('¿Estás seguro de que quieres eliminar esta tarea?')) {
      await this.dataManager.deleteTask(id);
      this.refreshCurrentView();
    }
  }

  async toggleTaskStatus(id) {
    if (!auth.isAdmin()) return this.openAuthModal();
    const task = this.dataManager.getTask(id);
    if (!task) return;

    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await this.dataManager.updateTask(id, { status: newStatus });
    this.refreshCurrentView();
  }

  // Auth Modal
  openAuthModal() {
    this.switchAuthTab('login');
    document.getElementById('auth-modal').classList.remove('hidden');
  }

  closeAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
  }

  switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    document.getElementById('auth-submit-text').textContent = tab === 'login' ? 'Iniciar Sesión' : 'Registrarse';
    this.currentAuthTab = tab;
  }

  async handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Procesando...';

    try {
      if (this.currentAuthTab === 'register') {
        await auth.register(email, password);
        alert('Registro exitoso. Ya puedes iniciar sesión.');
        this.closeAuthModal();
        return; // Stop here for registration
      } else {
        await auth.login(email, password);
      }
      this.closeAuthModal();
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = this.currentAuthTab === 'login' ? 'Iniciar Sesión' : 'Registrarse';
    }
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
    } else if (view === 'calendar') {
      this.renderCalendar();
    }
    this.updateStats();
  }

  // Management (Super Admin)
  renderManagement() {
    const container = document.getElementById('areas-list');
    const areas = this.dataManager.areas;

    if (areas.length === 0) {
      container.innerHTML = '<div class="empty-state">No hay áreas creadas</div>';
      return;
    }

    container.innerHTML = areas.map(area => `
      <div class="project-card">
        <div class="project-header">
          <h3 class="project-title">${this.escapeHtml(area.name)}</h3>
          <div class="project-actions">
            <button class="btn-icon btn-secondary" onclick="ui.editArea('${area.id}')">✏️</button>
          </div>
        </div>
        <div class="project-meta">
          <div class="project-stat">
            <span>📅</span>
            <span>Creada: ${new Date(area.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Team (Area Leader)
  async renderTeam() {
    const container = document.getElementById('team-list');
    const areaId = this.dataManager.profile?.area_id;

    if (!areaId) {
      container.innerHTML = '<div class="empty-state">No tienes un área asignada</div>';
      return;
    }

    const { data: members } = await clientSB
      .from('profiles')
      .select('*')
      .eq('area_id', areaId);

    if (!members || members.length === 0) {
      container.innerHTML = '<div class="empty-state">No hay miembros en tu equipo</div>';
      return;
    }

    container.innerHTML = members.map(member => `
      <div class="task-item">
        <div class="task-content">
          <div class="task-title">${this.escapeHtml(member.email)}</div>
          <div class="task-meta">
            <span>Rol: ${member.role}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  // Settings
  renderSettings() {
    if (this.dataManager.profile) {
      document.getElementById('settings-email').value = this.dataManager.profile.email;
    }
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
const auth = new AuthController(ui);
ui.auth = auth; // Referencia circular necesaria para control de UI
