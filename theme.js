// Applies saved theme on initial page load
(function initTheme() {
  const savedTheme = localStorage.getItem('userTheme') || 'theme-wireframe';
  document.body.className = savedTheme;
  
  const selectElem = document.getElementById('themeSelect');
  if (selectElem) {
    selectElem.value = savedTheme;
  }
})();

function changeTheme(themeName) {
  document.body.className = themeName;
  localStorage.setItem('userTheme', themeName);
}