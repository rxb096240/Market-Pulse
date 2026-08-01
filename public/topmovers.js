// Stocks · Top Movers panel: same data/rendering as the Home widget
// (fetchTopMovers/renderTopMovers in home.js), just a bigger list.
const STOCKS_TOP_MOVERS_COUNT = 20;
let stocksTopMoversLoaded = false;

async function refreshStocksTopMovers(){
  if(!stocksTopMoversLoaded){
    const el = document.getElementById('stocksTopMovers');
    if(el) el.innerHTML = '<div class="news-loading">Loading top movers…</div>';
  }
  const data = await fetchTopMovers(STOCKS_TOP_MOVERS_COUNT);
  if(data) stocksTopMoversLoaded = true;
  renderTopMovers(data, 'stocksTopMovers', 'stocksTopMoversNote');
}
