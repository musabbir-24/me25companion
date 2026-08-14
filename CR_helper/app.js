// ==========================================================================
// 1. FIREBASE SDK IMPORTS
// ==========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, getDocs, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
    getStorage, ref, uploadBytesResumable, getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { 
    getAuth, onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ==========================================================================
// 2. FIREBASE CONFIGURATION
// ==========================================================================
const firebaseConfig = {
  apiKey: "AIzaSyB4k3Drlan_vKHTTsyEwl5QoDlqfshDobY",
  authDomain: "me-portal-25.firebaseapp.com",
  projectId: "me-portal-25",
  storageBucket: "me-portal-25.firebasestorage.app",
  messagingSenderId: "1072719358582",
  appId: "1:1072719358582:web:698785c01a458520038d57",
  measurementId: "G-M9CFJCCKXL"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);

// State Arrays for Local Search & Filtering across pages
let state = {
    ct_updates: [],
    assignments: [],
    class_notes: [],
    lab_reports: [],
    gallery: []
};

// Map post categories to their respective Firestore collection names
const COLLECTION_MAP = {
    'ct': 'ct_updates',
    'assignment': 'assignments',
    'notes': 'class_notes',
    'lab': 'lab_reports',
    'gallery': 'gallery'
};

// ==========================================================================
// 3. INITIALIZATION & ROUTING
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    initAuthObserver();
    initModalPreview();

    // Route based on elements present on current page
    if (document.getElementById('ct-container')) initPublicPage('ct_updates', 'ct-container', 'ct-search', renderCTCard);
    if (document.getElementById('assignments-container')) initPublicPage('assignments', 'assignments-container', 'assignment-search', renderAssignmentCard);
    if (document.getElementById('notes-container')) initPublicPage('class_notes', 'notes-container', 'notes-search', renderNotesCard);
    if (document.getElementById('lab-container')) initPublicPage('lab_reports', 'lab-container', 'lab-search', renderLabCard);
    if (document.getElementById('gallery-container')) initGalleryPage();

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
    onAuthStateChanged(auth, (user) => {
        const userNameEl = document.getElementById('cr-user-name');
        if (user && userNameEl) {
            userNameEl.textContent = user.displayName || user.email || 'CR Admin';
        }
    });

    const logoutBtn = document.getElementById('admin-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                alert("Logged out successfully.");
                window.location.href = "index.html";
            } catch (err) {
                console.error("Logout error:", err);
            }
        });
    }
}

// ==========================================================================
// 5. UNIFIED ADMIN DASHBOARD (CTs, Assignments, Notes, Labs, Gallery)
// ==========================================================================
function initAdminDashboard() {
    const postForm = document.getElementById('admin-post-form');
    const categorySelect = document.getElementById('post-category');
    const filesInput = document.getElementById('post-files');
    const filePreviewContainer = document.getElementById('file-preview-container');
    const fileListPreview = document.getElementById('file-list-preview');

    // Dynamically toggle extra fields depending on chosen category
    if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
            const cat = e.target.value;
            toggleFieldGroup('dueDate-group', cat === 'ct' || cat === 'assignment');
            toggleFieldGroup('venue-group', cat === 'ct');
            toggleFieldGroup('subject-group', cat !== 'gallery');
        });
    }

    // Live listener for real-time dashboard posts management
    const activeCategory = categorySelect ? categorySelect.value : 'ct';
    listenToAdminCategory(COLLECTION_MAP[activeCategory] || 'ct_updates');

    if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
            const colName = COLLECTION_MAP[e.target.value] || 'ct_updates';
            listenToAdminCategory(colName);
        });
    }

    // Multi-File Preview
    if (filesInput) {
        filesInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                if (filePreviewContainer) filePreviewContainer.classList.remove('hidden');
                if (fileListPreview) {
                    fileListPreview.innerHTML = files.map((file, idx) => `
                        <div class="flex items-center justify-between bg-slate-900 border border-white/10 px-3 py-1.5 rounded-lg text-[11px]">
                            <span class="flex items-center gap-2 truncate max-w-[80%]">
                                <span class="text-rose-400 font-mono font-bold">#${idx + 1}</span>
                                <span class="text-slate-200 truncate">${file.name}</span>
                            </span>
                            <span class="text-[10px] text-slate-500 font-mono">${(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                        </div>
                    `).join('');
                }
            } else {
                if (filePreviewContainer) filePreviewContainer.classList.add('hidden');
            }
        });
    }

    // Single Unified Submission Handler
    if (postForm) {
        postForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const submitBtn = document.getElementById('submit-post-btn');
            const progressWrapper = document.getElementById('upload-progress-wrapper');
            const progressBar = document.getElementById('upload-progress-bar');
            const progressPercentage = document.getElementById('upload-percentage');

            const categoryKey = document.getElementById('post-category').value;
            const targetCollection = COLLECTION_MAP[categoryKey] || 'ct_updates';

            const subject = document.getElementById('post-subject')?.value.trim() || '';
            const title = document.getElementById('post-title').value.trim();
            const date = document.getElementById('post-date')?.value || '';
            const time = document.getElementById('post-time')?.value.trim() || '';
            const venue = document.getElementById('post-venue')?.value.trim() || '';
            const description = document.getElementById('post-desc')?.value.trim() || '';
            const selectedFiles = filesInput ? Array.from(filesInput.files) : [];

            try {
                if (submitBtn) submitBtn.disabled = true;
                if (progressWrapper) progressWrapper.classList.remove('hidden');

                const attachments = [];
                const totalFiles = selectedFiles.length;

                // 1. Storage Upload for Attached Documents or Gallery Photos
                for (let i = 0; i < totalFiles; i++) {
                    const file = selectedFiles[i];
                    const folder = categoryKey === 'gallery' ? 'gallery_photos' : 'academic_docs';
                    const storageRef = ref(storage, `${folder}/${Date.now()}_${file.name}`);
                    const uploadTask = uploadBytesResumable(storageRef, file);

                    await new Promise((resolve, reject) => {
                        uploadTask.on('state_changed',
                            (snapshot) => {
                                const fileProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                                const overallProgress = Math.round(((i + (fileProgress / 100)) / (totalFiles || 1)) * 100);
                                if (progressBar) progressBar.style.width = `${overallProgress}%`;
                                if (progressPercentage) progressPercentage.textContent = `${overallProgress}%`;
                            },
                            (error) => reject(error),
                            async () => {
                                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                                attachments.push({
                                    fileName: file.name,
                                    fileUrl: downloadURL,
                                    fileType: file.type
                                });
                                resolve();
                            }
                        );
                    });
                }

                // 2. Dynamic Payload Construction
                const payload = {
                    category: categoryKey,
                    subjectCode: subject,
                    title: title,
                    date: date,
                    time: time,
                    venue: venue,
                    description: description,
                    attachments: attachments,
                    createdAt: serverTimestamp()
                };

                await addDoc(collection(db, targetCollection), payload);

                alert(`Posted to ${categoryKey.toUpperCase()} successfully!`);

                postForm.reset();
                if (filePreviewContainer) filePreviewContainer.classList.add('hidden');
                if (progressWrapper) progressWrapper.classList.add('hidden');

            } catch (err) {
                console.error("Upload error:", err);
                alert("Failed to submit entry. Check console.");
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

// Real-time listener for current Admin view category
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
                <p class="text-[10px] text-slate-400">${item.date ? item.date : ''} ${item.attachments ? `• ${item.attachments.length} file(s)` : ''}</p>
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
// 6. GENERIC PUBLIC PAGE RENDERER (CTs, Assignments, Notes, Labs)
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

// Card Template 1: Class Tests
function renderCTCard(ct) {
    return `
        <div class="bg-slate-900/40 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 flex flex-col justify-between space-y-4 hover:border-rose-500/40 transition shadow-xl">
            <div class="space-y-3">
                <div class="flex items-center justify-between">
                    <span class="text-[10px] font-mono font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-lg">${ct.subjectCode}</span>
                    <span class="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">CT Schedule</span>
                </div>
                <h3 class="text-base font-bold text-white">${ct.title}</h3>
                ${ct.description ? `<p class="text-xs text-slate-400 line-clamp-2">${ct.description}</p>` : ''}
                <div class="p-3 bg-slate-950/60 rounded-2xl border border-white/5 space-y-1.5 text-[11px]">
                    <div class="flex justify-between text-slate-300"><span>Date:</span> <span class="font-bold text-white">${ct.date}</span></div>
                    <div class="flex justify-between text-slate-300"><span>Time:</span> <span class="font-bold text-amber-300">${ct.time}</span></div>
                    <div class="flex justify-between text-slate-300"><span>Venue:</span> <span class="font-semibold text-sky-300">${ct.venue}</span></div>
                </div>
            </div>
            ${renderAttachmentsList(ct.attachments)}
        </div>
    `;
}

// Card Template 2: Assignments
function renderAssignmentCard(asm) {
    return `
        <div class="bg-slate-900/40 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 flex flex-col justify-between space-y-4 hover:border-amber-500/40 transition shadow-xl">
            <div class="space-y-3">
                <div class="flex items-center justify-between">
                    <span class="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg">${asm.subjectCode}</span>
                    <span class="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full font-semibold">Due: ${asm.date}</span>
                </div>
                <h3 class="text-base font-bold text-white">${asm.title}</h3>
                ${asm.description ? `<p class="text-xs text-slate-400 line-clamp-3">${asm.description}</p>` : ''}
            </div>
            ${renderAttachmentsList(asm.attachments)}
        </div>
    `;
}

// Card Template 3: Class Notes
function renderNotesCard(note) {
    return `
        <div class="bg-slate-900/40 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 flex flex-col justify-between space-y-4 hover:border-sky-500/40 transition shadow-xl">
            <div class="space-y-3">
                <span class="text-[10px] font-mono font-bold text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-lg">${note.subjectCode}</span>
                <h3 class="text-base font-bold text-white">${note.title}</h3>
                ${note.description ? `<p class="text-xs text-slate-400 line-clamp-2">${note.description}</p>` : ''}
            </div>
            ${renderAttachmentsList(note.attachments)}
        </div>
    `;
}

// Card Template 4: Lab Reports
function renderLabCard(lab) {
    return `
        <div class="bg-slate-900/40 backdrop-blur-2xl rounded-3xl border border-white/10 p-6 flex flex-col justify-between space-y-4 hover:border-emerald-500/40 transition shadow-xl">
            <div class="space-y-3">
                <span class="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg">${lab.subjectCode}</span>
                <h3 class="text-base font-bold text-white">${lab.title}</h3>
                ${lab.description ? `<p class="text-xs text-slate-400 line-clamp-2">${lab.description}</p>` : ''}
            </div>
            ${renderAttachmentsList(lab.attachments)}
        </div>
    `;
}

// Helper to render attachment buttons
function renderAttachmentsList(attachments) {
    if (!attachments || attachments.length === 0) {
        return `<p class="text-[11px] text-slate-500 italic">No files attached.</p>`;
    }
    return `
        <div class="space-y-2 pt-3 border-t border-white/10">
            <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Attached Resources (${attachments.length}):</span>
            <div class="flex flex-col gap-2 max-h-36 overflow-y-auto no-scrollbar">
                ${attachments.map(file => `
                    <button onclick="openModalPreview('${file.fileUrl}', '${file.fileName.replace(/'/g, "\\'")}')" 
                            class="w-full flex items-center justify-between gap-2 bg-slate-950/80 hover:bg-slate-800 text-slate-200 border border-white/10 px-3 py-2 rounded-xl text-xs font-medium transition group">
                        <span class="flex items-center gap-2 truncate">
                            <i data-lucide="file-text" class="w-3.5 h-3.5 text-rose-400 shrink-0"></i>
                            <span class="truncate">${file.fileName}</span>
                        </span>
                        <i data-lucide="eye" class="w-3.5 h-3.5 text-slate-500 group-hover:text-rose-400 shrink-0"></i>
                    </button>
                `).join('')}
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
            const imgUrl = item.attachments && item.attachments[0] ? item.attachments[0].fileUrl : '';
            return `
                <div onclick="openModalPreview('${imgUrl}', '${item.title.replace(/'/g, "\\'")}')" class="group relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900 cursor-pointer aspect-square">
                    <img src="${imgUrl}" alt="${item.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80 group-hover:opacity-90 transition"></div>
                    <div class="absolute bottom-0 left-0 right-0 p-4">
                        <p class="text-xs font-bold text-white">${item.title}</p>
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

    if (!modal) return;

    if (modalTitle) modalTitle.textContent = title || "Resource Preview";
    if (downloadBtn) downloadBtn.href = url;

    const lowerUrl = url.toLowerCase();
    const isImage = lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg') || lowerUrl.includes('.png') || lowerUrl.includes('.webp');

    if (isImage) {
        if (iframe) iframe.style.display = 'none';
        if (img) { img.src = url; img.style.display = 'block'; }
    } else {
        if (img) img.style.display = 'none';
        if (iframe) {
            iframe.src = `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
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