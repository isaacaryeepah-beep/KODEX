const API = '';
let token = localStorage.getItem('token');
let currentUser = null;
let currentView = 'dashboard';

function svgIcon(path, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
function dashboardIcon() {
  return svgIcon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>');
}
function sessionsIcon() {
  return svgIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>');
}
function usersIcon() {
  return svgIcon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>');
}
function meetingsIcon() {
  return svgIcon('<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>');
}
function reportsIcon() {
  return svgIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>');
}
function coursesIcon() {
  return svgIcon('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>');
}
function quizzesIcon() {
  return svgIcon('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 14l2 2 4-4"/>');
}
function attendanceIcon() {
  return svgIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>');
}
function subscriptionIcon() {
  return svgIcon('<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>');
}
function approvalsIcon() {
  return svgIcon('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>');
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (res.headers.get('content-type')?.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      // Subscription gate — redirect lecturer to subscription page automatically
      if (res.status === 403 && data.subscriptionRequired) {
        showSubscriptionGate(data.message);
        throw new Error(data.error || 'Subscription required');
      }
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }
  if (!res.ok) throw new Error('Request failed');
  return res;
}

function showError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 5000);
}

let selectedPortalType = 'admin-corporate';

function selectPortal(type) {
  selectedPortalType = type;
  document.getElementById('portal-selector').classList.add('hidden');
  if (type === 'admin-corporate' || type === 'admin-academic') {
    const isAcademic = type === 'admin-academic';
    document.getElementById('admin-auth').classList.remove('hidden');
    document.getElementById('admin-portal-title').textContent = isAcademic ? 'Institution Admin' : 'Admin Portal';
    document.getElementById('admin-portal-subtitle').textContent = isAcademic ? 'Academic Institution Admin' : 'Corporate Admin Access';
    document.getElementById('admin-reg-company-label').textContent = isAcademic ? 'Institution Name' : 'Company Name';
    document.getElementById('admin-reg-company').placeholder = isAcademic ? 'Your institution name' : 'Your company name';
  } else if (type === 'lecturer') {
    document.getElementById('lecturer-auth').classList.remove('hidden');
  } else if (type === 'employee') {
    document.getElementById('employee-auth').classList.remove('hidden');
  } else {
    document.getElementById('student-auth').classList.remove('hidden');
  }
}

function showPortalSelector() {
  document.getElementById('admin-auth').classList.add('hidden');
  document.getElementById('lecturer-auth').classList.add('hidden');
  document.getElementById('employee-auth').classList.add('hidden');
  document.getElementById('student-auth').classList.add('hidden');
  document.getElementById('portal-selector').classList.remove('hidden');
  document.querySelectorAll('.auth-container input').forEach(i => i.value = '');
  document.querySelectorAll('.error-msg').forEach(e => e.style.display = 'none');
  selectedPortalType = null;
}

function backToPortalSelector() {
  showPortalSelector();
}

function showAdminRegister() {
  document.getElementById('admin-login-form').classList.add('hidden');
  document.getElementById('admin-register-form').classList.remove('hidden');
  document.getElementById('admin-auth-error').style.display = 'none';
}

function showAdminLogin() {
  document.getElementById('admin-register-form').classList.add('hidden');
  document.getElementById('admin-login-form').classList.remove('hidden');
  document.getElementById('admin-auth-error').style.display = 'none';
}

function showAdminError(msg) {
  const el = document.getElementById('admin-auth-error');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = '';
  el.style.color = '';
  setTimeout(() => el.style.display = 'none', 5000);
}

function showLecturerRegister() {
  document.getElementById('lecturer-login-form').classList.add('hidden');
  document.getElementById('lecturer-register-form').classList.remove('hidden');
  document.getElementById('lecturer-auth-error').style.display = 'none';
}

function showLecturerLogin() {
  document.getElementById('lecturer-register-form').classList.add('hidden');
  document.getElementById('lecturer-login-form').classList.remove('hidden');
  document.getElementById('lecturer-auth-error').style.display = 'none';
}

function showLecturerError(msg) {
  const el = document.getElementById('lecturer-auth-error');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = '';
  el.style.color = '';
  setTimeout(() => el.style.display = 'none', 5000);
}

function showEmployeeError(msg) {
  const el = document.getElementById('employee-auth-error');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = '';
  el.style.color = '';
  setTimeout(() => el.style.display = 'none', 5000);
}

function showStudentRegister() {
  document.getElementById('student-login-form').classList.add('hidden');
  document.getElementById('student-forgot-form').classList.add('hidden');
  document.getElementById('student-register-form').classList.remove('hidden');
  document.getElementById('student-auth-error').style.display = 'none';
}

function showStudentLogin() {
  document.getElementById('student-register-form').classList.add('hidden');
  document.getElementById('student-forgot-form').classList.add('hidden');
  document.getElementById('student-login-form').classList.remove('hidden');
  document.getElementById('student-auth-error').style.display = 'none';
  studentForgotStep = 'request';
}

function showStudentForgot() {
  document.getElementById('student-login-form').classList.add('hidden');
  document.getElementById('student-register-form').classList.add('hidden');
  document.getElementById('student-forgot-form').classList.remove('hidden');
  document.getElementById('student-auth-error').style.display = 'none';
  document.getElementById('student-reset-code-group').classList.add('hidden');
  document.getElementById('student-new-password-group').classList.add('hidden');
  document.getElementById('student-forgot-btn').textContent = 'Request Reset Code';
  studentForgotStep = 'request';
}

function showStudentError(msg) {
  const el = document.getElementById('student-auth-error');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = '';
  el.style.color = '';
  setTimeout(() => el.style.display = 'none', 5000);
}

function showPendingApproval(message) {
  document.getElementById('auth-page').style.display = 'flex';
  document.getElementById('dashboard-page').classList.add('hidden');
  document.getElementById('portal-selector').classList.add('hidden');
  const authMap = { lecturer: 'lecturer-auth', student: 'student-auth', employee: 'employee-auth' };
  const errorMap = { lecturer: 'lecturer-auth-error', student: 'student-auth-error', employee: 'employee-auth-error' };
  const authEl = authMap[selectedPortalType] || 'lecturer-auth';
  document.getElementById(authEl).classList.remove('hidden');
  const errorEl = errorMap[selectedPortalType] || 'lecturer-auth-error';
  const el = document.getElementById(errorEl);
  el.textContent = message || 'Your account is pending approval. Please contact your institution admin.';
  el.style.display = 'block';
  el.style.background = '#fef3c7';
  el.style.color = '#92400e';
  localStorage.removeItem('token');
  token = null;
  currentUser = null;
}

async function handleAdminLogin() {
  try {
    const email = document.getElementById('admin-login-email').value;
    const password = document.getElementById('admin-login-password').value;
    if (!email) return showAdminError('Please enter your email');
    if (!password) return showAdminError('Please enter your password');
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

    // Block non-admin roles from admin portals
    const userRole = data.user?.role;
    if (!['admin', 'superadmin', 'manager'].includes(userRole)) {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch(e) {}
      if (userRole === 'lecturer') {
        return showAdminError('Invalid email or password. Please try again.');
      } else if (userRole === 'student') {
        return showAdminError('Invalid email or password. Please try again.');
      } else {
        return showAdminError('Invalid email or password. Please try again.');
      }
    }

    const companyMode = data.user && data.user.company ? data.user.company.mode : 'corporate';
    const expectedMode = selectedPortalType === 'admin-academic' ? 'academic' : 'corporate';
    if (companyMode !== expectedMode) {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch(e) {}
      if (expectedMode === 'academic') {
        return showAdminError('Invalid email or password. Please try again.');
      } else {
        return showAdminError('Invalid email or password. Please try again.');
      }
    }

    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;
    showDashboard(data);
  } catch (e) {
    showAdminError('Invalid email or password. Please try again.');
  }
}

async function handleAdminRegister() {
  try {
    const name = document.getElementById('admin-reg-name').value;
    const email = document.getElementById('admin-reg-email').value;
    const password = document.getElementById('admin-reg-password').value;
    const companyName = document.getElementById('admin-reg-company').value;
    const mode = selectedPortalType === 'admin-academic' ? 'academic' : 'corporate';
    if (!name || !email || !password || !companyName) {
      return showAdminError('Please fill in all fields');
    }
    if (password.length < 8) {
      return showAdminError('Password must be at least 8 characters');
    }
    const body = { name, email, password, companyName, mode };
    const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;
    showDashboard(data);
  } catch (e) {
    showAdminError(e.message || 'Registration failed');
  }
}

async function handleLecturerLogin() {
  try {
    const email = document.getElementById('lecturer-login-email').value;
    const password = document.getElementById('lecturer-login-password').value;
    if (!email) return showLecturerError('Please enter your email');
    if (!password) return showLecturerError('Please enter your password');
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, portalMode: 'academic' }) });

    // ✅ Only lecturers allowed in lecturer portal
    const userRole = data.user?.role;
    if (userRole !== 'lecturer') {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch(e) {}
      if (userRole === 'admin' || userRole === 'superadmin') {
        return showLecturerError('Invalid email or password. Please try again.');
      } else if (userRole === 'student') {
        return showLecturerError('Invalid email or password. Please try again.');
      } else {
        return showLecturerError('Invalid email or password. Please try again.');
      }
    }

    if (data.user && !data.user.isApproved) {
      return showPendingApproval('Your account is pending admin approval. Please wait for your institution admin to approve your account.');
    }
    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;
    showDashboard(data);
  } catch (e) {
    showLecturerError('Invalid email or password. Please try again.');
  }
}

async function handleLecturerRegister() {
  try {
    const name = document.getElementById('lecturer-reg-name').value;
    const email = document.getElementById('lecturer-reg-email').value;
    const password = document.getElementById('lecturer-reg-password').value;
    const regMode = document.getElementById('lecturer-reg-mode')?.value || 'join';

    if (!name || !email || !password) {
      return showLecturerError('Please fill in all fields');
    }
    if (password.length < 8) {
      return showLecturerError('Password must be at least 8 characters');
    }

    const dept = document.getElementById('lecturer-reg-dept')?.value?.trim();
    let body = { name, email, password };
    if (dept) body.department = dept;
    if (regMode === 'create') {
      const institutionName = document.getElementById('lecturer-reg-institution').value;
      if (!institutionName) return showLecturerError('Please enter your institution name');
      body.institutionName = institutionName;
    } else {
      const institutionCode = document.getElementById('lecturer-reg-code').value;
      if (!institutionCode) return showLecturerError('Please enter the institution code');
      body.institutionCode = institutionCode;
    }

    const data = await api('/api/auth/register-lecturer', { method: 'POST', body: JSON.stringify(body) });

    if (data.token) {
      // Created own institution — log them in immediately
      token = data.token;
      localStorage.setItem('token', token);
      currentUser = data.user;
      showDashboard(data);
    } else {
      const el = document.getElementById('lecturer-auth-error');
      el.textContent = data.message || 'Registration successful! Your account is pending admin approval.';
      el.style.display = 'block';
      el.style.background = '#f0fdf4';
      el.style.color = '#15803d';
      showLecturerLogin();
      document.getElementById('lecturer-auth-error').style.display = 'block';
    }
  } catch (e) {
    showLecturerError(e.message || 'Registration failed');
  }
}

function toggleLecturerRegMode() {
  const mode = document.getElementById('lecturer-reg-mode').value;
  const codeGroup = document.getElementById('lecturer-reg-code-group');
  const instGroup = document.getElementById('lecturer-reg-inst-group');
  const hint = document.getElementById('lecturer-reg-hint');
  if (mode === 'create') {
    codeGroup.classList.add('hidden');
    instGroup.classList.remove('hidden');
    hint.textContent = 'You will be the admin of your institution and can immediately start using the platform.';
  } else {
    codeGroup.classList.remove('hidden');
    instGroup.classList.add('hidden');
    hint.textContent = 'Your account will need admin approval before you can access the system.';
  }
}

function showEmployeeLogin() {
  document.getElementById('employee-login-form').classList.remove('hidden');
  document.getElementById('employee-register-form').classList.add('hidden');
}
function showEmployeeRegister() {
  document.getElementById('employee-login-form').classList.add('hidden');
  document.getElementById('employee-register-form').classList.remove('hidden');
}

async function handleEmployeeLogin() {
  try {
    const email = document.getElementById('employee-login-email').value;
    const institutionCode = document.getElementById('employee-login-code').value;
    const password = document.getElementById('employee-login-password').value;
    if (!email) return showEmployeeError('Please enter your email');
    if (!institutionCode) return showEmployeeError('Please enter your institution code');
    if (!password) return showEmployeeError('Please enter your password');
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, institutionCode, loginRole: 'employee' }) });
    if (data.user && !data.user.isApproved) {
      return showPendingApproval('Your account is pending admin approval. Please wait for your admin to approve your account.');
    }
    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;
    showDashboard(data);
  } catch (e) {
    showEmployeeError('Invalid email or password. Please try again.');
  }
}

async function handleEmployeeRegister() {
  try {
    const name = document.getElementById('employee-reg-name').value;
    const email = document.getElementById('employee-reg-email').value;
    const institutionCode = document.getElementById('employee-reg-code').value;
    const password = document.getElementById('employee-reg-password').value;
    if (!name || !email || !institutionCode || !password) {
      return showEmployeeError('Please fill in all fields');
    }
    if (password.length < 8) {
      return showEmployeeError('Password must be at least 8 characters');
    }
    const data = await api('/api/auth/register-employee', { method: 'POST', body: JSON.stringify({ name, email, password, institutionCode }) });
    const el = document.getElementById('employee-auth-error');
    el.textContent = data.message || 'Registration successful! Your account is pending admin approval.';
    el.style.display = 'block';
    el.style.background = '#f0fdf4';
    el.style.color = '#15803d';
    showEmployeeLogin();
    document.getElementById('employee-auth-error').style.display = 'block';
  } catch (e) {
    showEmployeeError(e.message || 'Registration failed');
  }
}

async function handleStudentLogin() {
  try {
    const indexNumber = document.getElementById('student-login-index').value;
    const institutionCode = document.getElementById('student-login-code').value;
    const password = document.getElementById('student-login-password').value;
    if (!indexNumber) return showStudentError('Please enter your student ID');
    if (!institutionCode) return showStudentError('Please enter your institution code');
    if (!password) return showStudentError('Please enter your password');
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ indexNumber, password, institutionCode }) });
    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;
    showDashboard(data);
  } catch (e) {
    showStudentError('Invalid student ID or password. Please try again.');
  }
}

async function handleStudentRegister() {
  try {
    const name = document.getElementById('student-reg-name').value;
    const indexNumber = document.getElementById('student-reg-index').value;
    const institutionCode = document.getElementById('student-reg-code').value;
    const password = document.getElementById('student-reg-password').value;
    const confirm = document.getElementById('student-reg-confirm').value;
    if (!name || !indexNumber || !institutionCode || !password) {
      return showStudentError('Please fill in all fields');
    }
    if (password.length < 8) {
      return showStudentError('Password must be at least 8 characters');
    }
    if (password !== confirm) {
      return showStudentError('Passwords do not match');
    }
    const data = await api('/api/auth/register-student', { method: 'POST', body: JSON.stringify({ name, indexNumber, password, institutionCode }) });
    if (data.token) {
      token = data.token;
      localStorage.setItem('token', token);
      currentUser = data.user;
      showDashboard(data);
    } else {
      const el = document.getElementById('student-auth-error');
      el.textContent = data.message || 'Registration successful!';
      el.style.display = 'block';
      el.style.background = '#f0fdf4';
      el.style.color = '#15803d';
      showStudentLogin();
      document.getElementById('student-auth-error').style.display = 'block';
    }
  } catch (e) {
    showStudentError(e.message || 'Registration failed');
  }
}

let studentForgotStep = 'request';
let studentForgotIndex = '';
let studentForgotCode = '';

async function handleStudentForgotPassword() {
  if (studentForgotStep === 'request') {
    const indexNumber = document.getElementById('student-forgot-index').value;
    const institutionCode = document.getElementById('student-forgot-code').value;
    if (!indexNumber || !institutionCode) return showStudentError('Please fill in all fields');
    try {
      const data = await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ indexNumber, institutionCode }) });
      studentForgotIndex = indexNumber;
      studentForgotCode = institutionCode;
      studentForgotStep = 'reset';
      document.getElementById('student-reset-code-group').classList.remove('hidden');
      document.getElementById('student-new-password-group').classList.remove('hidden');
      document.getElementById('student-forgot-btn').textContent = 'Reset Password';
      const el = document.getElementById('student-auth-error');
      el.textContent = data.message + (data.resetCode ? ' Code: ' + data.resetCode : '');
      el.style.display = 'block';
      el.style.background = '#f0fdf4';
      el.style.color = '#15803d';
    } catch (e) {
      showStudentError(e.message);
    }
  } else {
    const resetCode = document.getElementById('student-reset-code').value;
    const newPassword = document.getElementById('student-new-password').value;
    if (!resetCode || !newPassword) return showStudentError('Please enter the reset code and new password');
    if (newPassword.length < 8) return showStudentError('Password must be at least 8 characters');
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ indexNumber: studentForgotIndex, resetCode, newPassword, institutionCode: studentForgotCode }) });
      studentForgotStep = 'request';
      showStudentLogin();
      const el = document.getElementById('student-auth-error');
      el.textContent = 'Password reset successful! You can now sign in.';
      el.style.display = 'block';
      el.style.background = '#f0fdf4';
      el.style.color = '#15803d';
    } catch (e) {
      showStudentError(e.message);
    }
  }
}

async function handleLogout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  document.getElementById('main-content').innerHTML = '';
  document.getElementById('sidebar-nav').innerHTML = '';
  document.getElementById('user-name').textContent = '';
  document.getElementById('user-role').textContent = '';
  document.getElementById('trial-banner').style.display = 'none';
  document.getElementById('trial-expired-banner').style.display = 'none';
  const topbarLeft = document.querySelector('.topbar-left');
  if (topbarLeft) topbarLeft.innerHTML = '';
  document.getElementById('dashboard-page').classList.add('hidden');
  document.getElementById('dashboard-page').removeAttribute('data-portal');
  document.getElementById('auth-page').style.display = 'flex';
  showPortalSelector();
}

async function loadUserData() {
  try {
    const data = await api('/api/auth/me');
    currentUser = data.user;
    if (!currentUser) throw new Error('No user data');
    showDashboard(data);
  } catch (e) {
    localStorage.removeItem('token');
    token = null;
    currentUser = null;
    document.getElementById('auth-page').style.display = 'flex';
    document.getElementById('dashboard-page').classList.add('hidden');
  }
}

function getPortalName(role) {
  const names = {
    manager: 'Manager Portal',
    lecturer: 'Lecturer Portal',
    employee: 'Employee Portal',
    student: 'Student Portal',
    admin: 'Admin Portal',
    superadmin: 'Admin Portal'
  };
  return names[role] || 'Smart Attendance';
}

function getPortalAttr(role) {
  if (role === 'superadmin' || role === 'admin') return 'admin';
  return role;
}

function showDashboard(data) {
  try {
    document.getElementById('auth-page').style.display = 'none';
    const dashPage = document.getElementById('dashboard-page');
    dashPage.classList.remove('hidden');

    const role = currentUser.role;
    const portalAttr = getPortalAttr(role);
    dashPage.setAttribute('data-portal', portalAttr);

    document.getElementById('user-name').textContent = currentUser.name || '';
    const roleEl = document.getElementById('user-role');
    roleEl.textContent = currentUser.role || '';
    roleEl.className = `role-badge role-${currentUser.role || 'user'}`;

    const companyName = currentUser.company?.name || '';
    const mode = currentUser.company?.mode || 'corporate';
    const topbarLeft = document.querySelector('.topbar-left');
    topbarLeft.innerHTML = `
      <h2>${getPortalName(role)}</h2>
      ${companyName ? `<span class="portal-company">— ${companyName}</span>` : ''}
      <span class="mode-badge">${mode}</span>
    `;

    const trial = data.trial || null;
    const subscription = data.subscription || null;
    const isSubRole = (role === 'employee' || role === 'student');

    if (isSubRole) {
      document.getElementById('trial-banner').style.display = 'none';
      document.getElementById('trial-expired-banner').style.display = 'none';
    } else if (trial && trial.active) {
      const banner = document.getElementById('trial-banner');
      const tr = trial.timeRemaining || {};
      banner.textContent = `Free Trial: ${trial.daysRemaining} days remaining (${tr.days || 0}d ${tr.hours || 0}h ${tr.minutes || 0}m)`;
      banner.style.display = 'block';
      document.getElementById('trial-expired-banner').style.display = 'none';
    } else if (subscription && !subscription.active && trial && !trial.active) {
      document.getElementById('trial-expired-banner').textContent = 'Your free trial has ended. Please subscribe to continue using premium features.';
      document.getElementById('trial-expired-banner').style.display = 'block';
      document.getElementById('trial-banner').style.display = 'none';
    } else {
      document.getElementById('trial-banner').style.display = 'none';
      document.getElementById('trial-expired-banner').style.display = 'none';
    }

    buildSidebar();
    navigateTo('dashboard');
  } catch (e) {
    console.error('Dashboard error:', e);
    document.getElementById('auth-page').style.display = 'flex';
    document.getElementById('dashboard-page').classList.add('hidden');
    localStorage.removeItem('token');
    token = null;
    currentUser = null;
    showError('Something went wrong. Please sign in again.');
  }
}

function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  const role = currentUser.role;

  let links = [
    { id: 'dashboard', label: 'Dashboard', icon: dashboardIcon() },
  ];

  switch (role) {
    case 'admin':
      links.push({ id: 'approvals', label: 'Approvals', icon: approvalsIcon() });
      links.push({ id: 'search', label: 'Search', icon: svgIcon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>') });
      links.push({ id: 'users', label: 'Users', icon: usersIcon() });
      links.push({ id: 'sessions', label: 'Sessions', icon: sessionsIcon() });
      if (currentUser.company?.mode === 'academic') {
        links.push({ id: 'courses', label: 'Courses', icon: coursesIcon() });
        links.push({ id: 'quizzes', label: 'Quizzes', icon: quizzesIcon() });
      }
      links.push({ id: 'meetings', label: 'Meetings', icon: meetingsIcon() });
      links.push({ id: 'reports', label: 'Reports', icon: reportsIcon() });
      links.push({ id: 'subscription', label: 'Subscription', icon: subscriptionIcon() });
      break;
    case 'manager':
      links.push({ id: 'approvals', label: 'Approvals', icon: approvalsIcon() });
      links.push({ id: 'sessions', label: 'Sessions', icon: sessionsIcon() });
      links.push({ id: 'users', label: 'Users', icon: usersIcon() });
      links.push({ id: 'meetings', label: 'Meetings', icon: meetingsIcon() });
      links.push({ id: 'reports', label: 'Reports', icon: reportsIcon() });
      break;
    case 'lecturer':
      links.push({ id: 'sessions', label: 'Sessions', icon: sessionsIcon() });
      links.push({ id: 'search', label: 'Search', icon: svgIcon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>') });
      links.push({ id: 'courses', label: 'Courses', icon: coursesIcon() });
      links.push({ id: 'quizzes', label: 'Quizzes', icon: quizzesIcon() });
      links.push({ id: 'meetings', label: 'Meetings', icon: meetingsIcon() });
      links.push({ id: 'reports', label: 'Reports', icon: reportsIcon() });
      links.push({ id: 'subscription', label: 'Subscription', icon: subscriptionIcon() });
      break;
    case 'employee':
      links.push({ id: 'sign-in-out', label: 'Sign In / Out', icon: attendanceIcon() });
      links.push({ id: 'my-attendance', label: 'My Attendance', icon: sessionsIcon() });
      links.push({ id: 'meetings', label: 'Meetings', icon: meetingsIcon() });
      links.push({ id: 'reports', label: 'Reports', icon: reportsIcon() });
      break;
    case 'student':
      links.push({ id: 'mark-attendance', label: 'Mark Attendance', icon: attendanceIcon() });
      links.push({ id: 'my-attendance', label: 'My Attendance', icon: sessionsIcon() });
      links.push({ id: 'courses', label: 'My Courses', icon: coursesIcon() });
      links.push({ id: 'quizzes', label: 'Quizzes', icon: quizzesIcon() });
      links.push({ id: 'meetings', label: 'Meetings', icon: meetingsIcon() });
      links.push({ id: 'reports', label: 'Reports', icon: reportsIcon() });
      break;
    case 'superadmin':
      links.push({ id: 'approvals', label: 'Approvals', icon: approvalsIcon() });
      links.push({ id: 'search', label: 'Search', icon: svgIcon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>') });
      links.push({ id: 'sessions', label: 'Sessions', icon: sessionsIcon() });
      links.push({ id: 'users', label: 'Users', icon: usersIcon() });
      links.push({ id: 'meetings', label: 'Meetings', icon: meetingsIcon() });
      links.push({ id: 'courses', label: 'Courses', icon: coursesIcon() });
      links.push({ id: 'quizzes', label: 'Quizzes', icon: quizzesIcon() });
      links.push({ id: 'reports', label: 'Reports', icon: reportsIcon() });
      links.push({ id: 'subscription', label: 'Subscription', icon: subscriptionIcon() });
      break;
  }

  nav.innerHTML = `<div class="sidebar-section-title">Navigation</div>` + links.map(l =>
    `<a onclick="navigateTo('${l.id}')" id="nav-${l.id}">${l.icon} <span>${l.label}</span></a>`
  ).join('');
}

function navigateTo(view) {
  currentView = view;
  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
  const navEl = document.getElementById(`nav-${view}`);
  if (navEl) navEl.classList.add('active');

  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading...</div>';

  switch (view) {
    case 'dashboard': renderDashboard(); break;
    case 'sessions': renderSessions(); break;
    case 'users': renderUsers(); break;
    case 'meetings': renderMeetings(); break;
    case 'courses': renderCourses(); break;
    case 'quizzes': renderQuizzes(); break;
    case 'my-attendance': renderMyAttendance(); break;
    case 'mark-attendance': renderMarkAttendance(); break;
    case 'sign-in-out': renderSignInOut(); break;
    case 'subscription': renderSubscription(); break;
    case 'reports': renderReports(); break;
    case 'approvals': renderApprovals(); break;
    case 'search': renderSearch(); break;
    default: renderDashboard();
  }
}

async function renderDashboard() {
  const content = document.getElementById('main-content');
  const role = currentUser.role;

  try {
    switch (role) {
      case 'admin':
        await renderAdminDashboard(content);
        break;
      case 'manager':
        await renderAdminDashboard(content);
        break;
      case 'lecturer':
        await renderLecturerDashboard(content);
        break;
      case 'employee':
        await renderEmployeeDashboard(content);
        break;
      case 'student':
        await renderStudentDashboard(content);
        break;
      case 'superadmin':
        await renderAdminDashboard(content);
        break;
      default:
        content.innerHTML = `<div class="card"><p>Welcome to Smart Attendance!</p></div>`;
    }
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Welcome to ${getPortalName(role)}!</p></div>`;
  }
}

async function renderApprovals() {
  const content = document.getElementById('main-content');
  try {
    const data = await api('/api/approvals/pending');
    const pending = data.pending || [];

    content.innerHTML = `
      <div class="page-header"><h2>Pending Approvals</h2><p>Review and approve registration requests</p></div>
      <div class="card">
        ${pending.length ? `
          <table>
            <thead><tr><th>Name</th><th>Email / ID</th><th>Role</th><th>Registered</th><th>Actions</th></tr></thead>
            <tbody>${pending.map(u => `
              <tr>
                <td style="font-weight:500">${u.name}</td>
                <td>${u.email || u.indexNumber || 'N/A'}</td>
                <td><span class="status-badge status-active">${u.role}</span></td>
                <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                <td style="white-space:nowrap">
                  <button class="btn btn-sm" style="background:#22c55e;color:#fff" onclick="approveUser('${u._id}')">Approve</button>
                  <button class="btn btn-danger btn-sm" onclick="rejectUser('${u._id}')">Reject</button>
                </td>
              </tr>
            `).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No pending approval requests</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Failed to load approvals: ${e.message}</p></div>`;
  }
}

async function approveUser(userId) {
  if (!confirm('Approve this user?')) return;
  try {
    await api(`/api/approvals/${userId}/approve`, { method: 'PATCH' });
    renderApprovals();
  } catch (e) {
    alert(e.message);
  }
}

async function rejectUser(userId) {
  if (!confirm('Reject and remove this user? This cannot be undone.')) return;
  try {
    await api(`/api/approvals/${userId}/reject`, { method: 'DELETE' });
    renderApprovals();
  } catch (e) {
    alert(e.message);
  }
}

async function renderLecturerDashboard(content) {
  const [sessionsData, coursesData, quizzesData] = await Promise.all([
    api('/api/attendance-sessions?limit=5').catch(() => ({ sessions: [], pagination: { total: 0 } })),
    api('/api/courses').catch(() => ({ courses: [] })),
    api('/api/quizzes').catch(() => ({ quizzes: [] })),
  ]);

  // Count students enrolled across lecturer's courses only
  const totalStudents = coursesData.courses.reduce((sum, c) => sum + (c.enrolledStudents?.length || 0), 0);
  const activeCourses = coursesData.courses.length;
  const quizzesCreated = quizzesData.quizzes.length;

  content.innerHTML = `
    <div class="page-header">
      <h2>Welcome back, ${currentUser.name.split(' ')[0]}</h2>
      <p>Here's an overview of your workspace at ${currentUser.company?.name || 'your institution'}</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${totalStudents}</div><div class="stat-label">Students</div></div>
      <div class="stat-card"><div class="stat-value">${activeCourses}</div><div class="stat-label">Courses</div></div>
      <div class="stat-card"><div class="stat-value">${sessionsData.pagination.total}</div><div class="stat-label">Sessions</div></div>
      <div class="stat-card"><div class="stat-value">${quizzesCreated}</div><div class="stat-label">Quizzes</div></div>
    </div>
    <div class="quick-actions">
      <button class="btn btn-primary btn-sm" onclick="navigateTo('sessions'); setTimeout(showStartSessionModal, 300)">${sessionsIcon()} Start Session</button>
      <button class="btn btn-secondary btn-sm" onclick="navigateTo('courses'); setTimeout(showCreateCourseModal, 300)">${coursesIcon()} Create Course</button>
      <button class="btn btn-secondary btn-sm" onclick="navigateTo('quizzes'); setTimeout(showCreateQuizModal, 300)">${quizzesIcon()} Create Quiz</button>
    </div>
    <div class="card">
      <div class="card-title">Recent Sessions</div>
      ${sessionsData.sessions.length ? `
        <table>
          <thead><tr><th>Title</th><th>Status</th><th>Started</th><th>Created By</th></tr></thead>
          <tbody>${sessionsData.sessions.map(s => `
            <tr>
              <td style="font-weight:500;color:var(--text)">${s.title || 'Untitled'}</td>
              <td><span class="status-badge status-${s.status}">${s.status}</span></td>
              <td>${new Date(s.startedAt).toLocaleString()}</td>
              <td>${s.createdBy?.name || 'N/A'}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      ` : '<div class="empty-state"><p>No sessions yet. Start your first attendance session!</p></div>'}
    </div>
  `;
}

async function renderEmployeeDashboard(content) {
  const [attendance, meetingsData, signInStatus] = await Promise.all([
    api('/api/attendance-sessions/my-attendance?limit=5').catch(() => ({ records: [], pagination: { total: 0 } })),
    api('/api/zoom').catch(() => ({ meetings: [] })),
    api('/api/attendance-sessions/sign-in-status').catch(() => ({ signedIn: false, record: null })),
  ]);

  const upcomingMeetings = meetingsData.meetings.filter(m => m.status === 'scheduled');
  const totalCheckins = attendance.pagination.total;
  const attendanceRate = totalCheckins > 0 ? Math.round((attendance.records.filter(r => r.status === 'present').length / attendance.records.length) * 100) : 0;
  const signedIn = signInStatus.signedIn;
  const signInRecord = signInStatus.record;
  const signInTime = signInRecord?.checkInTime ? new Date(signInRecord.checkInTime) : null;

  content.innerHTML = `
    <div class="page-header">
      <h2>Welcome back, ${currentUser.name.split(' ')[0]}</h2>
      <p>${currentUser.company?.name || 'Your company'}${currentUser.employeeId ? ` \u2022 ID: ${currentUser.employeeId}` : ''}</p>
    </div>

    <div class="card" style="border-left:4px solid ${signedIn ? 'var(--success)' : 'var(--primary)'};background:${signedIn ? 'linear-gradient(135deg,#f0fdf4,#ecfdf5)' : 'linear-gradient(135deg,#eef2ff,#e0e7ff)'}">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px">
        <div>
          <div style="font-size:12px;text-transform:uppercase;font-weight:700;letter-spacing:.5px;color:${signedIn ? 'var(--success)' : 'var(--primary)'}">
            ${signedIn ? '● Currently Signed In' : '○ Not Signed In'}
          </div>
          <div style="font-size:18px;font-weight:700;margin-top:4px">${signedIn ? 'You are clocked in' : 'Ready to start your day?'}</div>
          ${signInTime ? `<div style="font-size:12px;color:var(--text-light);margin-top:2px">Since ${signInTime.toLocaleString()}</div>` : ''}
        </div>
        <div style="display:flex;gap:10px">
          ${!signedIn ? `<button class="btn btn-success" onclick="employeeSignIn()" style="gap:8px;font-size:14px;padding:12px 24px">
            ${svgIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 16)} Sign In
          </button>` : `<button class="btn btn-danger" onclick="employeeSignOut()" style="gap:8px;font-size:14px;padding:12px 24px">
            ${svgIcon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>', 16)} Sign Out
          </button>`}
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${totalCheckins}</div><div class="stat-label">Total Days</div></div>
      <div class="stat-card"><div class="stat-value">${attendanceRate}%</div><div class="stat-label">Attendance Rate</div></div>
      <div class="stat-card"><div class="stat-value">${upcomingMeetings.length}</div><div class="stat-label">Meetings</div></div>
    </div>

    <div class="card">
      <div class="card-title">Recent Attendance</div>
      ${attendance.records.length ? `
        <table>
          <thead><tr><th>Session</th><th>Status</th><th>Sign In</th><th>Sign Out</th><th>Duration</th></tr></thead>
          <tbody>${attendance.records.map(r => {
            const inTime = r.checkInTime ? new Date(r.checkInTime) : null;
            const outTime = r.checkOutTime ? new Date(r.checkOutTime) : null;
            const dur = inTime && outTime ? Math.round((outTime - inTime) / 60000) : null;
            return `<tr>
              <td>${r.session?.title || 'N/A'}</td>
              <td><span class="status-badge status-${r.status}">${r.status}</span></td>
              <td>${inTime ? inTime.toLocaleTimeString() : '—'}</td>
              <td>${outTime ? outTime.toLocaleTimeString() : '<span style="color:#f59e0b;font-weight:600">Active</span>'}</td>
              <td>${dur !== null ? Math.floor(dur/60)+'h '+(dur%60)+'m' : '—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      ` : '<div class="empty-state"><p>No attendance records yet. Sign in to start tracking.</p></div>'}
    </div>
  `;
}

async function employeeSignIn() {
  try {
    const data = await api('/api/attendance-sessions/sign-in', { method: 'POST' });
    alert(data.message || 'Signed in successfully!');
    navigateTo('dashboard');
  } catch (e) {
    alert(e.message || 'Sign in failed');
  }
}

async function employeeSignOut() {
  if (!confirm('Are you sure you want to sign out?')) return;
  try {
    const data = await api('/api/attendance-sessions/sign-out', { method: 'POST' });
    alert(data.message ? data.message + (data.duration ? ' Duration: ' + data.duration : '') : 'Signed out successfully!');
    navigateTo('dashboard');
  } catch (e) {
    alert(e.message || 'Sign out failed');
  }
}

async function renderSignInOut() {
  const content = document.getElementById('main-content');
  try {
    const [statusData, attendanceData] = await Promise.all([
      api('/api/attendance-sessions/sign-in-status').catch(() => ({ signedIn: false, record: null })),
      api('/api/attendance-sessions/my-attendance?limit=30').catch(() => ({ records: [] })),
    ]);

    const signedIn = statusData.signedIn;
    const record = statusData.record;
    const signInTime = record?.checkInTime ? new Date(record.checkInTime) : null;

    content.innerHTML = `
      <div class="page-header">
        <h2>Sign In / Sign Out</h2>
        <p>Track your daily attendance</p>
      </div>

      <div class="card" style="text-align:center;padding:40px 24px;border-left:4px solid ${signedIn ? 'var(--success)' : 'var(--primary)'}">
        <div style="font-size:56px;margin-bottom:16px">${signedIn ? svgIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 56) : svgIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 56)}</div>
        <div style="font-size:22px;font-weight:800;color:${signedIn ? 'var(--success)' : 'var(--primary)'}">
          ${signedIn ? 'You are currently signed in' : 'You are not signed in'}
        </div>
        ${signInTime ? `<div style="font-size:14px;color:var(--text-light);margin-top:6px">Signed in at ${signInTime.toLocaleString()}</div>` : ''}
        <div style="margin-top:28px;display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
          ${!signedIn ? `
            <button class="btn btn-success" onclick="employeeSignIn()" style="gap:10px;font-size:16px;padding:14px 32px;width:auto">
              ${svgIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 18)}
              Sign In
            </button>
          ` : `
            <button class="btn btn-danger" onclick="employeeSignOut()" style="gap:10px;font-size:16px;padding:14px 32px;width:auto">
              ${svgIcon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>', 18)}
              Sign Out
            </button>
          `}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Attendance History</div>
        ${attendanceData.records.length ? `
          <table>
            <thead><tr><th>Date / Session</th><th>Status</th><th>Sign In</th><th>Sign Out</th><th>Duration</th></tr></thead>
            <tbody>${attendanceData.records.map(r => {
              const inTime = r.checkInTime ? new Date(r.checkInTime) : null;
              const outTime = r.checkOutTime ? new Date(r.checkOutTime) : null;
              const dur = inTime && outTime ? Math.round((outTime - inTime) / 60000) : null;
              return `<tr>
                <td>
                  <div style="font-weight:600;font-size:13px">${r.session?.title || 'Work Day'}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${inTime ? inTime.toLocaleDateString() : ''}</div>
                </td>
                <td><span class="status-badge status-${r.status}">${r.status}</span></td>
                <td style="font-size:13px">${inTime ? inTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                <td style="font-size:13px">${outTime ? outTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '<span style="color:#f59e0b;font-weight:600;font-size:11px">Active</span>'}</td>
                <td style="font-size:13px">${dur !== null ? Math.floor(dur/60)+'h '+(dur%60)+'m' : '—'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No attendance records yet. Click Sign In to start.</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

async function renderStudentDashboard(content) {
  const [attendance, coursesData, quizzesData, meetingsData, activeSessionData] = await Promise.all([
    api('/api/attendance-sessions/my-attendance?limit=5').catch(() => ({ records: [], pagination: { total: 0 } })),
    api('/api/courses').catch(() => ({ courses: [] })),
    api('/api/quizzes').catch(() => ({ quizzes: [] })),
    api('/api/zoom').catch(() => ({ meetings: [] })),
    api('/api/attendance-sessions/active').catch(() => ({ session: null })),
  ]);

  const totalCheckins = attendance.pagination.total;
  const enrolledCourses = coursesData.courses.length;
  const quizzesTaken = quizzesData.quizzes.length;
  const upcomingMeetings = meetingsData.meetings.filter(m => m.status === 'scheduled');
  const activeSession = activeSessionData.session;
  const attendanceRate = totalCheckins > 0 ? Math.round((attendance.records.filter(r => r.status === 'present').length / attendance.records.length) * 100) : 0;

  const methodLabel = (m) => {
    const labels = { qr_mark: 'QR Code', code_mark: 'Code Entry', ble_mark: 'BLE Proximity', jitsi_join: 'Meeting Join', manual: 'Manual', qr: 'QR Code', ble: 'BLE', zoom: 'Meeting' };
    return labels[m] || m;
  };

  content.innerHTML = `
    <div class="page-header">
      <h2>Welcome back, ${currentUser.name.split(' ')[0]}</h2>
      <p>${currentUser.company?.name || 'Your institution'}${currentUser.indexNumber ? ' \u2022 ' + currentUser.indexNumber : ''}</p>
    </div>
    
    ${activeSession ? `
      <div class="card" style="border-left:4px solid var(--success);background:linear-gradient(135deg,#f0fdf4,#ecfdf5);cursor:pointer" onclick="navigateTo('mark-attendance')">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div style="background:var(--success);color:white;border-radius:12px;padding:12px;display:flex;align-items:center;justify-content:center">
            ${svgIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 28)}
          </div>
          <div style="flex:1">
            <div style="font-size:12px;text-transform:uppercase;color:var(--success);font-weight:700;letter-spacing:0.5px">Active Session — Mark Now</div>
            <div style="font-size:16px;font-weight:700;margin-top:2px">${activeSession.title || 'Untitled Session'}</div>
            <div style="font-size:12px;color:var(--text-light)">Started ${new Date(activeSession.startedAt).toLocaleString()}</div>
          </div>
          <span class="status-badge status-active" style="animation:pulse 2s infinite">LIVE</span>
        </div>
      </div>
    ` : ''}
    
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${totalCheckins}</div><div class="stat-label">Total Check-ins</div></div>
      <div class="stat-card"><div class="stat-value">${attendanceRate}%</div><div class="stat-label">Attendance Rate</div></div>
      <div class="stat-card"><div class="stat-value">${enrolledCourses}</div><div class="stat-label">Enrolled Courses</div></div>
      <div class="stat-card"><div class="stat-value">${quizzesTaken}</div><div class="stat-label">Quizzes Taken</div></div>
    </div>
    
    <div class="quick-actions">
      <button class="btn btn-primary btn-sm" onclick="navigateTo('mark-attendance')">Mark Attendance</button>
      <button class="btn btn-secondary btn-sm" onclick="navigateTo('my-attendance')">View History</button>
      <button class="btn btn-secondary btn-sm" onclick="navigateTo('courses')">My Courses</button>
      <button class="btn btn-secondary btn-sm" onclick="navigateTo('quizzes')">Quizzes</button>
    </div>
    
    ${upcomingMeetings.length > 0 ? `
      <div class="card">
        <div class="card-title">Upcoming Meetings</div>
        ${upcomingMeetings.slice(0, 3).map(m => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-weight:600;font-size:14px">${m.title}</div>
              <div style="font-size:12px;color:var(--text-light)">${new Date(m.scheduledStart).toLocaleString()} — ${m.duration} min</div>
            </div>
            ${m.joinUrl ? `<a href="${m.joinUrl}" target="_blank" class="btn btn-success btn-sm">Join</a>` : ''}
          </div>
        `).join('')}
      </div>
    ` : ''}
    
    <div class="card">
      <div class="card-title">Recent Attendance</div>
      ${attendance.records.length ? `
        <table>
          <thead><tr><th>Session</th><th>Status</th><th>Method</th><th>Check-in Time</th></tr></thead>
          <tbody>${attendance.records.map(r => `
            <tr>
              <td>${r.session?.title || 'N/A'}</td>
              <td><span class="status-badge status-${r.status}">${r.status}</span></td>
              <td><span style="font-size:11px;background:var(--bg);padding:3px 8px;border-radius:8px">${methodLabel(r.method)}</span></td>
              <td>${new Date(r.checkInTime).toLocaleString()}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      ` : '<div class="empty-state"><p>No attendance records yet. Mark attendance when a session is active.</p></div>'}
    </div>
  `;
}

async function renderAdminDashboard(content) {
  const [sessionsData, usersData, pendingData, meetingsData] = await Promise.all([
    api('/api/attendance-sessions?limit=5').catch(() => ({ sessions: [], pagination: { total: 0 } })),
    api('/api/users').catch(() => ({ users: [] })),
    api('/api/approvals/pending').catch(() => ({ pending: [] })),
    api('/api/zoom').catch(() => ({ meetings: [] })),
  ]);

  const activeSessions = sessionsData.sessions.filter(s => s.status === 'active').length;
  const totalUsers = usersData.users.length;
  const pendingCount = pendingData.pending.length;
  const upcomingMeetings = meetingsData.meetings.filter(m => m.status === 'scheduled').length;
  const instCode = currentUser.company?.institutionCode || 'N/A';
  const mode = currentUser.company?.mode || 'corporate';
  const bleLocId = currentUser.company?.bleLocationId || 'N/A';
  const qrSeed = currentUser.company?.qrSeed || 'N/A';

  content.innerHTML = `
    <div class="page-header">
      <h2>Welcome back, ${currentUser.name.split(' ')[0]}</h2>
      <p>${currentUser.company?.name || 'Your institution'}</p>
    </div>

    <div class="card" style="background:linear-gradient(135deg,#ede9fe,#e0e7ff);border:1px solid #c7d2fe;margin-bottom:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:12px;text-transform:uppercase;color:var(--primary);font-weight:700;letter-spacing:0.5px">Institution Code</div>
          <div style="font-size:28px;font-weight:800;letter-spacing:4px;color:var(--primary);font-family:monospace;margin-top:4px">${instCode}</div>
          <div style="font-size:12px;color:var(--text-light);margin-top:4px">Share this code with ${mode === 'academic' ? 'lecturers and students' : 'employees'} so they can join your institution</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText('${instCode}').then(() => alert('Code copied!'))">Copy Code</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div class="card" style="margin:0;background:#f0fdfa;border:1px solid #99f6e4">
        <div style="font-size:11px;text-transform:uppercase;font-weight:700;color:#0d9488;letter-spacing:0.5px">BLE Location ID</div>
        <div style="font-size:13px;font-family:monospace;margin-top:6px;word-break:break-all">${bleLocId}</div>
      </div>
      <div class="card" style="margin:0;background:#fef9c3;border:1px solid #fde68a">
        <div style="font-size:11px;text-transform:uppercase;font-weight:700;color:#a16207;letter-spacing:0.5px">QR Seed</div>
        <div style="font-size:13px;font-family:monospace;margin-top:6px;word-break:break-all">${qrSeed.substring(0, 16)}...</div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" ${pendingCount > 0 ? 'style="border-left:3px solid #f59e0b;cursor:pointer" onclick="navigateTo(\'approvals\')"' : ''}>
        <div class="stat-value" ${pendingCount > 0 ? 'style="color:#f59e0b"' : ''}>${pendingCount}</div>
        <div class="stat-label">Pending Approvals</div>
      </div>
      <div class="stat-card"><div class="stat-value">${totalUsers}</div><div class="stat-label">Total Users</div></div>
      <div class="stat-card"><div class="stat-value">${activeSessions}</div><div class="stat-label">Active Sessions</div></div>
      <div class="stat-card"><div class="stat-value">${upcomingMeetings}</div><div class="stat-label">Meetings</div></div>
    </div>

    <div class="quick-actions">
      ${pendingCount > 0 ? `<button class="btn btn-primary btn-sm" onclick="navigateTo('approvals')">${approvalsIcon()} Review Approvals (${pendingCount})</button>` : ''}
      <button class="btn btn-secondary btn-sm" onclick="navigateTo('users'); setTimeout(showCreateUserModal, 300)">${usersIcon()} Add User</button>
    </div>

    <div class="card">
      <div class="card-title">Recent Sessions</div>
      ${sessionsData.sessions.length ? `
        <table>
          <thead><tr><th>Title</th><th>Status</th><th>Started</th><th>Created By</th></tr></thead>
          <tbody>${sessionsData.sessions.map(s => `
            <tr>
              <td style="font-weight:500;color:var(--text)">${s.title || 'Untitled'}</td>
              <td><span class="status-badge status-${s.status}">${s.status}</span></td>
              <td>${new Date(s.startedAt).toLocaleString()}</td>
              <td>${s.createdBy?.name || 'N/A'}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      ` : '<div class="empty-state"><p>No sessions yet. Start your first attendance session!</p></div>'}
    </div>
  `;
}

async function renderSessions() {
  const content = document.getElementById('main-content');
  try {
    const data = await api('/api/attendance-sessions');
    content.innerHTML = `
      <div class="page-header"><h2>Attendance Sessions</h2><p>Manage attendance sessions</p></div>
      <div class="actions-bar">
        <button class="btn btn-primary btn-sm" onclick="showStartSessionModal()">Start New Session</button>
      </div>
      <div class="card">
        ${data.sessions.length ? `
          <table>
            <thead><tr><th>Title</th><th>Status</th><th>Started</th><th>Stopped</th><th>Actions</th></tr></thead>
            <tbody>${data.sessions.map(s => `
              <tr>
                <td>${s.title || 'Untitled'}</td>
                <td><span class="status-badge status-${s.status}">${s.status}</span></td>
                <td>${new Date(s.startedAt).toLocaleString()}</td>
                <td>${s.stoppedAt ? new Date(s.stoppedAt).toLocaleString() : '-'}</td>
                <td>${s.status === 'active' ? `<button class="btn btn-danger btn-sm" onclick="stopSession('${s._id}')">Stop</button> <button class="btn btn-success btn-sm" onclick="generateQR('${s._id}')">QR Code</button>` : ''}</td>
              </tr>
            `).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No sessions found</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

function showStartSessionModal() {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>Start New Session</h3>
        <div class="form-group">
          <label>Session Title</label>
          <input type="text" id="session-title" placeholder="e.g., Morning Roll Call">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="startSession()">Start Session</button>
        </div>
      </div>
    </div>
  `;
}

async function startSession() {
  try {
    const title = document.getElementById('session-title').value;
    await api('/api/attendance-sessions/start', { method: 'POST', body: JSON.stringify({ title }) });
    closeModal();
    renderSessions();
  } catch (e) {
    alert(e.message);
  }
}

async function stopSession(id) {
  if (!confirm('Stop this session?')) return;
  try {
    await api(`/api/attendance-sessions/${id}/stop`, { method: 'POST' });
    renderSessions();
  } catch (e) {
    alert(e.message);
  }
}

async function generateQR(sessionId) {
  try {
    const data = await api('/api/qr-tokens/generate', { method: 'POST', body: JSON.stringify({ sessionId }) });
    const container = document.getElementById('modal-container');
    container.classList.remove('hidden');
    container.innerHTML = `
      <div class="modal-overlay" onclick="closeModal(event)">
        <div class="modal" onclick="event.stopPropagation()" style="text-align:center">
          <h3>QR Token Generated</h3>
          <div style="font-size:48px;font-weight:700;color:var(--primary);margin:20px 0;letter-spacing:8px">${data.qrToken.code}</div>
          <p style="color:var(--text-light);font-size:13px">Share this code with attendees</p>
          <p style="color:var(--text-light);font-size:12px;margin-top:8px">Expires: ${new Date(data.qrToken.expiresAt).toLocaleString()}</p>
          <div class="modal-actions" style="justify-content:center">
            <button class="btn btn-primary btn-sm" onclick="closeModal()">Done</button>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    alert(e.message);
  }
}

async function renderUsers() {
  const content = document.getElementById('main-content');
  try {
    const data = await api('/api/users');
    const mode = currentUser.company?.mode || 'corporate';
    const isManager = currentUser.role === 'manager';
    const canManage = ['manager', 'admin', 'superadmin'].includes(currentUser.role);
    const pageTitle = isManager ? 'Employees' : 'Users';
    const pageDesc = isManager ? 'Manage your employees' : 'Manage team members';
    const addLabel = isManager ? 'Add Employee' : 'Add User';

    const otherUsers = data.users.filter(u => u._id !== currentUser.id);

    content.innerHTML = `
      <div class="page-header"><h2>${pageTitle}</h2><p>${pageDesc}</p></div>
      <div class="actions-bar" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${canManage ? `<button class="btn btn-primary btn-sm" onclick="showCreateUserModal()">${addLabel}</button>` : ''}
        ${canManage ? `
          <div id="bulk-actions" style="display:none;gap:8px;align-items:center;margin-left:auto">
            <span id="selected-count" style="font-size:13px;color:var(--text-light)">0 selected</span>
            <button class="btn btn-sm" style="background:#22c55e;color:#fff" onclick="bulkUserAction('activate')">Activate</button>
            <button class="btn btn-sm" style="background:#f59e0b;color:#fff" onclick="bulkUserAction('deactivate')">Deactivate</button>
            <button class="btn btn-danger btn-sm" onclick="bulkUserAction('delete')">Delete</button>
          </div>
        ` : ''}
      </div>
      <div class="card">
        ${otherUsers.length ? `
          <table>
            <thead><tr>
              ${canManage ? '<th style="width:40px"><input type="checkbox" id="select-all-users" onchange="toggleSelectAllUsers()"></th>' : ''}
              <th>Name</th>${mode === 'corporate' ? '<th>Employee ID</th>' : ''}<th>Email / Index</th><th>Role</th><th>Status</th>${canManage ? '<th>Actions</th>' : ''}
            </tr></thead>
            <tbody>${otherUsers.map(u => `
              <tr id="user-row-${u._id}">
                ${canManage ? `<td><input type="checkbox" class="user-checkbox" value="${u._id}" onchange="updateBulkActions()"></td>` : ''}
                <td>${u.name}</td>
                ${mode === 'corporate' ? `<td>${u.employeeId || '-'}</td>` : ''}
                <td>${u.email || u.indexNumber || 'N/A'}</td>
                <td><span class="role-badge role-${u.role}">${u.role}</span></td>
                <td><span class="status-badge ${u.isActive ? 'status-active' : 'status-stopped'}">${u.isActive ? 'Active' : 'Inactive'}</span></td>
                ${canManage ? `<td style="white-space:nowrap">
                  ${u.isActive
                    ? `<button class="btn btn-sm" style="background:#f59e0b;color:#fff;font-size:11px" onclick="deactivateUser('${u._id}')">Deactivate</button>`
                    : `<button class="btn btn-sm" style="background:#22c55e;color:#fff;font-size:11px" onclick="activateUser('${u._id}')">Activate</button>`}
                  <button class="btn btn-danger btn-sm" style="font-size:11px" onclick="deleteUserPermanently('${u._id}', '${u.name.replace(/'/g, "\\'")}')">Delete</button>
                </td>` : ''}
              </tr>
            `).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No users found</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

function showCreateUserModal() {
  const mode = currentUser.company?.mode || 'corporate';
  const isManager = currentUser.role === 'manager';

  let roles;
  if (isManager) {
    roles = '<option value="employee">Employee</option>';
  } else if (mode === 'corporate') {
    roles = '<option value="employee">Employee</option><option value="manager">Manager</option>';
  } else {
    roles = '<option value="student">Student</option><option value="lecturer">Lecturer</option>';
  }

  const defaultRole = isManager ? 'employee' : (mode === 'corporate' ? 'employee' : 'student');
  const modalTitle = isManager ? 'Add Employee' : 'Add User';

  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>${modalTitle}</h3>
        <div class="form-group">
          <label>Full Name</label>
          <input type="text" id="new-user-name" placeholder="Full name">
        </div>
        ${!isManager ? `<div class="form-group">
          <label>Role</label>
          <select id="new-user-role" onchange="toggleUserFields()">${roles}</select>
        </div>` : `<input type="hidden" id="new-user-role" value="${defaultRole}">`}
        <div class="form-group" id="new-user-email-group" ${defaultRole === 'student' ? 'class="hidden"' : ''}>
          <label>Email</label>
          <input type="email" id="new-user-email" placeholder="user@company.com">
        </div>
        <div class="form-group ${defaultRole !== 'student' ? 'hidden' : ''}" id="new-user-index-group">
          <label>Index Number</label>
          <input type="text" id="new-user-index" placeholder="Student index number">
        </div>
        ${defaultRole === 'employee' ? '<p style="font-size:12px;color:var(--text-light);margin-bottom:12px">An Employee ID will be auto-generated.</p>' : ''}
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="new-user-password" placeholder="Min 8 characters">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="createUser()">Create</button>
        </div>
      </div>
    </div>
  `;
  toggleUserFields();
}

function toggleUserFields() {
  const role = document.getElementById('new-user-role').value;
  document.getElementById('new-user-email-group').classList.toggle('hidden', role === 'student');
  document.getElementById('new-user-index-group').classList.toggle('hidden', role !== 'student');
}

async function createUser() {
  try {
    const role = document.getElementById('new-user-role').value;
    const body = {
      name: document.getElementById('new-user-name').value,
      password: document.getElementById('new-user-password').value,
      role,
    };
    if (role === 'student') {
      body.indexNumber = document.getElementById('new-user-index').value;
    } else {
      body.email = document.getElementById('new-user-email').value;
    }
    await api('/api/users', { method: 'POST', body: JSON.stringify(body) });
    closeModal();
    renderUsers();
  } catch (e) {
    alert(e.message);
  }
}

function toggleSelectAllUsers() {
  const selectAll = document.getElementById('select-all-users');
  document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = selectAll.checked);
  updateBulkActions();
}

function updateBulkActions() {
  const checked = document.querySelectorAll('.user-checkbox:checked');
  const bulkEl = document.getElementById('bulk-actions');
  const countEl = document.getElementById('selected-count');
  if (bulkEl) {
    bulkEl.style.display = checked.length > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = `${checked.length} selected`;
  }
}

function getSelectedUserIds() {
  return Array.from(document.querySelectorAll('.user-checkbox:checked')).map(cb => cb.value);
}

async function bulkUserAction(action) {
  const ids = getSelectedUserIds();
  if (ids.length === 0) return;
  const labels = { activate: 'activate', deactivate: 'deactivate', delete: 'permanently delete' };
  if (!confirm(`Are you sure you want to ${labels[action]} ${ids.length} user(s)?${action === 'delete' ? ' This cannot be undone!' : ''}`)) return;
  try {
    const result = await api('/api/users/bulk', { method: 'POST', body: JSON.stringify({ userIds: ids, action }) });
    alert(result.message);
    renderUsers();
  } catch (e) {
    alert(e.message);
  }
}

async function deactivateUser(id) {
  if (!confirm('Deactivate this user?')) return;
  try {
    await api(`/api/users/${id}`, { method: 'DELETE' });
    renderUsers();
  } catch (e) {
    alert(e.message);
  }
}

async function activateUser(id) {
  if (!confirm('Reactivate this user?')) return;
  try {
    await api(`/api/users/${id}/activate`, { method: 'PATCH' });
    renderUsers();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteUserPermanently(id, name) {
  if (!confirm(`Permanently delete "${name}"? This cannot be undone!`)) return;
  try {
    await api(`/api/users/${id}/permanent`, { method: 'DELETE' });
    renderUsers();
  } catch (e) {
    alert(e.message);
  }
}

async function renderMeetings() {
  const content = document.getElementById('main-content');
  try {
    const data = await api('/api/zoom');
    const canCreate = ['manager', 'lecturer', 'admin', 'superadmin'].includes(currentUser.role);
    const canManage = canCreate;

    const statusStyle = (s) => {
      const map = { scheduled: 'background:#3b82f6;color:#fff;', active: 'background:#22c55e;color:#fff;', completed: 'background:#6b7280;color:#fff;', cancelled: 'background:#ef4444;color:#fff;' };
      return map[s] || '';
    };

    content.innerHTML = `
      <div class="page-header"><h2>Meetings</h2><p>Jitsi video meetings for your organization</p></div>
      ${canCreate ? '<div class="actions-bar"><button class="btn btn-primary btn-sm" onclick="showCreateMeetingModal()">Schedule Meeting</button></div>' : ''}
      <div class="card">
        ${data.meetings.length ? `
          <table>
            <thead><tr><th>Title</th><th>Host</th><th>Scheduled</th><th>Duration</th><th>Attendees</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>${data.meetings.map(m => {
              const isCreator = m.createdBy?._id === currentUser._id;
              const isAdmin = ['admin', 'superadmin'].includes(currentUser.role);
              const canControl = canManage && (isCreator || isAdmin);
              return `<tr>
                <td><strong>${m.title}</strong>${m.course ? `<div style="font-size:0.85em;color:#6b7280;">${m.course.code || m.course.title}</div>` : ''}</td>
                <td>${m.createdBy?.name || 'Unknown'}</td>
                <td style="font-size:0.85em;">${new Date(m.scheduledStart).toLocaleString()}<br><span style="color:#6b7280;">to ${new Date(m.scheduledEnd).toLocaleString()}</span></td>
                <td>${m.duration} min</td>
                <td>${m.attendees?.length || 0}</td>
                <td><span class="status-badge" style="${statusStyle(m.status)}">${m.status.charAt(0).toUpperCase() + m.status.slice(1)}</span></td>
                <td style="white-space:nowrap;">
                  ${m.status === 'active' || m.status === 'scheduled' ? `<button class="btn btn-success btn-sm" onclick="joinMeeting('${m._id}', '${m.joinUrl}')">Join</button>` : ''}
                  ${canControl && m.status === 'scheduled' ? `<button class="btn btn-primary btn-sm" onclick="startMeeting('${m._id}')" style="margin-left:4px;">Start</button>` : ''}
                  ${canControl && m.status === 'active' ? `<button class="btn btn-danger btn-sm" onclick="endMeeting('${m._id}')" style="margin-left:4px;">End</button>` : ''}
                  ${canControl && (m.status === 'scheduled' || m.status === 'active') ? `<button class="btn btn-secondary btn-sm" onclick="cancelMeeting('${m._id}')" style="margin-left:4px;">Cancel</button>` : ''}
                  <button class="btn btn-secondary btn-sm" onclick="viewMeetingDetail('${m._id}')" style="margin-left:4px;">Details</button>
                </td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No meetings scheduled yet.</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

function showCreateMeetingModal() {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:500px;">
        <h3>Schedule Jitsi Meeting</h3>
        <div class="form-group">
          <label>Title *</label>
          <input type="text" id="meeting-title" placeholder="Meeting title" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        </div>
        <div class="form-group">
          <label>Start Time *</label>
          <input type="datetime-local" id="meeting-start" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        </div>
        <div class="form-group">
          <label>End Time *</label>
          <input type="datetime-local" id="meeting-end" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        </div>
        <div id="meeting-error" style="color:#ef4444;margin:8px 0;display:none;"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="createMeeting()">Schedule Meeting</button>
        </div>
      </div>
    </div>
  `;
}

async function createMeeting() {
  const title = document.getElementById('meeting-title').value.trim();
  const start = document.getElementById('meeting-start').value;
  const end = document.getElementById('meeting-end').value;
  const errEl = document.getElementById('meeting-error');

  if (!title || !start || !end) {
    errEl.textContent = 'Please fill in all required fields.';
    errEl.style.display = 'block';
    return;
  }

  try {
    await api('/api/zoom', { method: 'POST', body: JSON.stringify({
      title,
      scheduledStart: start,
      scheduledEnd: end,
    }) });
    closeModal();
    renderMeetings();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

async function startMeeting(id) {
  try {
    const data = await api(`/api/zoom/${id}/start`, { method: 'POST' });
    window.open(data.joinUrl, '_blank');
    renderMeetings();
  } catch (e) {
    alert(e.message);
  }
}

function joinMeeting(id, joinUrl) {
  const w = window.open('', '_blank');
  api(`/api/zoom/${id}/join`, { method: 'POST' }).then((data) => {
    const url = data.joinUrl || joinUrl;
    w.location.href = url;
    setTimeout(() => renderMeetings(), 1000);
  }).catch((e) => {
    w.close();
    alert(e.message || 'Failed to join meeting');
  });
}

async function endMeeting(id) {
  if (!confirm('End this meeting? All participants will be marked as left.')) return;
  try {
    await api(`/api/zoom/${id}/end`, { method: 'POST' });
    renderMeetings();
  } catch (e) {
    alert(e.message);
  }
}

async function cancelMeeting(id) {
  if (!confirm('Cancel this meeting?')) return;
  try {
    await api(`/api/zoom/${id}/cancel`, { method: 'POST' });
    renderMeetings();
  } catch (e) {
    alert(e.message);
  }
}

async function viewMeetingDetail(id) {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="card"><p>Loading meeting details...</p></div>';
  try {
    const data = await api(`/api/zoom/${id}`);
    const m = data.meeting;
    const isCreator = m.createdBy?._id === currentUser._id;
    const isAdmin = ['admin', 'superadmin'].includes(currentUser.role);
    const canManage = ['manager', 'lecturer', 'admin', 'superadmin'].includes(currentUser.role) && (isCreator || isAdmin);

    const statusStyle = (s) => {
      const map = { scheduled: 'background:#3b82f6;color:#fff;', active: 'background:#22c55e;color:#fff;', completed: 'background:#6b7280;color:#fff;', cancelled: 'background:#ef4444;color:#fff;' };
      return map[s] || '';
    };

    content.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;">
        <div>
          <h2>${m.title}</h2>
          <p>Hosted by ${m.createdBy?.name || 'Unknown'} <span class="status-badge" style="${statusStyle(m.status)}">${m.status.charAt(0).toUpperCase() + m.status.slice(1)}</span></p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="renderMeetings()">Back to Meetings</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">
        <div class="card">
          <div class="card-title">Meeting Info</div>
          <p><strong>Start:</strong> ${new Date(m.scheduledStart).toLocaleString()}</p>
          <p><strong>End:</strong> ${new Date(m.scheduledEnd).toLocaleString()}</p>
          <p><strong>Duration:</strong> ${m.duration} minutes</p>
          ${m.course ? `<p><strong>Course:</strong> ${m.course.code} - ${m.course.title}</p>` : ''}
          <p><strong>Join Link:</strong> <a href="${m.joinUrl}" target="_blank" style="color:#3b82f6;word-break:break-all;">${m.joinUrl}</a></p>
          <div style="margin-top:12px;">
            ${m.status === 'active' || m.status === 'scheduled' ? `<button class="btn btn-success btn-sm" onclick="joinMeeting('${m._id}', '${m.joinUrl}')">Join Meeting</button>` : ''}
            ${canManage && m.status === 'active' ? `<button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="endMeeting('${m._id}')">End Meeting</button>` : ''}
          </div>
        </div>
        <div class="card">
          <div class="card-title">Attendees (${m.attendees?.length || 0})</div>
          ${m.attendees && m.attendees.length ? `
            <table>
              <thead><tr><th>Name</th><th>Index No.</th><th>Role</th><th>Joined At</th><th>Status</th></tr></thead>
              <tbody>${m.attendees.map(a => `
                <tr>
                  <td>${a.user?.name || 'Unknown'}</td>
                  <td>${a.user?.indexNumber || '—'}</td>
                  <td>${a.user?.role || '—'}</td>
                  <td style="font-size:0.85em;">${a.joinedAt ? new Date(a.joinedAt).toLocaleString() : '—'}</td>
                  <td><span class="status-badge" style="${a.status === 'joined' ? 'background:#22c55e;color:#fff;' : a.status === 'late' ? 'background:#f59e0b;color:#fff;' : 'background:#ef4444;color:#fff;'}">${a.status}</span></td>
                </tr>
              `).join('')}</tbody>
            </table>
          ` : '<p style="color:#6b7280;">No one has joined yet.</p>'}
        </div>
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p><button class="btn btn-secondary" onclick="renderMeetings()">Back</button></div>`;
  }
}

async function renderCourses() {
  const content = document.getElementById('main-content');
  try {
    const data = await api('/api/courses');
    const canCreate = ['lecturer', 'admin', 'superadmin'].includes(currentUser.role);
    const canManageRoster = ['lecturer', 'admin', 'superadmin'].includes(currentUser.role);
    content.innerHTML = `
      <div class="page-header"><h2>Courses</h2><p>Manage academic courses</p></div>
      ${canCreate ? '<div class="actions-bar"><button class="btn btn-primary btn-sm" onclick="showCreateCourseModal()">Create Course</button></div>' : ''}
      <div class="card">
        ${data.courses.length ? `
          <table>
            <thead><tr><th>Code</th><th>Title</th><th>Lecturer</th><th>Roster</th><th>Enrolled</th>${canManageRoster ? '<th>Actions</th>' : ''}</tr></thead>
            <tbody>${data.courses.map(c => `
              <tr>
                <td><strong>${c.code}</strong></td>
                <td>${c.title}</td>
                <td>${c.lecturer?.name || 'N/A'}</td>
                <td><button class="btn btn-sm" style="font-size:11px;background:var(--bg);border:1px solid var(--border)" onclick="viewRoster('${c._id}', '${c.code}')">View Roster</button></td>
                <td>${c.enrolledStudents?.length || 0}</td>
                ${canManageRoster ? `<td style="white-space:nowrap">
                  <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="showUploadRosterModal('${c._id}', '${c.code}')">Upload Students</button>
                </td>` : ''}
              </tr>
            `).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No courses found</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

function showCreateCourseModal() {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>Create Course</h3>
        <div class="form-group">
          <label>Course Code</label>
          <input type="text" id="course-code" placeholder="e.g., CS101">
        </div>
        <div class="form-group">
          <label>Course Title</label>
          <input type="text" id="course-title" placeholder="Introduction to Computer Science">
        </div>
        <div class="form-group">
          <label>Description</label>
          <input type="text" id="course-desc" placeholder="Optional description">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="createCourse()">Create</button>
        </div>
      </div>
    </div>
  `;
}

async function createCourse() {
  try {
    await api('/api/courses', {
      method: 'POST',
      body: JSON.stringify({
        code: document.getElementById('course-code').value,
        title: document.getElementById('course-title').value,
        description: document.getElementById('course-desc').value,
      }),
    });
    closeModal();
    renderCourses();
  } catch (e) {
    alert(e.message);
  }
}

function showUploadRosterModal(courseId, courseCode) {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:500px">
        <h3>Upload Student List - ${courseCode}</h3>
        <p style="font-size:13px;color:var(--text-light);margin-bottom:16px">Add student IDs so students can register. Enter one student per line: <strong>StudentID, Full Name</strong></p>
        <div class="form-group">
          <label>Student List</label>
          <textarea id="roster-text" rows="10" placeholder="STU001, John Doe&#10;STU002, Jane Smith&#10;STU003, Alex Johnson" style="width:100%;font-family:monospace;font-size:13px;resize:vertical"></textarea>
        </div>
        <p style="font-size:12px;color:var(--text-light);margin-bottom:12px">Each line should have: StudentID, Name (name is optional)</p>
        <div id="roster-upload-status" style="display:none;padding:10px;border-radius:8px;margin-bottom:12px;font-size:13px"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" id="roster-upload-btn" onclick="uploadRoster('${courseId}')">Upload Students</button>
        </div>
      </div>
    </div>
  `;
}

async function uploadRoster(courseId) {
  const text = document.getElementById('roster-text').value.trim();
  if (!text) return alert('Please enter at least one student');

  const lines = text.split('\\n').filter(l => l.trim());
  const students = lines.map(line => {
    const parts = line.split(',').map(p => p.trim());
    return { studentId: parts[0], name: parts[1] || '' };
  });

  const invalid = students.filter(s => !s.studentId);
  if (invalid.length > 0) return alert('Some lines are missing a Student ID');

  const btn = document.getElementById('roster-upload-btn');
  btn.disabled = true;
  btn.textContent = 'Uploading...';

  try {
    const data = await api(`/api/roster/${courseId}/upload`, {
      method: 'POST',
      body: JSON.stringify({ students }),
    });
    const statusEl = document.getElementById('roster-upload-status');
    statusEl.style.display = 'block';
    statusEl.style.background = '#f0fdf4';
    statusEl.style.color = '#15803d';
    statusEl.textContent = data.message;
    btn.textContent = 'Upload Students';
    btn.disabled = false;
    document.getElementById('roster-text').value = '';
  } catch (e) {
    alert(e.message);
    btn.textContent = 'Upload Students';
    btn.disabled = false;
  }
}

async function viewRoster(courseId, courseCode) {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:600px">
        <h3>Student Roster - ${courseCode}</h3>
        <div id="roster-content" style="text-align:center;padding:20px"><p>Loading...</p></div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">Close</button>
        </div>
      </div>
    </div>
  `;

  try {
    const data = await api(`/api/roster/${courseId}`);
    const rosterEl = document.getElementById('roster-content');
    const canDelete = ['lecturer', 'admin', 'superadmin'].includes(currentUser.role);

    if (data.roster.length === 0) {
      rosterEl.innerHTML = '<div class="empty-state"><p>No students in roster yet. Upload a student list first.</p></div>';
      return;
    }

    const registered = data.roster.filter(r => r.registered).length;
    const pending = data.roster.length - registered;

    rosterEl.innerHTML = `
      <div style="display:flex;gap:12px;margin-bottom:16px">
        <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:20px;font-weight:700;color:#16a34a">${registered}</div>
          <div style="font-size:11px;color:#15803d">Registered</div>
        </div>
        <div style="flex:1;background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:20px;font-weight:700;color:#a16207">${pending}</div>
          <div style="font-size:11px;color:#a16207">Pending</div>
        </div>
      </div>
      <table style="font-size:13px">
        <thead><tr><th>Student ID</th><th>Name</th><th>Status</th>${canDelete ? '<th></th>' : ''}</tr></thead>
        <tbody>${data.roster.map(r => `
          <tr>
            <td style="font-family:monospace;font-weight:600">${r.studentId}</td>
            <td>${r.name || '-'}</td>
            <td><span class="status-badge ${r.registered ? 'status-active' : 'status-stopped'}">${r.registered ? 'Registered' : 'Pending'}</span></td>
            ${canDelete ? `<td><button class="btn btn-danger btn-sm" style="font-size:10px;padding:2px 8px" onclick="removeRosterEntry('${courseId}', '${r._id}', '${courseCode}')">Remove</button></td>` : ''}
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  } catch (e) {
    document.getElementById('roster-content').innerHTML = `<p style="color:var(--danger)">Error: ${e.message}</p>`;
  }
}

async function removeRosterEntry(courseId, rosterId, courseCode) {
  if (!window.confirm('Remove this student from the roster?')) return;
  try {
    await api(`/api/roster/${courseId}/entries/${rosterId}`, { method: 'DELETE' });
    viewRoster(courseId, courseCode);
  } catch (e) {
    alert(e.message);
  }
}

let quizTimerInterval = null;

async function renderQuizzes() {
  const content = document.getElementById('main-content');
  const role = currentUser.role;
  if (role === 'lecturer') {
    await renderLecturerQuizzes(content);
  } else if (role === 'student') {
    await renderStudentQuizzes(content);
  } else if (role === 'admin' || role === 'superadmin') {
    await renderAdminQuizzes(content);
  } else {
    content.innerHTML = '<div class="card"><p>Quizzes are not available for your role.</p></div>';
  }
}

function quizStatusBadge(q) {
  const now = new Date();
  const start = new Date(q.startTime);
  const end = new Date(q.endTime);
  if (now < start) return '<span class="status-badge" style="background:#6b7280;color:#fff;">Upcoming</span>';
  if (now > end) return '<span class="status-badge" style="background:#ef4444;color:#fff;">Closed</span>';
  return '<span class="status-badge" style="background:#22c55e;color:#fff;">Open</span>';
}

function closeQuizModal() {
  const mc = document.getElementById('modal-container');
  if (mc) { mc.classList.add('hidden'); mc.innerHTML = ''; }
}

async function renderLecturerQuizzes(content) {
  try {
    const data = await api('/api/lecturer/quizzes');
    content.innerHTML = `
      <div class="page-header"><h2>Quizzes</h2><p>Manage your quizzes and assessments</p></div>
      <div class="actions-bar"><button class="btn btn-primary btn-sm" onclick="showCreateQuizModal()">Create Quiz</button></div>
      <div class="card">
        ${data.quizzes.length ? `
          <table>
            <thead><tr><th>Title</th><th>Course</th><th>Questions</th><th>Submissions</th><th>Time Range</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>${data.quizzes.map(q => `
              <tr>
                <td><strong>${q.title}</strong></td>
                <td>${q.course?.code || 'N/A'}</td>
                <td>${q.questionCount || 0}</td>
                <td>${q.attemptCount || 0}</td>
                <td style="font-size:0.85em;">${new Date(q.startTime).toLocaleString()} — ${new Date(q.endTime).toLocaleString()}</td>
                <td>${quizStatusBadge(q)}</td>
                <td style="white-space:nowrap;">
                  <button class="btn btn-sm btn-secondary" onclick="viewLecturerQuizDetail('${q._id}')">Details</button>
                  <button class="btn btn-sm btn-primary" onclick="showAddQuestionsView('${q._id}')">Questions</button>
                  <button class="btn btn-sm btn-success" onclick="viewQuizResults('${q._id}')">Results</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteLecturerQuiz('${q._id}')">Delete</button>
                </td>
              </tr>
            `).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No quizzes found. Create your first quiz!</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

async function showCreateQuizModal() {
  const mc = document.getElementById('modal-container');
  mc.classList.remove('hidden');
  mc.innerHTML = '<div class="modal-overlay"><div class="modal"><p>Loading courses...</p></div></div>';
  try {
    const coursesData = await api('/api/courses');
    const courses = coursesData.courses || [];
    mc.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)closeQuizModal()">
        <div class="modal" style="max-width:500px;">
          <h3>Create Quiz</h3>
          <div class="form-group"><label>Title *</label><input type="text" id="cq-title" placeholder="Quiz title" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
          <div class="form-group"><label>Description</label><textarea id="cq-desc" placeholder="Optional description" rows="2" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></textarea></div>
          <div class="form-group"><label>Course *</label><select id="cq-course" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
            <option value="">Select a course</option>
            ${courses.map(c => `<option value="${c._id}">${c.code} - ${c.title}</option>`).join('')}
          </select></div>
          <div class="form-group"><label>Time Limit (minutes)</label><input type="number" id="cq-timelimit" value="30" min="1" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
          <div class="form-group"><label>Start Time *</label><input type="datetime-local" id="cq-start" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
          <div class="form-group"><label>End Time *</label><input type="datetime-local" id="cq-end" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
          <div id="cq-error" style="color:#ef4444;margin:8px 0;display:none;"></div>
          <div class="modal-actions">
            <button class="btn btn-secondary" onclick="closeQuizModal()">Cancel</button>
            <button class="btn btn-primary" onclick="submitCreateQuiz()">Create Quiz</button>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    mc.innerHTML = `<div class="modal-overlay" onclick="if(event.target===this)closeQuizModal()"><div class="modal"><p>Error loading courses: ${e.message}</p><div class="modal-actions"><button class="btn btn-secondary" onclick="closeQuizModal()">Close</button></div></div></div>`;
  }
}

async function submitCreateQuiz() {
  const title = document.getElementById('cq-title').value.trim();
  const description = document.getElementById('cq-desc').value.trim();
  const courseId = document.getElementById('cq-course').value;
  const timeLimit = parseInt(document.getElementById('cq-timelimit').value) || 30;
  const startTime = document.getElementById('cq-start').value;
  const endTime = document.getElementById('cq-end').value;
  const errEl = document.getElementById('cq-error');

  if (!title || !courseId || !startTime || !endTime) {
    errEl.textContent = 'Please fill in all required fields.';
    errEl.style.display = 'block';
    return;
  }
  try {
    const data = await api('/api/lecturer/quizzes', {
      method: 'POST',
      body: JSON.stringify({ title, description, courseId, timeLimit, startTime: new Date(startTime).toISOString(), endTime: new Date(endTime).toISOString() })
    });
    closeQuizModal();
    showAddQuestionsView(data.quiz._id);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

async function showAddQuestionsView(quizId) {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="card"><p>Loading quiz...</p></div>';
  try {
    const data = await api(`/api/lecturer/quizzes/${quizId}`);
    const quiz = data.quiz;
    const questions = quiz.questions || [];

    content.innerHTML = `
      <div class="page-header">
        <h2>Questions: ${quiz.title}</h2>
        <p>${quiz.course?.code || ''} — ${quiz.course?.title || ''} | Total Marks: <span id="aq-total-marks">${quiz.totalMarks || 0}</span></p>
      </div>
      <div class="actions-bar"><button class="btn btn-secondary btn-sm" onclick="renderQuizzes()">← Back to Quizzes</button></div>
      <div class="card" style="margin-bottom:16px;">
        <h3>Add New Question</h3>
        <div class="form-group"><label>Question Text *</label><textarea id="aq-text" rows="3" placeholder="Enter question text" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <div class="form-group"><label>Option A *</label><input type="text" id="aq-opt-0" placeholder="Option A" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
          <div class="form-group"><label>Option B *</label><input type="text" id="aq-opt-1" placeholder="Option B" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
          <div class="form-group"><label>Option C</label><input type="text" id="aq-opt-2" placeholder="Option C" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
          <div class="form-group"><label>Option D</label><input type="text" id="aq-opt-3" placeholder="Option D" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
        </div>
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
          <div class="form-group"><label>Correct Answer *</label><div style="display:flex;gap:12px;">
            <label><input type="radio" name="aq-correct" value="0"> A</label>
            <label><input type="radio" name="aq-correct" value="1"> B</label>
            <label><input type="radio" name="aq-correct" value="2"> C</label>
            <label><input type="radio" name="aq-correct" value="3"> D</label>
          </div></div>
          <div class="form-group"><label>Marks</label><input type="number" id="aq-marks" value="1" min="1" style="width:80px;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
        </div>
        <div id="aq-error" style="color:#ef4444;margin:8px 0;display:none;"></div>
        <button class="btn btn-primary" onclick="submitAddQuestion('${quizId}')">Add Question</button>
      </div>
      <div class="card">
        <h3>Existing Questions (${questions.length})</h3>
        <div id="aq-questions-list">
          ${questions.length ? questions.map((q, i) => `
            <div style="padding:12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div>
                  <strong>Q${i + 1}.</strong> ${q.questionText}
                  <div style="margin-top:4px;font-size:0.9em;color:#6b7280;">
                    ${q.options.map((o, oi) => `<span style="margin-right:12px;${oi === q.correctAnswer ? 'color:#22c55e;font-weight:bold;' : ''}">${String.fromCharCode(65 + oi)}) ${o}</span>`).join('')}
                  </div>
                  <div style="font-size:0.85em;color:#9ca3af;margin-top:2px;">Marks: ${q.marks}</div>
                </div>
                <button class="btn btn-sm btn-danger" onclick="deleteQuizQuestion('${quizId}','${q._id}')">Delete</button>
              </div>
            </div>
          `).join('') : '<p style="color:#9ca3af;">No questions added yet.</p>'}
        </div>
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

async function submitAddQuestion(quizId) {
  const questionText = document.getElementById('aq-text').value.trim();
  const options = [
    document.getElementById('aq-opt-0').value.trim(),
    document.getElementById('aq-opt-1').value.trim(),
    document.getElementById('aq-opt-2').value.trim(),
    document.getElementById('aq-opt-3').value.trim()
  ].filter(o => o);
  const correctRadio = document.querySelector('input[name="aq-correct"]:checked');
  const marks = parseInt(document.getElementById('aq-marks').value) || 1;
  const errEl = document.getElementById('aq-error');

  if (!questionText) { errEl.textContent = 'Question text is required.'; errEl.style.display = 'block'; return; }
  if (options.length < 2) { errEl.textContent = 'At least 2 options are required.'; errEl.style.display = 'block'; return; }
  if (!correctRadio) { errEl.textContent = 'Please select the correct answer.'; errEl.style.display = 'block'; return; }

  const correctAnswer = parseInt(correctRadio.value);
  if (correctAnswer >= options.length) { errEl.textContent = 'Correct answer must match a filled option.'; errEl.style.display = 'block'; return; }

  try {
    await api(`/api/lecturer/quizzes/${quizId}/questions`, {
      method: 'POST',
      body: JSON.stringify({ questionText, options, correctAnswer, marks })
    });
    showAddQuestionsView(quizId);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

async function deleteQuizQuestion(quizId, questionId) {
  if (!confirm('Delete this question?')) return;
  try {
    await api(`/api/lecturer/quizzes/${quizId}/questions/${questionId}`, { method: 'DELETE' });
    showAddQuestionsView(quizId);
  } catch (e) {
    alert(e.message);
  }
}

async function viewLecturerQuizDetail(quizId) {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="card"><p>Loading...</p></div>';
  try {
    const data = await api(`/api/lecturer/quizzes/${quizId}`);
    const q = data.quiz;
    const questions = q.questions || [];
    const attempts = data.attempts || [];
    content.innerHTML = `
      <div class="page-header"><h2>${q.title}</h2><p>${q.description || 'No description'}</p></div>
      <div class="actions-bar"><button class="btn btn-secondary btn-sm" onclick="renderQuizzes()">← Back</button></div>
      <div class="card" style="margin-bottom:16px;">
        <h3>Quiz Details</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:8px;">
          <div><strong>Course:</strong> ${q.course?.code || 'N/A'} — ${q.course?.title || ''}</div>
          <div><strong>Time Limit:</strong> ${q.timeLimit || 30} min</div>
          <div><strong>Total Marks:</strong> ${q.totalMarks || 0}</div>
          <div><strong>Questions:</strong> ${questions.length}</div>
          <div><strong>Submissions:</strong> ${attempts.length}</div>
          <div><strong>Start:</strong> ${new Date(q.startTime).toLocaleString()}</div>
          <div><strong>End:</strong> ${new Date(q.endTime).toLocaleString()}</div>
          <div><strong>Status:</strong> ${quizStatusBadge(q)}</div>
        </div>
      </div>
      <div class="card">
        <h3>Questions (${questions.length})</h3>
        ${questions.length ? questions.map((qn, i) => `
          <div style="padding:10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;">
            <strong>Q${i + 1}.</strong> ${qn.questionText} <span style="color:#9ca3af;">(${qn.marks} marks)</span>
            <div style="margin-top:4px;font-size:0.9em;">
              ${qn.options.map((o, oi) => `<span style="margin-right:10px;${oi === qn.correctAnswer ? 'color:#22c55e;font-weight:bold;' : ''}">${String.fromCharCode(65 + oi)}) ${o}</span>`).join('')}
            </div>
          </div>
        `).join('') : '<p style="color:#9ca3af;">No questions.</p>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

async function viewQuizResults(quizId) {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="card"><p>Loading results...</p></div>';
  try {
    const data = await api(`/api/lecturer/quizzes/${quizId}/results`);
    const quiz = data.quiz;
    const stats = data.stats;
    const attempts = data.attempts || [];
    content.innerHTML = `
      <div class="page-header"><h2>Results: ${quiz.title}</h2><p>${quiz.course?.code || ''} — ${quiz.course?.title || ''}</p></div>
      <div class="actions-bar"><button class="btn btn-secondary btn-sm" onclick="renderQuizzes()">← Back</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px;">
        <div class="card" style="text-align:center;"><div style="font-size:1.8em;font-weight:bold;color:#3b82f6;">${stats.submitted}</div><div style="color:#6b7280;font-size:0.9em;">Submitted</div></div>
        <div class="card" style="text-align:center;"><div style="font-size:1.8em;font-weight:bold;color:#22c55e;">${stats.averageScore}</div><div style="color:#6b7280;font-size:0.9em;">Avg Score</div></div>
        <div class="card" style="text-align:center;"><div style="font-size:1.8em;font-weight:bold;color:#f59e0b;">${stats.passRate}%</div><div style="color:#6b7280;font-size:0.9em;">Pass Rate</div></div>
        <div class="card" style="text-align:center;"><div style="font-size:1.8em;font-weight:bold;color:#8b5cf6;">${stats.highestScore}/${quiz.totalMarks || 0}</div><div style="color:#6b7280;font-size:0.9em;">Highest</div></div>
      </div>
      <div class="card">
        <h3>Student Submissions</h3>
        ${attempts.length ? `
          <table>
            <thead><tr><th>Student</th><th>ID</th><th>Score</th><th>Percentage</th><th>Submitted At</th></tr></thead>
            <tbody>${attempts.map(a => {
              const pct = a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0;
              return `<tr>
                <td>${a.student?.name || 'Unknown'}</td>
                <td>${a.student?.indexNumber || a.student?.email || 'N/A'}</td>
                <td>${a.score}/${a.maxScore}</td>
                <td><span style="color:${pct >= 50 ? '#22c55e' : '#ef4444'};font-weight:bold;">${pct}%</span></td>
                <td>${a.submittedAt ? new Date(a.submittedAt).toLocaleString() : 'N/A'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No submissions yet.</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

async function deleteLecturerQuiz(quizId) {
  if (!confirm('Are you sure you want to delete this quiz? All questions and submissions will be removed.')) return;
  try {
    await api(`/api/lecturer/quizzes/${quizId}`, { method: 'DELETE' });
    renderQuizzes();
  } catch (e) {
    alert(e.message);
  }
}

async function renderStudentQuizzes(content, showAll) {
  try {
    const url = showAll ? '/api/student/quizzes?showAll=true' : '/api/student/quizzes';
    const data = await api(url);
    const quizzes = data.quizzes || [];
    content.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;">
        <div><h2>Quizzes</h2><p>Your available quizzes and assessments</p></div>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9em;">
          <input type="checkbox" ${showAll ? 'checked' : ''} onchange="renderStudentQuizzes(document.getElementById('main-content'), this.checked)">
          Show past & upcoming
        </label>
      </div>
      <div class="card">
        ${quizzes.length ? `
          <table>
            <thead><tr><th>Title</th><th>Course</th><th>Questions</th><th>Time Limit</th><th>Start Time</th><th>End Time</th><th>Status</th><th>Score</th><th>Actions</th></tr></thead>
            <tbody>${quizzes.map(q => {
              const statusColors = { upcoming: 'background:#6b7280;color:#fff;', open: 'background:#22c55e;color:#fff;', closed: 'background:#ef4444;color:#fff;' };
              const statusLabel = q.status ? q.status.charAt(0).toUpperCase() + q.status.slice(1) : 'Unknown';
              return `<tr>
                <td><strong>${q.title}</strong>${q.description ? `<div style="font-size:0.85em;color:#6b7280;">${q.description}</div>` : ''}</td>
                <td>${q.course?.code || 'N/A'}</td>
                <td>${q.questionCount || 0}</td>
                <td>${q.timeLimit || 30} min</td>
                <td style="font-size:0.85em;">${new Date(q.startTime).toLocaleString()}</td>
                <td style="font-size:0.85em;">${new Date(q.endTime).toLocaleString()}</td>
                <td><span class="status-badge" style="${statusColors[q.status] || ''}">${statusLabel}</span></td>
                <td>${q.isSubmitted ? `<strong style="color:#3b82f6;">${q.myScore}/${q.myMaxScore}</strong>` : '—'}</td>
                <td style="white-space:nowrap;">
                  ${q.canAttempt ? `<button class="btn btn-sm btn-primary" onclick="startStudentQuiz('${q._id}')">Take Quiz</button>` : ''}
                  ${q.isSubmitted ? `<button class="btn btn-sm btn-secondary" onclick="viewStudentResult('${q._id}')">View Result</button>` : ''}
                </td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No quizzes available at the moment.</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

async function startStudentQuiz(quizId) {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="card"><p>Loading quiz...</p></div>';
  if (quizTimerInterval) { clearInterval(quizTimerInterval); quizTimerInterval = null; }

  try {
    const data = await api(`/api/student/quizzes/${quizId}/start`, { method: 'POST' });
    const questions = data.questions || [];
    const timeLimit = data.timeLimit || 30;
    const attempt = data.attempt;
    const startedAt = new Date(attempt.startedAt);
    const endTime = new Date(startedAt.getTime() + timeLimit * 60 * 1000);

    content.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;">
        <div><h2>Quiz in Progress</h2><p>${questions.length} questions — ${timeLimit} minutes</p></div>
        <div id="quiz-timer" style="font-size:1.4em;font-weight:bold;color:#ef4444;background:#fef2f2;padding:8px 16px;border-radius:8px;"></div>
      </div>
      <div id="quiz-questions">
        ${questions.map((q, i) => `
          <div class="card" style="margin-bottom:12px;">
            <h4>Question ${i + 1} of ${questions.length} <span style="color:#9ca3af;font-weight:normal;font-size:0.85em;">(${q.marks || 1} marks)</span></h4>
            <p style="margin:8px 0;">${q.questionText}</p>
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${q.options.map((opt, oi) => `
                <label style="display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background=''">
                  <input type="radio" name="sq-${q._id}" value="${oi}" style="accent-color:#3b82f6;">
                  <span><strong>${String.fromCharCode(65 + oi)}.</strong> ${opt}</span>
                </label>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
      <div style="text-align:center;margin:16px 0;">
        <button class="btn btn-primary" style="padding:12px 32px;font-size:1.1em;" onclick="submitStudentQuiz('${quizId}')">Submit Quiz</button>
        <button class="btn btn-secondary" style="margin-left:8px;" onclick="if(confirm('Go back? Your progress will be lost.'))renderQuizzes()">Cancel</button>
      </div>
    `;

    window._quizQuestions = questions;

    function updateTimer() {
      const now = new Date();
      const remaining = Math.max(0, endTime - now);
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      const timerEl = document.getElementById('quiz-timer');
      if (timerEl) {
        timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')} remaining`;
        if (remaining <= 60000) timerEl.style.color = '#dc2626';
      }
      if (remaining <= 0) {
        clearInterval(quizTimerInterval);
        quizTimerInterval = null;
        submitStudentQuiz(quizId);
      }
    }
    updateTimer();
    quizTimerInterval = setInterval(updateTimer, 1000);

    window._quizTabHandler = function() {
      if (document.hidden && window._quizQuestions && window._quizQuestions.length > 0 && !window._quizSubmitting) {
        window._quizSubmitting = true;
        submitStudentQuiz(quizId);
      }
    };
    document.addEventListener('visibilitychange', window._quizTabHandler);

  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p><button class="btn btn-secondary" onclick="renderQuizzes()">← Back</button></div>`;
  }
}

async function submitStudentQuiz(quizId) {
  if (window._quizTabHandler) {
    document.removeEventListener('visibilitychange', window._quizTabHandler);
    window._quizTabHandler = null;
  }
  window._quizSubmitting = false;
  if (quizTimerInterval) { clearInterval(quizTimerInterval); quizTimerInterval = null; }
  const questions = window._quizQuestions || [];
  const answers = questions.map(q => {
    const selected = document.querySelector(`input[name="sq-${q._id}"]:checked`);
    return { questionId: q._id, selectedAnswer: selected ? parseInt(selected.value) : -1 };
  });

  const content = document.getElementById('main-content');
  try {
    const data = await api(`/api/student/quizzes/${quizId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers })
    });
    const pct = data.percentage || 0;
    content.innerHTML = `
      <div style="max-width:500px;margin:40px auto;text-align:center;">
        <div class="card">
          <div style="font-size:3em;margin-bottom:8px;">${pct >= 50 ? '🎉' : '📝'}</div>
          <h2>Quiz Submitted!</h2>
          <div style="font-size:2.5em;font-weight:bold;color:${pct >= 50 ? '#22c55e' : '#ef4444'};margin:16px 0;">${pct}%</div>
          <p style="font-size:1.1em;color:#6b7280;">Score: ${data.score} / ${data.maxScore}</p>
          <div style="margin-top:20px;">
            <button class="btn btn-primary" onclick="viewStudentResult('${quizId}')">View Detailed Result</button>
            <button class="btn btn-secondary" style="margin-left:8px;" onclick="renderQuizzes()">Back to Quizzes</button>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error submitting quiz: ${e.message}</p><button class="btn btn-secondary" onclick="renderQuizzes()">← Back</button></div>`;
  }
}

async function viewStudentResult(quizId) {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="card"><p>Loading result...</p></div>';
  try {
    const data = await api(`/api/student/quizzes/${quizId}/result`);
    const attempt = data.attempt;
    const answers = data.answers || [];
    const pct = attempt.maxScore > 0 ? Math.round((attempt.score / attempt.maxScore) * 100) : 0;

    content.innerHTML = `
      <div class="page-header">
        <h2>Quiz Result: ${attempt.quiz?.title || 'Quiz'}</h2>
        <p>Score: <strong style="color:${pct >= 50 ? '#22c55e' : '#ef4444'};">${attempt.score}/${attempt.maxScore} (${pct}%)</strong></p>
      </div>
      <div class="actions-bar"><button class="btn btn-secondary btn-sm" onclick="renderQuizzes()">← Back to Quizzes</button></div>
      <div id="result-questions">
        ${answers.map((a, i) => {
          const q = a.question;
          if (!q) return '';
          return `
            <div class="card" style="margin-bottom:12px;border-left:4px solid ${a.isCorrect ? '#22c55e' : '#ef4444'};">
              <h4>Question ${i + 1} <span style="color:#9ca3af;font-weight:normal;font-size:0.85em;">(${q.marks || 1} marks)</span></h4>
              <p style="margin:8px 0;">${q.questionText}</p>
              <div style="display:flex;flex-direction:column;gap:6px;">
                ${q.options.map((opt, oi) => {
                  let style = 'padding:8px 12px;border-radius:6px;border:1px solid #e5e7eb;';
                  if (oi === q.correctAnswer) style += 'background:#f0fdf4;border-color:#22c55e;color:#15803d;';
                  if (oi === a.selectedAnswer && !a.isCorrect) style += 'background:#fef2f2;border-color:#ef4444;color:#dc2626;';
                  return `<div style="${style}">
                    <strong>${String.fromCharCode(65 + oi)}.</strong> ${opt}
                    ${oi === q.correctAnswer ? ' ✓ Correct' : ''}
                    ${oi === a.selectedAnswer && oi !== q.correctAnswer ? ' ✗ Your answer' : ''}
                    ${oi === a.selectedAnswer && oi === q.correctAnswer ? ' ✓ Your answer' : ''}
                  </div>`;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p><button class="btn btn-secondary" onclick="renderQuizzes()">← Back</button></div>`;
  }
}

async function renderAdminQuizzes(content) {
  try {
    const data = await api('/api/admin/quizzes');
    const quizzes = data.quizzes || [];
    content.innerHTML = `
      <div class="page-header"><h2>All Quizzes</h2><p>Overview of quizzes across all lecturers</p></div>
      <div class="card">
        ${quizzes.length ? `
          <table>
            <thead><tr><th>Title</th><th>Lecturer</th><th>Course</th><th>Questions</th><th>Submissions</th><th>Avg Score</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>${quizzes.map(q => `
              <tr>
                <td><strong>${q.title}</strong></td>
                <td>${q.createdBy?.name || 'Unknown'}</td>
                <td>${q.course?.code || 'N/A'}</td>
                <td>${q.questionCount || 0}</td>
                <td>${q.attemptCount || 0}</td>
                <td>${q.averageScore || 0}</td>
                <td>${quizStatusBadge(q)}</td>
                <td><button class="btn btn-sm btn-secondary" onclick="viewAdminQuizDetail('${q._id}')">View</button></td>
              </tr>
            `).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No quizzes found.</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

async function viewAdminQuizDetail(quizId) {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="card"><p>Loading...</p></div>';
  try {
    const data = await api(`/api/admin/quizzes/${quizId}`);
    const quiz = data.quiz;
    const questions = data.questions || [];
    const attempts = data.attempts || [];
    const stats = data.stats || {};

    content.innerHTML = `
      <div class="page-header"><h2>${quiz.title}</h2><p>${quiz.description || 'No description'} — by ${quiz.createdBy?.name || 'Unknown'}</p></div>
      <div class="actions-bar"><button class="btn btn-secondary btn-sm" onclick="renderQuizzes()">← Back</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px;">
        <div class="card" style="text-align:center;"><div style="font-size:1.8em;font-weight:bold;color:#3b82f6;">${stats.submitted || 0}</div><div style="color:#6b7280;font-size:0.9em;">Submitted</div></div>
        <div class="card" style="text-align:center;"><div style="font-size:1.8em;font-weight:bold;color:#22c55e;">${stats.averageScore || 0}</div><div style="color:#6b7280;font-size:0.9em;">Avg Score</div></div>
        <div class="card" style="text-align:center;"><div style="font-size:1.8em;font-weight:bold;color:#f59e0b;">${stats.highestScore || 0}</div><div style="color:#6b7280;font-size:0.9em;">Highest</div></div>
        <div class="card" style="text-align:center;"><div style="font-size:1.8em;font-weight:bold;color:#ef4444;">${stats.lowestScore || 0}</div><div style="color:#6b7280;font-size:0.9em;">Lowest</div></div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <h3>Quiz Info</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:8px;">
          <div><strong>Course:</strong> ${quiz.course?.code || 'N/A'} — ${quiz.course?.title || ''}</div>
          <div><strong>Time Limit:</strong> ${quiz.timeLimit || 30} min</div>
          <div><strong>Total Marks:</strong> ${quiz.totalMarks || 0}</div>
          <div><strong>Start:</strong> ${new Date(quiz.startTime).toLocaleString()}</div>
          <div><strong>End:</strong> ${new Date(quiz.endTime).toLocaleString()}</div>
          <div><strong>Status:</strong> ${quizStatusBadge(quiz)}</div>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <h3>Questions (${questions.length})</h3>
        ${questions.length ? questions.map((qn, i) => `
          <div style="padding:10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;">
            <strong>Q${i + 1}.</strong> ${qn.questionText} <span style="color:#9ca3af;">(${qn.marks} marks)</span>
            <div style="margin-top:4px;font-size:0.9em;">
              ${qn.options.map((o, oi) => `<span style="margin-right:10px;${oi === qn.correctAnswer ? 'color:#22c55e;font-weight:bold;' : ''}">${String.fromCharCode(65 + oi)}) ${o}</span>`).join('')}
            </div>
          </div>
        `).join('') : '<p style="color:#9ca3af;">No questions.</p>'}
      </div>
      <div class="card">
        <h3>Student Submissions (${attempts.length})</h3>
        ${attempts.length ? `
          <table>
            <thead><tr><th>Student</th><th>ID</th><th>Score</th><th>Percentage</th><th>Submitted</th></tr></thead>
            <tbody>${attempts.map(a => {
              const pct = a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0;
              return `<tr>
                <td>${a.student?.name || 'Unknown'}</td>
                <td>${a.student?.indexNumber || a.student?.email || 'N/A'}</td>
                <td>${a.score}/${a.maxScore}</td>
                <td><span style="color:${pct >= 50 ? '#22c55e' : '#ef4444'};font-weight:bold;">${pct}%</span></td>
                <td>${a.submittedAt ? new Date(a.submittedAt).toLocaleString() : 'N/A'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No submissions yet.</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p><button class="btn btn-secondary" onclick="renderQuizzes()">← Back</button></div>`;
  }
}

async function renderMyAttendance() {
  const content = document.getElementById('main-content');
  try {
    const data = await api('/api/attendance-sessions/my-attendance');
    content.innerHTML = `
      <div class="page-header"><h2>My Attendance</h2><p>Your attendance history</p></div>
      <div class="actions-bar">
        <button class="btn btn-primary btn-sm" onclick="showMarkAttendanceModal()">Mark Attendance</button>
      </div>
      <div class="card">
        ${data.records.length ? `
          <table>
            <thead><tr><th>Session</th><th>Status</th><th>Method</th><th>Check-in Time</th></tr></thead>
            <tbody>${data.records.map(r => `
              <tr>
                <td>${r.session?.title || 'N/A'}</td>
                <td><span class="status-badge status-${r.status}">${r.status}</span></td>
                <td>${r.method}</td>
                <td>${new Date(r.checkInTime).toLocaleString()}</td>
              </tr>
            `).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No attendance records yet</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

async function renderMarkAttendance() {
  const content = document.getElementById('main-content');
  
  let activeSession = null;
  try {
    const data = await api('/api/attendance-sessions/active');
    activeSession = data.session;
  } catch (e) {}

  const alreadyMarked = activeSession ? await api('/api/attendance-sessions/my-attendance?limit=100')
    .then(d => d.records.some(r => r.session?._id === activeSession._id))
    .catch(() => false) : false;

  content.innerHTML = `
    <div class="page-header">
      <h2>Mark Attendance</h2>
      <p>Check in to active sessions</p>
    </div>
    
    ${activeSession ? `
      <div class="card" style="border-left: 4px solid var(--success); background: #f0fdf4">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-size:12px;text-transform:uppercase;color:var(--success);font-weight:700;letter-spacing:0.5px">Active Session</div>
            <div style="font-size:18px;font-weight:700;margin-top:4px">${activeSession.title || 'Untitled Session'}</div>
            <div style="font-size:13px;color:var(--text-light);margin-top:2px">Started ${new Date(activeSession.startedAt).toLocaleString()} by ${activeSession.createdBy?.name || 'Unknown'}</div>
            ${activeSession.course ? `<div style="font-size:13px;color:var(--text-light)">Course: ${activeSession.course.title || activeSession.course.code || ''}</div>` : ''}
          </div>
          <span class="status-badge status-active" style="font-size:13px;padding:6px 14px">LIVE</span>
        </div>
      </div>
      
      ${alreadyMarked ? `
        <div class="card" style="text-align:center;border-left:4px solid var(--primary)">
          <div style="font-size:48px;margin-bottom:8px">${svgIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 48)}</div>
          <div style="font-size:18px;font-weight:700;color:var(--success)">Attendance Already Marked</div>
          <p style="font-size:13px;color:var(--text-light);margin-top:4px">You have already checked in for this session.</p>
        </div>
      ` : `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:16px">
          <div class="card mark-method-card" onclick="showCodeEntry()" style="cursor:pointer;text-align:center;transition:all 0.2s">
            <div style="font-size:36px;margin-bottom:12px">${svgIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h.01M7 12h.01M12 7h.01M12 12h.01M17 7h.01M7 17h.01M12 17h.01M17 12h.01M17 17h.01"/>', 42)}</div>
            <div style="font-size:16px;font-weight:700">Enter Code</div>
            <p style="font-size:12px;color:var(--text-light);margin-top:4px">Type the 6-digit code shown by your lecturer</p>
          </div>
          
          <div class="card mark-method-card" onclick="showQrEntry()" style="cursor:pointer;text-align:center;transition:all 0.2s">
            <div style="font-size:36px;margin-bottom:12px">${svgIcon('<rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="4" height="4"/><path d="M18 14h4v4M14 18h4v4"/>', 42)}</div>
            <div style="font-size:16px;font-weight:700">QR Code</div>
            <p style="font-size:12px;color:var(--text-light);margin-top:4px">Enter QR token from your lecturer's screen</p>
          </div>
          
          <div class="card mark-method-card" onclick="markBLE()" style="cursor:pointer;text-align:center;transition:all 0.2s">
            <div style="font-size:36px;margin-bottom:12px">${svgIcon('<path d="M6.5 6.5l11 11M6.5 17.5l11-11M12 2v20"/>', 42)}</div>
            <div style="font-size:16px;font-weight:700">BLE Proximity</div>
            <p style="font-size:12px;color:var(--text-light);margin-top:4px">Auto-detect via Bluetooth proximity</p>
          </div>
          
          <div class="card mark-method-card" onclick="showJitsiJoin()" style="cursor:pointer;text-align:center;transition:all 0.2s">
            <div style="font-size:36px;margin-bottom:12px">${svgIcon('<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>', 42)}</div>
            <div style="font-size:16px;font-weight:700">Join Meeting</div>
            <p style="font-size:12px;color:var(--text-light);margin-top:4px">Mark attendance by joining the session meeting</p>
          </div>
        </div>
        
        <div id="mark-input-area"></div>
      `}
    ` : `
      <div class="card" style="text-align:center;padding:40px 20px">
        <div style="margin-bottom:16px">${svgIcon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 48)}</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:8px">No Active Session</div>
        <p style="font-size:14px;color:var(--text-light)">There are no active attendance sessions right now.</p>
        <p style="font-size:13px;color:var(--text-light);margin-top:8px">Your lecturer will start a session when it's time to mark attendance.</p>
        <button class="btn btn-secondary btn-sm" style="margin-top:16px" onclick="navigateTo('mark-attendance')">Refresh</button>
      </div>
    `}
  `;
}

function showCodeEntry() {
  const area = document.getElementById('mark-input-area');
  if (!area) return;
  area.innerHTML = `
    <div class="card">
      <div class="card-title">Enter Attendance Code</div>
      <div class="form-group">
        <label>6-Digit Code</label>
        <input type="text" id="mark-code-input" placeholder="Enter code" maxlength="6" style="font-size:24px;text-align:center;letter-spacing:8px;font-weight:700" autofocus>
      </div>
      <button class="btn btn-primary" onclick="submitCodeMark()" style="width:100%">Submit Code</button>
    </div>
  `;
  document.getElementById('mark-code-input')?.focus();
}

function showQrEntry() {
  const area = document.getElementById('mark-input-area');
  if (!area) return;
  area.innerHTML = `
    <div class="card">
      <div class="card-title">Enter QR Token</div>
      <div class="form-group">
        <label>QR Token String</label>
        <input type="text" id="mark-qr-input" placeholder="Paste QR token here" autofocus>
      </div>
      <button class="btn btn-primary" onclick="submitQrMark()" style="width:100%">Verify & Check In</button>
    </div>
  `;
  document.getElementById('mark-qr-input')?.focus();
}

async function submitCodeMark() {
  const code = document.getElementById('mark-code-input')?.value;
  if (!code || code.length !== 6) return alert('Please enter a valid 6-digit code');
  try {
    await api('/api/attendance-sessions/mark', {
      method: 'POST',
      body: JSON.stringify({ code, method: 'code_mark' }),
    });
    alert('Attendance marked successfully!');
    navigateTo('mark-attendance');
  } catch (e) {
    alert(e.message);
  }
}

async function submitQrMark() {
  const qrToken = document.getElementById('mark-qr-input')?.value;
  if (!qrToken) return alert('Please enter the QR token');
  try {
    await api('/api/attendance-sessions/mark', {
      method: 'POST',
      body: JSON.stringify({ qrToken, method: 'qr_mark' }),
    });
    alert('Attendance marked successfully!');
    navigateTo('mark-attendance');
  } catch (e) {
    alert(e.message);
  }
}

async function markBLE() {
  try {
    await api('/api/attendance-sessions/mark', {
      method: 'POST',
      body: JSON.stringify({ method: 'ble_mark' }),
    });
    alert('BLE attendance marked successfully!');
    navigateTo('mark-attendance');
  } catch (e) {
    alert(e.message);
  }
}

async function showJitsiJoin() {
  const area = document.getElementById('mark-input-area');
  if (!area) return;
  let meetingsHtml = '<p style="color:var(--text-light);font-size:13px">Loading meetings...</p>';
  try {
    const data = await api('/api/zoom');
    const available = data.meetings.filter(m => m.status === 'scheduled' || m.status === 'active');
    if (available.length > 0) {
      meetingsHtml = available.map(m => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px">
          <div>
            <div style="font-weight:600;font-size:14px">${m.title}</div>
            <div style="font-size:12px;color:var(--text-light)">${new Date(m.scheduledStart).toLocaleString()} — ${m.duration} min</div>
            <span class="status-badge" style="${m.status === 'active' ? 'background:#22c55e;color:#fff;' : 'background:#3b82f6;color:#fff;'}font-size:11px;margin-top:4px;">${m.status === 'active' ? 'Live' : 'Scheduled'}</span>
          </div>
          <button class="btn btn-success btn-sm" onclick="submitJitsiJoin('${m._id}', '${m.joinUrl || ''}')">Join & Mark</button>
        </div>
      `).join('');
    } else {
      meetingsHtml = '<p style="color:var(--text-light);font-size:13px">No available meetings found.</p>';
    }
  } catch (e) {
    meetingsHtml = '<p style="color:var(--text-light);font-size:13px">Could not load meetings.</p>';
  }
  area.innerHTML = `
    <div class="card">
      <div class="card-title">Join Meeting to Mark Attendance</div>
      ${meetingsHtml}
    </div>
  `;
}

async function submitJitsiJoin(meetingId, joinUrl) {
  try {
    await api(`/api/zoom/${meetingId}/join`, { method: 'POST' });
    await api('/api/attendance-sessions/mark', {
      method: 'POST',
      body: JSON.stringify({ method: 'jitsi_join', meetingId }),
    });
    alert('Attendance marked via meeting join!');
    if (joinUrl) window.open(joinUrl, '_blank');
    navigateTo('mark-attendance');
  } catch (e) {
    alert(e.message);
  }
}

function showMarkAttendanceModal() {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>Mark Attendance</h3>
        <p style="font-size:13px;color:var(--text-light);margin-bottom:16px">Enter the 6-digit code shown by your lecturer or manager.</p>
        <div class="form-group">
          <label>6-Digit Code</label>
          <input type="text" id="attend-code" placeholder="Enter code" maxlength="6" style="font-size:22px;text-align:center;letter-spacing:8px;font-weight:700" autofocus>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="markAttendance()">Submit</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('attend-code')?.focus();
}

async function markAttendance() {
  try {
    const code = document.getElementById('attend-code').value;
    if (!code || code.length < 4) return alert('Please enter a valid code');
    await api('/api/attendance-sessions/mark', {
      method: 'POST',
      body: JSON.stringify({ code, method: 'code_mark' }),
    });
    closeModal();
    alert('Attendance marked successfully!');
    renderMyAttendance();
  } catch (e) {
    alert(e.message);
  }
}

async function renderSubscription() {
  const content = document.getElementById('main-content');
  try {
    const [statusData, plansData] = await Promise.all([
      api('/api/payments/status'),
      api('/api/payments/plans'),
    ]);

    const sub = statusData.subscription || {};
    const trial = statusData.trial || {};
    const trialTimeRemaining = trial.timeRemaining || { days: 0, hours: 0, minutes: 0 };

    content.innerHTML = `
      <div class="page-header"><h2>Subscription</h2><p>Manage your subscription plan</p></div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value" style="color:${statusData.hasAccess ? 'var(--success)' : 'var(--danger)'}">${statusData.hasAccess ? 'Active' : 'Inactive'}</div>
          <div class="stat-label">Access Status</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${sub.active ? sub.plan : trial.active ? 'Trial' : 'None'}</div>
          <div class="stat-label">Current Plan</div>
        </div>
        ${trial.active ? `
          <div class="stat-card">
            <div class="stat-value">${trial.daysRemaining || 0}</div>
            <div class="stat-label">Trial Days Left</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${trialTimeRemaining.days}d ${trialTimeRemaining.hours}h ${trialTimeRemaining.minutes}m</div>
            <div class="stat-label">Time Remaining</div>
          </div>
        ` : ''}
      </div>

      <div class="card">
        <div class="card-title">Available Plans</div>
        <div class="stats-grid">
          ${(plansData.plans || []).map(p => `
            <div class="stat-card">
              <div class="stat-value" style="font-size:18px">${p.name}</div>
              <div style="margin-top:12px">
                <p style="font-size:13px;color:var(--text-light)">Stripe: ${p.stripe ? p.stripe.label : 'N/A'}</p>
                <p style="font-size:13px;color:var(--text-light)">Paystack: ${p.paystack ? p.paystack.label : 'N/A'}</p>
              </div>
              <div style="margin-top:12px">
                <button class="btn btn-primary btn-sm" onclick="subscribePlan('${p.id}', 'stripe')">Pay with Stripe ($)</button>
                <button class="btn btn-success btn-sm" style="margin-top:4px" onclick="subscribePlan('${p.id}', 'paystack')">Pay with Paystack (GHS)</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      ${!trial.active && !sub.active ? `
        <div class="card" style="background:#fef2f2;border-color:#fecaca">
          <p style="color:var(--danger);font-weight:600">Your free trial has ended. Please subscribe via Paystack or Stripe to continue using premium features.</p>
        </div>
      ` : ''}
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

async function subscribePlan(plan, provider) {
  if (provider === 'paystack') {
    try {
      const data = await api('/api/payments/paystack/initialize', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        alert('Could not get payment URL. Please try again.');
      }
    } catch (e) {
      alert(e.message);
    }
  } else {
    alert('Stripe is not available. Please use Paystack (GHS).');
  }
}


async function renderSearch() {
  const content = document.getElementById('main-content');
  const mode = currentUser.company?.mode || 'corporate';
  const isAcademic = mode === 'academic';
  const role = currentUser.role;
  const canSeeAdmins = (role === 'admin' || role === 'superadmin');

  // inject filter button styles once
  if (!document.getElementById('search-filter-styles')) {
    const style = document.createElement('style');
    style.id = 'search-filter-styles';
    style.textContent = '.search-filter-btn{padding:6px 14px;border-radius:20px;border:1px solid var(--border);background:var(--bg);color:var(--text-light);font-size:12px;cursor:pointer;transition:all .15s}.search-filter-btn.active,.search-filter-btn:hover{background:var(--primary);color:#fff;border-color:var(--primary)}';
    document.head.appendChild(style);
  }

  let filterBtns = '<button class="search-filter-btn active" onclick="setSearchFilter(\'all\', this)">All</button>';
  if (isAcademic) {
    filterBtns += '<button class="search-filter-btn" onclick="setSearchFilter(\'student\', this)">Students</button>';
    filterBtns += '<button class="search-filter-btn" onclick="setSearchFilter(\'lecturer\', this)">Lecturers</button>';
  } else {
    filterBtns += '<button class="search-filter-btn" onclick="setSearchFilter(\'employee\', this)">Employees</button>';
    filterBtns += '<button class="search-filter-btn" onclick="setSearchFilter(\'manager\', this)">Managers</button>';
  }
  if (canSeeAdmins) {
    filterBtns += '<button class="search-filter-btn" onclick="setSearchFilter(\'admin\', this)">Admins</button>';
  }

  const placeholder = isAcademic
    ? 'Search by name, email, index number...'
    : 'Search by name, email, employee ID...';

  content.innerHTML =
    '<div class="page-header"><h2>Search</h2><p>Find ' + (isAcademic ? 'students, lecturers, or staff' : 'employees or staff') + ' quickly</p></div>' +
    '<div class="card" style="margin-bottom:16px">' +
      '<div style="display:flex;gap:10px;align-items:center">' +
        '<input type="text" id="search-input" placeholder="' + placeholder + '" style="flex:1;padding:12px 16px;border:1px solid var(--border);border-radius:8px;font-size:14px;outline:none" oninput="debounceSearch()" onkeydown="if(event.key===\'Enter\')doSearch()">' +
        '<button class="btn btn-primary" onclick="doSearch()" style="padding:12px 20px">Search</button>' +
      '</div>' +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap" id="search-filters">' + filterBtns + '</div>' +
    '</div>' +
    '<div id="search-results">' +
      '<div class="empty-state" style="padding:40px 20px;text-align:center;color:var(--text-light)">' +
        '<p>Enter a name, email' + (isAcademic ? ', or index number' : ', or employee ID') + ' to search</p>' +
      '</div>' +
    '</div>';
}

let searchFilter = 'all';
let searchDebounceTimer = null;

function setSearchFilter(filter, btn) {
  searchFilter = filter;
  document.querySelectorAll('.search-filter-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  doSearch();
}

function debounceSearch() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(doSearch, 350);
}

async function doSearch() {
  var query = document.getElementById('search-input') ? document.getElementById('search-input').value.trim() : '';
  var resultsEl = document.getElementById('search-results');
  if (!resultsEl) return;

  if (!query || query.length < 2) {
    resultsEl.innerHTML = '<div class="card"><div class="empty-state"><p>Enter at least 2 characters to search</p></div></div>';
    return;
  }

  resultsEl.innerHTML = '<div class="card"><p>Searching...</p></div>';

  try {
    var params = new URLSearchParams({ q: query });
    if (searchFilter !== 'all') params.append('role', searchFilter);
    var data = await api('/api/search?' + params.toString());
    var users = data.users || [];
    var mode = currentUser.company ? currentUser.company.mode || 'corporate' : 'corporate';

    if (users.length === 0) {
      resultsEl.innerHTML = '<div class="card"><div class="empty-state"><p>No users found for "' + query + '"</p></div></div>';
      return;
    }

    var rows = users.map(function(u) {
      var idCol = mode === 'academic'
        ? '<td>' + (u.indexNumber || u.email || '—') + '</td>'
        : '<td>' + (u.email || '—') + '</td><td>' + (u.employeeId || '—') + '</td>';
      var activeClass = u.isActive ? 'status-active' : 'status-stopped';
      var activeLabel = u.isActive ? 'Active' : 'Inactive';
      return '<tr><td style="font-weight:600">' + u.name + '</td>' + idCol +
        '<td><span class="role-badge role-' + u.role + '">' + u.role + '</span></td>' +
        '<td><span class="status-badge ' + activeClass + '">' + activeLabel + '</span></td>' +
        '<td style="font-size:12px;color:var(--text-light)">' + new Date(u.createdAt).toLocaleDateString() + '</td></tr>';
    }).join('');

    var headerCols = mode === 'academic'
      ? '<th>Index / Email</th>'
      : '<th>Email</th><th>Employee ID</th>';

    resultsEl.innerHTML =
      '<div class="card">' +
        '<div class="card-title" style="margin-bottom:12px">' + users.length + ' result' + (users.length !== 1 ? 's' : '') + ' for "<strong>' + query + '</strong>"</div>' +
        '<table><thead><tr><th>Name</th>' + headerCols + '<th>Role</th><th>Status</th><th>Joined</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>' +
      '</div>';
  } catch (e) {
    resultsEl.innerHTML = '<div class="card"><p style="color:var(--danger)">Search failed: ' + e.message + '</p></div>';
  }
}


function renderReports() {
  const content = document.getElementById('main-content');
  const role = currentUser.role;
  const mode = currentUser.company?.mode || 'corporate';
  const isAcademic = mode === 'academic';
  const isAdmin = ['admin', 'superadmin'].includes(role);

  if (isAdmin) {
    renderAdminReports(content, isAcademic);
    return;
  }

  let cards = '';
  const isStaff = ['manager', 'lecturer'].includes(role);

  cards += reportCard(
    '#6366f1', '#8b5cf6',
    '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    'Attendance Report',
    isStaff ? 'All attendance records across your sessions' : 'Your personal attendance history',
    'attendance', 'reports'
  );

  if (isStaff) {
    cards += reportCard(
      '#0ea5e9', '#06b6d4',
      '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      'Sessions Report',
      role === 'lecturer' ? 'Summary of your attendance sessions' : 'All sessions in your institution',
      'sessions', 'reports'
    );
  }

  if (isAcademic && (role === 'lecturer' || role === 'student')) {
    cards += reportCard(
      '#f59e0b', '#f97316',
      '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
      'Performance Report',
      role === 'student' ? 'Your quiz scores and performance' : 'Quiz scores and student performance',
      'performance', 'reports'
    );
  }

  content.innerHTML = `
    <div class="page-header"><h2>Reports</h2><p>Download reports as PDF with one click</p></div>
    <div class="reports-grid">${cards}</div>
  `;
}

function reportCard(c1, c2, iconPath, title, desc, type, apiBase) {
  const downloadIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  return `
    <div class="report-card" style="--report-gradient:linear-gradient(135deg,${c1},${c2});--report-shadow:${c1}33" onclick="downloadReport('${type}','${apiBase}', event)">
      <div class="report-card-icon">
        ${svgIcon(iconPath, 28)}
      </div>
      <div class="report-card-title">${title}</div>
      <div class="report-card-desc">${desc}</div>
      <button class="report-card-btn" onclick="event.stopPropagation(); downloadReport('${type}','${apiBase}', event)">
        ${downloadIcon} Download PDF
      </button>
    </div>`;
}

function renderAdminReports(content, isAcademic) {
  let cards = '';

  cards += reportCard(
    '#4f46e5', '#6366f1',
    '<path d="M3 3h18v18H3z"/><path d="M3 9h18"/><path d="M9 21V9"/>',
    'Institution Summary',
    'Complete overview: users, attendance, subscription, and academic data',
    'summary', 'admin/reports'
  );

  cards += reportCard(
    '#6366f1', '#8b5cf6',
    '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    'Attendance Overview',
    'Institution-wide attendance with per-session breakdown and individual records',
    'attendance', 'admin/reports'
  );

  cards += reportCard(
    '#0ea5e9', '#06b6d4',
    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    'Session Report',
    'Duration tracking, attendee counts, and suspicious session flagging',
    'sessions', 'admin/reports'
  );

  if (isAcademic) {
    cards += reportCard(
      '#8b5cf6', '#a78bfa',
      '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
      'Performance Report',
      'Quiz analytics: per-course scores, pass rates, and all submissions',
      'performance', 'admin/reports'
    );

    cards += reportCard(
      '#10b981', '#059669',
      '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      'Lecturer Performance',
      'Compare lecturers: sessions, courses, student engagement, and records',
      'lecturers', 'admin/reports'
    );
  }

  cards += reportCard(
    '#f59e0b', '#f97316',
    isAcademic
      ? '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 4 3 6 3s6-1 6-3v-5"/>'
      : '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
    isAcademic ? 'Student Analytics' : 'Employee Analytics',
    isAcademic
      ? 'Attendance rates, course enrollments, and quiz score averages'
      : 'Attendance rates and participation metrics per employee',
    'students', 'admin/reports'
  );

  content.innerHTML = `
    <div class="page-header">
      <h2>Admin Reports</h2>
      <p>Full institution analytics — click any report card to download as PDF</p>
    </div>
    <div class="reports-grid">${cards}</div>
  `;
}

async function downloadReport(type, apiBase = 'reports', e) {
  const btn = e ? e.target.closest('.report-card-btn') || e.target.closest('.btn') : null;
  const card = btn ? btn.closest('.report-card') : null;
  const originalHTML = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = 'Generating...';
    btn.disabled = true;
    btn.style.opacity = '0.7';
  }
  if (card) card.style.pointerEvents = 'none';
  try {
    const headers = { 'Authorization': `Bearer ${token}` };
    const res = await fetch(`${API}/api/${apiBase}/${type}`, { headers });
    if (!res.ok) {
      let errMsg = 'Failed to generate report';
      try { const err = await res.json(); errMsg = err.error; } catch(e) {}
      throw new Error(errMsg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-report.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.message);
  } finally {
    if (btn) {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      btn.style.opacity = '';
    }
    if (card) card.style.pointerEvents = '';
  }
}

function closeModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('modal-container').classList.add('hidden');
  document.getElementById('modal-container').innerHTML = '';
}

if (token) {
  loadUserData();
}
