const menuButton = document.querySelector('.menu-toggle');
const menu = document.querySelector('.primary-nav');

menuButton?.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  menuButton.setAttribute('aria-label', open ? '메뉴 열기' : '메뉴 닫기');
  menu.classList.toggle('is-open', !open);
});

menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  menu.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', '메뉴 열기');
}));

document.querySelector('#year').textContent = new Date().getFullYear();

const kakaoToggle = document.querySelector('#kakao-inquiry-toggle');
const kakaoPanel = document.querySelector('#kakao-inquiry-panel');
document.querySelector('#contact-kakao-toggle')?.addEventListener('click', () => kakaoToggle?.click());
kakaoToggle?.addEventListener('click', () => {
  const open = kakaoToggle.getAttribute('aria-expanded') === 'true';
  kakaoToggle.setAttribute('aria-expanded', String(!open));
  kakaoPanel.hidden = open;
});
document.addEventListener('click', event => {
  if (!event.target.closest('.floating-inquiry') && kakaoPanel && !kakaoPanel.hidden) {
    kakaoPanel.hidden = true;
    kakaoToggle.setAttribute('aria-expanded', 'false');
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && kakaoPanel && !kakaoPanel.hidden) {
    kakaoPanel.hidden = true;
    kakaoToggle.setAttribute('aria-expanded', 'false');
    kakaoToggle.focus();
  }
});

// Edit this list to update capacity and price labels across the product cards.
const barrelSizes = [
  { liters: 1, price: 299000 },
  { liters: 2, price: 299000 },
  { liters: 3, price: 299000 },
  { liters: 5, price: 299000 },
];

const renderBarrels = origin => barrelSizes.map(({ liters, price }) => {
  const country = origin === 'france' ? '프렌치' : '아메리칸';
  const image = origin === 'france' ? 'assets/french-engraved.jpg' : 'assets/american-engraved.jpg';
  const subject = encodeURIComponent(`${country} 오크통 ${liters}L 제품 문의`);
  return `<article class="product-card">
    <div class="product-picture"><span>${String(liters).padStart(2, '0')} / SIZE</span><img src="${image}" alt="${country} 오크통 ${liters}리터 콘셉트 이미지" loading="lazy"></div>
    <div class="product-info"><div><h3>${country} 오크통 ${liters}L</h3></div><strong>₩${price.toLocaleString('ko-KR')}</strong></div>
    <a href="mailto:info@oakorigin.co.kr?subject=${subject}" class="product-inquiry">${liters}L 제품 문의 <span aria-hidden="true">↗</span></a>
  </article>`;
}).join('');

document.querySelector('#product-grid-france').innerHTML = renderBarrels('france');
document.querySelector('#product-grid-usa').innerHTML = renderBarrels('usa');

const header = document.querySelector('.site-header');
const updateHeader = () => header.classList.toggle('scrolled', window.scrollY > 24);
window.addEventListener('scroll', updateHeader, { passive: true });
updateHeader();

