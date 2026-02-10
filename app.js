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
    this.selectedProjectId = null; // For filtering tasks by project
    this.allowedAreas = []; // For lider_data multi-area access
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

      if (!this.profile) {
        console.log('[DataManager] Guest mode: No data fetched');
        this.projects = [];
        this.tasks = [];
        this.areas = [];
        return true;
      }

      let projectsQuery = clientSB.from('projects').select('*, areas(name)').order('created_at', { ascending: false });
      let tasksQuery = clientSB.from('tasks').select('*').order('created_at', { ascending: false });

      /* 
      // Filter logic: Local users only see their area. 
      // Super Admin and Global Admin (read-only) see EVERYTHING.
      // Area Leaders see their area OR shared projects.
      */
      const isGlobalPower = this.profile?.role === 'super_admin' || this.profile?.role === 'super_manager' || this.profile?.role === 'admin';

      // Fetch allowed areas for lider_data
      this.allowedAreas = [];
      if (this.profile?.role === 'lider_data') {
        const { data: allowed } = await clientSB
          .from('profile_areas')
          .select('area_id')
          .eq('profile_id', this.profile.id);
        this.allowedAreas = (allowed || []).map(a => a.area_id);
      }

      if (this.profile && !isGlobalPower) {
        if (this.profile.role === 'area_leader' && this.profile.area_id) {
          // Area Leaders: their area OR shared
          projectsQuery = projectsQuery.or(`area_id.eq.${this.profile.area_id},is_shared.eq.true`);
          tasksQuery = tasksQuery.eq('area_id', this.profile.area_id);
        } else if (this.profile.role === 'lider_data' && this.allowedAreas.length > 0) {
          // Lider Data: multiple specific areas OR shared
          const areaFilterStr = `area_id.in.(${this.allowedAreas.join(',')})`;
          projectsQuery = projectsQuery.or(`${areaFilterStr},is_shared.eq.true`);
          tasksQuery = tasksQuery.filter('area_id', 'in', `(${this.allowedAreas.join(',')})`);
        } else if (this.profile.role === 'user' && this.profile.area_id) {
          // Standard Users: their area
          projectsQuery = projectsQuery.eq('area_id', this.profile.area_id);
          tasksQuery = tasksQuery.eq('area_id', this.profile.area_id);
        }
      }

      console.log(`[DataManager] Fetching data for role: ${this.profile?.role || 'guest'}, area: ${this.profile?.area_id || 'all'}`);

      const [{ data: projects, error: projectsError }, { data: tasks, error: tasksError }] = await Promise.all([
        projectsQuery,
        tasksQuery
      ]);

      if (projectsError) throw projectsError;
      if (tasksError) throw tasksError;

      console.log(`[DataManager] Data received: ${projects?.length || 0} projects, ${tasks?.length || 0} tasks`);

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

      // Fetch areas for everyone (needed for filters)
      try {
        const { data: areas, error: areasError } = await clientSB.from('areas').select('*');
        if (!areasError) {
          this.areas = areas || [];
        } else {
          console.warn('Could not fetch areas for filter:', areasError);
          this.areas = [];
        }
      } catch (e) {
        console.warn('Error fetching areas:', e);
        this.areas = [];
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
      console.error('CRITICAL: Error loading data from Supabase:', error);
      // Log more details to help debugging
      if (error.code) console.error('Error Code:', error.code);
      if (error.message) console.error('Error Message:', error.message);
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
        status: projectData.status
      })
      .eq('id', id)
      .select();

    if (error) throw error;
    const project = { ...data[0], createdAt: data[0].created_at };
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
    console.log('Creating task with data:', taskData);
    const insertData = {
      title: taskData.title,
      description: taskData.description || '',
      project_id: taskData.projectId || null,
      status: taskData.status || 'pending',
      due_date: taskData.dueDate || formatDateYYYYMMDD(new Date()),
      area_id: this.profile?.area_id || null,
      assigned_to: taskData.assignedTo || auth.user?.id || null
    };
    console.log('Insert data:', insertData);

    const { data, error } = await clientSB
      .from('tasks')
      .insert([insertData])
      .select();

    if (error) {
      console.error('Error creating task:', error);
      throw error;
    }

    console.log('Task created:', data);
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
      }, 500);
    }

    // Explicitly load data for the current session state (guest or logged in)
    await this.ui.dataManager.loadInitialData();
    this.updateUIState();
    this.ui.refreshCurrentView();

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
    return this.ui.dataManager.profile?.role === 'super_admin' ||
      this.user?.email === 'elitealmaia@gmail.com';
  }

  isSuperManager() {
    return this.ui.dataManager.profile?.role === 'super_manager';
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
    // Allow any authenticated user (except strictly read-only roles) to manage projects
    if (!this.user) return false;
    if (this.isViewer()) return false;

    // Admin and Super Manager have full access
    if (this.isAdmin() || this.isSuperManager()) return true;

    // Area Leaders and Standard Users can manage projects
    // Note: Standard users will create projects in their area (or null area)
    return true;
  }

  canEditTasks() {
    if (!this.user) return false;
    if (this.isAdmin() || this.isSuperManager()) return true;

    // Viewers and Global Admins (read-only) cannot edit tasks
    // Everyone else (including 'user' and 'area_leader') can
    return !this.isViewer() && !this.isGlobalAdmin();
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
    const canSeeAreas = isSuperAdmin || isGlobalAdmin || auth.isSuperManager();
    const canSeeUsers = isSuperAdmin || isGlobalAdmin || isAreaLeader || auth.isSuperManager();

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
      el.classList.toggle('hidden', !canEditProjects && !isSuperAdmin);
    });

    document.querySelectorAll('.editor-only').forEach(el => {
      el.classList.toggle('hidden', !canEditTasks && !isSuperAdmin);
    });

    // Hide area filters for non-global roles
    const isGlobalFilterRole = isSuperAdmin || isGlobalAdmin || auth.isSuperManager();
    const projectAreaFilter = document.getElementById('filter-projects-area');
    const taskAreaFilter = document.getElementById('filter-tasks-area');
    const reportAreaFilter = document.getElementById('filter-reports-area');

    if (projectAreaFilter) projectAreaFilter.classList.toggle('hidden', !isGlobalFilterRole);
    if (taskAreaFilter) taskAreaFilter.classList.toggle('hidden', !isGlobalFilterRole);
    if (reportAreaFilter) reportAreaFilter.classList.toggle('hidden', !isGlobalFilterRole);

    // Hide user filter for standard users (only area leaders and admins can filter by user)
    const canSeeUserFilter = isGlobalFilterRole || isAreaLeader;
    const taskUserFilter = document.getElementById('filter-tasks-user');
    const reportUserFilter = document.getElementById('filter-reports-user');

    if (taskUserFilter) taskUserFilter.classList.toggle('hidden', !canSeeUserFilter);
    if (reportUserFilter) reportUserFilter.classList.toggle('hidden', !canSeeUserFilter);
  }
}


// ===== UI CONTROLLER =====
class UIController {
  constructor(dataManager) {
    this.dataManager = dataManager;
    this.currentAuthTab = 'login';
    this.charts = {}; // Store for Chart.js instances
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
        if (view) {
          // Clear project filter when navigating from sidebar
          this.dataManager.selectedProjectId = null;
          this.switchView(view);
        }
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
      document.getElementById('area-id').value = '';
      document.getElementById('area-modal-title').textContent = 'Nueva Área';
      document.getElementById('area-submit-text').textContent = 'Crear Área';
    });

    document.getElementById('btn-new-user-main')?.addEventListener('click', () => {
      this.openCreateUserModal();
    });

    // Close/Cancel User Modal
    document.getElementById('close-user-modal')?.addEventListener('click', () => {
      document.getElementById('user-modal')?.classList.add('hidden');
    });
    document.getElementById('cancel-user')?.addEventListener('click', () => {
      document.getElementById('user-modal')?.classList.add('hidden');
    });

    // Close/Cancel Area Modal
    document.getElementById('close-area-modal')?.addEventListener('click', () => {
      document.getElementById('area-modal')?.classList.add('hidden');
    });
    document.getElementById('cancel-area')?.addEventListener('click', () => {
      document.getElementById('area-modal')?.classList.add('hidden');
    });
    document.getElementById('close-project-modal').addEventListener('click', () => this.closeProjectModal());
    document.getElementById('cancel-project').addEventListener('click', () => this.closeProjectModal());
    document.getElementById('project-form').addEventListener('submit', (e) => this.handleProjectSubmit(e));

    // Task Modal
    document.getElementById('close-task-modal').addEventListener('click', () => this.closeTaskModal());
    document.getElementById('cancel-task').addEventListener('click', () => this.closeTaskModal());
    document.getElementById('task-form').addEventListener('submit', (e) => this.handleTaskSubmit(e));

    document.getElementById('btn-new-task')?.addEventListener('click', () => {
      if (!auth.canEditTasks()) return this.openAuthModal();
      this.openTaskModal();
    });

    document.getElementById('change-password-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById('settings-new-password').value;
      const confirmPassword = document.getElementById('settings-confirm-password').value;
      const submitBtn = document.getElementById('btn-change-password');

      if (newPassword !== confirmPassword) {
        return alert('❌ Las contraseñas no coinciden');
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Actualizando...';

      try {
        await auth.updatePassword(newPassword);
        alert('✅ Contraseña actualizada correctamente');
        e.target.reset();
      } catch (error) {
        alert('❌ Error: ' + error.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Actualizar Contraseña';
      }
    });

    // Search and Filters
    document.getElementById('search-projects')?.addEventListener('input', (e) => this.handleSearchProjects(e));
    document.getElementById('filter-projects')?.addEventListener('change', (e) => this.handleFilterProjects(e));
    document.getElementById('filter-projects-area')?.addEventListener('change', (e) => this.handleFilterProjectsArea(e));

    document.getElementById('search-tasks')?.addEventListener('input', (e) => this.handleSearchTasks(e));
    document.getElementById('filter-tasks')?.addEventListener('change', (e) => this.renderTasks(e.target.value));
    document.getElementById('filter-tasks-date')?.addEventListener('change', (e) => {
      const dateFilter = e.target.value;
      const rangeContainer = document.getElementById('date-range-container');
      if (dateFilter === 'custom') {
        rangeContainer.classList.remove('hidden');
      } else {
        rangeContainer.classList.add('hidden');
        this.renderTasks('all', '', dateFilter);
      }
    });
    document.getElementById('apply-date-range')?.addEventListener('click', () => {
      const from = document.getElementById('filter-date-from').value;
      const to = document.getElementById('filter-date-to').value;
      this.renderTasks('all', '', 'custom');
    });

    document.getElementById('filter-tasks-area')?.addEventListener('change', (e) => {
      this.renderTasks('all', '', 'all', e.target.value);
    });
    document.getElementById('filter-tasks-user')?.addEventListener('change', (e) => {
      this.renderTasks('all', '', 'all', 'all', e.target.value);
    });

    // Reports Listeners
    document.getElementById('btn-refresh-reports')?.addEventListener('click', () => this.renderReportsView());
    ['filter-reports-project', 'filter-reports-area', 'filter-reports-user', 'filter-reports-date'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.renderReportsView());
    });
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

    // User Details Modal Handlers
    document.getElementById('close-user-details')?.addEventListener('click', () => {
      document.getElementById('user-details-modal')?.classList.add('hidden');
    });
    document.getElementById('btn-close-user-details')?.addEventListener('click', () => {
      document.getElementById('user-details-modal')?.classList.add('hidden');
    });
    document.getElementById('user-details-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'user-details-modal') e.target.classList.add('hidden');
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
    try {
      if (view === 'dashboard') {
        this.renderDashboard();
      } else if (view === 'projects') {
        this.renderProjects();
      } else if (view === 'tasks') {
        this.renderTasks();
      } else if (view === 'calendar') {
        this.renderCalendar();
      } else if (view === 'reports') {
        this.renderReportsView();
      }
      this.updateStats();
    } catch (e) {
      console.error(`Error rendering view "${view}":`, e);
    }
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
  renderProjects(filter = 'all', search = '', areaFilter = 'all') {
    let projects = this.dataManager.projects;

    // Apply Area Filter
    if (areaFilter !== 'all') {
      projects = projects.filter(p => p.area_id === areaFilter);
    }

    // Apply Status Filter
    if (filter !== 'all') {
      projects = projects.filter(p => p.status === filter);
    }

    // Apply search
    if (search) {
      projects = projects.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(search.toLowerCase()))
      );
    }

    // Populate Area Filter Dropdown (if empty or needs update)
    const areaSelect = document.getElementById('filter-projects-area');
    if (areaSelect && areaSelect.options.length <= 1) {
      // Prefer using fetched areas from DataManager
      if (this.dataManager.areas && this.dataManager.areas.length > 0) {
        this.dataManager.areas.forEach(area => {
          const option = document.createElement('option');
          option.value = area.id;
          option.textContent = area.name;
          option.selected = area.id === areaFilter;
          areaSelect.appendChild(option);
        });
      } else {
        // Fallback: Extract from projects
        const uniqueAreas = new Map();
        this.dataManager.projects.forEach(p => {
          if (p.areas) {
            uniqueAreas.set(p.area_id, p.areas.name);
          }
        });

        uniqueAreas.forEach((name, id) => {
          const option = document.createElement('option');
          option.value = id;
          option.textContent = name;
          option.selected = id === areaFilter;
          areaSelect.appendChild(option);
        });
      }
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
      <div class="project-card" data-project-id="${project.id}" onclick="ui.viewProjectTasks('${project.id}')" style="cursor: pointer;">
        <div class="project-header">
          <div>
            <h3 class="project-title">${this.escapeHtml(project.name)}</h3>
            ${statusBadge}
          </div>
          <div class="project-actions admin-only">
            <button class="btn-icon btn-secondary" onclick="event.stopPropagation(); ui.openTaskModal('${project.id}')" title="Agregar tarea">
              ➕
            </button>
            <button class="btn-icon btn-secondary" onclick="event.stopPropagation(); ui.editProject('${project.id}')" title="Editar proyecto">
              ✏️
            </button>
            <button class="btn-icon btn-secondary" onclick="event.stopPropagation(); ui.deleteProject('${project.id}')" title="Eliminar proyecto">
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
            ${project.areas ? `<div class="project-stat"><span>🏢</span><span>${this.escapeHtml(project.areas.name)}</span></div>` : ''}
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
  renderTasks(filter = 'all', search = '', dateFilter = 'all', areaFilter = 'all', userFilter = 'all') {
    let tasks = this.dataManager.tasks;

    // Apply project filter if set
    const selectedProjectId = this.dataManager.selectedProjectId;
    if (selectedProjectId) {
      tasks = tasks.filter(t => t.projectId === selectedProjectId);
    }

    // Apply status filter
    if (filter !== 'all') {
      tasks = tasks.filter(t => t.status === filter);
    }

    // Apply area filter
    if (areaFilter !== 'all') {
      tasks = tasks.filter(t => t.area_id === areaFilter);
    }

    // Apply user filter
    if (userFilter !== 'all') {
      tasks = tasks.filter(t => t.assignedTo === userFilter);
    }

    // Apply date filter
    if (dateFilter && dateFilter !== 'all') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (dateFilter === 'today') {
        const todayStr = formatDateYYYYMMDD(today);
        tasks = tasks.filter(t => t.dueDate === todayStr);
      } else if (dateFilter === 'week') {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);

        const startStr = formatDateYYYYMMDD(startOfWeek);
        const endStr = formatDateYYYYMMDD(endOfWeek);
        tasks = tasks.filter(t => t.dueDate >= startStr && t.dueDate <= endStr);
      } else if (dateFilter === 'month') {
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        const startStr = formatDateYYYYMMDD(startOfMonth);
        const endStr = formatDateYYYYMMDD(endOfMonth);
        tasks = tasks.filter(t => t.dueDate >= startStr && t.dueDate <= endStr);
      } else if (dateFilter === 'custom') {
        const fromDate = document.getElementById('filter-date-from')?.value;
        const toDate = document.getElementById('filter-date-to')?.value;
        if (fromDate && toDate) {
          tasks = tasks.filter(t => t.dueDate >= fromDate && t.dueDate <= toDate);
        }
      }
    }

    // Populate Area filter if empty
    const areaFilterSelect = document.getElementById('filter-tasks-area');
    if (areaFilterSelect && areaFilterSelect.options.length <= 1) {
      if (this.dataManager.areas && this.dataManager.areas.length > 0) {
        this.dataManager.areas.forEach(area => {
          const opt = document.createElement('option');
          opt.value = area.id;
          opt.textContent = area.name;
          opt.selected = area.id === areaFilter;
          areaFilterSelect.appendChild(opt);
        });
      }
    }

    // Populate User filter if empty
    const userFilterSelect = document.getElementById('filter-tasks-user');
    if (userFilterSelect && userFilterSelect.options.length <= 1) {
      this.populateUserFilter(userFilterSelect, userFilter);
    }

    // Apply search
    if (search) {
      tasks = tasks.filter(t =>
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        (t.description && t.description.toLowerCase().includes(search.toLowerCase()))
      );
    }

    // Split tasks by status for Kanban columns
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    const progressTasks = tasks.filter(t => t.status === 'progress');
    const completedTasks = tasks.filter(t => t.status === 'completed');

    console.log(`Rendering Kanban: ${pendingTasks.length} pending, ${progressTasks.length} progress, ${completedTasks.length} completed`);

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
            ${assignedUser ? `<span>👤 ${this.escapeHtml((assignedUser.username || assignedUser.email || 'Usuario').split('@')[0])}</span>` : ''}
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
        const userInitial = assignedUser ? ((assignedUser.username || assignedUser.email || '?').split('@')[0][0]).toUpperCase() : '';
        const userName = assignedUser ? (assignedUser.username || assignedUser.email || 'Usuario').split('@')[0] : '';
        const project = this.dataManager.getProject(item.projectId);
        return `<div class="calendar-task-dot ${item.status === 'completed' ? 'completed' : ''}" title="${this.escapeHtml(item.title)}${assignedUser ? ' - ' + this.escapeHtml(userName) : ''}${project ? ' [' + this.escapeHtml(project.name) + ']' : ''}">${userInitial ? userInitial + ': ' : ''}${this.escapeHtml(item.title)}</div>`;
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

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const submitText = document.getElementById('project-submit-text');
    const originalText = submitText.textContent;

    submitBtn.disabled = true;
    submitText.textContent = 'Guardando...';

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
      console.error('Error saving project:', error);
      alert('Error: ' + (error.message || error.error_description || JSON.stringify(error)));
    } finally {
      submitBtn.disabled = false;
      submitText.textContent = originalText;
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

    // Populate user select - FORCE CLEAN DISPLAY
    if (userSelect && this.dataManager.users.length > 0) {
      userSelect.innerHTML = '<option value="">Sin asignar *</option>' +
        this.dataManager.users.map(u => {
          let nameToDisplay = 'Usuario';
          if (u.username) nameToDisplay = u.username;
          else if (u.email) nameToDisplay = u.email;

          // Always strip @ and everything after
          if (nameToDisplay && nameToDisplay.includes('@')) {
            nameToDisplay = nameToDisplay.split('@')[0];
          }

          return `<option value="${u.id}" ${u.id === auth.user?.id ? 'selected' : ''}>${this.escapeHtml(nameToDisplay)}</option>`;
        }).join('');
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
      userSelect.innerHTML = '<option value="">Sin asignar *</option>' +
        this.dataManager.users.map(u => {
          let nameToDisplay = 'Usuario';
          if (u.username) nameToDisplay = u.username;
          else if (u.email) nameToDisplay = u.email;

          if (nameToDisplay && nameToDisplay.includes('@')) {
            nameToDisplay = nameToDisplay.split('@')[0];
          }

          return `<option value="${u.id}">${this.escapeHtml(nameToDisplay)}</option>`;
        }).join('');
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

    // Username support: append @pegasus360agency.com if not an email
    const email = input.includes('@') ? input : `${input}@pegasus360agency.com`;

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
    const areaFilter = document.getElementById('filter-projects-area')?.value || 'all';
    this.renderProjects(filter, search, areaFilter);
  }

  handleFilterProjects(e) {
    const filter = e.target.value;
    const search = document.getElementById('search-projects').value;
    const areaFilter = document.getElementById('filter-projects-area')?.value || 'all';
    this.renderProjects(filter, search, areaFilter);
  }

  handleFilterProjectsArea(e) {
    const areaFilter = e.target.value;
    const filter = document.getElementById('filter-projects').value;
    const search = document.getElementById('search-projects').value;
    this.renderProjects(filter, search, areaFilter);
  }

  handleSearchTasks(e) {
    const search = e.target.value;
    const filter = document.getElementById('filter-tasks').value;
    const dateFilter = document.getElementById('filter-tasks-date')?.value || 'all';
    this.renderTasks(filter, search, dateFilter);
  }

  handleFilterTasks(e) {
    const filter = e.target.value;
    const search = document.getElementById('search-tasks').value;
    const dateFilter = document.getElementById('filter-tasks-date')?.value || 'all';
    this.renderTasks(filter, search, dateFilter);
  }

  handleDateFilterTasks(e) {
    const dateFilter = e.target.value;
    const container = document.getElementById('date-range-container');

    // Show/hide date range inputs
    if (dateFilter === 'custom') {
      container.style.display = 'flex';
      container.classList.remove('hidden');
    } else {
      container.style.display = 'none';
      container.classList.add('hidden');
    }

    const filter = document.getElementById('filter-tasks').value;
    const search = document.getElementById('search-tasks').value;
    this.renderTasks(filter, search, dateFilter);
  }

  applyCustomDateRange() {
    const filter = document.getElementById('filter-tasks').value;
    const search = document.getElementById('search-tasks').value;
    this.renderTasks(filter, search, 'custom');
  }

  handleFilterTasksArea(e) {
    const areaFilter = e.target.value;
    const filter = document.getElementById('filter-tasks').value;
    const search = document.getElementById('search-tasks').value;
    const dateFilter = document.getElementById('filter-tasks-date')?.value || 'all';
    const userFilter = document.getElementById('filter-tasks-user')?.value || 'all';
    this.renderTasks(filter, search, dateFilter, areaFilter, userFilter);
  }

  handleFilterTasksUser(e) {
    const userFilter = e.target.value;
    const filter = document.getElementById('filter-tasks').value;
    const search = document.getElementById('search-tasks').value;
    const dateFilter = document.getElementById('filter-tasks-date')?.value || 'all';
    const areaFilter = document.getElementById('filter-tasks-area')?.value || 'all';
    this.renderTasks(filter, search, dateFilter, areaFilter, userFilter);
  }

  async populateUserFilter(selectElement, selectedValue) {
    if (selectElement.options.length > 1) return;

    try {
      // Use DataManager profiles if possible, otherwise fetch
      let profiles = [];
      const { data, error } = await clientSB.from('profiles').select('id, username, email');
      if (!error && data) {
        profiles = data;
      }

      profiles.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        const rawName = user.username || user.email || 'Usuario';
        option.textContent = rawName.split('@')[0];
        option.selected = user.id === selectedValue;
        selectElement.appendChild(option);
      });
    } catch (e) {
      console.warn('Error populating user filter:', e);
    }
  }

  // Utilities
  refreshCurrentView() {
    const view = this.dataManager.currentView;
    if (view === 'dashboard') {
      this.renderDashboard();
    } else if (view === 'projects') {
      const filter = document.getElementById('filter-projects').value;
      const search = document.getElementById('search-projects').value;
      const areaFilter = document.getElementById('filter-projects-area')?.value || 'all';
      this.renderProjects(filter, search, areaFilter);
    } else if (view === 'tasks') {
      const filter = document.getElementById('filter-tasks').value;
      const search = document.getElementById('search-tasks').value;
      const dateFilter = document.getElementById('filter-tasks-date')?.value || 'all';
      const areaFilter = document.getElementById('filter-tasks-area')?.value || 'all';
      const userFilter = document.getElementById('filter-tasks-user')?.value || 'all';
      this.renderTasks(filter, search, dateFilter, areaFilter, userFilter);
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

  // View tasks for a specific project
  viewProjectTasks(projectId) {
    console.log('viewProjectTasks called with:', projectId);
    this.dataManager.selectedProjectId = projectId;
    this.switchView('tasks');
  }

  // Clear project filter and show all tasks
  clearProjectFilter() {
    this.dataManager.selectedProjectId = null;
    this.renderTasks();
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
            <button class="btn-icon btn-secondary" onclick="ui.editArea('${area.id}')" title="Editar área">✏️</button>
            <button class="btn-icon btn-danger" onclick="ui.deleteArea('${area.id}')" title="Eliminar área">🗑️</button>
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

// Edit Area Helper
ui.editArea = async function (id) {
  try {
    const { data: area, error } = await clientSB
      .from('areas')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !area) throw new Error('No se pudo encontrar el área');

    document.getElementById('area-modal')?.classList.remove('hidden');
    document.getElementById('area-modal-title').textContent = 'Editar Área';
    document.getElementById('area-submit-text').textContent = 'Guardar Cambios';
    document.getElementById('area-id').value = area.id;
    document.getElementById('area-name').value = area.name;
    document.getElementById('area-slug').value = area.slug;
  } catch (error) {
    alert('❌ Error: ' + error.message);
  }
};

// Delete Area Helper
ui.deleteArea = async function (id) {
  if (!confirm('¿Estás seguro de que deseas eliminar esta área? Esta acción no se puede deshacer.')) return;

  try {
    const { error } = await clientSB
      .from('areas')
      .delete()
      .eq('id', id);

    if (error) throw error;

    alert('✅ Área eliminada exitosamente');
    ui.renderAreasView();
    // Also refresh data manager to update filters
    ui.dataManager.loadInitialData().then(() => ui.refreshCurrentView());
  } catch (error) {
    alert('❌ Error al eliminar el área: ' + error.message);
  }
};

// Render Users View (Dedicated View)
ui.renderUsersView = async function () {
  const container = document.getElementById('users-list-main');
  if (!container) return;

  try {
    let query = clientSB
      .from('profiles')
      .select('*, areas(name)');
    //.order('created_at', { ascending: false }); // Column might not exist

    // Global Roles see all. Area Leaders only see their area.
    const profile = this.dataManager.profile;
    const isGlobal = profile?.role === 'super_admin' || profile?.role === 'super_manager' || profile?.role === 'admin';

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
      'super_manager': 'progress',
      'admin': 'progress',
      'area_leader': 'progress',
      'user': 'pending'
    };

    const roleNames = {
      'super_admin': 'Super Administrador',
      'super_manager': 'Administrador de Roles',
      'admin': 'Admin Global (Lectura)',
      'area_leader': 'Líder de Área',
      'user': 'Usuario'
    };

    container.innerHTML = users.map(user => `
      <div class="task-item">
        <div class="task-content">
          <div class="task-title">
            👤 ${this.escapeHtml(user.username || user.email?.split('@')[0] || 'Sin nombre')}
            <span class="badge badge-${roleColors[user.role] || 'pending'}">${roleNames[user.role] || user.role}</span>
          </div>
          <div class="task-meta">
            ${user.areas ? `<span>🏢 Área: <strong>${this.escapeHtml(user.areas.name)}</strong></span>` : '<span>🌐 Sin área asignada</span>'}
            <span>📅 Desde: ${user.created_at && !isNaN(new Date(user.created_at)) ? new Date(user.created_at).toLocaleDateString() : 'Sin fecha'}</span>
          </div>
        </div>
        <div class="task-actions admin-only">
          <button class="btn-icon btn-secondary" onclick="ui.viewUserDetails('${user.id}')" title="Ver proyectos y tareas">👁️</button>
          <button class="btn-icon btn-secondary" onclick="ui.editUser('${user.id}')" title="Editar usuario">✏️</button>
          <button class="btn-icon btn-danger" onclick="ui.deleteUser('${user.id}')" title="Eliminar usuario">🗑️</button>
        </div>
      </div>
    `).join('');

    auth.updateUIState();
  } catch (error) {
    console.error('Error loading users:', error);
    alert('Error al cargar usuarios: ' + (error.message || 'Error desconocido'));
    container.innerHTML = `<div class="empty-state">Error al cargar usuarios: ${this.escapeHtml(error.message)}</div>`;
  }
};

// Delete User Helper
ui.deleteUser = async function (id) {
  if (!confirm('¿Estás seguro de que deseas eliminar este usuario? Se eliminará su perfil permanentemente.')) return;

  try {
    const { error } = await clientSB
      .from('profiles')
      .delete()
      .eq('id', id);

    if (error) throw error;

    alert('✅ Usuario eliminado exitosamente');
    ui.renderUsersView();
  } catch (error) {
    alert('❌ Error al eliminar el usuario: ' + error.message);
  }
};

// Area Modal Handlers - These are now handled in UIController setupEventListeners
/*
document.getElementById('btn-new-area')?.addEventListener('click', () => {
...
*/

document.getElementById('area-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = document.getElementById('area-id').value;
  const name = document.getElementById('area-name').value;
  const slug = document.getElementById('area-slug').value;

  try {
    const areaData = { name, slug };
    if (id) areaData.id = id;

    const { error } = await clientSB
      .from('areas')
      .upsert(areaData);

    if (error) throw error;

    alert(id ? '✅ Área actualizada exitosamente' : '✅ Área creada exitosamente');
    document.getElementById('area-modal').classList.add('hidden');
    ui.renderAreasView();
    // Refresh data manager to update filters
    ui.dataManager.loadInitialData().then(() => ui.refreshCurrentView());
  } catch (error) {
    alert('❌ Error: ' + error.message);
  }
});

// User Management - Create user with username/password (admin only)
const createUserWithUsername = async (username, password, role, areaId) => {
  try {
    const email = `${username}@pegasus360agency.com`;

    // 1. Create user in Supabase Auth
    const { data: authData, error: authError } = await clientSB.auth.signUp({
      email,
      password,
      options: {
        data: { username, role, area_id: areaId }
      }
    });

    if (authError) throw authError;

    // 2. Profile table: use UPSERT to ensure the row exists and is updated
    const { error: profileError } = await clientSB
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email,
        username,
        role,
        area_id: areaId
      }, { onConflict: 'id' });

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

// View User Details (Tasks & Projects)
ui.viewUserDetails = async function (userId) {
  const modal = document.getElementById('user-details-modal');
  const infoContainer = document.getElementById('user-details-info');
  const projectsContainer = document.getElementById('user-details-projects');
  const tasksContainer = document.getElementById('user-details-tasks');

  if (!modal) return;
  modal.classList.remove('hidden');
  infoContainer.innerHTML = '<div class="empty-state">Cargando detalles...</div>';
  projectsContainer.innerHTML = '';
  tasksContainer.innerHTML = '';

  try {
    // 1. Fetch user profile
    const { data: user, error: userError } = await clientSB
      .from('profiles')
      .select('*, areas(name)')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    // 2. Fetch tasks assigned to this user
    const { data: tasks, error: tasksError } = await clientSB
      .from('tasks')
      .select('*, projects(name)')
      .eq('assigned_to', userId)
      .order('created_at', { ascending: false });

    if (tasksError) throw tasksError;

    // Render Info
    infoContainer.innerHTML = `
      <div class="card bg-surface-variant p-md">
        <h2 class="card-title mb-xs">${this.escapeHtml(user.username || user.email)}</h2>
        <p class="text-sm opacity-70 mb-sm">${user.email}</p>
        <div class="flex gap-sm">
          <span class="badge badge-progress">${user.role}</span>
          ${user.areas ? `<span class="badge badge-pending">${this.escapeHtml(user.areas.name)}</span>` : ''}
        </div>
      </div>
    `;

    // Render Tasks & Projects
    if (!tasks || tasks.length === 0) {
      tasksContainer.innerHTML = '<div class="empty-state">No tiene tareas asignadas</div>';
      projectsContainer.innerHTML = '<div class="empty-state">No participa en proyectos</div>';
    } else {
      // Group unique projects
      const uniqueProjects = Array.from(new Set(tasks.map(t => t.projects?.name).filter(Boolean)));
      projectsContainer.innerHTML = uniqueProjects.map(p => `
        <div class="card p-sm border-accent">
          <div class="font-bold">📁 ${this.escapeHtml(p)}</div>
        </div>
      `).join('');

      tasksContainer.innerHTML = tasks.map(t => `
        <div class="task-item" style="padding: 10px; margin-bottom: 5px; border-left: 3px solid var(--accent-color);">
          <div class="flex justify-between items-center w-full">
            <div>
              <div class="font-bold text-sm">${this.escapeHtml(t.title)}</div>
              <div class="text-xs opacity-60">${t.projects?.name || 'Sin proyecto'}</div>
            </div>
            ${this.getStatusBadge(t.status)}
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Error viewing user details:', error);
    infoContainer.innerHTML = '<div class="empty-state text-error">Error al cargar datos: ' + error.message + '</div>';
  }
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

// Update SwitchView to handle new routes on the Prototype so extensions can chain it
const prototypeSwitchView = UIController.prototype.switchView;
UIController.prototype.switchView = function (view) {
  prototypeSwitchView.call(this, view);
  if (view === 'reports') {
    setTimeout(() => this.renderReportsView(), 50);
  } else if (view === 'areas') {
    this.renderAreasView();
  } else if (view === 'users') {
    this.renderUsersView();
  } else if (view === 'settings') {
    this.loadProfileData();
  }
};

// ===== REPORTS & KPIs =====

ui.renderReportsView = function () {
  const tasks = this.dataManager.tasks;
  const projects = this.dataManager.projects;
  const areas = this.dataManager.areas;
  const users = this.dataManager.users;

  // Populate filters if empty
  this.populateReportsFilters();

  // Get filter values
  const projectId = document.getElementById('filter-reports-project').value;
  const areaId = document.getElementById('filter-reports-area').value;
  const userId = document.getElementById('filter-reports-user').value;
  const dateFilter = document.getElementById('filter-reports-date').value;

  // Role-based Base Filtering
  const profile = this.dataManager.profile;
  const isSuper = auth.isAdmin() || auth.isSuperManager();
  const isLeader = auth.isAreaLeader();
  const isGlobal = auth.isGlobalAdmin();

  let filteredTasks = tasks;

  if (!isSuper && !isGlobal) {
    if (isLeader) {
      // Area leaders see all tasks in their area
      filteredTasks = filteredTasks.filter(t => t.area_id === profile.area_id);
    } else if (profile?.role === 'lider_data') {
      // Data leaders see tasks in their allowed areas
      filteredTasks = filteredTasks.filter(t => this.dataManager.allowedAreas.includes(t.area_id));
    } else {
      // Normal users only see their own tasks
      filteredTasks = filteredTasks.filter(t => t.assignedTo === auth.user?.id);
    }
  }

  // Apply UI Filters on top of base filter
  if (projectId !== 'all') filteredTasks = filteredTasks.filter(t => t.projectId === projectId);
  if (areaId !== 'all') filteredTasks = filteredTasks.filter(t => t.area_id === areaId);
  if (userId !== 'all') filteredTasks = filteredTasks.filter(t => t.assignedTo === userId);

  if (dateFilter !== 'all') {
    const now = new Date();
    if (dateFilter === 'today') {
      const today = formatDateYYYYMMDD(now);
      filteredTasks = filteredTasks.filter(t => t.created_at?.startsWith(today));
    } else if (dateFilter === 'week') {
      const weekAgo = new Date(now.setDate(now.getDate() - 7));
      filteredTasks = filteredTasks.filter(t => new Date(t.created_at) >= weekAgo);
    } else if (dateFilter === 'month') {
      const monthAgo = new Date(now.setMonth(now.getMonth() - 1));
      filteredTasks = filteredTasks.filter(t => new Date(t.created_at) >= monthAgo);
    }
  }

  // Aggregate Data
  const statusData = {
    pending: filteredTasks.filter(t => t.status === 'pending').length,
    progress: filteredTasks.filter(t => t.status === 'progress').length,
    completed: filteredTasks.filter(t => t.status === 'completed').length
  };

  const areaData = {};
  areas.forEach(a => areaData[a.name] = 0);
  filteredTasks.forEach(t => {
    const area = areas.find(a => a.id === t.area_id);
    if (area) areaData[area.name]++;
  });

  const userData = {};
  filteredTasks.forEach(t => {
    const user = users.find(u => u.id === t.assignedTo);
    const name = user ? (user.username || user.email.split('@')[0]) : 'Sin asignar';
    userData[name] = (userData[name] || 0) + 1;
  });

  // Trend Data (Last 15 days)
  const trendLabels = [];
  const trendValues = [];
  const todayDate = new Date();

  for (let i = 14; i >= 0; i--) {
    const d = new Date(todayDate);
    d.setDate(d.getDate() - i);
    const dateStr = formatDateYYYYMMDD(d);
    trendLabels.push(dateStr);

    const count = filteredTasks.filter(t => {
      if (t.status !== 'completed' || !t.completed_at) return false;
      return t.completed_at.startsWith(dateStr);
    }).length;

    trendValues.push(count);
  }

  console.log('Rendering Charts with tasks:', filteredTasks.length);

  // Render Charts
  this.initChart('chart-tasks-status', 'pie', {
    labels: ['Pendientes', 'En Progreso', 'Completadas'],
    datasets: [{
      data: [statusData.pending, statusData.progress, statusData.completed],
      backgroundColor: ['#fbbf24', '#60a5fa', '#34d399'],
      borderWidth: 0
    }]
  });

  this.initChart('chart-tasks-area', 'bar', {
    labels: Object.keys(areaData),
    datasets: [{
      label: 'Tareas por Área',
      data: Object.values(areaData),
      backgroundColor: '#667eea',
      borderRadius: 6
    }]
  }, { indexAxis: 'y' });

  this.initChart('chart-tasks-trend', 'line', {
    labels: trendLabels,
    datasets: [{
      label: 'Tareas Completadas',
      data: trendValues,
      borderColor: '#f093fb',
      backgroundColor: 'rgba(240, 147, 251, 0.1)',
      fill: true,
      tension: 0.4
    }]
  });

  this.initChart('chart-tasks-user', 'bar', {
    labels: Object.keys(userData),
    datasets: [{
      label: 'Tareas por Usuario',
      data: Object.values(userData),
      backgroundColor: '#4facfe',
      borderRadius: 6
    }]
  });
};

ui.populateReportsFilters = function () {
  const projectSelect = document.getElementById('filter-reports-project');
  const areaSelect = document.getElementById('filter-reports-area');
  const userSelect = document.getElementById('filter-reports-user');

  const isSuper = auth.isAdmin() || auth.isSuperManager();
  const isLeader = auth.isAreaLeader();
  const profile = this.dataManager.profile;

  if (projectSelect) {
    const currentValue = projectSelect.value;
    projectSelect.innerHTML = '<option value="all">Todos los Proyectos</option>';
    this.dataManager.projects.forEach(p => {
      // Area leaders only see projects related to their area (if projects have area_id, else show all)
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      projectSelect.appendChild(opt);
    });
    projectSelect.value = currentValue || 'all';
  }

  if (areaSelect) {
    if (!isSuper && !auth.isGlobalAdmin()) {
      areaSelect.classList.add('hidden');
    } else {
      areaSelect.classList.remove('hidden');
      const currentValue = areaSelect.value;
      areaSelect.innerHTML = '<option value="all">Todas las Áreas</option>';

      let areasToDisplay = this.dataManager.areas;
      if (profile?.role === 'lider_data') {
        areasToDisplay = areasToDisplay.filter(a => this.dataManager.allowedAreas.includes(a.id));
      }

      areasToDisplay.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name;
        areaSelect.appendChild(opt);
      });
      areaSelect.value = currentValue || 'all';
    }
  }

  if (userSelect) {
    if (!isSuper && !isLeader && !auth.isGlobalAdmin()) {
      userSelect.classList.add('hidden');
    } else {
      userSelect.classList.remove('hidden');
      const currentValue = userSelect.value;
      userSelect.innerHTML = '<option value="all">Todos los Usuarios</option>';

      let usersToDisplay = this.dataManager.users;
      if (isLeader && !isSuper) {
        usersToDisplay = usersToDisplay.filter(u => u.area_id === profile.area_id);
      } else if (profile?.role === 'lider_data') {
        usersToDisplay = usersToDisplay.filter(u => this.dataManager.allowedAreas.includes(u.area_id));
      }

      usersToDisplay.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.username || u.email.split('@')[0];
        userSelect.appendChild(opt);
      });
      userSelect.value = currentValue || 'all';
    }
  }
};

ui.initChart = function (id, type, data, options = {}) {
  const ctx = document.getElementById(id)?.getContext('2d');
  if (!ctx) return;

  if (this.charts[id]) {
    this.charts[id].destroy();
  }

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: '#b4b4c8', font: { family: 'Inter' } }
      }
    },
    scales: type === 'pie' ? {} : {
      y: { ticks: { color: '#6e6e8f' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      x: { ticks: { color: '#6e6e8f' }, grid: { display: false } }
    }
  };

  this.charts[id] = new Chart(ctx, {
    type: type,
    data: data,
    options: { ...defaultOptions, ...options }
  });
};

console.log(' Fase 4: Reportes y KPIs cargados');

