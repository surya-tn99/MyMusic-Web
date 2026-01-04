const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Store active download streams: downloadId -> { res, keepAliveInterval }
const activeDownloads = new Map();

// Cache the working browser to save time on subsequent requests
let cachedBrowser = null;

// Helper: Promisified yt-dlp info fetch
const fetchYtInfo = (executable, url, browser) => {
    return new Promise((resolve, reject) => {
        const args = [
            '--dump-json',
            '--no-playlist',
            '--skip-download',
            url
        ];

        if (browser && browser !== 'none') {
            args.push('--cookies-from-browser', browser);
        }

        console.log(`[Spawn] yt-dlp info fetch with browser: ${browser}`);
        const process = spawn(executable, args);
        let output = '';
        let error = '';

        process.stdout.on('data', d => {
            output += d.toString();
        });
        process.stderr.on('data', d => {
            const errStr = d.toString();
            console.error('[yt-dlp/info stderr]:', errStr);
            error += errStr;
        });

        process.on('close', code => {
            if (code === 0) resolve(output);
            else reject(error);
        });
    });
};

exports.getVideoInfo = async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    const ytDlpPath = path.join(__dirname, '../../bin/yt-dlp');
    const executable = fs.existsSync(ytDlpPath) ? ytDlpPath : 'yt-dlp';

    // Helper to process info result
    const processResult = (output) => {
        const info = JSON.parse(output);
        return {
            title: info.title,
            thumbnail: info.thumbnail,
            duration: info.duration_string || info.duration,
            channel: info.uploader
        };
    };

    // If we have a cached browser, try it first
    if (cachedBrowser) {
        console.log(`[Info] Using cached browser: ${cachedBrowser}`);
        try {
            const output = await fetchYtInfo(executable, url, cachedBrowser);
            return res.json(processResult(output));
        } catch (err) {
            console.warn(`[Info] Cached browser ${cachedBrowser} failed. Resetting cache and retrying discovery...`);
            cachedBrowser = null;
            // Fall through to discovery logic
        }
    }

    // Discovery Chain
    try {
        console.log(`[Info] Trying with Firefox...`);
        const output = await fetchYtInfo(executable, url, 'firefox');
        cachedBrowser = 'firefox';
        return res.json(processResult(output));
    } catch (firefoxError) {
        console.warn(`[Info] Firefox failed. Retrying with Chrome...`);
        try {
            const output = await fetchYtInfo(executable, url, 'chrome');
            cachedBrowser = 'chrome';
            return res.json(processResult(output));
        } catch (chromeError) {
            console.warn(`[Info] Chrome failed. Retrying without cookies...`);
            try {
                const output = await fetchYtInfo(executable, url, 'none');
                cachedBrowser = 'none';
                return res.json(processResult(output));
            } catch (noCookieError) {
                console.error(`[Info] All attempts failed.`);
                return res.status(500).json({ error: 'Failed to fetch info. Video might be restricted.' });
            }
        }
    }
};

exports.startDownload = (req, res) => {
    const { url, format } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const downloadId = crypto.randomUUID();
    const type = format === 'video' ? 'video' : 'audio';
    console.log(`Starting download [${downloadId}] for: ${url} [${type}]`);

    // Base Downloads Directory
    const baseDir = path.join(__dirname, '../../downloads');
    const targetDir = path.join(baseDir, type);
    const thumbDir = path.join(baseDir, 'thumbnails');

    // Ensure directories get created
    [targetDir, thumbDir].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    const ytDlpPath = path.join(__dirname, '../../bin/yt-dlp');
    const executable = fs.existsSync(ytDlpPath) ? ytDlpPath : 'yt-dlp';

    // Initial State
    activeDownloads.set(downloadId, {
        clients: [],
        progress: { percentage: 0, status: 'Starting...' },
        process: null
    });

    // --- Process Starter Function ---
    const startProcess = (browser) => {
        console.log(`[Download ${downloadId}] Launching with browser: ${browser}`);

        const args = ['-o', path.join(targetDir, '%(title)s.%(ext)s')];

        if (type === 'video') {
            args.push('-f', 'bestvideo+bestaudio/best');
        } else {
            args.push('-f', 'bestaudio/best');
            args.push('-x', '--audio-format', 'mp3');
        }

        args.push(url);

        // Cookies
        if (browser !== 'none') {
            args.push('--cookies-from-browser', browser);
        }

        const ytDlp = spawn(executable, args);
        const downloadSession = activeDownloads.get(downloadId);
        if (downloadSession) downloadSession.process = ytDlp;

        let hasProgress = false;

        ytDlp.stdout.on('data', (data) => {
            const line = data.toString();

            const progressMatch = line.match(/(\d+\.?\d*)%\s+of\s+~?\s*([\d\.]+)(\w+)\s+at\s+([\d\.]+)(\w+\/s)/);

            if (progressMatch) {
                const percentage = parseFloat(progressMatch[1]);
                const size = progressMatch[2];
                const sizeUnit = progressMatch[3];
                const speed = progressMatch[4];
                const speedUnit = progressMatch[5];

                broadcast(downloadId, {
                    type: 'progress',
                    data: { percentage, size, sizeUnit, speed, speedUnit, raw: line.trim() }
                });
            } else {
                const simpleMatch = line.match(/(\d+\.?\d*)%/);
                if (simpleMatch) {
                    broadcast(downloadId, {
                        type: 'progress',
                        data: { percentage: parseFloat(simpleMatch[1]), raw: line.trim() }
                    });
                }
            }
        });

        ytDlp.stderr.on('data', (data) => {
            console.log(`[yt-dlp/DL stderr]: ${data.toString()}`); // Log ALL stderr to server console
        });

        ytDlp.on('close', (code) => {
            if (code === 0) {
                console.log(`[Download ${downloadId}] Success with ${browser}`);
                cachedBrowser = browser; // Update/Confirm cache on success
                broadcast(downloadId, { type: 'complete', status: 'completed', code });
                setTimeout(() => activeDownloads.delete(downloadId), 10000);
            } else {
                console.error(`[Download ${downloadId}] Failed with ${browser} (Exit: ${code})`);

                // If we were using cached browser, clear it and fall back to chain
                if (browser === cachedBrowser) {
                    console.log('[Download] Cached browser failed. Starting discovery chain...');
                    cachedBrowser = null;
                    return startProcess('firefox'); // Start from top
                }

                // Discovery Chain
                let nextBrowser = null;
                if (browser === 'firefox') nextBrowser = 'chrome';
                else if (browser === 'chrome') nextBrowser = 'none';

                if (nextBrowser) {
                    broadcast(downloadId, {
                        type: 'progress',
                        data: { percentage: 0, raw: `Auth failed (${browser}), retrying with ${nextBrowser}...` }
                    });
                    startProcess(nextBrowser);
                } else {
                    broadcast(downloadId, { type: 'complete', status: 'error', code });
                    setTimeout(() => activeDownloads.delete(downloadId), 10000);
                }
            }
        });
    }

    // Start with cached or default firefox
    startProcess(cachedBrowser || 'firefox');

    res.json({ message: 'Download initiated', downloadId });
};

// SSE Endpoint
exports.streamProgress = (req, res) => {
    const { id } = req.params;
    const download = activeDownloads.get(id);

    if (!download) {
        return res.status(404).json({ error: 'Download session not found' });
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    download.clients.push(res);
    const initialMsg = JSON.stringify({ type: 'connected', id });
    res.write(`data: ${initialMsg}\n\n`);

    req.on('close', () => {
        download.clients = download.clients.filter(client => client !== res);
    });
};

function broadcast(id, payload) {
    const download = activeDownloads.get(id);
    if (!download) return;
    const message = `data: ${JSON.stringify(payload)}\n\n`;
    download.clients.forEach(client => client.write(message));
}

exports.getDownloadHistory = (req, res) => {
    const baseDir = path.join(__dirname, '../../downloads');
    const audioDir = path.join(baseDir, 'audio');
    const videoDir = path.join(baseDir, 'video');
    const thumbDir = path.join(baseDir, 'thumbnails');

    let results = [];

    const processDir = (dir, type) => {
        if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir);
            files.forEach(file => {
                if (file.startsWith('.')) return;

                const filePath = path.join(dir, file);
                try {
                    const stats = fs.statSync(filePath);
                    const nameWithoutExt = path.parse(file).name;

                    // Try to find matching thumbnail
                    // We look for nameWithoutExt.* in thumbDir
                    let thumbnail = null;
                    if (fs.existsSync(thumbDir)) {
                        const thumbFiles = fs.readdirSync(thumbDir);
                        const match = thumbFiles.find(t => t.startsWith(nameWithoutExt));
                        if (match) {
                            thumbnail = `/downloads/thumbnails/${match}`;
                        }
                    }

                    results.push({
                        name: file,
                        // We serve these statically now via /downloads/audio/...
                        url: `/downloads/${type}/${file}`,
                        size: stats.size,
                        date: stats.mtime,
                        type: type,
                        thumbnail: thumbnail
                    });
                } catch (e) {
                    // skip error files
                }
            });
        }
    };

    processDir(audioDir, 'audio');
    processDir(videoDir, 'video');

    results.sort((a, b) => b.date - a.date);
    res.json(results);
};
