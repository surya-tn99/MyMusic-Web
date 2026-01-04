console.log('MyMusic Frontend Loaded');

// Utility: Debounce
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Sidebar Toggle
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.querySelector('.sidebar');

if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent immediate closing if we add document listener
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('mobile-open');
        } else {
            sidebar.classList.toggle('collapsed');
        }
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && sidebar.classList.contains('mobile-open')) {
            if (!sidebar.contains(e.target) && e.target !== sidebarToggle) {
                sidebar.classList.remove('mobile-open');
            }
        }
    });
}

// 1. Fetch User Profile
fetch('/auth/current_user')
    .then(res => res.json())
    .then(user => {
        const usernameEl = document.getElementById('username');
        if (usernameEl && user && user.displayName) {
            usernameEl.textContent = user.displayName;
        }
    })
    .catch(err => console.error('Failed to fetch user:', err));

const form = document.getElementById('downloadForm');
if (form) {
    const videoUrlInput = document.getElementById('videoUrl');
    const mediaPreview = document.getElementById('mediaPreview');
    const thumbnailImg = document.getElementById('thumbnailImg');
    const videoTitle = document.getElementById('videoTitle');
    const videoChannel = document.getElementById('videoChannel');
    const videoDuration = document.getElementById('videoDuration');

    const statusArea = document.getElementById('statusArea');
    const statusText = document.getElementById('statusText');
    const progressBar = document.querySelector('.progress-fill');
    const downloadBtn = document.getElementById('downloadBtn');

    // Navigation Elements
    const navDownloads = document.getElementById('navDownloads');
    const navMemory = document.getElementById('navMemory');
    const downloadsSection = document.getElementById('downloadsSection');
    const memorySection = document.getElementById('memorySection');
    const radioSection = document.getElementById('radioSection');
    const navRadio = document.getElementById('navRadio');

    // --- Music Player State ---
    const player = {
        queue: [],
        currentIndex: 0,
        audio: new Audio(),
        isPlaying: false
    };

    const musicPlayerEl = document.getElementById('musicPlayer');
    const playerThumb = document.getElementById('playerThumb');
    const playerTitle = document.getElementById('playerTitle');
    const playerArtist = document.getElementById('playerArtist');
    const playBtn = document.getElementById('playBtn');
    const playIcon = document.getElementById('playIcon');
    const pauseIcon = document.getElementById('pauseIcon');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const seekSlider = document.getElementById('seekSlider');
    const currentTimeEl = document.getElementById('currentTime');
    const totalTimeEl = document.getElementById('totalTime');
    const playerMinimize = document.getElementById('playerMinimize');
    const playerInfoArea = document.getElementById('playerInfoArea');
    const volumeSlider = document.getElementById('volumeSlider');

    // --- Navigation Logic (Hash Based) ---
    function handleHashChange() {
        const hash = window.location.hash || '#downloads'; // Default to downloads

        // Update Sidebar UI
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        const contentWrapper = document.querySelector('.content-wrapper');

        if (hash === '#memory') {
            const el = document.getElementById('navMemory');
            if (el) el.classList.add('active');

            if (navDownloads) navDownloads.classList.remove('active');
            if (navRadio) navRadio.classList.remove('active');
            downloadsSection.classList.add('hidden');
            memorySection.classList.remove('hidden');
            radioSection.classList.add('hidden');
            if (contentWrapper) contentWrapper.classList.add('align-top');
            loadMemory();
        } else if (hash === '#radio') {
            const el = document.getElementById('navRadio');
            if (el) el.classList.add('active');

            if (navDownloads) navDownloads.classList.remove('active');
            if (navMemory) navMemory.classList.remove('active');
            downloadsSection.classList.add('hidden');
            memorySection.classList.add('hidden');
            radioSection.classList.remove('hidden');
            if (contentWrapper) contentWrapper.classList.add('align-top');
            loadRadio();
        } else if (hash === '#settings') {
            // Placeholder for settings
            const el = document.querySelector('a[href="#settings"]');
            if (el) el.classList.add('active');
            if (contentWrapper) contentWrapper.classList.add('align-top');
        } else {
            // Default: Downloads
            const el = document.getElementById('navDownloads');
            if (el) el.classList.add('active');

            if (navRadio) navRadio.classList.remove('active');
            downloadsSection.classList.remove('hidden');
            memorySection.classList.add('hidden');
            radioSection.classList.add('hidden');
            if (contentWrapper) contentWrapper.classList.remove('align-top');
        }
    }

    // Initialize Hash Handling
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('load', handleHashChange);

    // --- Memory Logic ---
    let allFiles = [];

    function renderMemory(files) {
        const grid = document.getElementById('memoryGrid');
        if (!grid) return;

        grid.innerHTML = '';

        if (!files || files.length === 0) {
            grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #888; margin-top: 2rem;">No files found in memory.</p>';
            return;
        }

        files.forEach(file => {
            const date = new Date(file.date).toLocaleDateString();
            const size = (file.size / (1024 * 1024)).toFixed(1) + ' MB';

            // Thumbnail or fallback
            let thumbHtml = '';
            const typeBadge = file.type === 'video'
                ? '<span class="type-badge video">VIDEO</span>'
                : '<span class="type-badge audio">AUDIO</span>';

            if (file.thumbnail) {
                thumbHtml = `
                    <div class="thumb-wrapper">
                        <img src="${file.thumbnail}" alt="${file.name}" class="memory-thumb">
                        ${typeBadge}
                    </div>`;
            } else {
                const icon = file.type === 'audio' ? '🎵' : '🎬';
                thumbHtml = `
                    <div class="thumb-wrapper">
                        <span class="file-icon">${icon}</span>
                        ${typeBadge}
                    </div>`;
            }

            const card = document.createElement('div');
            card.className = 'memory-card';
            card.innerHTML = `
                ${thumbHtml}
                <div class="file-name" title="${file.name}">${file.name}</div>
                <div class="file-meta">
                    <span>${size}</span>
                    <span>${date}</span>
                </div>
            `;
            grid.appendChild(card);
        });
    }

    async function loadMemory() {
        try {
            console.log('Fetching download history...');
            const res = await fetch('/api/downloads/history');
            allFiles = await res.json();
            console.log('History fetched:', allFiles);

            // Apply current filter
            const activeBtn = document.querySelector('.filter-btn.active');
            const activeFilter = activeBtn ? activeBtn.dataset.filter : 'all';
            applyFilter(activeFilter);
        } catch (err) {
            console.error('Failed to load history', err);
            const grid = document.getElementById('memoryGrid');
            if (grid) grid.innerHTML = '<p style="text-align:center; color:red">Failed to load history.</p>';
        }
    }

    function applyFilter(type) {
        let filtered = allFiles;
        if (type !== 'all') {
            filtered = allFiles.filter(f => f.type === type);
        }
        renderMemory(filtered);
    }

    // Filter Buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update UI
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');

            // Filter
            applyFilter(e.target.dataset.filter);
        });
    });


    // --- Radio Logic ---

    async function loadRadio() {
        try {
            const res = await fetch('/api/downloads/history');
            const allFiles = await res.json();
            // Filter strictly for Audio
            player.queue = allFiles.filter(f => f.type === 'audio');

            document.getElementById('queueCount').textContent = `${player.queue.length} Songs`;
            renderQueue();

            // If player has no track, queue first one
            if (player.audio.src === '' && player.queue.length > 0) {
                loadTrack(0, false);
            }
        } catch (err) {
            console.error('Failed to load radio', err);
        }
    }

    function renderQueue() {
        const list = document.getElementById('radioQueue');
        list.innerHTML = '';

        player.queue.forEach((song, index) => {
            const item = document.createElement('div');
            item.className = `queue-item ${index === player.currentIndex ? 'playing' : ''}`;
            item.onclick = () => {
                loadTrack(index, true);
            };

            const thumb = song.thumbnail || 'assert/favicon.png';
            const duration = '3:00'; // Placeholder as we don't have meta yet

            item.innerHTML = `
                <img src="${thumb}" class="queue-thumb" loading="lazy">
                <div class="queue-info">
                    <div class="queue-title">${song.name}</div>
                    <div class="queue-meta">MyMusic Radio</div>
                </div>
                <!-- <div class="queue-duration">${duration}</div> -->
            `;
            list.appendChild(item);
        });
    }

    // --- Audio Player Core ---

    function loadTrack(index, autoPlay = true) {
        if (index < 0 || index >= player.queue.length) return;

        player.currentIndex = index;
        const song = player.queue[index];

        player.audio.src = song.url;
        player.audio.load();

        updatePlayerUI(song);
        updateQueueUI();
        updateMediaSession(song);

        if (autoPlay) {
            playTrack();
        }
    }

    function playTrack() {
        player.audio.play()
            .then(() => {
                player.isPlaying = true;
                playIcon.classList.add('hidden');
                pauseIcon.classList.remove('hidden');
                playerThumb.classList.add('playing-state');
                musicPlayerEl.classList.remove('hidden'); // Show player
                navigator.mediaSession.playbackState = 'playing';
            })
            .catch(e => console.error("Play failed", e));
    }

    function pauseTrack() {
        player.audio.pause();
        player.isPlaying = false;
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
        playerThumb.classList.remove('playing-state');
        navigator.mediaSession.playbackState = 'paused';
    }

    function prevTrack() {
        let newIndex = player.currentIndex - 1;
        if (newIndex < 0) newIndex = player.queue.length - 1; // Loop
        loadTrack(newIndex, true);
    }

    function nextTrack() {
        let newIndex = player.currentIndex + 1;
        if (newIndex >= player.queue.length) newIndex = 0; // Loop
        loadTrack(newIndex, true);
    }

    function updatePlayerUI(song) {
        playerTitle.textContent = song.name;
        playerArtist.textContent = "MyMusic Radio"; // or extract artist if possible
        playerThumb.src = song.thumbnail || 'assert/favicon.png';
    }

    function updateQueueUI() {
        // Simple re-render to update 'playing' class
        // Optimization: just toggle class on existing elements could be better
        renderQueue();
    }

    function updateMediaSession(song) {
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: song.name,
                artist: 'MyMusic Radio',
                album: 'Downloads',
                artwork: [
                    { src: song.thumbnail || 'assert/favicon.png', sizes: '512x512', type: 'image/png' }
                ]
            });

            navigator.mediaSession.setActionHandler('play', playTrack);
            navigator.mediaSession.setActionHandler('pause', pauseTrack);
            navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
            navigator.mediaSession.setActionHandler('nexttrack', nextTrack);
        }
    }

    // --- Event Listeners (Player) ---
    playBtn.addEventListener('click', () => {
        if (player.isPlaying) pauseTrack();
        else playTrack();
    });

    prevBtn.addEventListener('click', prevTrack);
    nextBtn.addEventListener('click', nextTrack);

    player.audio.addEventListener('timeupdate', () => {
        const { currentTime, duration } = player.audio;
        if (isNaN(duration)) return;

        const progressPercent = (currentTime / duration) * 100;
        seekSlider.value = progressPercent;

        // Format Time
        const formatTime = (t) => {
            const min = Math.floor(t / 60);
            const sec = Math.floor(t % 60);
            return `${min}:${sec < 10 ? '0' + sec : sec}`;
        };

        currentTimeEl.textContent = formatTime(currentTime);
        totalTimeEl.textContent = formatTime(duration);
    });

    player.audio.addEventListener('ended', nextTrack);

    seekSlider.addEventListener('input', () => {
        const seekTo = player.audio.duration * (seekSlider.value / 100);
        player.audio.currentTime = seekTo;
    });

    // Mobile Player Toggle
    // Click on thumbnail/info expands logic handled by CSS classes?
    // We added expanded class in CSS logic.
    playerInfoArea.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            musicPlayerEl.classList.add('expanded');
        }
    });

    playerMinimize.addEventListener('click', (e) => {
        e.stopPropagation();
        musicPlayerEl.classList.remove('expanded');
    });

    if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
            player.audio.volume = e.target.value;
        });
    }


    // --- Download Logic ---

    // YouTube URL Regex
    const YOUTUBE_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;

    const fetchMetadata = debounce(async (url) => {
        mediaPreview.classList.add('hidden');
        if (!url) {
            statusArea.classList.add('hidden');
            return;
        }

        if (!YOUTUBE_REGEX.test(url)) {
            statusArea.classList.remove('hidden');
            statusText.textContent = "Invalid YouTube URL.";
            progressBar.style.width = '0%';
            return;
        }

        try {
            statusArea.classList.remove('hidden');
            statusText.textContent = "Fetching video info...";
            progressBar.style.width = '20%';

            const response = await fetch('/api/downloads/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            const data = await response.json();

            if (response.ok) {
                thumbnailImg.src = data.thumbnail;
                videoTitle.textContent = data.title;
                videoChannel.textContent = data.channel;
                videoDuration.textContent = data.duration;

                mediaPreview.classList.remove('hidden');
                statusArea.classList.add('hidden');
            } else {
                statusText.textContent = 'Error: ' + (data.error || 'Unknown');
            }
        } catch (error) {
            statusText.textContent = 'Failed to connect.';
        }
    }, 800);

    videoUrlInput.addEventListener('input', (e) => {
        fetchMetadata(e.target.value);
    });

    // Reset Handler (attached to button if needed, but form submit handles it)
    downloadBtn.addEventListener('click', (e) => {
        if (downloadBtn.textContent === 'Download Another') {
            e.preventDefault();
            e.stopPropagation();
            window.location.reload();
            return false;
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Check if button text is 'Download Another' - though click handler should catch it, 
        // sometimes enter key triggers submit directly.
        if (downloadBtn.textContent === 'Download Another') {
            window.location.reload();
            return;
        }

        const url = videoUrlInput.value;
        const format = document.querySelector('input[name="format"]:checked').value;

        if (!url) return;

        // Reset Status & UI
        statusArea.classList.remove('hidden');
        statusText.textContent = `Starting download...`;
        progressBar.style.width = '0%';
        document.getElementById('logOutput').textContent = '';

        // Hide Button
        downloadBtn.classList.add('hidden');

        try {
            const response = await fetch('/api/downloads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, format })
            });

            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }

            const data = await response.json();

            if (response.ok && data.downloadId) {
                statusText.textContent = 'Initializing stream...';

                const eventSource = new EventSource(`/api/downloads/progress/${data.downloadId}`);

                eventSource.onmessage = (event) => {
                    const payload = JSON.parse(event.data);

                    if (payload.type === 'progress') {
                        progressBar.style.width = `${payload.data.percentage}%`;

                        const { percentage, size, sizeUnit, speed, speedUnit, raw } = payload.data;

                        if (size && speed) {
                            statusText.textContent = `${percentage}% of ${size}${sizeUnit} @ ${speed}${speedUnit}`;
                        } else {
                            // Fallback or just raw trimming
                            statusText.textContent = raw ? raw.replace('[download]', '').trim() : `${percentage}%`;
                        }

                    } else if (payload.type === 'complete') {
                        if (payload.status === 'completed') {
                            statusText.textContent = 'Download Complete! ✅';
                            progressBar.style.width = '100%';

                            // Show "Download Another"
                            setTimeout(() => {
                                downloadBtn.classList.remove('hidden');
                                downloadBtn.textContent = 'Download Another';
                            }, 1000);
                        } else {
                            statusText.textContent = 'Download Failed ❌';
                            downloadBtn.classList.remove('hidden');
                            downloadBtn.textContent = 'Try Again';
                        }
                        eventSource.close();
                    }
                };

                eventSource.onerror = () => {
                    eventSource.close();
                    downloadBtn.classList.remove('hidden');
                };

            } else {
                statusText.textContent = 'Error: ' + data.error;
                downloadBtn.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Error:', error);
            statusText.textContent = 'Request failed.';
            downloadBtn.classList.remove('hidden');
        }
    });
}
