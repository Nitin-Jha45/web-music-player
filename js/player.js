// ============================================
// MUSIC PLAYER - Complete Working Version
// ============================================

// IndexedDB Setup for Songs (Shared across users on same device)
const DB_NAME = 'MusicPlayerDB';
const DB_VERSION = 1;
const STORE_NAME = 'songs';

let db = null;
let allSongs = [];
let currentSongIndex = 0;
let playlists = [];
let currentView = "home";

// DOM Elements
let songList, audioPlayer, nowPlaying, searchInput, nextBtn, prevBtn;
let playlistName, createPlaylistBtn, playlistContainer, librarySection;
let homeSection, playlistView, playlistNameDisplay, playlistSongsList;

// ============================================
// INDEXEDDB FUNCTIONS (For Song Storage)
// ============================================

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
                // Create object store for songs with auto-generated key
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('title', 'title', { unique: false });
                store.createIndex('artist', 'artist', { unique: false });
                store.createIndex('uploadDate', 'uploadDate', { unique: false });
            }
        };
    });
}

// Load all songs from IndexedDB
async function loadAllSongs() {
    try {
        const database = await openDB();
        const transaction = database.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        
        return new Promise((resolve, reject) => {
            request.onsuccess = () => {
                const songs = request.result;
                // Convert audioBlobs to object URLs for playback
                allSongs = songs.map(song => ({
                    ...song,
                    src: URL.createObjectURL(song.audioBlob)
                }));
                console.log(`Loaded ${allSongs.length} songs from IndexedDB`);
                resolve(allSongs);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Error loading songs:', error);
        return [];
    }
}

// ============================================
// PLAYLIST FUNCTIONS (Stored in localStorage - Device specific)
// ============================================

// Save playlists to localStorage (device-specific, private per user)
function savePlaylists() {
    localStorage.setItem("playlists", JSON.stringify(playlists));
    console.log(`Saved ${playlists.length} playlists to localStorage`);
}

// Load playlists from localStorage
function loadPlaylists() {
    const saved = localStorage.getItem("playlists");
    if (saved) {
        playlists = JSON.parse(saved);
        console.log(`Loaded ${playlists.length} playlists from localStorage`);
    } else {
        playlists = [];
        console.log("No existing playlists found");
    }
}

// Create new playlist
function createPlaylist() {
    const name = playlistName.value.trim();
    if (!name) {
        alert("Please enter a playlist name");
        return;
    }
    
    // Check for duplicate playlist name
    if (playlists.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        alert("A playlist with this name already exists!");
        return;
    }
    
    const newPlaylist = {
        id: Date.now(),
        name: name,
        songs: [],
        createdAt: new Date().toISOString()
    };
    
    playlists.push(newPlaylist);
    savePlaylists();
    displayPlaylists();
    
    playlistName.value = "";
    alert(`✅ Playlist "${name}" created successfully!`);
}

// Display all playlists in library
function displayPlaylists() {
    if (!playlistContainer) return;
    
    if (playlists.length === 0) {
        playlistContainer.innerHTML = '<div class="empty-state">No playlists yet. Create your first playlist!</div>';
        return;
    }
    
    playlistContainer.innerHTML = playlists.map(playlist => `
        <div class="playlist-card" onclick="openPlaylist(${playlist.id})">
            <h4>📁 ${escapeHtml(playlist.name)}</h4>
            <p>${playlist.songs.length} song${playlist.songs.length !== 1 ? 's' : ''}</p>
            <div class="song-count">🎵</div>
        </div>
    `).join('');
}

// Open a specific playlist
function openPlaylist(playlistId) {
    const playlist = playlists.find(p => p.id == playlistId);
    if (!playlist) return;
    
    // Hide playlists grid and create section
    const myPlaylistsSection = document.querySelector('.my-playlists-section');
    const createSection = document.querySelector('.create-playlist-section');
    if (myPlaylistsSection) myPlaylistsSection.style.display = 'none';
    if (createSection) createSection.style.display = 'none';
    
    // Show playlist view
    if (playlistView) playlistView.style.display = 'block';
    
    if (playlistNameDisplay) {
        playlistNameDisplay.textContent = `📁 ${escapeHtml(playlist.name)}`;
    }
    
    if (!playlistSongsList) return;
    
    if (playlist.songs.length === 0) {
        playlistSongsList.innerHTML = '<div class="empty-playlist">No songs in this playlist. Add some from Home or Search!</div>';
        return;
    }
    
    playlistSongsList.innerHTML = playlist.songs.map((song, index) => `
        <div class="playlist-song-item" onclick="playSongById(${song.id})">
            <div class="playlist-song-info">
                <div class="playlist-song-title">${escapeHtml(song.title)}</div>
                <div class="playlist-song-artist">${escapeHtml(song.artist)}</div>
            </div>
            <button class="remove-from-playlist-btn" onclick="event.stopPropagation(); removeFromPlaylist(${playlist.id}, ${index})">
                Remove
            </button>
        </div>
    `).join('');
}

// Back to playlists overview
function backToPlaylists() {
    // Hide playlist view
    if (playlistView) playlistView.style.display = 'none';
    
    // Show playlists grid and create section
    const myPlaylistsSection = document.querySelector('.my-playlists-section');
    const createSection = document.querySelector('.create-playlist-section');
    if (myPlaylistsSection) myPlaylistsSection.style.display = 'block';
    if (createSection) createSection.style.display = 'block';
    
    // Refresh playlists display
    displayPlaylists();
}

// Add song to playlist
function addToPlaylist(songId) {
    if (playlists.length === 0) {
        alert("No playlists found! Create a playlist first in the Library section.");
        showSection('library');
        return;
    }
    
    const song = allSongs.find(s => s.id == songId);
    if (!song) return;
    
    // Create playlist selection dialog
    let playlistOptions = "Select a playlist:\n\n";
    playlists.forEach((playlist, index) => {
        playlistOptions += `${index + 1}. ${playlist.name} (${playlist.songs.length} songs)\n`;
    });
    playlistOptions += "\nEnter number (or 0 to cancel):";
    
    const choice = prompt(playlistOptions);
    
    if (choice && choice !== "0") {
        const index = parseInt(choice) - 1;
        if (index >= 0 && index < playlists.length) {
            // Check if song already exists in playlist
            const exists = playlists[index].songs.some(s => s.id == songId);
            if (exists) {
                alert("⚠️ This song is already in the playlist!");
            } else {
                playlists[index].songs.push(song);
                savePlaylists();
                displayPlaylists();
                alert(`✅ Added "${song.title}" to "${playlists[index].name}"`);
            }
        } else {
            alert("Invalid selection!");
        }
    }
}

// Remove song from playlist
function removeFromPlaylist(playlistId, songIndex) {
    const playlist = playlists.find(p => p.id == playlistId);
    if (playlist) {
        const removedSong = playlist.songs[songIndex];
        playlist.songs.splice(songIndex, 1);
        savePlaylists();
        
        // Refresh current playlist view
        openPlaylist(playlistId);
        displayPlaylists();
        
        alert(`✅ Removed "${removedSong.title}" from playlist`);
    }
}

// Delete entire playlist
function deletePlaylist(playlistId) {
    const playlist = playlists.find(p => p.id == playlistId);
    if (!playlist) return;
    
    if (confirm(`Are you sure you want to delete "${playlist.name}" playlist?\nThis will remove all ${playlist.songs.length} songs from this playlist.`)) {
        playlists = playlists.filter(p => p.id != playlistId);
        savePlaylists();
        
        // If we're currently viewing this playlist, go back
        if (playlistView && playlistView.style.display === 'block') {
            backToPlaylists();
        } else {
            displayPlaylists();
        }
        
        alert(`✅ Playlist "${playlist.name}" deleted successfully!`);
    }
}

// ============================================
// PLAYBACK FUNCTIONS
// ============================================

// Play song by ID
async function playSongById(songId) {
    const song = allSongs.find(s => s.id == songId);
    if (song) {
        playSong(song);
    } else {
        console.error('Song not found:', songId);
        alert('Sorry, this song could not be found.');
    }
}

// Play song
function playSong(song) {
    if (!audioPlayer) return;
    
    currentSongIndex = allSongs.findIndex(s => s.id === song.id);
    
    // Set audio source and play
    audioPlayer.src = song.src;
    
    const playPromise = audioPlayer.play();
    
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.error("Playback failed:", error);
            nowPlaying.textContent = "⚠️ Cannot play this song. File may be corrupted.";
        });
    }
    
    // Update now playing display
    if (nowPlaying) {
        nowPlaying.innerHTML = `🎵 Now Playing: <strong>${escapeHtml(song.title)}</strong> by ${escapeHtml(song.artist)}`;
    }
    
    // Highlight current song in list (optional)
    highlightCurrentSong(song.id);
}

// Highlight currently playing song
function highlightCurrentSong(songId) {
    const allSongItems = document.querySelectorAll('.song-item');
    allSongItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-song-id') == songId) {
            item.classList.add('active');
        }
    });
}

// Play next song
function playNext() {
    if (allSongs.length === 0) return;
    currentSongIndex = (currentSongIndex + 1) % allSongs.length;
    playSong(allSongs[currentSongIndex]);
}

// Play previous song
function playPrevious() {
    if (allSongs.length === 0) return;
    currentSongIndex = (currentSongIndex - 1 + allSongs.length) % allSongs.length;
    playSong(allSongs[currentSongIndex]);
}

// ============================================
// DISPLAY FUNCTIONS
// ============================================

// Display songs in home/search view
async function displaySongs(songs) {
    if (!songList) return;
    
    if (!songs || songs.length === 0) {
        songList.innerHTML = '<div class="empty-state">🎵 No songs found. Contact admin to upload music!</div>';
        return;
    }
    
    songList.innerHTML = songs.map((song) => `
        <div class="song-item" data-song-id="${song.id}" onclick="playSongById(${song.id})">
            <div class="song-info">
                <div class="song-title">${escapeHtml(song.title)}</div>
                <div class="song-artist">${escapeHtml(song.artist)}</div>
                <div class="song-meta">${formatFileSize(song.fileSize)}</div>
            </div>
            <div class="song-actions">
                <button class="add-to-playlist-btn" onclick="event.stopPropagation(); addToPlaylist(${song.id})">
                    📋 Add to Playlist
                </button>
            </div>
        </div>
    `).join('');
}

// Handle search functionality
function handleSearch() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    
    if (searchTerm === "") {
        displaySongs(allSongs);
        return;
    }
    
    const filteredSongs = allSongs.filter(song => 
        song.title.toLowerCase().includes(searchTerm) || 
        song.artist.toLowerCase().includes(searchTerm)
    );
    
    if (filteredSongs.length === 0) {
        songList.innerHTML = `<div class="empty-state">🔍 No results found for "${escapeHtml(searchTerm)}"</div>`;
    } else {
        displaySongs(filteredSongs);
    }
}

// ============================================
// NAVIGATION FUNCTIONS
// ============================================

// Show different sections (Home, Search, Library)
function showSection(type) {
    currentView = type;
    
    // Hide all sections
    if (homeSection) homeSection.style.display = "none";
    if (librarySection) librarySection.style.display = "none";
    
    // Handle search input visibility
    if (searchInput) {
        if (type === 'search') {
            searchInput.style.display = "block";
            searchInput.focus();
        } else {
            searchInput.style.display = "none";
            searchInput.value = "";
        }
    }
    
    if (type === "home") {
        if (homeSection) {
            homeSection.style.display = "block";
            displaySongs(allSongs);
        }
    } else if (type === "search") {
        if (homeSection) {
            homeSection.style.display = "block";
            // Show all songs initially
            displaySongs(allSongs);
        }
    } else if (type === "library") {
        if (librarySection) {
            librarySection.style.display = "block";
            // Reset to playlists view
            if (playlistView) playlistView.style.display = "none";
            const myPlaylistsSection = document.querySelector('.my-playlists-section');
            const createSection = document.querySelector('.create-playlist-section');
            if (myPlaylistsSection) myPlaylistsSection.style.display = "block";
            if (createSection) createSection.style.display = "block";
            displayPlaylists();
        }
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

// Format file size for display
function formatFileSize(bytes) {
    if (!bytes) return 'Unknown size';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Escape HTML to prevent XSS attacks
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ============================================
// INITIALIZATION
// ============================================

// Initialize the player
async function init() {
    console.log("Initializing Music Player...");
    
    // Get DOM elements
    songList = document.getElementById("songList");
    audioPlayer = document.getElementById("audioPlayer");
    nowPlaying = document.getElementById("nowPlaying");
    searchInput = document.getElementById("searchInput");
    nextBtn = document.getElementById("nextBtn");
    prevBtn = document.getElementById("prevBtn");
    playlistName = document.getElementById("playlistName");
    createPlaylistBtn = document.getElementById("createPlaylistBtn");
    playlistContainer = document.getElementById("playlistContainer");
    librarySection = document.getElementById("librarySection");
    homeSection = document.getElementById("homeSection");
    playlistView = document.getElementById("playlistView");
    playlistNameDisplay = document.getElementById("playlistNameDisplay");
    playlistSongsList = document.getElementById("playlistSongsList");
    
    // Check if we're on the player page
    if (!songList) {
        console.log("Not on player page - skipping initialization");
        return;
    }
    
    // Load songs from IndexedDB
    await loadAllSongs();
    
    // Load playlists from localStorage
    loadPlaylists();
    
    // Display initial songs
    await displaySongs(allSongs);
    
    // Setup event listeners
    if (searchInput) {
        searchInput.addEventListener("input", handleSearch);
        searchInput.style.display = "none"; // Hide by default
    }
    
    if (nextBtn) {
        nextBtn.addEventListener("click", playNext);
    }
    
    if (prevBtn) {
        prevBtn.addEventListener("click", playPrevious);
    }
    
    if (audioPlayer) {
        audioPlayer.addEventListener("ended", playNext);
        audioPlayer.addEventListener("error", (e) => {
            console.error("Audio error:", e);
            nowPlaying.textContent = "⚠️ Error playing this song";
        });
    }
    
    if (createPlaylistBtn) {
        createPlaylistBtn.addEventListener("click", createPlaylist);
    }
    
    console.log(`✅ Player initialized with ${allSongs.length} songs and ${playlists.length} playlists`);
    console.log("ℹ️ Playlists are stored in localStorage - private to this device/browser");
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ============================================
// GLOBAL FUNCTIONS (For HTML onclick)
// ============================================

window.playSongById = playSongById;
window.openPlaylist = openPlaylist;
window.addToPlaylist = addToPlaylist;
window.removeFromPlaylist = removeFromPlaylist;
window.showSection = showSection;
window.backToPlaylists = backToPlaylists;
window.deletePlaylist = deletePlaylist;
window.formatFileSize = formatFileSize;