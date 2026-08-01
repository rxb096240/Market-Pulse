// Light/dark theme toggle. The inline script in index.html's <head> sets
// data-theme synchronously (before CSS paints) to avoid a flash of the
// wrong theme; this file just owns the toggle button and persistence.

function currentTheme(){
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function applyThemeIcon(){
  const btn = document.getElementById('themeToggleBtn');
  if(!btn) return;
  btn.textContent = currentTheme() === 'light' ? '☀️' : '🌙';
}

function setTheme(theme){
  if(theme === 'light'){
    document.documentElement.setAttribute('data-theme', 'light');
  }else{
    document.documentElement.removeAttribute('data-theme');
  }
  try{ localStorage.setItem('theme', theme); }catch(e){}
  applyThemeIcon();
}

document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
  setTheme(currentTheme() === 'light' ? 'dark' : 'light');
});

applyThemeIcon();
