document.addEventListener('DOMContentLoaded', () => {
    const navContainer = document.getElementById('navbar-container');
    if (!navContainer) return;

    // Detect current page filename
    let currentPage = window.location.pathname.split('/').pop();
    if (!currentPage || currentPage === '') currentPage = 'index.html';

    // List of all navigation items
    const navItems = [
        { name: 'Home', href: 'index.html' },
        { name: 'CT Updates', href: 'ct-updates.html' },
        { name: 'Assignments', href: 'assignments.html' },
        { name: 'Class Notes', href: 'class-notes.html' },
        { name: 'Lab Reports', href: 'lab-reports.html' },
        { name: 'Gallery', href: 'gallery.html' }
    ];

    // Generate links with active state highlighting
    const navLinksHtml = navItems.map(item => {
        const isActive = currentPage === item.href;
        const activeClasses = isActive 
            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold' 
            : 'text-slate-400 hover:text-white hover:bg-white/5';
        
        return `<a href="${item.href}" class="px-3.5 py-1.5 rounded-xl transition ${activeClasses}">${item.name}</a>`;
    }).join('');

    // Inject Master Navigation HTML
    navContainer.innerHTML = `
        <header class="sticky top-0 z-40 bg-slate-950/70 backdrop-blur-xl border-b border-white/10">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                
                <!-- Brand Logo -->
                <a href="index.html" class="flex items-center gap-2.5 group">
                    <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-rose-500/20 group-hover:scale-105 transition duration-300">
                        <i data-lucide="book-open-check" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <span class="text-sm font-extrabold tracking-tight text-white block leading-none">ME-25 Companion</span>
                        <span class="text-[10px] font-mono text-slate-400">1st Semester</span>
                    </div>
                </a>

                <!-- Desktop Navigation Links -->
                <nav class="hidden md:flex items-center gap-1 bg-slate-900/60 p-1.5 rounded-2xl border border-white/10 text-xs font-medium">
                    ${navLinksHtml}
                </nav>

                <!-- Admin Button -->
                <div class="flex items-center gap-3">
                    <a href="admin-dashboard.html" class="flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-white/10 hover:border-white/20 transition group">
                        <i data-lucide="shield-check" class="w-4 h-4 text-rose-400 group-hover:rotate-12 transition"></i>
                        <span class="hidden sm:inline">CR Admin</span>
                    </a>
                </div>

            </div>
        </header>
    `;

    // Re-trigger Lucide icon rendering after injection
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
});