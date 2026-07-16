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

function openAuthModal(){ authModalBackdrop.classList.add('open'); authError.textContent=''; }
function closeAuthModal(){ authModalBackdrop.classList.remove('open'); authEmail.value=''; authPassword.value=''; }

function updateAuthUI(){
  if(currentUser){
    authBtn.textContent = currentUser.email;
  }else{
    authBtn.textContent = 'Sign in';
  }
  const adminGroup = document.getElementById('adminNavGroup');
  if(adminGroup) adminGroup.style.display = (currentUser?.email === ADMIN_EMAIL) ? '' : 'none';
}

authBtn?.addEventListener('click', () => {
  if(currentUser){
    supabaseClient.auth.signOut();
  }else{
    openAuthModal();
  }
});

authModalClose?.addEventListener('click', closeAuthModal);

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

