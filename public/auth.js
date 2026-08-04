// Supabase auth: sign in/up modal, currentUser state, and the onAuthStateChange handler.
// On login/logout it re-syncs watchlist, portfolio, and practice data across the other modules.

let currentUser = null;
let authMode = 'signin'; // or 'signup'

const authBtn = document.getElementById('authBtn');
const authModalBackdrop = document.getElementById('authModalBackdrop');
const authModalClose = document.getElementById('authModalClose');
const authModalTitle = document.getElementById('authModalTitle');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authError = document.getElementById('authError');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authToggleText = document.getElementById('authToggleText');
const authToggleLink = document.getElementById('authToggleLink');
const authMenuWrap = document.getElementById('authMenuWrap');
const authMenu = document.getElementById('authMenu');
const authMenuEmail = document.getElementById('authMenuEmail');
const authNicknameInput = document.getElementById('authNicknameInput');
const authNicknameSaveBtn = document.getElementById('authNicknameSaveBtn');
const authNicknameHint = document.getElementById('authNicknameHint');
const authAvatarGrid = document.getElementById('authAvatarGrid');
const authLogoutBtn = document.getElementById('authLogoutBtn');

function openAuthModal(){ authModalBackdrop.classList.add('open'); authError.textContent=''; }
function closeAuthModal(){ authModalBackdrop.classList.remove('open'); authEmail.value=''; authPassword.value=''; }

function refreshAuthButtonLabel(){
  if(!currentUser){ authBtn.textContent = 'Sign in'; return; }
  const nickname = (practiceAccount?.nickname || '').trim();
  const avatarIcon = avatarIconHtml(practiceAccount?.avatar_key, 'auth-btn-avatar') || '';
  authBtn.innerHTML = `${avatarIcon}Hello, ${escapeHtml(nickname || 'Trader')}`;
}

function renderAuthAvatarGrid(){
  if(!authAvatarGrid) return;
  const selectedKey = practiceAccount?.avatar_key || null;
  authAvatarGrid.innerHTML = AVATARS.map(a => `
    <button type="button" class="auth-avatar-tile${a.key === selectedKey ? ' selected' : ''}" data-key="${a.key}">
      ${avatarIconHtml(a.key)}
    </button>
  `).join('');
  authAvatarGrid.querySelectorAll('.auth-avatar-tile').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.key;
      if(key === selectedKey) return;
      await savePracticeAvatar(key);
      renderAuthAvatarGrid();
    });
  });
}

async function openAuthMenu(){
  authNicknameHint.textContent = '';
  authMenuEmail.textContent = currentUser?.email || '';
  if(!practiceAccount) await loadPracticeAccount();
  authNicknameInput.value = practiceAccount?.nickname || '';
  renderAuthAvatarGrid();
  authMenu.classList.add('open');
}
function closeAuthMenu(){ authMenu.classList.remove('open'); }

async function updateAuthUI(){
  refreshAuthButtonLabel();
  if(!currentUser) closeAuthMenu();
  const adminGroup = document.getElementById('adminNavGroup');
  if(adminGroup){
    if(currentUser){
      try{
        const token = await getAccessToken();
        const res = await fetch(`${API_BASE}/api/admin/check`, { headers: { Authorization: `Bearer ${token}` } });
        const { isAdmin } = await res.json();
        adminGroup.style.display = isAdmin ? '' : 'none';
      }catch(e){
        adminGroup.style.display = 'none';
      }
    }else{
      adminGroup.style.display = 'none';
    }
  }
}


authModalClose?.addEventListener('click', closeAuthModal);

authBtn?.addEventListener('click', async (e) => {
  if(currentUser){
    e.stopPropagation();
    if(authMenu.classList.contains('open')) closeAuthMenu();
    else await openAuthMenu();
    return;
  }
  authMode = 'signin';
  authModalTitle.textContent = 'Sign in';
  authSubmitBtn.textContent = 'Sign in';
  authToggleText.textContent = 'No account?';
  authToggleLink.textContent = 'Sign up';
  openAuthModal();
});

document.addEventListener('click', (e) => {
  if(authMenu.classList.contains('open') && !authMenuWrap.contains(e.target)) closeAuthMenu();
});

authNicknameSaveBtn?.addEventListener('click', async () => {
  const nickname = authNicknameInput.value.trim();
  if(nickname.length > 24){ authNicknameHint.textContent = 'Keep it under 24 characters.'; return; }
  authNicknameHint.textContent = '';
  await savePracticeNickname(nickname);
  authNicknameHint.textContent = nickname ? 'Saved.' : 'Nickname cleared.';
  refreshAuthButtonLabel();
});

authLogoutBtn?.addEventListener('click', async () => {
  const confirmed = confirm('Sign out?');
  if(!confirmed) return;
  closeAuthMenu();
  await supabaseClient.auth.signOut();
  currentUser = null;
  updateAuthUI();
});


authToggleLink?.addEventListener('click', (e) => {
  e.preventDefault();
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  authModalTitle.textContent = authMode === 'signin' ? 'Sign in' : 'Sign up';
  authSubmitBtn.textContent = authMode === 'signin' ? 'Sign in' : 'Sign up';
  authToggleText.textContent = authMode === 'signin' ? 'No account?' : 'Already have one?';
  authToggleLink.textContent = authMode === 'signin' ? 'Sign up' : 'Sign in';
});

authSubmitBtn?.addEventListener('click', async () => {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if(!email || !password){ authError.textContent = 'Enter both email and password.'; return; }

  authSubmitBtn.disabled = true;
  const fn = authMode === 'signin' ? 'signInWithPassword' : 'signUp';
  const { data, error } = await supabaseClient.auth[fn]({ email, password });
  authSubmitBtn.disabled = false;

  if(error){ authError.textContent = error.message; return; }
  if(authMode === 'signup' && !data.session){
    authError.textContent = 'Check your email to confirm your account.';
    return;
  }
  closeAuthModal();
  currentUser = data.user;
  updateAuthUI();
   if(currentView === 'practice-mode') loadPracticeAccount();
});

async function getAccessToken(){
  const { data } = await supabaseClient.auth.getSession();
  return data?.session?.access_token || null;
}

