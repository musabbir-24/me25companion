// ==========================================================================
// 1. FIREBASE SDK IMPORTS
// ==========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ==========================================================================
// 2. FIREBASE CONFIGURATION
// ==========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyB4k3Drlan_vKHTTsyEwl5QoDlqfshDobY",
  authDomain: "me-portal-25.firebaseapp.com",
  projectId: "me-portal-25",
  messagingSenderId: "1072719358582",
  appId: "1:1072719358582:web:698785c01a458520038d57",
  measurementId: "G-M9CFJCCKXL"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Local State
let state = {
    ct_updates: [],
    assignments: [],
    class_notes: [],
    lab_reports: [],
    gallery: []
};

// Robust collection map to catch all HTML option value variations
const COLLECTION_MAP = {
    'ct': 'ct_updates',
    'ct_updates': 'ct_updates',
    'assignment': 'assignments',
    'assignments': 'assignments',
    'notes': 'class_notes',
    'class_notes': 'class_notes',
    'lab': 'lab_reports',
    'labs': 'lab_reports',
    'lab_reports': 'lab_reports',
    'gallery': 'gallery'
};

// ==========================================================================
// HELPER: Convert Google Drive Links to Direct Displayable Image URLs
// ==========================================================================
function getDirectImageUrl(url) {
    if (!url) return '';
    const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1] && url.includes('drive.google.com')) {
        return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
    }
    return url;
}

// ==========================================================================
// 3. INITIALIZATION & ROUTING
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initAuthObserver();
    initModalPreview();

    if (document.getElementById('ct-container')) initPublicPage('ct_updates', 'ct-container', 'ct-search', renderCTCard);
    if (document.getElementById('assignments-container')) initPublicPage('assignments', 'assignments-container', 'assignment-search', renderAssignmentCard);
    if (document.getElementById('notes-container')) initPublicPage('class_notes', 'notes-container', 'notes-search', renderNotesCard);
    if (document.getElementById('lab-container')) initPublicPage('lab_reports', 'lab-container', 'lab-search', renderLabCard);
    if (document.getElementById('gallery-container')) initGalleryPage();

    initHomePage();

    if (document.getElementById('admin-post-form')) {
        initAdminDashboard();
    }
});

function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

// ==========================================================================
// 4. AUTHENTICATION & SESSION MANAGEMENT
// ==========================================================================
function initAuthObserver() {
    const authOverlay = document.getElementById('admin-auth-overlay');
    const loginForm = document.getElementById('admin-login-form');
    const errorMsg = document.getElementById('login-error-msg');
    const userNameEl = document.getElementById('cr-user-name');

    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (authOverlay) authOverlay.classList.add('hidden');
            if (userNameEl) userNameEl.textContent = user.displayName || user.email || 'CR Admin';
        } else {
            if (authOverlay) authOverlay.classList.remove('hidden');
        }
    });

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('admin-email').value;
            const password = document.getElementById('admin-password').value;
            const submitBtn = document.getElementById('login-submit-btn');

            try {
                if (errorMsg) errorMsg.classList.add('hidden');
                if (submitBtn) submitBtn.disabled = true;

                await signInWithEmailAndPassword(auth, email, password);
                loginForm.reset();
            } catch (err) {
                console.error("Login failed:", err);
                if (errorMsg) {
                    errorMsg.textContent = "Authentication failed. Check credentials.";
                    errorMsg.classList.remove('hidden');
                }
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    const logoutBtn = document.getElementById('admin-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                alert("Logged out successfully.");
            } catch (err) {
                console.error("Logout error:", err);
            }
        });
    }
}

// ==========================================================================
// 5. UNIFIED ADMIN DASHBOARD
// ==========================================================================
function initAdminDashboard() {
    const categorySelect = document.getElementById('post-category');

    if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
            const cat = e.target.value.toLowerCase();
            toggleFieldGroup('dueDate-group', cat.includes('ct') || cat.includes('assignment'));
            toggleFieldGroup('venue-group', cat.includes('ct'));
            toggleFieldGroup('subject-group', !cat.includes('gallery'));
            
            const colName = COLLECTION_MAP[cat] || 'ct_updates';
            listenToAdminCategory(colName);
        });
    }

    const initialCategory = categorySelect ? categorySelect.value.toLowerCase() : 'ct';
    listenToAdminCategory(COLLECTION_MAP[initialCategory] || 'ct_updates');

    const postForm = document.getElementById('admin-post-form');

    if (postForm) {
        postForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('submit-post-btn');
            
            const rawCategory = document.getElementById('post-category').value.toLowerCase();
            const targetCollection = COLLECTION_MAP[rawCategory] || 'ct_updates';
            
            const title = document.getElementById('post-title').value.trim();
            const subject = document.getElementById('post-subject')?.value.trim() || '';
            const date = document.getElementById('post-date')?.value || document.getElementById('post-due-date')?.value || '';
            const time = document.getElementById('post-time')?.value.trim() || '';
            const venue = document.getElementById('post-venue')?.value.trim() || '';
            const description = document.getElementById('post-desc')?.value.trim() || '';
            
            let driveUrl = (document.getElementById('post-drive-url')?.value || document.getElementById('post-files')?.value || '').trim();
            if (driveUrl.includes('C:\\fakepath') || driveUrl.includes('C:/fakepath')) {
                driveUrl = '';
            }

            try {
                if (submitBtn) submitBtn.disabled = true;

                const attachments = driveUrl ? [{
                    fileName: title || 'Google Drive Resource',
                    fileUrl: driveUrl,
                    fileType: 'drive'
                }] : [];

                const payload = {
                    category: rawCategory,
                    subjectCode: subject,
                    title: title,
                    date: date,
                    time: time,
                    venue: venue,
                    description: description,
                    driveUrl: driveUrl,
                    attachments: attachments,
                    createdAt: serverTimestamp()
                };

                await addDoc(collection(db, targetCollection), payload);

                alert(`Posted to [${targetCollection.toUpperCase()}] successfully!`);
                postForm.reset();

            } catch (err) {
                console.error("Firestore Save Error:", err);
                alert(`Failed to save post: ${err.message}`);
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }
}

function toggleFieldGroup(groupId, show) {
    const el = document.getElementById(groupId);
    if (el) {
        if (show) el.classList.remove('hidden');
        else el.classList.add('hidden');
    }
}

let unsubscribeAdminListener = null;
function listenToAdminCategory(collectionName) {
    if (unsubscribeAdminListener) unsubscribeAdminListener();

    const q = query(collection(db, collectionName), orderBy("createdAt", "desc"));
    unsubscribeAdminListener = onSnapshot(q, (snapshot) => {
        const items = [];
        snapshot.forEach(docSnap => items.push({ id: docSnap.id, col: collectionName, ...docSnap.data() }));
        renderAdminPostList(items);
    });
}

function renderAdminPostList(items) {
    const container = document.getElementById('admin-posts-list');
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = `<div class="text-center py-8 text-slate-500 text-xs italic">No items published in this category yet.</div>`;
        return;
    }

    container.innerHTML = items.map(item => `
        <div class="bg-slate-900/40 border border-white/10 rounded-2xl p-4 flex items-center justify-between hover:border-white/20 transition">
            <div class="space-y-1 max-w-[80%]">
                <div class="flex items-center gap-2">
                    ${item.subjectCode ? `<span class="text-[10px] font-mono font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded">${item.subjectCode}</span>` : ''}
                    <span class="text-[10px] text-slate-400 uppercase font-mono">${item.category || 'Post'}</span>
                </div>
                <h4 class="text-xs font-bold text-white truncate">${item.title}</h4>
                <p class="text-[10px] text-slate-400">${item.date ? item.date : ''} ${item.driveUrl ? `• Linked Drive File` : ''}</p>
            </div>
            <button onclick="deletePost('${item.col}', '${item.id}')" class="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
        </div>
    `).join('');

    refreshIcons();
}

window.deletePost = async function(collectionName, id) {
    if (confirm("Delete this entry permanently?")) {
        try {
            await deleteDoc(doc(db, collectionName, id));
            alert("Entry removed.");
        } catch (err) {
            console.error("Delete failed:", err);
        }
    }
};

// ==========================================================================
// 6. GENERIC PUBLIC PAGE RENDERER
// ==========================================================================
function initPublicPage(collectionName, containerId, searchInputId, cardRendererFn) {
    const q = query(collection(db, collectionName), orderBy("createdAt", "desc"));

    onSnapshot(q, (snapshot) => {
        state[collectionName] = [];
        snapshot.forEach(docSnap => state[collectionName].push({ id: docSnap.id, ...docSnap.data() }));
        renderPublicGrid(containerId, state[collectionName], cardRendererFn);
    });

    const searchInput = document.getElementById(searchInputId);
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const filtered = state[collectionName].filter(item => 
                (item.subjectCode && item.subjectCode.toLowerCase().includes(term)) ||
                (item.title && item.title.toLowerCase().includes(term)) ||
                (item.description && item.description.toLowerCase().includes(term))
            );
            renderPublicGrid(containerId, filtered, cardRendererFn);
        });
    }
}

// ==========================================================================
// HOME PAGE WIDGET RENDERER
// ==========================================================================
function initHomePage() {
    const homeSections = [
        { 
            collectionName: 'ct_updates', 
            possibleIds: ['home-ct-container', 'recent-ct-container', 'home-ct', 'latest-ct'], 
            renderFn: renderCTCard 
        },
        { 
            collectionName: 'assignments', 
            possibleIds: ['home-assignments-container', 'recent-assignments-container', 'home-assignments', 'latest-assignments'], 
            renderFn: renderAssignmentCard 
        },
        { 
            collectionName: 'class_notes', 
            possibleIds: ['home-notes-container', 'recent-notes-container', 'home-notes', 'latest-notes'], 
            renderFn: renderNotesCard 
        },
        { 
            collectionName: 'lab_reports', 
            possibleIds: ['home-lab-container', 'recent-lab-container', 'home-labs', 'home-lab', 'latest-labs'], 
            renderFn: renderLabCard 
        }
    ];

    // 1. Render CT, Assignments, Notes, and Labs
    homeSections.forEach(section => {
        const targetId = section.possibleIds.find(id => document.getElementById(id));
        
        if (targetId) {
            const q = query(collection(db, section.collectionName), orderBy("createdAt", "desc"));
            
            onSnapshot(q, (snapshot) => {
                const items = [];
                snapshot.forEach(docSnap => items.push({ id: docSnap.id, ...docSnap.data() }));
                
                const recentItems = items.slice(0, 3);
                renderPublicGrid(targetId, recentItems, section.renderFn);
            }, (error) => {
                console.error(`Error loading home section [${section.collectionName}]:`, error);
            });
        }
    });

    // 2. Render Home Gallery Preview
    const homeGalleryIds = [
        'home-gallery-container', 
        'recent-gallery-container', 
        'home-gallery', 
        'recent-gallery', 
        'gallery-preview'
    ];
    const galleryTargetId = homeGalleryIds.find(id => document.getElementById(id));

    if (galleryTargetId) {
        const q = query(collection(db, "gallery"), orderBy("createdAt", "desc"));
        onSnapshot(q, (snapshot) => {
            const photos = [];
            snapshot.forEach(docSnap => photos.push({ id: docSnap.id, ...docSnap.data() }));

            const container = document.getElementById(galleryTargetId);
            if (!container) return;

            if (photos.length === 0) {
                container.innerHTML = `<div class="col-span-full text-center py-12 text-slate-500 text-xs italic">No gallery photos uploaded yet.</div>`;
                return;
            }

            // Display the 4 most recent photos on the home page
            const recentPhotos = photos.slice(0, 4);

            container.innerHTML = recentPhotos.map(item => {
                const rawUrl = item.attachments && item.attachments[0] ? item.attachments[0].fileUrl : (item.driveUrl || '');
                const imgUrl = getDirectImageUrl(rawUrl);
                const safeTitle = (item.title || 'Photo').replace(/'/g, "\\'");
                const displayTitle = item.title || 'Untitled Photo';

                return `
                    <div onclick="openModalPreview('${imgUrl}', '${safeTitle}')" class="group relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900 cursor-pointer aspect-square">
                        <img src="${imgUrl}" alt="${displayTitle}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                        <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80 group-hover:opacity-90 transition"></div>
                        <div class="absolute bottom-0 left-0 right-0 p-4">
                            <p class="text-xs font-bold text-white truncate">${displayTitle}</p>
                            ${item.description ? `<p class="text-[10px] text-slate-300 line-clamp-1">${item.description}</p>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        });
    }
}

function renderPublicGrid(containerId, items, cardRendererFn) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-12 text-slate-500 text-xs italic bg-slate-900/20 rounded-3xl border border-white/5">
                No resources found for this category.
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(item => cardRendererFn(item)).join('');
    refreshIcons();
}

function renderCTCard(ct) {
    return `
        <div class="bg-slate-900/40 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 flex flex-col justify-between space-y-4 hover:border-rose-500/40 transition shadow-xl">
            <div class="space-y-3">
                <div class="flex items-center justify-between">
                    <span class="text-[10px] font-mono font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-lg">${ct.subjectCode || 'CT'}</span>
                    <span class="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">CT Schedule</span>
                </div>
                <h3 class="text-base font-bold text-white">${ct.title}</h3>
                ${ct.description ? `<p class="text-xs text-slate-400 line-clamp-2">${ct.description}</p>` : ''}
                <div class="p-3 bg-slate-950/60 rounded-2xl border border-white/5 space-y-1.5 text-[11px]">
                    <div class="flex justify-between text-slate-300"><span>Date:</span> <span class="font-bold text-white">${ct.date || 'TBA'}</span></div>
                    <div class="flex justify-between text-slate-300"><span>Time:</span> <span class="font-bold text-amber-300">${ct.time || 'TBA'}</span></div>
                    <div class="flex justify-between text-slate-300"><span>Venue:</span> <span class="font-semibold text-sky-300">${ct.venue || 'TBA'}</span></div>
                </div>
            </div>
            ${renderAttachmentsList(ct.attachments)}
        </div>
    `;
}

function renderAssignmentCard(asm) {
    return `
        <div class="bg-slate-900/40 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 flex flex-col justify-between space-y-4 hover:border-amber-500/40 transition shadow-xl">
            <div class="space-y-3">
                <div class="flex items-center justify-between">
                    <span class="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg">${asm.subjectCode || 'ASSIGNMENT'}</span>
                    ${asm.date ? `<span class="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full font-semibold">Due: ${asm.date}</span>` : ''}
                </div>
                <h3 class="text-base font-bold text-white">${asm.title}</h3>
                ${asm.description ? `<p class="text-xs text-slate-400 line-clamp-3">${asm.description}</p>` : ''}
            </div>
            ${renderAttachmentsList(asm.attachments)}
        </div>
    `;
}

function renderNotesCard(note) {
    return `
        <div class="bg-slate-900/40 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 flex flex-col justify-between space-y-4 hover:border-sky-500/40 transition shadow-xl">
            <div class="space-y-3">
                <span class="text-[10px] font-mono font-bold text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-lg">${note.subjectCode || 'NOTES'}</span>
                <h3 class="text-base font-bold text-white">${note.title}</h3>
                ${note.description ? `<p class="text-xs text-slate-400 line-clamp-2">${note.description}</p>` : ''}
            </div>
            ${renderAttachmentsList(note.attachments)}
        </div>
    `;
}

function renderLabCard(lab) {
    return `
        <div class="bg-slate-900/40 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 flex flex-col justify-between space-y-4 hover:border-emerald-500/40 transition shadow-xl">
            <div class="space-y-3">
                <span class="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg">${lab.subjectCode || 'LAB'}</span>
                <h3 class="text-base font-bold text-white">${lab.title}</h3>
                ${lab.description ? `<p class="text-xs text-slate-400 line-clamp-2">${lab.description}</p>` : ''}
            </div>
            ${renderAttachmentsList(lab.attachments)}
        </div>
    `;
}

function renderAttachmentsList(attachments) {
    if (!attachments || attachments.length === 0 || !attachments[0].fileUrl) {
        return `<p class="text-[11px] text-slate-500 italic">No resource attached.</p>`;
    }
    return `
        <div class="space-y-2 pt-3 border-t border-white/10">
            <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Attached Resource:</span>
            <div class="flex flex-col gap-2">
                ${attachments.map(file => {
                    const safeFileName = (file.fileName || 'Resource').replace(/'/g, "\\'");
                    return `
                    <button onclick="openModalPreview('${file.fileUrl}', '${safeFileName}')" 
                            class="w-full flex items-center justify-between gap-2 bg-slate-950/80 hover:bg-slate-800 text-slate-200 border border-white/10 px-3 py-2 rounded-xl text-xs font-medium transition group">
                        <span class="flex items-center gap-2 truncate">
                            <i data-lucide="external-link" class="w-3.5 h-3.5 text-rose-400 shrink-0"></i>
                            <span class="truncate">${file.fileName}</span>
                        </span>
                        <i data-lucide="eye" class="w-3.5 h-3.5 text-slate-500 group-hover:text-rose-400 shrink-0"></i>
                    </button>
                `}).join('')}
            </div>
        </div>
    `;
}

// ==========================================================================
// 7. CLASS GALLERY PAGE
// ==========================================================================
function initGalleryPage() {
    const q = query(collection(db, "gallery"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        const photos = [];
        snapshot.forEach(docSnap => photos.push({ id: docSnap.id, ...docSnap.data() }));
        
        const container = document.getElementById('gallery-container');
        if (!container) return;

        if (photos.length === 0) {
            container.innerHTML = `<div class="col-span-full text-center py-12 text-slate-500 text-xs italic">No photos uploaded to gallery yet.</div>`;
            return;
        }

        container.innerHTML = photos.map(item => {
            const rawUrl = item.attachments && item.attachments[0] ? item.attachments[0].fileUrl : (item.driveUrl || '');
            const imgUrl = getDirectImageUrl(rawUrl);
            const safeTitle = (item.title || 'Photo').replace(/'/g, "\\'");
            const displayTitle = item.title || 'Untitled Photo';

            return `
                <div onclick="openModalPreview('${imgUrl}', '${safeTitle}')" class="group relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900 cursor-pointer aspect-square">
                    <img src="${imgUrl}" alt="${displayTitle}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80 group-hover:opacity-90 transition"></div>
                    <div class="absolute bottom-0 left-0 right-0 p-4">
                        <p class="text-xs font-bold text-white truncate">${displayTitle}</p>
                        ${item.description ? `<p class="text-[10px] text-slate-300 line-clamp-1">${item.description}</p>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    });
}

// ==========================================================================
// 8. EMBEDDED PREVIEW MODAL
// ==========================================================================
function initModalPreview() {
    const modal = document.getElementById('file-modal');
    const closeBtn = document.getElementById('close-modal-btn');

    if (closeBtn && modal) {
        closeBtn.addEventListener('click', closeModalPreview);
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModalPreview(); });
    }
}

window.openModalPreview = function(url, title) {
    const modal = document.getElementById('file-modal');
    const modalTitle = document.getElementById('modal-title');
    const iframe = document.getElementById('modal-iframe');
    const img = document.getElementById('modal-img');
    const downloadBtn = document.getElementById('modal-download-btn');

    if (!modal || !url) return;

    if (modalTitle) modalTitle.textContent = title || "Resource Preview";
    if (downloadBtn) downloadBtn.href = url;

    const formattedUrl = getDirectImageUrl(url);
    const lowerUrl = formattedUrl.toLowerCase();
    
    const isImage = lowerUrl.includes('.jpg') || 
                    lowerUrl.includes('.jpeg') || 
                    lowerUrl.includes('.png') || 
                    lowerUrl.includes('.webp') || 
                    lowerUrl.includes('.gif') ||
                    lowerUrl.includes('googleusercontent.com');

    if (isImage) {
        if (iframe) iframe.style.display = 'none';
        if (img) { 
            img.src = formattedUrl; 
            img.style.display = 'block'; 
        }
    } else {
        if (img) img.style.display = 'none';
        if (iframe) {
            let embedUrl = formattedUrl;
            if (formattedUrl.includes('drive.google.com')) {
                embedUrl = formattedUrl.replace(/\/view(\?.*)?$/, '/preview').replace(/\/edit(\?.*)?$/, '/preview');
            } else {
                embedUrl = `https://docs.google.com/gview?url=${encodeURIComponent(formattedUrl)}&embedded=true`;
            }
            iframe.src = embedUrl;
            iframe.style.display = 'block';
        }
    }

    modal.classList.remove('hidden');
};

function closeModalPreview() {
    const modal = document.getElementById('file-modal');
    const iframe = document.getElementById('modal-iframe');
    const img = document.getElementById('modal-img');

    if (modal) modal.classList.add('hidden');
    if (iframe) iframe.src = '';
    if (img) img.src = '';
}