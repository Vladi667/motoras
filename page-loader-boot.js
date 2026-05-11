(function () {
 try {
 if (sessionStorage.getItem('motoras_page_loader_nav')) {
 document.documentElement.classList.add('page-loader-boot');
 }
 } catch (error) {}
})();
