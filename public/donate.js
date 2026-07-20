// Donate modal: PayPal link opens via normal <a href>; BTC address has copy-to-clipboard.

const donateModalBackdrop = document.getElementById('donateModalBackdrop');
const donateNavBtn = document.getElementById('donateNavBtn');
const donateModalClose = document.getElementById('donateModalClose');
const donateBtcAddress = document.getElementById('donateBtcAddress');
const donateBtcCopyBtn = document.getElementById('donateBtcCopyBtn');

function openDonateModal(){ donateModalBackdrop.classList.add('open'); }
function closeDonateModal(){ donateModalBackdrop.classList.remove('open'); }

donateNavBtn?.addEventListener('click', () => {
  if(window.innerWidth <= 820) closeDrawer();
  openDonateModal();
});
donateModalClose?.addEventListener('click', closeDonateModal);
donateModalBackdrop?.addEventListener('click', (e) => {
  if(e.target === donateModalBackdrop) closeDonateModal();
});

donateBtcCopyBtn?.addEventListener('click', async () => {
  try{
    await navigator.clipboard.writeText(donateBtcAddress.textContent.trim());
    donateBtcCopyBtn.textContent = 'Copied!';
  }catch(e){
    donateBtcCopyBtn.textContent = 'Copy failed';
  }
  setTimeout(() => { donateBtcCopyBtn.textContent = 'Copy'; }, 1800);
});
