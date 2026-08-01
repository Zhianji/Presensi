// ==== KONFIGURASI APLIKASI ====
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby3iZkJ4ReeKdeHRixSvkLg9pR2zeUdswpdFhw7_tnY6wmVOZmWPNsGYlayeEpAP56K4A/exec';

// Google OAuth Client ID (Isi jika menggunakan Google Identity Services di domain terdaftar)
const GOOGLE_CLIENT_ID = '222705604056-fjhbfphdg2ncua1gohaboliar2drr59m.apps.googleusercontent.com';

const TOKEN_KEY = 'absensi_token';
const ROLE_KEY = 'absensi_role';
const NAMA_KEY = 'absensi_nama';
const EMAIL_KEY = 'absensi_email';

// ==== HELPER API ====
async function apiGet(action, params = {}) {
  const query = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${APPS_SCRIPT_URL}?${query}`, { method: 'GET' });
  return res.json();
}

async function apiPost(action, data = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...data }),
      signal: controller.signal
    });
    clearTimeout(timer);
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new Error('Koneksi ke Google Apps Script timeout (melewati 12 detik).');
    }
    throw err;
  }
}

// ==== CACHING SYSTEM ====
const CACHE_DURATIONS = {
  cache_overview_v2: 5 * 60 * 1000,
  cache_siswa_list: 30 * 60 * 1000,
  cache_kelas_list: 60 * 60 * 1000,
  cache_rekap_bulanan: 10 * 60 * 1000,
  cache_riwayat_siswa: 5 * 60 * 1000,
};

function getCached(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    const duration = CACHE_DURATIONS[key] || 5 * 60 * 1000;
    if (Date.now() - timestamp > duration) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch (err) {
    return null;
  }
}

function setCached(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch (err) {}
}

function clearAllCache() {
  Object.keys(CACHE_DURATIONS).forEach(k => localStorage.removeItem(k));
}

async function apiPostCached(action, data, cacheKey, onFresh) {
  const cached = cacheKey ? getCached(cacheKey) : null;
  const freshPromise = apiPost(action, data).then(res => {
    if (res.ok && cacheKey) setCached(cacheKey, res);
    if (onFresh) onFresh(res);
    return res;
  });
  if (cached) return cached;
  return freshPromise;
}

// ==== SESSION MANAGEMENT ====
function saveSession(token, role, nama, email = '') {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ROLE_KEY, role);
  localStorage.setItem(NAMA_KEY, nama);
  if (email) localStorage.setItem(EMAIL_KEY, email);
}

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function getRole() { return localStorage.getItem(ROLE_KEY); }
function getNama() { return localStorage.getItem(NAMA_KEY); }
function getEmail() { return localStorage.getItem(EMAIL_KEY); }

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
  localStorage.removeItem(NAMA_KEY);
  localStorage.removeItem(EMAIL_KEY);
  clearAllCache();
}

/**
 * Jaga halaman: redirect ke login jika belum ada session atau role tidak cocok.
 * requiredRole bisa string ('siswa') atau array (['admin', 'guru', 'kepsek'])
 */
async function guardPage(requiredRole) {
  const token = getToken();
  if (!token) {
    window.location.href = 'index.html';
    return null;
  }
  try {
    const check = await apiPost('checkSession', { token });

    let roleMatch = false;
    if (Array.isArray(requiredRole)) {
      roleMatch = requiredRole.includes(check.role);
    } else {
      roleMatch = check.role === requiredRole;
    }

    if (!check.ok || !roleMatch) {
      clearSession();
      window.location.href = 'index.html';
      return null;
    }

    // Auto setup UI sidebar & header user details
    setupCommonUI(check);

    return check;
  } catch (e) {
    console.error('Session verification error:', e);
    // Allow cached local session fallback if network fails temporarily
    const currentRole = getRole();
    let roleMatch = Array.isArray(requiredRole) ? requiredRole.includes(currentRole) : currentRole === requiredRole;
    if (currentRole && roleMatch) {
      setupCommonUI({ role: currentRole, nama: getNama() });
      return { ok: true, role: currentRole, nama: getNama() };
    } else {
      clearSession();
      window.location.href = 'index.html';
      return null;
    }
  }
}

// ==== GOOGLE IDENTITY SERVICES & MOCK LOGIN ====
async function mockGoogleLogin(email, name = '', picture = '') {
  return await apiPost('loginWithGoogle', { email, name, picture });
}

function decodeJwtToken(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

function initGoogleSignIn(containerId, handleSuccess) {
  if (typeof google !== 'undefined' && google.accounts && GOOGLE_CLIENT_ID) {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      use_fedcm_for_prompt: false,
      callback: async (response) => {
        const payload = decodeJwtToken(response.credential);
        if (payload && payload.email) {
          const res = await mockGoogleLogin(payload.email, payload.name, payload.picture);
          if (handleSuccess) handleSuccess(res);
        }
      }
    });
    if (containerId && document.getElementById(containerId)) {
      google.accounts.id.renderButton(
        document.getElementById(containerId),
        { theme: 'outline', size: 'large', width: '100%', text: 'signin_with' }
      );
    }
  }
}

function triggerRealGoogleSignIn(handleSuccess, fallbackFn) {
  if (typeof google !== 'undefined' && google.accounts && GOOGLE_CLIENT_ID) {
    if (google.accounts.oauth2) {
      try {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: GOOGLE_CLIENT_ID,
          scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
          callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
              try {
                const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                });
                const userInfo = await userRes.json();
                if (userInfo && userInfo.email) {
                  const res = await mockGoogleLogin(userInfo.email, userInfo.name || '', userInfo.picture || '');
                  if (handleSuccess) handleSuccess(res);
                  return;
                }
              } catch (err) {
                console.error("GSI UserInfo fetch error:", err);
              }
            }
            if (fallbackFn) fallbackFn();
          },
          error_callback: (err) => {
            console.warn("Google OAuth popup error:", err);
            if (fallbackFn) fallbackFn();
          }
        });
        client.requestAccessToken();
        return;
      } catch (e) {
        console.warn("initTokenClient failed, fallback:", e);
      }
    }
  }
  if (fallbackFn) fallbackFn();
}

function handleLogout() {
  const token = getToken();
  if (token) {
    apiPost('logout', { token }).catch(() => {});
  }
  clearSession();
  window.location.href = 'index.html';
}

// ==== COMMON UI RENDERING ====
function setupCommonUI(session) {
  const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';

  // 1. Render User Header Info
  const userHeaderNames = document.querySelectorAll('.user-name-display, #user-name, p.font-label-md.font-bold');
  userHeaderNames.forEach(el => {
    if (session.nama) el.textContent = session.nama;
  });

  const userHeaderRoles = document.querySelectorAll('.user-role-display, #user-role');
  userHeaderRoles.forEach(el => {
    if (session.role) el.textContent = session.role.toUpperCase();
  });

  // 2. Render Sidebar Navigation & Active States
  const navElement = document.querySelector('aside nav');
  if (!navElement) return;

  const role = session.role || getRole();

  const menuItems = [
    { page: 'dashboard.html', label: 'Beranda', icon: 'dashboard', roles: ['admin', 'guru', 'kepsek'] },
    { page: 'input-absensi.html', label: 'Input Absen', icon: 'how_to_reg', roles: ['admin', 'guru', 'kepsek'] },
    { page: 'master-data.html', label: 'Master Data', icon: 'database', roles: ['admin', 'guru', 'kepsek'] },
    { page: 'laporan.html', label: 'Laporan', icon: 'description', roles: ['admin', 'guru', 'kepsek'] },
    { page: 'kelola-admin.html', label: 'Kelola Admin', icon: 'admin_panel_settings', roles: ['admin', 'kepsek'] },
    { page: 'notifikasi.html', label: 'Notifikasi', icon: 'notifications_active', roles: ['admin', 'guru', 'kepsek', 'siswa'] },
    { page: 'pengaturan.html', label: 'Pengaturan', icon: 'settings', roles: ['admin', 'kepsek'] },
    { page: 'log-aktivitas.html', label: 'Log Aktivitas', icon: 'history_edu', roles: ['admin', 'kepsek'] },
  ];

  let navHtml = '';
  menuItems.forEach(item => {
    if (!item.roles.includes(role)) return;

    const isActive = currentPage === item.page;
    if (isActive) {
      navHtml += `
        <a href="${item.page}" class="flex items-center gap-3 bg-primary-container text-on-primary-container rounded-lg px-4 py-3 border-l-4 border-primary transition-all">
          <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">${item.icon}</span>
          <span class="font-label-md text-label-md font-bold">${item.label}</span>
        </a>
      `;
    } else {
      navHtml += `
        <a href="${item.page}" class="flex items-center gap-3 text-on-surface-variant hover:bg-surface-container px-4 py-3 rounded-lg transition-all scale-95 active:scale-90">
          <span class="material-symbols-outlined">${item.icon}</span>
          <span class="font-label-md text-label-md">${item.label}</span>
        </a>
      `;
    }
  });

  navElement.innerHTML = navHtml;
}

// ==== TOAST FEEDBACK HELPER ====
function showToast(message, isError = false) {
  let toastContainer = document.getElementById('global-toast');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'global-toast';
    toastContainer.className = 'fixed bottom-6 right-6 z-50 transition-all duration-300 transform translate-y-10 opacity-0';
    document.body.appendChild(toastContainer);
  }

  const bgColor = isError ? 'bg-error text-on-error' : 'bg-inverse-surface text-inverse-on-surface';
  const icon = isError ? 'error' : 'check_circle';

  toastContainer.innerHTML = `
    <div class="${bgColor} px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3">
      <span class="material-symbols-outlined">${icon}</span>
      <span class="font-body-md text-sm">${message}</span>
    </div>
  `;

  requestAnimationFrame(() => {
    toastContainer.classList.remove('translate-y-10', 'opacity-0');
  });

  setTimeout(() => {
    toastContainer.classList.add('translate-y-10', 'opacity-0');
  }, 3500);
}

// ==== SIDEBAR & RESPONSIVE UI ====
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  let overlay = document.getElementById('sidebar-overlay');

  if (!sidebar) return;

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sidebar-overlay';
    overlay.className = 'fixed inset-0 bg-black/50 z-30 transition-opacity duration-300 opacity-0 pointer-events-none md:hidden';
    overlay.onclick = closeSidebar;
    document.body.appendChild(overlay);
  }

  const isClosed = sidebar.classList.contains('-translate-x-full');
  if (isClosed) {
    // Open sidebar
    sidebar.classList.remove('-translate-x-full');
    overlay.classList.remove('opacity-0', 'pointer-events-none');
    overlay.classList.add('opacity-100', 'pointer-events-auto');
  } else {
    // Close sidebar
    closeSidebar();
  }
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) {
    sidebar.classList.add('-translate-x-full');
  }
  if (overlay) {
    overlay.classList.remove('opacity-100', 'pointer-events-auto');
    overlay.classList.add('opacity-0', 'pointer-events-none');
  }
}

// ==== MOBILE PROFILE DROPDOWN HELPER ====
function toggleMobileDropdown(id) {
    const el = document.getElementById(id);
    if (el) {
        if (el.classList.contains('opacity-0')) {
            el.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
            el.classList.add('opacity-100', 'scale-100');
            // Try to populate user data if available in localStorage
            const userStr = localStorage.getItem('user_session');
            if (userStr) {
                try {
                    const user = JSON.parse(userStr);
                    const nameEl = document.getElementById(id + '-name');
                    const roleEl = document.getElementById(id + '-role');
                    if (nameEl && user.nama) nameEl.textContent = user.nama;
                    if (roleEl && user.role) roleEl.textContent = user.role;
                } catch (e) {}
            }
        } else {
            closeMobileDropdown(id);
        }
    }
}

function closeMobileDropdown(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
        el.classList.remove('opacity-100', 'scale-100');
    }
}
