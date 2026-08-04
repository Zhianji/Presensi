// ==== KONFIGURASI APLIKASI ====
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyUcFNc2m_M8ni_68F6w_Zivso3zuxRDAZokPLkSVEkL0HK7KOYyuQUQSy73hzagGm1OA/exec';

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

async function apiPost(action, data = {}, timeoutMs = 35000, maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const currentTimeout = attempt > 0 ? 45000 : timeoutMs;
    const timer = setTimeout(() => controller.abort(), currentTimeout);
    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...data }),
        signal: controller.signal
      });
      clearTimeout(timer);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch (e) {
        console.warn("Apps Script non-JSON response:", text);
        return { ok: false, error: "Respon server bukan format JSON yang valid.", raw: text };
      }
    } catch (err) {
      clearTimeout(timer);
      const isAbort = err.name === 'AbortError';
      if (attempt < maxRetries) {
        console.warn(`[apiPost] Retrying action '${action}' (attempt ${attempt + 1}/${maxRetries}) due to ${isAbort ? 'timeout' : 'network error'}`);
        await new Promise(r => setTimeout(r, 800));
        continue;
      }
      if (isAbort) {
        return { ok: false, error: `Koneksi ke Google Apps Script timeout (${Math.round(currentTimeout/1000)}s). Silakan coba lagi.` };
      }
      return { ok: false, error: err.message || 'Gagal terhubung ke server.' };
    }
  }
}

// ==== CACHING SYSTEM ====
const CACHE_DURATIONS = {
  cache_overview_v2: 5 * 60 * 1000,
  cache_siswa_list: 30 * 60 * 1000,
  cache_kelas_list: 60 * 60 * 1000,
  cache_rekap_bulanan: 10 * 60 * 1000,
  cache_riwayat_siswa: 5 * 60 * 1000,
  cache_laporan_data: 5 * 60 * 1000,
  cache_pengaturan: 60 * 60 * 1000,
  cache_guru_list: 30 * 60 * 1000,
  cache_log_aktivitas: 5 * 60 * 1000,
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
  sessionStorage.removeItem('absensi_verified_session');
}

function invalidateCache(keys) {
  if (!keys) {
    clearAllCache();
    return;
  }
  const keysArr = Array.isArray(keys) ? keys : [keys];
  keysArr.forEach(k => localStorage.removeItem(k));
}

async function apiPostCached(action, data, cacheKey, onFresh) {
  const cached = cacheKey ? getCached(cacheKey) : null;
  const freshPromise = apiPost(action, data).then(res => {
    if (res && res.ok && cacheKey) setCached(cacheKey, res);
    if (onFresh) onFresh(res);
    return res;
  }).catch(err => {
    return cached || { ok: false, error: err.message };
  });

  if (cached) {
    freshPromise.catch(() => {});
    return cached;
  }
  return await freshPromise;
}

// ==== SESSION MANAGEMENT ====
function saveSession(token, role, nama, email = '') {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ROLE_KEY, role);
  localStorage.setItem(NAMA_KEY, nama);
  if (email) localStorage.setItem(EMAIL_KEY, email);
  sessionStorage.removeItem('absensi_verified_session');
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

function getAvatarUrl(nama) {
  const nameStr = nama || getNama() || 'User';
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(nameStr)}&background=3b82f6&color=fff&bold=true`;
}

const SESSION_CACHE_KEY = 'absensi_verified_session';
const SESSION_CACHE_DURATION = 10 * 60 * 1000; // 10 menit

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

  const currentRole = getRole();
  const currentNama = getNama();
  const currentEmail = getEmail();
  let roleMatch = Array.isArray(requiredRole) ? requiredRole.includes(currentRole) : currentRole === requiredRole;

  if (!roleMatch) {
    clearSession();
    window.location.href = 'index.html';
    return null;
  }

  // Fast-path: Gunakan session tersimpan jika masih berlaku (mencegah request HTTP setiap pindah halaman)
  try {
    const rawSession = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (rawSession) {
      const { session, token: cachedToken, timestamp } = JSON.parse(rawSession);
      if (cachedToken === token && (Date.now() - timestamp < SESSION_CACHE_DURATION)) {
        setupCommonUI(session);
        // Background revalidation jika session cache sudah berusia > 3 menit
        if (Date.now() - timestamp > 3 * 60 * 1000) {
          apiPost('checkSession', { token }).then(check => {
            if (check && check.ok) {
              sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ session: check, token, timestamp: Date.now() }));
            }
          }).catch(() => {});
        }
        return session;
      }
    }
  } catch (e) {}

  // Network verification jika belum ada cache
  try {
    const check = await apiPost('checkSession', { token });

    let freshRoleMatch = false;
    if (Array.isArray(requiredRole)) {
      freshRoleMatch = requiredRole.includes(check.role);
    } else {
      freshRoleMatch = check.role === requiredRole;
    }

    if (!check || !check.ok) {
      const isTimeoutOrConnError = check && check.error && (
        check.error.includes('timeout') || 
        check.error.includes('terhubung') || 
        check.error.includes('Failed to fetch')
      );
      if (isTimeoutOrConnError || (token && (token.startsWith('fallback_token_') || token.startsWith('local_token_')))) {
        console.warn("Using offline session fallback due to backend timeout/connection issue.");
        const fallbackSession = { ok: true, role: currentRole, nama: currentNama, email: currentEmail };
        setupCommonUI(fallbackSession);
        return fallbackSession;
      }
      clearSession();
      window.location.href = 'index.html';
      return null;
    }

    if (!freshRoleMatch) {
      clearSession();
      window.location.href = 'index.html';
      return null;
    }

    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ session: check, token, timestamp: Date.now() }));
    setupCommonUI(check);
    return check;
  } catch (e) {
    console.error('Session verification error:', e);
    if (currentRole && roleMatch) {
      const fallbackSession = { ok: true, role: currentRole, nama: currentNama, email: currentEmail };
      setupCommonUI(fallbackSession);
      return fallbackSession;
    } else {
      clearSession();
      window.location.href = 'index.html';
      return null;
    }
  }
}

// ==== GOOGLE IDENTITY SERVICES & MOCK LOGIN ====
async function mockGoogleLogin(email, name = '', picture = '', expectedRole = '') {
  const res = await apiPost('loginWithGoogle', { email, name, picture, expectedRole });
  if (res && res.ok) {
    return res;
  }

  // Check if failure is due to network timeout or connection error to Google Apps Script
  const isNetworkOrTimeout = res && res.error && (
    res.error.includes('timeout') || 
    res.error.includes('terhubung') || 
    res.error.includes('Failed to fetch') ||
    res.error.includes('NetworkError')
  );

  if (isNetworkOrTimeout) {
    console.warn("Google Apps Script login timeout/connection error. Performing fallback login for:", email);

    // Check cached registered accounts
    let localAccounts = [];
    try {
      const cached = localStorage.getItem('cached_registered_accounts');
      if (cached) localAccounts = JSON.parse(cached);
    } catch(e) {}

    const targetEmail = String(email || '').toLowerCase().trim();
    const matchedAccount = localAccounts.find(a => String(a.email || '').toLowerCase().trim() === targetEmail);

    if (matchedAccount) {
      const role = (matchedAccount.role || expectedRole || 'admin').toLowerCase();
      const nama = matchedAccount.nama || name || 'User';
      return {
        ok: true,
        token: 'fallback_token_' + Date.now(),
        nama: nama,
        role: role,
        isOfflineFallback: true,
        message: 'Login berhasil (mode offline/fallback).'
      };
    }

    const defaultDemoRoles = {
      'admin@sekolah.sch.id': { role: 'admin', nama: 'Administrator System' },
      'kepsek@sekolah.sch.id': { role: 'kepsek', nama: 'Dr. H. Ahmad Dahlan, M.Pd' },
      'guru@sekolah.sch.id': { role: 'guru', nama: 'Budi Santoso, S.Pd' },
      'siswa@sekolah.sch.id': { role: 'siswa', nama: 'Andi Pratama' }
    };

    if (defaultDemoRoles[targetEmail]) {
      const demo = defaultDemoRoles[targetEmail];
      return {
        ok: true,
        token: 'fallback_token_' + Date.now(),
        nama: demo.nama,
        role: demo.role,
        isOfflineFallback: true
      };
    }

    if (expectedRole && targetEmail) {
      const roleNameMap = {
        'admin': 'Administrator',
        'kepsek': 'Kepala Sekolah',
        'guru': 'Guru Pengajar',
        'siswa': 'Siswa'
      };
      const fallbackNama = name || email.split('@')[0] || (roleNameMap[expectedRole] || 'User');
      return {
        ok: true,
        token: 'fallback_token_' + Date.now(),
        nama: fallbackNama,
        role: expectedRole,
        isOfflineFallback: true
      };
    }
  }

  return res;
}

async function getRegisteredAccounts() {
  const LOCAL_ACCOUNTS_KEY = 'cached_registered_accounts';
  try {
    const res = await apiPost('getPublicAccounts');
    if (res && res.ok && Array.isArray(res.data)) {
      localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(res.data));
      return { ok: true, source: 'live', data: res.data };
    } else if (res && res.error) {
      console.warn("Backend error fetching accounts:", res.error);
    }
  } catch (e) {
    console.warn("Failed to fetch public accounts from backend, checking local cache:", e);
  }

  try {
    const cached = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { ok: true, source: 'cache', data: parsed };
      }
    }
  } catch (e) {}

  return {
    ok: false,
    source: 'fallback',
    error: 'Backend Apps Script belum di-deploy atau belum terhubung.',
    data: []
  };
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
            if (fallbackFn) fallbackFn('Gagal mengambil data profil Google.');
          },
          error_callback: (err) => {
            console.warn("Google OAuth popup error:", err);
            const reason = (err && (err.message || err.type)) ? (err.message || err.type) : 'Domain ini belum terdaftar di Google Cloud Console Client ID.';
            if (fallbackFn) fallbackFn(reason);
          }
        });
        client.requestAccessToken();
        return;
      } catch (e) {
        console.warn("initTokenClient failed, fallback:", e);
        if (fallbackFn) fallbackFn(e.message || 'Gagal menginisialisasi OAuth Client.');
        return;
      }
    }
  }
  if (fallbackFn) fallbackFn('Google OAuth Client ID belum dikonfigurasi.');
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

  // 1. Render User Header Info & Avatars
  const avatarUrl = getAvatarUrl(session.nama);
  const userAvatars = document.querySelectorAll('img[data-alt="User Avatar"], img.user-avatar, img[src*="googleusercontent"]');
  userAvatars.forEach(img => {
    img.src = avatarUrl;
  });

  const userHeaderNames = document.querySelectorAll('.user-name-display, #user-name, p.font-label-md.font-bold');
  userHeaderNames.forEach(el => {
    if (session.nama) el.textContent = session.nama;
  });

  const userHeaderRoles = document.querySelectorAll('.user-role-display, #user-role');
  userHeaderRoles.forEach(el => {
    if (session.role) el.textContent = session.role.toUpperCase();
  });

  // 2. Render Sidebar Navigation & Active States
  const navElements = document.querySelectorAll('aside nav');
  if (!navElements.length) return;

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
        <a href="${item.page}" class="flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl px-4 py-3 shadow-lg shadow-blue-600/20 border border-white/10 font-semibold text-xs overflow-hidden transition-all duration-300">
          <span class="material-symbols-outlined text-lg min-w-[20px] text-center" style="font-variation-settings: 'FILL' 1;">${item.icon}</span>
          <span class="sidebar-text whitespace-nowrap transition-all duration-300">${item.label}</span>
        </a>
      `;
    } else {
      navHtml += `
        <a href="${item.page}" class="flex items-center gap-3 text-slate-400 hover:bg-slate-800/80 hover:text-slate-200 px-4 py-3 rounded-xl transition-all duration-300 text-xs font-medium group overflow-hidden">
          <span class="material-symbols-outlined text-lg min-w-[20px] text-center group-hover:text-blue-400 transition-colors">${item.icon}</span>
          <span class="sidebar-text whitespace-nowrap transition-all duration-300">${item.label}</span>
        </a>
      `;
    }
  });

  navElements.forEach(el => {
    el.innerHTML = navHtml;
  });

  // Call sidebar toggle setup
  setupSidebarToggle();
}

function setupSidebarToggle() {
    if (document.getElementById('sidebar-styles')) return;

    const style = document.createElement('style');
    style.id = 'sidebar-styles';
    style.innerHTML = `
        /* Smooth transitions */
        #sidebar { transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); overflow-x: hidden; }
        main { transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        
        /* Collapsed state */
        body.sidebar-collapsed #sidebar { width: 5.5rem !important; }
        body.sidebar-collapsed main { margin-left: 5.5rem !important; }
        
        /* Hide texts smoothly */
        #sidebar h1, #sidebar p, #sidebar .sidebar-text, #sidebar .border-t button span:not(.material-symbols-outlined) { 
            transition: opacity 0.2s ease, max-width 0.3s ease;
            white-space: nowrap; 
            max-width: 200px;
        }
        body.sidebar-collapsed #sidebar h1, 
        body.sidebar-collapsed #sidebar p, 
        body.sidebar-collapsed #sidebar .sidebar-text,
        body.sidebar-collapsed #sidebar .border-t button span:not(.material-symbols-outlined) { 
            opacity: 0; 
            max-width: 0; 
            pointer-events: none;
            margin: 0;
            padding: 0;
        }
        
        /* Enlarge school icon & logo container */
        #sidebar .w-10.h-10 { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        #sidebar .w-10.h-10 span { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        
        body.sidebar-collapsed #sidebar .w-10.h-10 { 
            width: 3.2rem !important; 
            height: 3.2rem !important;
            margin: 0 auto;
        }
        body.sidebar-collapsed #sidebar .w-10.h-10 span { 
            font-size: 2rem !important;
        }
        
        /* Center elements when collapsed */
        body.sidebar-collapsed #sidebar .border-b { justify-content: center; padding: 1.5rem 0; }
        body.sidebar-collapsed #sidebar nav a, 
        body.sidebar-collapsed #sidebar .border-t button { 
            justify-content: center;
            padding-left: 0 !important; 
            padding-right: 0 !important;
        }
        /* Mobile handling (hide sidebar completely instead of collapsing) */
        @media (max-width: 768px) {
            body.sidebar-collapsed #sidebar { transform: translateX(-100%); width: 16rem !important; }
            body.sidebar-collapsed main { margin-left: 0 !important; }
        }
    `;
    document.head.appendChild(style);

    // Inject toggle button into header
    const headerTitle = document.querySelector('main header .flex.items-center.gap-4');
    if (headerTitle && !document.getElementById('sidebar-toggle-btn')) {
        const btn = document.createElement('button');
        btn.id = 'sidebar-toggle-btn';
        btn.className = 'w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/60 text-slate-300 hover:text-white transition-colors cursor-pointer mr-2';
        btn.innerHTML = '<span class="material-symbols-outlined text-lg">menu_open</span>';
        btn.onclick = () => {
            const isCollapsed = document.body.classList.toggle('sidebar-collapsed');
            localStorage.setItem('sidebar-collapsed', isCollapsed);
            btn.querySelector('span').textContent = isCollapsed ? 'menu' : 'menu_open';
        };
        headerTitle.insertBefore(btn, headerTitle.firstChild);
    }

    // Restore state from localStorage
    if (localStorage.getItem('sidebar-collapsed') === 'true') {
        document.body.classList.add('sidebar-collapsed');
        const btnSpan = document.querySelector('#sidebar-toggle-btn span');
        if (btnSpan) btnSpan.textContent = 'menu';
    }
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
