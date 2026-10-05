// Feedback modal: type chips (suggestion/bug/feature), a message box, and an
// email field that's only shown when signed out (a signed-in user's email is
// taken from their session instead). Submits to POST /api/feedback, which
// accepts anonymous submissions -- no sign-in required.

const feedbackNavBtn = document.getElementById('feedbackNavBtn');
const feedbackModalBackdrop = document.getElementById('feedbackModalBackdrop');
const feedbackModalClose = document.getElementById('feedbackModalClose');
const feedbackTypeRow = document.getElementById('feedbackTypeRow');
const feedbackMessage = document.getElementById('feedbackMessage');
const feedbackEmailRow = document.getElementById('feedbackEmailRow');
const feedbackEmail = document.getElementById('feedbackEmail');
const feedbackSignedInHint = document.getElementById('feedbackSignedInHint');
const feedbackError = document.getElementById('feedbackError');
const feedbackSubmitBtn = document.getElementById('feedbackSubmitBtn');

let feedbackType = 'suggestion';

function resetFeedbackForm(){
  feedbackType = 'suggestion';
  feedbackTypeRow?.querySelectorAll('.fb-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.type === feedbackType);
  });
  if(feedbackMessage) feedbackMessage.value = '';
  if(feedbackEmail) feedbackEmail.value = '';
  if(feedbackError) feedbackError.textContent = '';
  if(feedbackSubmitBtn){ feedbackSubmitBtn.disabled = false; feedbackSubmitBtn.textContent = 'Send feedback'; }
}

function openFeedbackModal(){
  resetFeedbackForm();
  if(currentUser){
    if(feedbackEmailRow) feedbackEmailRow.style.display = 'none';
    if(feedbackSignedInHint){
      feedbackSignedInHint.style.display = '';
      feedbackSignedInHint.textContent = `Signed in as ${currentUser.email} — we'll follow up there if needed.`;
    }
  }else{
    if(feedbackEmailRow) feedbackEmailRow.style.display = '';
    if(feedbackSignedInHint) feedbackSignedInHint.style.display = 'none';
  }
  feedbackModalBackdrop.classList.add('open');
}

function closeFeedbackModal(){ feedbackModalBackdrop.classList.remove('open'); }

feedbackNavBtn?.addEventListener('click', openFeedbackModal);
feedbackModalClose?.addEventListener('click', closeFeedbackModal);
feedbackModalBackdrop?.addEventListener('click', (e) => {
  if(e.target === feedbackModalBackdrop) closeFeedbackModal();
});

feedbackTypeRow?.addEventListener('click', (e) => {
  const chip = e.target.closest('.fb-chip');
  if(!chip) return;
  feedbackType = chip.dataset.type;
  feedbackTypeRow.querySelectorAll('.fb-chip').forEach(c => c.classList.toggle('active', c === chip));
});

feedbackSubmitBtn?.addEventListener('click', async () => {
  const message = (feedbackMessage?.value || '').trim();
  if(!message){ feedbackError.textContent = 'Say a bit about what\'s on your mind.'; return; }
  feedbackError.textContent = '';
  feedbackSubmitBtn.disabled = true;
  feedbackSubmitBtn.textContent = 'Sending…';

  try{
    const headers = { 'Content-Type': 'application/json' };
    if(currentUser){
      const token = await getAccessToken();
      if(token) headers.Authorization = `Bearer ${token}`;
    }
    const body = { type: feedbackType, message };
    if(!currentUser && feedbackEmail?.value.trim()) body.email = feedbackEmail.value.trim();

    const res = await fetch(`${API_BASE}/api/feedback`, { method: 'POST', headers, body: JSON.stringify(body) });
    if(!res.ok) throw new Error('request failed');

    feedbackSubmitBtn.textContent = 'Sent ✓';
    setTimeout(closeFeedbackModal, 900);
  }catch(e){
    console.error('Failed to submit feedback:', e);
    feedbackError.textContent = 'Could not send feedback. Try again in a moment.';
    feedbackSubmitBtn.disabled = false;
    feedbackSubmitBtn.textContent = 'Send feedback';
  }
});
