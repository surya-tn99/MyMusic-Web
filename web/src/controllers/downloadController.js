const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Store active download streams: downloadId -> { res, keepAliveInterval }
const activeDownloads = new Map();

exports.getVideoInfo = (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    // Use local yt-dlp binary
    const ytDlpPath = path.join(__dirname, '../../bin/yt-dlp');
    const executable = fs.existsSync(ytDlpPath) ? ytDlpPath : 'yt-dlp';

    const args = [
        '--dump-json',
        '--no-playlist',
        '--skip-download',
        url,
        '--cookies-from-browser', 'firefox'
    ];

    const ytDlp = spawn(executable, args);
    let output = '';
    let errorOutput = '';

    ytDlp.stdout.on('data', (data) => output += data.toString());
    ytDlp.stderr.on('data', (data) => errorOutput += data.toString());

    ytDlp.on('close', (code) => {
        if (code !== 0) {
            console.error('Info fetch error:', errorOutput);
            return res.status(500).json({ error: 'Failed to fetch video info' });
        }
        try {
            const info = JSON.parse(output);
            res.json({
                title: info.title,
                thumbnail: info.thumbnail,
                duration: info.duration_string || info.duration,
                channel: info.uploader
            });
        } catch (e) {
            res.status(500).json({ error: 'Failed to parse video info' });
        }
    });
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

    // 1. Download the Thumbnail separately (fast)
    // We use the ID as the key to link them if possible, or just same filename base
    const thumbArgs = [
        '--write-thumbnail',
        '--skip-download',
        '--cookies-from-browser', 'firefox',
        '-o', path.join(thumbDir, '%(title)s.%(ext)s'),
        url
    ];

    // We run this async but don't wait for it to block the main download start
    // However, it might be better to run it;
    const ytDlpPath = path.join(__dirname, '../../bin/yt-dlp');
    const executable = fs.existsSync(ytDlpPath) ? ytDlpPath : 'yt-dlp';

    // Fire and forget thumbnail download (or log error)
    const thumbProcess = spawn(executable, thumbArgs);
    thumbProcess.on('close', (code) => {
        if (code !== 0) console.error('Thumbnail download failed');
    });

    // 2. Start Main Download
    const args = [
        '-o', path.join(targetDir, '%(title)s.%(ext)s'),
    ];

    if (type === 'video') {
        args.push('-f', 'bestvideo+bestaudio/best');
    } else {
        args.push('-f', 'bestaudio/best');
        args.push('-x', '--audio-format', 'mp3');
    }

    args.push(url);

    // Cookies
    const cookiesPath = path.join(__dirname, '../../data/cookies.txt');
    if (fs.existsSync(cookiesPath)) {
        args.push('--cookies', cookiesPath);
    } else {
        args.push('--cookies-from-browser', 'firefox');
    }

    // Start background process
    const ytDlp = spawn(executable, args);

    activeDownloads.set(downloadId, {
        process: ytDlp,
        clients: [],
        progress: { percentage: 0, status: 'Starting...' }
    });

    // Parse output
    ytDlp.stdout.on('data', (data) => {
        const line = data.toString();
        // [download]  79.2% of ~ 42.56MiB at 2.08MiB/s ETA 00:05

        // Regex to capture: Percentage, Size, Unit, Speed, SpeedUnit
        // Matches: 79.2% ... 42.56MiB ... 2.08MiB/s
        const progressMatch = line.match(/(\d+\.?\d*)%\s+of\s+~?\s*([\d\.]+)(\w+)\s+at\s+([\d\.]+)(\w+\/s)/);

        if (progressMatch) {
            const percentage = parseFloat(progressMatch[1]);
            const size = progressMatch[2];
            const sizeUnit = progressMatch[3];
            const speed = progressMatch[4];
            const speedUnit = progressMatch[5];

            broadcast(downloadId, {
                type: 'progress',
                data: {
                    percentage,
                    size,
                    sizeUnit,
                    speed,
                    speedUnit,
                    raw: line.trim()
                }
            });
        } else {
            // Fallback for just percentage if valid
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
        // broadcast(downloadId, { type: 'log', data: data.toString() });
    });

    ytDlp.on('close', (code) => {
        const status = code === 0 ? 'completed' : 'error';
        broadcast(downloadId, { type: 'complete', status, code });
        setTimeout(() => activeDownloads.delete(downloadId), 10000);
    });

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

    // Also support legacy files in root downloads for backward compatibility if needed, 
    // or just ignore them. Let's ignore them to enforce new structure or move them?
    // For now, let's just stick to the new structure.

    results.sort((a, b) => b.date - a.date);
    res.json(results);
};
