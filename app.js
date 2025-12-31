const SUPABASE_URL = 'https://vwlfyautuvioxfzvogah.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3bGZ5YXV0dXZpb3hmenZvZ2FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0MzA0NDYsImV4cCI6MjA3ODAwNjQ0Nn0.4OjTvjf6HfilcdjFZaLHOkTqcjvMBEU7nRG5QWLWj-Y';
const clientSB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const formatDateYYYYMMDD = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// ===== DATA MODEL =====
class DataManager {
  constructor() {
    this.projects = [];
    this.tasks = [];
    this.areas = [];
    this.users = []; // Lista de usuarios para asignación
    this.profile = null;
    this.currentView = 'dashboard';
    this.realtimeSubscriptions = []; // Real-time subscriptions
  }

  // Supabase Data Fetching
  async loadInitialData() {
    try {
      let profile = null;
      if (auth.user) {
        let { data: existingProfile } = await clientSB
          .from('profiles')
          .select('*, areas(*)')
          .eq('id', auth.user.id)
          .maybeSingle();

        if (!existingProfile) {
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
            existingProfile = newProfile;
          } else {
            console.error('Error creating JIT profile:', insertError);
          }
        }

        profile = existingProfile;
      }

      this.profile = profile || null;

      let projectsQuery = clientSB.from('projects').select('*').order('created_at', { ascending: false });
      let tasksQuery = clientSB.from('tasks').select('*').order('created_at', { ascending: false });

      /* 
      // Filter logic: Local users only see their area. 
      // Super Admin and Global Admin (read-only) see EVERYTHING.
      */
      const isGlobalPower = this.profile?.role === 'super_admin' || this.profile?.role === 'admin';

      if (this.profile && !isGlobalPower) {
        projectsQuery = projectsQuery.eq('area_id', this.profile.area_id);
        tasksQuery = tasksQuery.eq('area_id', this.profile.area_id);
      }

      const [{ data: projects, error: projectsError }, { data: tasks, error: tasksError }] = await Promise.all([
        projectsQuery,
        tasksQuery
      ]);

      if (projectsError) throw projectsError;
      if (tasksError) throw tasksError;

      this.projects = (projects || []).map(p => ({
        ...p,
        createdAt: p.created_at,
        updatedAt: p.updated_at
      }));

      this.tasks = (tasks || []).map(t => ({
        ...t,
        projectId: t.project_id,
        assignedTo: t.assigned_to,
        dueDate: t.due_date ? String(t.due_date).slice(0, 10) : '',
        createdAt: t.created_at,
        updatedAt: t.updated_at
      }));

      if (this.profile && (this.profile.role === 'super_admin' || this.profile.role === 'admin')) {
        const { data: areas } = await clientSB.from('areas').select('*');
        this.areas = areas || [];
      }

      // Load users for task assignment (all profiles for admin, area users for area_leader)
      if (this.profile) {
        let usersQuery = clientSB.from('profiles').select('id, email, username, role, area_id');

        if (this.profile.role === 'area_leader') {
          usersQuery = usersQuery.eq('area_id', this.profile.area_id);
        }

        const { data: users } = await usersQuery;
        this.users = users || [];
      }

      // Setup real-time subscriptions
      this.setupRealtimeSync();

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
        due_date: taskData.dueDate || formatDateYYYYMMDD(new Date()),
        area_id: this.profile?.area_id || null,
        assigned_to: taskData.assignedTo || auth.user?.id || null
      }])
      .select();

    if (error) throw error;
    const task = {
      ...data[0],
      projectId: data[0].project_id,
      assignedTo: data[0].assigned_to,
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
    if (taskData.assignedTo !== undefined) updatePayload.assigned_to = taskData.assignedTo;
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
      assignedTo: data[0].assigned_to,
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
    const today = formatDateYYYYMMDD(new Date());
    return this.tasks.filter(task => task.dueDate === today);
  }

  getTasksByDate(date) {
    return this.tasks.filter(task => task.dueDate === date);
  }

  getProjectsByDeadline(date) {
    // Get projects that have a deadline on this date
    // For now, we'll use created_at + 30 days as example or you can add a deadline field to projects
    return [];
  }

  getCalendarItemsByDate(date) {
    const tasks = this.getTasksByDate(date);
    const items = tasks.map(t => ({
      type: 'task',
      id: t.id,
      title: t.title,
      status: t.status,
      assignedTo: t.assignedTo,
      projectId: t.projectId
    }));
    return items;
  }

  getUserById(userId) {
    return this.users.find(u => u.id === userId);
  }

  // Real-time sync setup
  setupRealtimeSync() {
    // Cleanup existing subscriptions
    this.realtimeSubscriptions.forEach(sub => {
      clientSB.removeChannel(sub);
    });
    this.realtimeSubscriptions = [];

    // Subscribe to projects changes
    const projectsChannel = clientSB
      .channel('projects-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        (payload) => this.handleProjectChange(payload)
      )
      .subscribe();

    // Subscribe to tasks changes
    const tasksChannel = clientSB
      .channel('tasks-changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        (payload) => this.handleTaskChange(payload)
      )
      .subscribe();

    this.realtimeSubscriptions = [projectsChannel, tasksChannel];
  }

  handleProjectChange(payload) {
    if (payload.eventType === 'INSERT') {
      const newProject = { ...payload.new, createdAt: payload.new.created_at, updatedAt: payload.new.updated_at };
      if (!this.projects.find(p => p.id === newProject.id)) {
        this.projects.unshift(newProject);
        ui?.refreshCurrentView();
      }
    } else if (payload.eventType === 'UPDATE') {
      const index = this.projects.findIndex(p => p.id === payload.new.id);
      if (index !== -1) {
        this.projects[index] = { ...payload.new, createdAt: payload.new.created_at, updatedAt: payload.new.updated_at };
        ui?.refreshCurrentView();
      }
    } else if (payload.eventType === 'DELETE') {
      this.projects = this.projects.filter(p => p.id !== payload.old.id);
      ui?.refreshCurrentView();
    }
  }

  handleTaskChange(payload) {
    if (payload.eventType === 'INSERT') {
      const newTask = {
        ...payload.new,
        projectId: payload.new.project_id,
        assignedTo: payload.new.assigned_to,
        dueDate: payload.new.due_date ? String(payload.new.due_date).slice(0, 10) : '',
        createdAt: payload.new.created_at,
        updatedAt: payload.new.updated_at
      };
      if (!this.tasks.find(t => t.id === newTask.id)) {
        this.tasks.unshift(newTask);
        ui?.refreshCurrentView();
      }
    } else if (payload.eventType === 'UPDATE') {
      const index = this.tasks.findIndex(t => t.id === payload.new.id);
      if (index !== -1) {
        this.tasks[index] = {
          ...payload.new,
          projectId: payload.new.project_id,
          assignedTo: payload.new.assigned_to,
          dueDate: payload.new.due_date ? String(payload.new.due_date).slice(0, 10) : '',
          createdAt: payload.new.created_at,
          updatedAt: payload.new.updated_at
        };
        ui?.refreshCurrentView();
      }
    } else if (payload.eventType === 'DELETE') {
      this.tasks = this.tasks.filter(t => t.id !== payload.old.id);
      ui?.refreshCurrentView();
    }
  }
}

// ===== AUTH CONTROLLER =====
class AuthController {
  constructor(uiController) {
    this.ui = uiController;
    this.user = null;
    // Removed automatic init() to prevent race conditions
  }

  async init() {
    const { data: { session } } = await clientSB.auth.getSession();
    this.user = session?.user || null;
    this.updateUIState();

    // Aggressive detection of password recovery state
    const isRecovery = window.location.hash.includes('type=recovery') ||
      window.location.search.includes('type=recovery');

    if (isRecovery) {
      setTimeout(() => {
        document.getElementById('update-password-modal')?.classList.remove('hidden');
      }, 500); // Small delay to ensure DOM is fully ready and stable
    }

    clientSB.auth.onAuthStateChange(async (event, session) => {
      this.user = session?.user || null;

      if (event === 'PASSWORD_RECOVERY') {
        document.getElementById('update-password-modal')?.classList.remove('hidden');
      }

      this.updateUIState();
      await this.ui.dataManager.loadInitialData();
      this.updateUIState();
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

  async requestPasswordReset(email) {
    const domain = 'https://gestor.pegasus360agency.com/';
    const { error } = await clientSB.auth.resetPasswordForEmail(email, {
      redirectTo: domain,
    });
    if (error) throw error;
  }

  async updatePassword(newPassword) {
    const { error } = await clientSB.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  isAdmin() {
    return this.ui.dataManager.profile?.role === 'super_admin';
  }

  isGlobalAdmin() {
    return this.ui.dataManager.profile?.role === 'admin';
  }

  isAreaLeader() {
    return this.ui.dataManager.profile?.role === 'area_leader';
  }

  isViewer() {
    return this.ui.dataManager.profile?.role === 'viewer';
  }

  canEditProjects() {
    return this.isAdmin() || this.isAreaLeader();
  }

  canEditTasks() {
    // Admin (Global Viewer) cannot edit tasks
    return this.user && !this.isViewer() && !this.isGlobalAdmin();
  }

  updateUIState() {
    const profile = this.ui.dataManager.profile;
    const isSuperAdmin = this.isAdmin();
    const isGlobalAdmin = this.isGlobalAdmin();
    const isAreaLeader = this.isAreaLeader();
    const canEditProjects = this.canEditProjects();
    const canEditTasks = this.canEditTasks();

    document.body.classList.toggle('guest-mode', !this.user);
    document.getElementById('nav-login').classList.toggle('hidden', !!this.user);
    document.getElementById('nav-logout').classList.toggle('hidden', !this.user);
    document.getElementById('nav-settings').classList.toggle('hidden', !this.user);

    // Sidebar navigation visibility
    const canSeeAreas = isSuperAdmin || isGlobalAdmin;
    const canSeeUsers = isSuperAdmin || isGlobalAdmin || isAreaLeader;

    document.getElementById('nav-areas').classList.toggle('hidden', !canSeeAreas);
    document.getElementById('nav-users').classList.toggle('hidden', !canSeeUsers);

    // Sidebar text update
    const areaName = profile?.areas?.name || 'Invitado';
    let roleLabel = 'Invitado';
    if (isSuperAdmin) roleLabel = 'Super Admin';
    else if (isGlobalAdmin) roleLabel = 'Admin Global';
    else if (profile) roleLabel = areaName;

    document.getElementById('user-area-tag').textContent = roleLabel;

    // Control visibility of admin/editor actions
    document.querySelectorAll('.admin-only').forEach(el => {
      el.classList.toggle('hidden', !canEditProjects);
    });

    document.querySelectorAll('.editor-only').forEach(el => {
      el.classList.toggle('hidden', !canEditTasks);
    });
  }
}


// ===== UI CONTROLLER =====
class UIController {
  constructor(dataManager) {
    this.dataManager = dataManager;
    this.currentAuthTab = 'login';
    // Removed automatic init() to prevent race conditions
  }

  init() {
    // Redundant check for password recovery
    if (window.location.hash.includes('type=recovery')) {
      document.getElementById('update-password-modal')?.classList.remove('hidden');
    }
    this.currentDate = new Date();
    this.setupEventListeners();
    this.dataManager.loadInitialData().then(() => {
      auth.updateUIState();
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
      if (!auth.canEditProjects()) return this.openAuthModal();
      this.openProjectModal();
    });

    // Areas and Users main view buttons
    document.getElementById('btn-new-area-main')?.addEventListener('click', () => {
      document.getElementById('area-modal')?.classList.remove('hidden');
      document.getElementById('area-form').reset();
    });

    document.getElementById('btn-new-user-main')?.addEventListener('click', () => {
      this.openCreateUserModal(); // Wrapper for existing logic
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
    // Forgot Password & Recovery Flow
    document.getElementById('btn-forgot-password')?.addEventListener('click', () => {
      this.closeAuthModal();
      document.getElementById('forgot-password-modal')?.classList.remove('hidden');
    });

    document.getElementById('close-forgot-modal')?.addEventListener('click', () => {
      document.getElementById('forgot-password-modal')?.classList.add('hidden');
    });

    document.getElementById('forgot-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('forgot-email').value;
      const submitBtn = e.target.querySelector('button[type="submit"]');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';

      try {
        await auth.requestPasswordReset(email);
        alert('Se ha enviado un correo de recuperación a ' + email);
        document.getElementById('forgot-password-modal').classList.add('hidden');
      } catch (error) {
        alert('Error: ' + error.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar Enlace';
      }
    });

    document.getElementById('update-password-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById('new-password').value;
      const submitBtn = e.target.querySelector('button[type="submit"]');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Actualizando...';

      try {
        await auth.updatePassword(newPassword);
        alert('✅ Contraseña actualizada exitosamente. Ya puedes ingresar.');
        document.getElementById('update-password-modal').classList.add('hidden');
        window.location.hash = ''; // Clear recovery hash
        this.openAuthModal();
      } catch (error) {
        alert('❌ Error: ' + error.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Cambiar Contraseña';
      }
    });

    // Close modals on overlay click
    document.getElementById('forgot-password-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'forgot-password-modal') e.target.classList.add('hidden');
    });
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
          <button class="btn btn-primary mt-xl admin-only" onclick="ui.switchView('projects'); ui.openProjectModal();">
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
    const canInteract = !!auth.user;

    if (todayTasks.length === 0) {
      container.innerHTML = '<div class="empty-state">No hay tareas para hoy</div>';
      return;
    }

    container.innerHTML = todayTasks.map(task => `
      <div class="task-item" ${canInteract ? `onclick="ui.editTask('${task.id}')"` : ''} style="${canInteract ? 'cursor: pointer;' : ''}">
        <div class="task-checkbox ${task.status === 'completed' ? 'checked' : ''}" 
             ${canInteract ? `onclick="event.stopPropagation(); ui.toggleTaskStatus('${task.id}')"` : ''}></div>
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
    const assignedUser = task.assignedTo ? this.dataManager.getUserById(task.assignedTo) : null;
    const statusBadge = this.getStatusBadge(task.status);
    const isCompleted = task.status === 'completed';
    const canInteract = !!auth.user;

    return `
      <div class="task-item">
        <div class="task-checkbox ${isCompleted ? 'checked' : ''}" ${canInteract ? `onclick="ui.toggleTaskStatus('${task.id}')"` : ''}></div>
        <div class="task-content">
          <div class="task-title ${isCompleted ? 'completed' : ''}">${this.escapeHtml(task.title)}</div>
          <div class="task-meta">
            <span>📁 ${project ? this.escapeHtml(project.name) : 'Sin proyecto'}</span>
            <span>📅 ${task.dueDate}</span>
            ${assignedUser ? `<span>👤 ${this.escapeHtml(assignedUser.email || assignedUser.username || 'Usuario')}</span>` : ''}
            ${statusBadge}
          </div>
        </div>
        <div class="task-actions editor-only">
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
    const dateStr = formatDateYYYYMMDD(date);
    const items = this.dataManager.getCalendarItemsByDate(dateStr);
    const isToday = dateStr === formatDateYYYYMMDD(new Date());

    const dayEl = document.createElement('div');
    dayEl.className = `calendar-day ${isOtherMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${items.length > 0 ? 'has-items' : ''}`;
    if (auth.user) dayEl.onclick = () => this.openTaskModalForDate(dateStr);

    const itemsList = items.map(item => {
      if (item.type === 'task') {
        const assignedUser = item.assignedTo ? this.dataManager.getUserById(item.assignedTo) : null;
        const userInitial = assignedUser ? (assignedUser.email?.[0] || assignedUser.username?.[0] || '?').toUpperCase() : '';
        const project = this.dataManager.getProject(item.projectId);
        return `<div class="calendar-task-dot ${item.status === 'completed' ? 'completed' : ''}" title="${this.escapeHtml(item.title)}${assignedUser ? ' - ' + (assignedUser.email || assignedUser.username) : ''}${project ? ' [' + this.escapeHtml(project.name) + ']' : ''}">${userInitial ? userInitial + ': ' : ''}${this.escapeHtml(item.title)}</div>`;
      }
      return '';
    }).join('');

    dayEl.innerHTML = `
      <div class="day-number">${day}</div>
      <div class="day-tasks">
        ${itemsList}
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
    if (!auth.canEditProjects()) return this.openAuthModal();

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
    if (!auth.canEditProjects()) return this.openAuthModal();
    this.openProjectModal(id);
  }

  async deleteProject(id) {
    if (!auth.canEditProjects()) return this.openAuthModal();
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
    const userSelect = document.getElementById('task-assigned-user');

    form.reset();

    // Populate project select
    projectSelect.innerHTML = '<option value="">Selecciona un proyecto</option>' +
      this.dataManager.projects.map(p =>
        `<option value="${p.id}" ${projectId === p.id ? 'selected' : ''}>${this.escapeHtml(p.name)}</option>`
      ).join('');

    // Populate user select
    if (userSelect && this.dataManager.users.length > 0) {
      userSelect.innerHTML = '<option value="">Sin asignar</option>' +
        this.dataManager.users.map(u =>
          `<option value="${u.id}" ${u.id === auth.user?.id ? 'selected' : ''}>${this.escapeHtml(u.email || u.username || 'Usuario')}</option>`
        ).join('');
    }

    document.getElementById('task-id').value = '';
    document.getElementById('task-date').value = formatDateYYYYMMDD(new Date());
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
    if (!auth.canEditTasks()) return this.openAuthModal();

    const id = document.getElementById('task-id').value;
    const userSelect = document.getElementById('task-assigned-user');
    const taskData = {
      title: document.getElementById('task-title').value,
      description: document.getElementById('task-description').value,
      projectId: document.getElementById('task-project').value,
      status: document.getElementById('task-status').value,
      dueDate: document.getElementById('task-date').value,
      assignedTo: userSelect ? (userSelect.value || null) : (auth.user?.id || null)
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
    const task = this.dataManager.getTask(id);
    // Check if user can edit this task
    if (!auth.canEditTasks() || (task.assignedTo && task.assignedTo !== auth.user?.id && !auth.canEditProjects())) {
      return this.openAuthModal();
    }
    if (!task) return;

    const modal = document.getElementById('task-modal');
    const title = document.getElementById('task-modal-title');
    const submitText = document.getElementById('task-submit-text');
    const projectSelect = document.getElementById('task-project');
    const userSelect = document.getElementById('task-assigned-user');

    // Populate project select
    projectSelect.innerHTML = '<option value="">Selecciona un proyecto</option>' +
      this.dataManager.projects.map(p =>
        `<option value="${p.id}">${this.escapeHtml(p.name)}</option>`
      ).join('');

    // Populate user select
    if (userSelect && this.dataManager.users.length > 0) {
      userSelect.innerHTML = '<option value="">Sin asignar</option>' +
        this.dataManager.users.map(u =>
          `<option value="${u.id}">${this.escapeHtml(u.email || u.username || 'Usuario')}</option>`
        ).join('');
    }

    document.getElementById('task-id').value = task.id;
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-description').value = task.description || '';
    document.getElementById('task-project').value = task.projectId;
    document.getElementById('task-date').value = task.dueDate;
    document.getElementById('task-status').value = task.status;
    if (userSelect) {
      userSelect.value = task.assignedTo || '';
    }

    title.textContent = 'Editar Tarea';
    submitText.textContent = 'Guardar Cambios';

    modal.classList.remove('hidden');
  }

  async deleteTask(id) {
    const task = this.dataManager.getTask(id);
    if (!auth.canEditTasks() || (task.assignedTo && task.assignedTo !== auth.user?.id && !auth.canEditProjects())) {
      return this.openAuthModal();
    }
    if (confirm('¿Estás seguro de que quieres eliminar esta tarea?')) {
      await this.dataManager.deleteTask(id);
      this.refreshCurrentView();
    }
  }

  async toggleTaskStatus(id) {
    const task = this.dataManager.getTask(id);
    if (!auth.canEditTasks() || (task.assignedTo && task.assignedTo !== auth.user?.id && !auth.canEditProjects())) {
      return this.openAuthModal();
    }
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
    const input = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');

    // Username support: append @gestor.local if not an email
    const email = input.includes('@') ? input : `${input}@gestor.local`;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Procesando...';

    try {
      if (this.currentAuthTab === 'register') {
        const { error } = await clientSB.auth.signUp({
          email,
          password,
          options: {
            data: { username: input.includes('@') ? input.split('@')[0] : input }
          }
        });
        if (error) throw error;
        alert('Registro exitoso. Ya puedes iniciar sesión.');
        this.closeAuthModal();
        return;
      } else {
        await auth.login(email, password);
      }
      this.closeAuthModal();
      window.location.reload();
    } catch (error) {
      alert('Error: ' + error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = this.currentAuthTab === 'login' ? 'Iniciar Sesión' : 'Registrarse';
    }
  }

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
ui.auth = auth;

// Safe Initialization Sequence
(async () => {
  await auth.init(); // Load session first
  ui.init();         // Then load UI and listeners
})();

// ===== PARTE 1: MODAL DE CALENDARIO - TAREAS DEL DÍA =====

// Función para abrir modal de tareas del día
ui.openDayTasksModal = function (dateStr) {
  const modal = document.getElementById('day-tasks-modal');
  if (!modal) return;

  const title = document.getElementById('day-tasks-title');
  const container = document.getElementById('day-tasks-list');

  const tasks = this.dataManager.getTasksByDate(dateStr);
  const date = new Date(dateStr + 'T12:00:00');
  const dateFormatted = date.toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  title.textContent = `Tareas del ${dateFormatted}`;

  if (tasks.length === 0) {
    container.innerHTML = '<div class="empty-state">No hay tareas para este día</div>';
  } else {
    container.innerHTML = tasks.map(task => this.renderTaskItem(task)).join('');
  }

  modal.classList.remove('hidden');
  modal.dataset.selectedDate = dateStr;
};

// Event listeners para modal de día
document.getElementById('close-day-tasks')?.addEventListener('click', () => {
  document.getElementById('day-tasks-modal')?.classList.add('hidden');
});

document.getElementById('btn-add-task-from-day')?.addEventListener('click', () => {
  const modal = document.getElementById('day-tasks-modal');
  const date = modal?.dataset.selectedDate;
  if (modal) modal.classList.add('hidden');
  if (date) {
    ui.openTaskModal();
    document.getElementById('task-date').value = date;
  }
});

// Modificar createCalendarDay para agregar click handler
const originalCreateCalendarDay = ui.createCalendarDay.bind(ui);
ui.createCalendarDay = function (day, month, year, isOtherMonth = false) {
  const dayEl = originalCreateCalendarDay(day, month, year, isOtherMonth);
  const date = new Date(year, month, day);
  const dateStr = formatDateYYYYMMDD(date);

  // Agregar data attribute para la fecha
  dayEl.dataset.date = dateStr;

  // Modificar el click handler
  const oldOnclick = dayEl.onclick;
  dayEl.onclick = (e) => {
    e.stopPropagation();
    if (auth.user) {
      this.openDayTasksModal(dateStr);
    } else {
      // Si es invitado, solo mostrar tareas sin poder crear
      this.openDayTasksModal(dateStr);
    }
  };

  return dayEl;
};

console.log(' Parte 1: Modal de calendario cargado');

// ===== PARTE 2: TABS EN SETTINGS =====

// Setup Settings Tabs
ui.setupSettingsTabs = function () {
  const profile = this.dataManager.profile;

  // Show/hide tabs based on role
  if (profile?.role === 'super_admin') {
    document.getElementById('tab-areas-btn')?.classList.remove('hidden');
    document.getElementById('tab-users-btn')?.classList.remove('hidden');
  } else if (profile?.role === 'area_leader') {
    document.getElementById('tab-users-btn')?.classList.remove('hidden');
  }

  // Tab switching
  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.onclick = (e) => {
      const tabName = e.target.dataset.tab;
      if (!tabName) return;

      // Update active tab
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');

      // Show corresponding content
      document.querySelectorAll('.settings-tab-content').forEach(content => {
        content.classList.add('hidden');
      });
      document.getElementById(`tab-${tabName}`)?.classList.remove('hidden');

      // Load data for tab
      if (tabName === 'areas') {
        this.renderAreasManagement();
      } else if (tabName === 'users') {
        this.renderUsersManagement();
      } else if (tabName === 'profile') {
        this.loadProfileData();
      }
    };
  });
};

// Load profile data
ui.loadProfileData = function () {
  const profile = this.dataManager.profile;
  if (!profile) return;

  const usernameInput = document.getElementById('settings-username');
  const emailInput = document.getElementById('settings-email');

  if (usernameInput) usernameInput.value = profile.username || profile.email?.split('@')[0] || 'usuario';
  if (emailInput) emailInput.value = profile.email || '';
};

// Render Areas View (Dedicated View)
ui.renderAreasView = async function () {
  const container = document.getElementById('areas-list-main');
  if (!container) return;

  try {
    const { data: areas, error } = await clientSB
      .from('areas')
      .select('*')
      .order('name');

    if (error) throw error;

    if (!areas || areas.length === 0) {
      container.innerHTML = '<div class="empty-state">No hay áreas creadas</div>';
      return;
    }

    container.innerHTML = areas.map(area => `
      <div class="project-card">
        <div class="project-header">
          <h3 class="project-title">${this.escapeHtml(area.name)}</h3>
          <div class="project-actions admin-only">
            <button class="btn-icon btn-secondary" onclick="ui.editArea('${area.id}')">✏️</button>
          </div>
        </div>
        <div class="project-meta">
          <div class="project-stat">
            <span>🔖</span>
            <span>Slug: ${this.escapeHtml(area.slug)}</span>
          </div>
          <div class="project-stat">
            <span>📅</span>
            <span>Creada: ${new Date(area.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    `).join('');

    auth.updateUIState(); // Refresh visibility of admin-only buttons
  } catch (error) {
    console.error('Error loading areas:', error);
    container.innerHTML = '<div class="empty-state">Error al cargar áreas</div>';
  }
};

// Render Users View (Dedicated View)
ui.renderUsersView = async function () {
  const container = document.getElementById('users-list-main');
  if (!container) return;

  try {
    let query = clientSB
      .from('profiles')
      .select('*, areas(name)')
      .order('created_at', { ascending: false });

    // Global Roles see all. Area Leaders only see their area.
    const profile = this.dataManager.profile;
    const isGlobal = profile?.role === 'super_admin' || profile?.role === 'admin';

    if (profile?.role === 'area_leader' && !isGlobal) {
      query = query.eq('area_id', profile.area_id);
    }

    const { data: users, error } = await query;
    if (error) throw error;

    if (!users || users.length === 0) {
      container.innerHTML = '<div class="empty-state">No hay usuarios registrados</div>';
      return;
    }

    const roleColors = {
      'super_admin': 'completed',
      'admin': 'progress',
      'area_leader': 'progress',
      'user': 'pending'
    };

    const roleNames = {
      'super_admin': 'Super Admin',
      'admin': 'Admin Global (Lectura)',
      'area_leader': 'Líder de Área',
      'user': 'Usuario'
    };

    container.innerHTML = users.map(user => `
      <div class="task-item">
        <div class="task-content">
          <div class="task-title">
            ${this.escapeHtml(user.username || user.email || 'Sin nombre')}
            <span class="badge badge-${roleColors[user.role] || 'pending'}">${roleNames[user.role] || user.role}</span>
          </div>
          <div class="task-meta">
            <span>📧 ${user.email || 'Sin email'}</span>
            ${user.areas ? `<span>🏢 ${this.escapeHtml(user.areas.name)}</span>` : '<span>🌐 Sin área asignada</span>'}
            <span>📅 Desde: ${new Date(user.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <div class="task-actions admin-only">
          <button class="btn-icon btn-secondary" onclick="ui.editUser('${user.id}')" title="Editar usuario">✏️</button>
        </div>
      </div>
    `).join('');

    auth.updateUIState();
  } catch (error) {
    console.error('Error loading users:', error);
    container.innerHTML = '<div class="empty-state">Error al cargar usuarios</div>';
  }
};

// Area Modal Handlers
document.getElementById('btn-new-area')?.addEventListener('click', () => {
  document.getElementById('area-modal')?.classList.remove('hidden');
  document.getElementById('area-name').value = '';
  document.getElementById('area-slug').value = '';
});

document.getElementById('close-area-modal')?.addEventListener('click', () => {
  document.getElementById('area-modal')?.classList.add('hidden');
});

document.getElementById('cancel-area')?.addEventListener('click', () => {
  document.getElementById('area-modal')?.classList.add('hidden');
});

document.getElementById('area-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('area-name').value;
  const slug = document.getElementById('area-slug').value;

  try {
    const { error } = await clientSB
      .from('areas')
      .insert([{ name, slug }]);

    if (error) throw error;

    alert(' Área creada exitosamente');
    document.getElementById('area-modal').classList.add('hidden');
    ui.renderAreasView();
  } catch (error) {
    alert(' Error al crear área: ' + error.message);
  }
});

// User Management - Create user with username/password (admin only)
const createUserWithUsername = async (username, password, role, areaId) => {
  try {
    const email = `${username}@gestor.local`;

    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await clientSB.auth.signUp({
      email,
      password,
      options: {
        data: { username, role, area_id: areaId }
      }
    });

    if (authError) throw authError;

    // 2. Profile table is usually updated via trigger in Supabase, 
    // but we ensure it has the correct role and area_id
    const { error: profileError } = await clientSB
      .from('profiles')
      .update({ username, role, area_id: areaId })
      .eq('id', authData.user.id);

    if (profileError) throw profileError;

    return authData.user;
  } catch (error) {
    console.error('Error in createUserWithUsername:', error);
    throw error;
  }
};

document.getElementById('user-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const userId = document.getElementById('user-id').value;
  const username = document.getElementById('user-username').value;
  const password = document.getElementById('user-password').value;
  const role = document.getElementById('user-role').value;
  const areaId = document.getElementById('user-area').value || null;

  const submitBtn = e.target.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = userId ? 'Actualizando...' : 'Creando...';

  try {
    if (userId) {
      // Update existing profile
      const updateData = { username, role, area_id: areaId };
      const { error } = await clientSB.from('profiles').update(updateData).eq('id', userId);
      if (error) throw error;
      alert('✅ Usuario actualizado exitosamente');
    } else {
      // Create new user
      if (!password) throw new Error('Se requiere contraseña para nuevos usuarios');
      await createUserWithUsername(username, password, role, areaId);
      alert('✅ Usuario creado exitosamente');
    }

    document.getElementById('user-modal').classList.add('hidden');
    e.target.reset();
    ui.renderUsersView();
  } catch (error) {
    alert('❌ Error: ' + error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Crear Usuario';
  }
});

// Helper to open User Creator Modal
ui.openCreateUserModal = function () {
  const modal = document.getElementById('user-modal');
  const form = document.getElementById('user-form');
  const title = document.getElementById('user-modal-title');
  const submitText = document.getElementById('user-submit-text');

  if (form) form.reset();
  document.getElementById('user-id').value = '';
  if (title) title.textContent = 'Crear Usuario';
  if (submitText) submitText.textContent = 'Crear Usuario';

  // Populate areas dropdown
  const selectArea = document.getElementById('user-area');
  if (selectArea) {
    clientSB.from('areas').select('*').order('name').then(({ data }) => {
      selectArea.innerHTML = '<option value="">Sin área</option>' +
        (data || []).map(area => `<option value="${area.id}">${area.name}</option>`).join('');
    });
  }

  // Show/hide role selector based on login role
  const profile = this.dataManager.profile;
  if (profile?.role === 'area_leader') {
    document.getElementById('user-role').value = 'user';
    document.getElementById('user-role-group')?.classList.add('hidden');
    if (profile.area_id) {
      document.getElementById('user-area').value = profile.area_id;
      document.getElementById('user-area-group')?.classList.add('hidden');
    }
  } else {
    document.getElementById('user-role-group')?.classList.remove('hidden');
    document.getElementById('user-area-group')?.classList.remove('hidden');
  }

  modal?.classList.remove('hidden');
};

// Edit User Helper
ui.editUser = async function (id) {
  const { data: user, error } = await clientSB
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !user) return alert('No se pudo encontrar el usuario');

  this.openCreateUserModal(); // Initial setup

  document.getElementById('user-modal-title').textContent = 'Editar Usuario';
  document.getElementById('user-submit-text').textContent = 'Guardar Cambios';
  document.getElementById('user-id').value = user.id;
  document.getElementById('user-username').value = user.username || '';
  document.getElementById('user-password').required = false;
  document.getElementById('user-role').value = user.role;
  document.getElementById('user-area').value = user.area_id || '';
};

// Cleanup old tab listeners and unused setup
ui.setupSettingsTabs = function () { }; // No longer needed
ui.loadProfileData = function () {
  const profile = this.dataManager.profile;
  if (!profile) return;
  document.getElementById('settings-username').value = profile.username || profile.email?.split('@')[0] || 'usuario';
  document.getElementById('settings-email').value = profile.email || '';
};

// Update SwitchView to handle new routes
const originalSwitchView = ui.switchView.bind(ui);
ui.switchView = function (view) {
  originalSwitchView(view);
  if (view === 'areas') {
    this.renderAreasView();
  } else if (view === 'users') {
    this.renderUsersView();
  } else if (view === 'settings') {
    this.loadProfileData();
  }
};

console.log(' Fase 3: Gestión explícita y Roles Globales cargados');
