// IndexedDB Setup
const DB_NAME = 'MusicPlayerDB';
const DB_VERSION = 1;
const STORE_NAME = 'songs';

let db = null;

// Open IndexedDB connection
function openDB() {
    return new Promise((resolve, reject) => {
        if (db && db.name === DB_NAME) {
            resolve(db);
            return;
        }
        
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(request.error);
        
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('title', 'title', { unique: false });
                store.createIndex('artist', 'artist', { unique: false });
                store.createIndex('uploadDate', 'uploadDate', { unique: false });
            }
        };
    });
}

// Load and display songs
async function loadAdminSongs() {
    try {
        const database = await openDB();
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        request.onsuccess = () => {
            const songs = request.result;
            const container = document.getElementById("songsList");
            
            if (!container) return;
            
            if (songs.length === 0) {
                container.innerHTML = '<div class="empty-state">No songs uploaded yet. Upload your first song!</div>';
                return;
            }
            
            container.innerHTML = songs.map(song => `
                <div class="admin-song-item" data-song-id="${song.id}">
                    <div class="song-details">
                        <div class="song-title-admin">${escapeHtml(song.title)}</div>
                        <div class="song-artist-admin">${escapeHtml(song.artist)}</div>
                        <div class="song-meta">
                            📅 ${new Date(song.uploadDate).toLocaleDateString()} | 
                            📁 ${song.fileName} | 
                            💾 ${formatFileSize(song.fileSize)}
                        </div>
                    </div>
                    <button class="delete-song-btn" onclick="deleteSong('${song.id}')">🗑 Delete</button>
                </div>
            `).join('');
        };
        
        request.onerror = () => {
            console.error('Error loading songs');
            container.innerHTML = '<div class="empty-state">Error loading songs</div>';
        };
    } catch (error) {
        console.error('Error:', error);
    }
}

// Upload song function
async function uploadSong() {
    const title = document.getElementById("songTitle").value.trim();
    const artist = document.getElementById("artistName").value.trim();
    const fileInput = document.getElementById("songFile");
    const file = fileInput.files[0];

    if (!title || !artist || !file) {
        alert("⚠️ Please fill all fields");
        return;
    }

    // Check file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
        alert("❌ File is too large! Maximum size is 50MB.");
        return;
    }

    const uploadBtn = document.querySelector(".upload-btn");
    const progressBar = document.getElementById("uploadProgress");
    const progressFill = progressBar.querySelector(".progress-fill");
    
    uploadBtn.textContent = "Uploading...";
    uploadBtn.disabled = true;
    progressBar.style.display = "block";
    progressFill.style.width = "0%";

    try {
        // Read file as ArrayBuffer
        const arrayBuffer = await readFileAsArrayBuffer(file);
        
        // Convert to Blob for storage
        const audioBlob = new Blob([arrayBuffer], { type: file.type });
        
        const newSong = {
            id: Date.now(),
            title: title,
            artist: artist,
            audioBlob: audioBlob,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            uploadDate: new Date().toISOString()
        };

        const database = await openDB();
        
        // Check for duplicate
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const existingSongs = await getAllSongs(store);
        
        const duplicate = existingSongs.find(s => 
            s.title.toLowerCase() === title.toLowerCase() && 
            s.artist.toLowerCase() === artist.toLowerCase()
        );
        
        if (duplicate) {
            alert("⚠️ A song with this title and artist already exists!");
            resetUploadButton(uploadBtn, progressBar);
            return;
        }
        
        // Save to IndexedDB
        const writeTransaction = database.transaction([STORE_NAME], 'readwrite');
        const writeStore = writeTransaction.objectStore(STORE_NAME);
        
        writeStore.add(newSong);
        
        writeTransaction.oncomplete = () => {
            alert(`✅ "${title}" by ${artist} uploaded successfully!`);
            
            // Clear form
            document.getElementById("songTitle").value = "";
            document.getElementById("artistName").value = "";
            fileInput.value = "";
            
            // Refresh the admin song list
            loadAdminSongs();
            resetUploadButton(uploadBtn, progressBar);
        };
        
        writeTransaction.onerror = () => {
            alert("❌ Error saving song. Please try again.");
            resetUploadButton(uploadBtn, progressBar);
        };
        
        // Simulate progress
        let progress = 0;
        const interval = setInterval(() => {
            progress += 10;
            if (progress <= 90) {
                progressFill.style.width = progress + "%";
            }
            if (progress >= 100) {
                clearInterval(interval);
            }
        }, 100);
        
    } catch (error) {
        console.error('Upload error:', error);
        alert("❌ Error uploading file. Please try again.");
        resetUploadButton(uploadBtn, progressBar);
    }
}

// Helper function to read file as ArrayBuffer
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });
}

// Get all songs from store
function getAllSongs(store) {
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Delete song function
async function deleteSong(songId) {
    if (confirm("⚠️ Are you sure you want to delete this song? This action cannot be undone!")) {
        try {
            const database = await openDB();
            const transaction = database.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            
            // Get song info first
            const getRequest = store.get(parseInt(songId));
            
            getRequest.onsuccess = () => {
                const song = getRequest.result;
                const deleteRequest = store.delete(parseInt(songId));
                
                deleteRequest.onsuccess = () => {
                    alert(`✅ "${song?.title}" has been deleted successfully!`);
                    loadAdminSongs(); // Refresh the list
                };
                
                deleteRequest.onerror = () => {
                    alert("❌ Error deleting song");
                };
            };
            
        } catch (error) {
            console.error('Delete error:', error);
            alert("❌ Error deleting song");
        }
    }
}

// Reset upload button
function resetUploadButton(button, progressBar) {
    button.textContent = "📤 Upload Song";
    button.disabled = false;
    progressBar.style.display = "none";
    const progressFill = progressBar.querySelector(".progress-fill");
    if (progressFill) progressFill.style.width = "0%";
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to escape HTML
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Load songs when page loads
document.addEventListener("DOMContentLoaded", () => {
    loadAdminSongs();
    console.log("Admin panel loaded - Ready to manage songs");
});

// Make functions globally available
window.uploadSong = uploadSong;
window.deleteSong = deleteSong;