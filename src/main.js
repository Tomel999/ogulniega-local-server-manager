const { app, BrowserWindow, ipcMain, dialog, shell, session } = require('electron');
const os = require('os');
const path = require('path');
const Store = require('electron-store');
const fetch = require('node-fetch');
const fs = require('fs-extra');
const { spawn, exec } = require('child_process');
const pidusage = require('pidusage');

const store = new Store();
const serversPath = path.join(app.getPath('userData'), 'servers');
const backupsPath = path.join(app.getPath('userData'), 'backups');
fs.ensureDirSync(serversPath);
fs.ensureDirSync(backupsPath);

const runningServers = {};
const serverIntervals = {};

async function findPidByPort(port) {
    const platform = process.platform;
    const command = platform === 'win32'
        ? `netstat -aon | findstr ":${port}"`
        : `lsof -i tcp:${port} -sTCP:LISTEN -t -n`;

    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                if (!stderr || stdout.trim() === '') return resolve(null);
                console.error(`Błąd przy szukaniu PID dla portu ${port}:`, stderr);
                return reject(error);
            }
            const output = stdout.trim();
            if (!output) return resolve(null);
            if (platform === 'win32') {
                const match = output.match(/LISTENING\s+(\d+)/);
                resolve(match ? parseInt(match[1], 10) : null);
            } else {
                resolve(parseInt(output.split('\n')[0], 10));
            }
        });
    });
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,

            additionalPermissions: ['clipboard-write', 'clipboard-read'],
        },
    });

    win.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'clipboard-read' || permission === 'clipboard-write') {
            callback(true);
        } else {
            callback(false);
        }
    });

    win.loadFile('src/index.html');

}

app.whenReady().then(() => {

    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'clipboard-read' || permission === 'clipboard-write') {
            callback(true);
        } else {
            callback(false);
        }
    });

    createWindow();
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('create-server', async (event, { name, type, version, ram }) => {
    const serverId = `${name.replace(/\s+/g, '-')}-${Date.now()}`;
    const serverDir = path.join(serversPath, serverId);
    let jarPath = '';
    let jarName = '';

    try {
        await fs.ensureDir(serverDir);
        event.sender.send('create-log', 'Tworzenie struktury folderów...');

        switch (type) {
            case 'paper':

                const buildResponse = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${version}/builds`);
                const buildData = await buildResponse.json();
                const latestBuild = buildData.builds.pop();
                jarName = latestBuild.downloads.application.name;
                const downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild.build}/downloads/${jarName}`;
                const jarResponse = await fetch(downloadUrl);
                jarPath = path.join(serverDir, 'server.jar');
                const fileStream = fs.createWriteStream(jarPath);
                await new Promise((resolve, reject) => {
                    jarResponse.body.pipe(fileStream);
                    jarResponse.body.on('error', reject);
                    fileStream.on('finish', resolve);
                });
                break;

            case 'fabric':

                event.sender.send('create-log', 'Pobieranie instalatora Fabric...');
                const fabricInstallerUrl = 'https://meta.fabricmc.net/v2/versions/installer';
                const fabricRes = await fetch(fabricInstallerUrl);
                const fabricData = await fabricRes.json();
                const latestInstaller = fabricData[0].url;

                const installerPath = path.join(serverDir, 'fabric-installer.jar');
                const installerRes = await fetch(latestInstaller);
                const installerStream = fs.createWriteStream(installerPath);
                await new Promise((resolve, reject) => {
                    installerRes.body.pipe(installerStream);
                    installerRes.body.on('error', reject);
                    installerStream.on('finish', resolve);
                });

                event.sender.send('create-log', 'Instalowanie serwera Fabric...');

                await new Promise((resolve, reject) => {
                    const fabricProcess = spawn('java', [
                        '-jar', installerPath,
                        'server',
                        '-mcversion', version,
                        '-downloadMinecraft'
                    ], { cwd: serverDir });

                    fabricProcess.stdout.on('data', (data) => {
                        event.sender.send('create-log', data.toString());
                    });

                    fabricProcess.stderr.on('data', (data) => {
                        event.sender.send('create-log', `[ERROR] ${data.toString()}`);
                    });

                    fabricProcess.on('close', (code) => {
                        if (code === 0) resolve();
                        else reject(new Error(`Instalator Fabric zakończył działanie z kodem ${code}`));
                    });
                });

                jarPath = path.join(serverDir, 'fabric-server-launch.jar');
                jarName = 'fabric-server-launch.jar';

                await fs.remove(installerPath);
                break;

            case 'forge':

                event.sender.send('create-log', 'Pobieranie instalatora Forge...');

                const forgeVersionUrl = `https://files.minecraftforge.net/net/minecraftforge/forge/index_${version}.html`;

                event.sender.send('create-log', 'Pobieranie Minecraft Vanilla...');
                const vanillaUrl = `https://piston-data.mojang.com/v1/objects/8dd1a28015f51b1803213892b50b7b4fc76e594d/server.jar`;
                const vanillaRes = await fetch(vanillaUrl);
                jarPath = path.join(serverDir, 'server.jar');
                const vanillaStream = fs.createWriteStream(jarPath);
                await new Promise((resolve, reject) => {
                    vanillaRes.body.pipe(vanillaStream);
                    vanillaRes.body.on('error', reject);
                    vanillaStream.on('finish', resolve);
                });

                jarName = 'server.jar';

                event.sender.send('create-log', `\nUWAGA: Aby zainstalować Forge ${version}, musisz:\n`);
                event.sender.send('create-log', `1. Pobrać instalator Forge ze strony: https://files.minecraftforge.net/\n`);
                event.sender.send('create-log', `2. Uruchomić instalator i wybrać "Install server"\n`);
                event.sender.send('create-log', `3. Wskazać folder serwera: ${serverDir}\n`);
                event.sender.send('create-log', `4. Po instalacji uruchomić serwer używając pliku forge-xxx-universal.jar\n`);
                break;

            default:
                throw new Error(`Nieznany typ serwera: ${type}`);
        }

        event.sender.send('create-log', `Pobrano ${jarName}`);

        await fs.writeFile(path.join(serverDir, 'eula.txt'), 'eula=true');
        event.sender.send('create-log', 'Zaakceptowano EULA');

        const serverPort = 25565 + store.get('servers', []).length;
        const properties = `server-port=${serverPort}\nmotd=A Minecraft Server created using Ogulniega Server Manager\nmax-players=20\n`;
        await fs.writeFile(path.join(serverDir, 'server.properties'), properties);
        event.sender.send('create-log', `Utworzono server.properties na porcie ${serverPort}`);

        const servers = store.get('servers', []);
        const newServer = {
            id: serverId,
            name,
            type,
            version,
            ram,
            path: serverDir,
            port: serverPort,
            status: 'stopped',
            jarFile: path.basename(jarPath)
        };

        servers.push(newServer);
        store.set('servers', servers);
        event.sender.send('create-log', 'Serwer został pomyślnie utworzony!');
        return newServer;
    } catch (error) {
        console.error('Błąd tworzenia serwera:', error);
        await fs.remove(serverDir);
        dialog.showErrorBox('Błąd tworzenia serwera', error.message);
        return null;
    }
});

ipcMain.handle('delete-server', async (event, serverId) => {

    if (runningServers[serverId]) {
        dialog.showErrorBox('Błąd', 'Nie można usunąć działającego serwera.');
        return false;
    }

    let servers = store.get('servers', []);
    const serverToDelete = servers.find(s => s.id === serverId);

    if (!serverToDelete) {
        console.error('Nie znaleziono serwera o ID:', serverId);
        return false;
    }

    try {
        console.log(`Usuwanie serwera: ${serverToDelete.name} (${serverToDelete.id}) z ścieżki: ${serverToDelete.path}`);

        if (await fs.pathExists(serverToDelete.path)) {
            try {

                await fs.remove(serverToDelete.path);
                console.log(`Usunięto katalog serwera: ${serverToDelete.path}`);
            } catch (err) {

                if (err.code === 'EBUSY' || err.code === 'EPERM') {
                    console.log('Katalog jest używany przez inny proces. Usuwanie tylko z konfiguracji...');

                    const response = await dialog.showMessageBox({
                        type: 'warning',
                        title: 'Nie można usunąć plików',
                        message: 'Niektóre pliki są używane przez inny proces i nie mogą zostać usunięte.',
                        detail: 'Czy chcesz usunąć serwer tylko z listy (pliki pozostaną na dysku)?',
                        buttons: ['Tak', 'Nie'],
                        defaultId: 0,
                        cancelId: 1
                    });

                    if (response.response === 1) {
                        return false;
                    }
                } else {

                    throw err;
                }
            }
        } else {
            console.log(`Katalog serwera nie istnieje: ${serverToDelete.path}`);
        }

        servers = servers.filter(s => s.id !== serverId);
        store.set('servers', servers);
        console.log(`Usunięto serwer z konfiguracji: ${serverId}`);

        return true;
    } catch (error) {
        console.error('Błąd usuwania plików serwera:', error);
        dialog.showErrorBox('Błąd usuwania plików', error.message);
        return false;
    }
});

ipcMain.on('start-server', (event, serverId) => {
    const servers = store.get('servers', []);
    const server = servers.find(s => s.id === serverId);
    if (!server || runningServers[serverId]) return;

    const jarFile = server.jarFile || 'server.jar';

    const javaProcess = spawn('java', [`-Xmx${server.ram}G`, `-Xms${server.ram}G`, '-jar', jarFile, 'nogui'], { cwd: server.path });
    runningServers[serverId] = { process: javaProcess, pid: null };
    const players = new Set();

    javaProcess.stdout.on('data', (data) => {
        const rawLog = data.toString();

        const cleanLog = rawLog.replace(/[\u001B\u009B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]|§[0-9a-fklmnor]/g, '');

        event.sender.send('server-log', { serverId, log: rawLog });

        const joinMatch = cleanLog.match(/(\w{3,16}) joined the game/);
        if (joinMatch) {
            players.add(joinMatch[1]);
            event.sender.send('player-list-update', { serverId, players: Array.from(players) });
        }

        const leaveMatch = cleanLog.match(/(\w{3,16}) left the game/);
        if (leaveMatch) {
            players.delete(leaveMatch[1]);
            event.sender.send('player-list-update', { serverId, players: Array.from(players) });
        }
    });

    javaProcess.stderr.on('data', (data) => event.sender.send('server-log', { serverId, log: `[ERROR] ${data.toString()}` }));
    javaProcess.on('close', (code) => console.log(`Proces launchera dla serwera ${serverId} zamknięty z kodem ${code}.`));

    setTimeout(async () => {
        try {
            const actualPid = await findPidByPort(server.port);
            if (actualPid) {
                console.log(`Znaleziono właściwy PID serwera: ${actualPid} na porcie ${server.port}`);
                if (runningServers[serverId]) runningServers[serverId].pid = actualPid;
                serverIntervals[serverId] = setInterval(async () => {
                    if (!runningServers[serverId]) return clearInterval(serverIntervals[serverId]);
                    try {
                        const stats = await pidusage(actualPid);
                        event.sender.send('resource-update', { serverId, cpu: stats.cpu.toFixed(1), ram: (stats.memory / 1024 / 1024).toFixed(0) });
                    } catch (err) {
                        clearInterval(serverIntervals[serverId]);
                        delete serverIntervals[serverId];
                    }
                }, 3000);
            } else {
                console.error(`Nie udało się znaleźć PID dla serwera na porcie ${server.port} po 15 sekundach.`);
            }
        } catch (err) {
            console.error('Krytyczny błąd podczas szukania PID:', err);
        }
    }, 15000);
    event.sender.send('server-status-change', { serverId, status: 'running' });
});

ipcMain.on('stop-server', (event, serverId) => {
    const serverData = runningServers[serverId];
    if (serverData && serverData.process) {
        if (serverIntervals[serverId]) {
            clearInterval(serverIntervals[serverId]);
            delete serverIntervals[serverId];
        }
        serverData.process.stdin.write('stop\n');
        setTimeout(() => { delete runningServers[serverId]; }, 5000);
        event.sender.send('server-status-change', { serverId, status: 'stopped' });
        event.sender.send('resource-update', { serverId, cpu: '0.0', ram: '0' });
        event.sender.send('player-list-update', { serverId, players: [] });
    }
});

ipcMain.on('send-command', (event, { serverId, command }) => {
    const serverData = runningServers[serverId];
    if (serverData && serverData.process) serverData.process.stdin.write(`${command}\n`);
});

ipcMain.on('open-server-folder', (event, serverId) => {
    const server = store.get('servers', []).find(s => s.id === serverId);
    if (server && server.path) shell.openPath(server.path);
});

ipcMain.handle('open-file-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
    return canceled ? null : filePaths;
});

ipcMain.handle('get-server-files', async (event, { serverId, subfolder }) => {
    const server = store.get('servers', []).find(s => s.id === serverId);
    if (!server) return [];
    const targetPath = path.join(server.path, subfolder || '');
    if (!targetPath.startsWith(server.path)) return [];
    try {
        const dirents = await fs.readdir(targetPath, { withFileTypes: true });
        return dirents.map(dirent => ({ name: dirent.name, isDirectory: dirent.isDirectory() }));
    } catch (error) {
        console.error(`Błąd odczytu katalogu ${targetPath}:`, error);
        return [];
    }
});

ipcMain.handle('upload-server-file', async (event, { serverId, subfolder, sourcePaths }) => {
    const server = store.get('servers', []).find(s => s.id === serverId);
    if (!server) return false;
    const destPath = path.join(server.path, subfolder || '');
    if (!destPath.startsWith(server.path)) return false;
    try {
        for (const sourcePath of sourcePaths) {
            await fs.copy(sourcePath, path.join(destPath, path.basename(sourcePath)));
        }
        return true;
    } catch (error) {
        console.error('Błąd podczas wgrywania pliku:', error);
        return false;
    }
});

ipcMain.handle('delete-server-file', async (event, { serverId, filePath }) => {
    const server = store.get('servers', []).find(s => s.id === serverId);
    if (!server) return false;
    const targetPath = path.join(server.path, filePath);
    if (!targetPath.startsWith(server.path)) return false;
    try {
        await fs.remove(targetPath);
        return true;
    } catch (error) {
        console.error(`Błąd usuwania ${targetPath}:`, error);
        return false;
    }
});

ipcMain.handle('get-server-properties', async (event, serverId) => {
    const server = store.get('servers', []).find(s => s.id === serverId);
    if (!server) return null;
    try {
        const propertiesPath = path.join(server.path, 'server.properties');
        const content = await fs.readFile(propertiesPath, 'utf-8');
        const properties = {};
        content.split('\n').forEach(line => {
            if (line.trim() && !line.startsWith('#')) {
                const [key, ...value] = line.split('=');
                if (key) properties[key.trim()] = value.join('=').trim();
            }
        });
        return properties;
    } catch (error) {
        console.error('Błąd odczytu server.properties:', error);
        return null;
    }
});

ipcMain.handle('save-server-properties', async (event, { serverId, properties }) => {
    const servers = store.get('servers', []);
    const server = servers.find(s => s.id === serverId);
    if (!server) return false;
    try {
        const propertiesPath = path.join(server.path, 'server.properties');
        const content = Object.entries(properties).map(([key, value]) => `${key}=${value}`).join('\n');
        await fs.writeFile(propertiesPath, content);
        if (properties['server-port'] && server.port !== parseInt(properties['server-port'])) {
            const serverIndex = servers.findIndex(s => s.id === serverId);
            servers[serverIndex].port = parseInt(properties['server-port']);
            store.set('servers', servers);
        }
        return true;
    } catch (error) {
        console.error('Błąd zapisu server.properties:', error);
        return false;
    }
});

ipcMain.handle('create-backup', async (event, serverId) => {
    const server = store.get('servers', []).find(s => s.id === serverId);
    if (!server) return { success: false, error: 'Serwer nie istnieje' };

    if (runningServers[serverId]) {
        return { success: false, error: 'Nie można utworzyć kopii zapasowej uruchomionego serwera' };
    }

    try {

        let archiver;
        try {
            archiver = require('archiver');
        } catch (err) {

            console.error('Moduł archiver nie jest zainstalowany. Instalowanie...');

            dialog.showMessageBox({
                type: 'info',
                title: 'Instalacja wymaganych modułów',
                message: 'Trwa instalacja wymaganych modułów. Może to potrwać chwilę. Spróbuj ponownie za kilka minut.',
                buttons: ['OK']
            });

            const { spawn } = require('child_process');
            const npmInstall = spawn('npm', ['install', 'archiver@5.3.1', 'extract-zip@2.0.1'], {
                cwd: path.join(__dirname, '..'),
                shell: true
            });

            npmInstall.stdout.on('data', (data) => {
                console.log(`npm install stdout: ${data}`);
            });

            npmInstall.stderr.on('data', (data) => {
                console.error(`npm install stderr: ${data}`);
            });

            npmInstall.on('close', (code) => {
                console.log(`npm install zakończone z kodem: ${code}`);
            });

            return {
                success: false,
                error: 'Wymagane moduły nie są zainstalowane. Instalacja rozpoczęta. Spróbuj ponownie za kilka minut.'
            };
        }

        const serverBackupsPath = path.join(backupsPath, serverId);
        await fs.ensureDir(serverBackupsPath);

        const date = new Date();
        const timestamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}-${String(date.getMinutes()).padStart(2, '0')}`;
        const backupFileName = `backup_${timestamp}.zip`;
        const backupFilePath = path.join(serverBackupsPath, backupFileName);

        const output = fs.createWriteStream(backupFilePath);

        const archive = archiver('zip', { zlib: { level: 9 } });

        return new Promise((resolve, reject) => {
            output.on('close', () => {
                console.log(`Backup created: ${backupFilePath}, size: ${archive.pointer()} bytes`);
                resolve({
                    success: true,
                    backupPath: backupFilePath,
                    backupName: backupFileName,
                    timestamp: timestamp,
                    size: archive.pointer()
                });
            });

            archive.on('error', (err) => {
                console.error('Błąd archiwizacji:', err);

                output.end();

                try {
                    fs.removeSync(backupFilePath);
                } catch (removeErr) {
                    console.error('Błąd podczas usuwania częściowo utworzonego pliku kopii zapasowej:', removeErr);
                }

                if (err.code === 'EBUSY' || err.code === 'EPERM') {
                    const response = dialog.showMessageBoxSync({
                        type: 'warning',
                        title: 'Pliki są używane',
                        message: 'Niektóre pliki serwera są używane przez inny proces.',
                        detail: 'Czy chcesz spróbować alternatywnej metody tworzenia kopii zapasowej? (Niektóre pliki mogą zostać pominięte)',
                        buttons: ['Tak, spróbuj alternatywnej metody', 'Anuluj'],
                        defaultId: 0,
                        cancelId: 1
                    });

                    if (response === 0) {

                        (async () => {
                            try {

                                const backupDir = path.join(serverBackupsPath, `backup_${timestamp}`);
                                fs.ensureDirSync(backupDir);

                                const copyFilesRecursively = async (src, dest) => {
                                    const stats = await fs.stat(src).catch(() => null);
                                    if (!stats) return;

                                    if (stats.isDirectory()) {
                                        await fs.ensureDir(dest).catch(() => {});

                                        try {
                                            const files = await fs.readdir(src);
                                            for (const file of files) {
                                                await copyFilesRecursively(
                                                    path.join(src, file),
                                                    path.join(dest, file)
                                                ).catch(() => {});
                                            }
                                        } catch (e) {
                                            console.log(`Pominięto katalog ${src}: ${e.message}`);
                                        }
                                    } else if (stats.isFile()) {
                                        try {
                                            await fs.copy(src, dest);
                                        } catch (e) {
                                            console.log(`Pominięto plik ${src}: ${e.message}`);
                                        }
                                    }
                                };

                                await copyFilesRecursively(server.path, backupDir);

                                const zipOutput = fs.createWriteStream(backupFilePath);
                                const zipArchive = archiver('zip', { zlib: { level: 9 } });

                                await new Promise((zipResolve, zipReject) => {
                                    zipOutput.on('close', zipResolve);
                                    zipArchive.on('error', zipReject);
                                    zipArchive.pipe(zipOutput);
                                    zipArchive.directory(backupDir, false);
                                    zipArchive.finalize();
                                });

                                await fs.remove(backupDir).catch(() => {});

                                resolve({
                                    success: true,
                                    backupPath: backupFilePath,
                                    backupName: backupFileName,
                                    timestamp: timestamp,
                                    size: fs.statSync(backupFilePath).size,
                                    partial: true
                                });
                            } catch (alternativeError) {
                                console.error('Błąd alternatywnej metody tworzenia kopii zapasowej:', alternativeError);
                                reject({
                                    success: false,
                                    error: `Błąd alternatywnej metody tworzenia kopii zapasowej: ${alternativeError.message}`
                                });
                            }
                        })();
                    } else {
                        reject({
                            success: false,
                            error: 'Niektóre pliki serwera są używane przez inny proces. Zamknij wszystkie programy, które mogą używać plików serwera i spróbuj ponownie.'
                        });
                    }
                } else {
                    reject({ success: false, error: err.message });
                }
            });

            output.on('error', (err) => {
                console.error('Błąd strumienia wyjściowego:', err);
                reject({ success: false, error: err.message });
            });

            archive.pipe(output);

            try {

                archive.directory(server.path, false);

                archive.finalize();
            } catch (err) {
                console.error('Błąd podczas dodawania plików do archiwum:', err);
                output.end();
                reject({ success: false, error: err.message });
            }
        });
    } catch (error) {
        console.error('Błąd tworzenia kopii zapasowej:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-backups', async (event, serverId) => {
    try {
        const serverBackupsPath = path.join(backupsPath, serverId);
        if (!await fs.pathExists(serverBackupsPath)) {
            return [];
        }

        const files = await fs.readdir(serverBackupsPath);
        const backups = [];

        for (const file of files) {
            if (file.endsWith('.zip') && file.startsWith('backup_')) {
                const filePath = path.join(serverBackupsPath, file);
                const stats = await fs.stat(filePath);

                const timestamp = file.replace('backup_', '').replace('.zip', '');

                backups.push({
                    name: file,
                    path: filePath,
                    timestamp: timestamp,
                    size: stats.size,
                    created: stats.mtime
                });
            }
        }

        return backups.sort((a, b) => b.created - a.created);
    } catch (error) {
        console.error('Błąd pobierania kopii zapasowych:', error);
        return [];
    }
});

ipcMain.handle('restore-backup', async (event, { serverId, backupPath }) => {
    const server = store.get('servers', []).find(s => s.id === serverId);
    if (!server) return { success: false, error: 'Serwer nie istnieje' };

    if (runningServers[serverId]) {
        return { success: false, error: 'Nie można przywrócić kopii zapasowej uruchomionego serwera' };
    }

    try {

        if (!await fs.pathExists(backupPath)) {
            return { success: false, error: 'Plik kopii zapasowej nie istnieje' };
        }

        let extract;
        try {
            extract = require('extract-zip');
        } catch (err) {

            console.error('Moduł extract-zip nie jest zainstalowany. Instalowanie...');

            dialog.showMessageBox({
                type: 'info',
                title: 'Instalacja wymaganych modułów',
                message: 'Trwa instalacja wymaganych modułów. Może to potrwać chwilę. Spróbuj ponownie za kilka minut.',
                buttons: ['OK']
            });

            const { spawn } = require('child_process');
            const npmInstall = spawn('npm', ['install', 'extract-zip@2.0.1'], {
                cwd: path.join(__dirname, '..'),
                shell: true
            });

            npmInstall.stdout.on('data', (data) => {
                console.log(`npm install stdout: ${data}`);
            });

            npmInstall.stderr.on('data', (data) => {
                console.error(`npm install stderr: ${data}`);
            });

            npmInstall.on('close', (code) => {
                console.log(`npm install zakończone z kodem: ${code}`);
            });

            return {
                success: false,
                error: 'Wymagane moduły nie są zainstalowane. Instalacja rozpoczęta. Spróbuj ponownie za kilka minut.'
            };
        }

        try {

            await fs.emptyDir(server.path);

            await extract(backupPath, { dir: server.path });

            console.log(`Backup restored from ${backupPath} to ${server.path}`);
            return { success: true };
        } catch (err) {

            if (err.code === 'EBUSY' || err.code === 'EPERM') {
                console.error('Błąd dostępu do plików:', err);
                return {
                    success: false,
                    error: 'Niektóre pliki są używane przez inny proces. Zamknij wszystkie programy, które mogą używać tych plików i spróbuj ponownie.'
                };
            }
            throw err;
        }
    } catch (error) {
        console.error('Błąd przywracania kopii zapasowej:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('check-java', () => new Promise(resolve => exec('java -version', error => resolve(!error))));

ipcMain.handle('get-papermc-versions', async () => {
    try {
        const res = await fetch('https://api.papermc.io/v2/projects/paper');
        const data = await res.json();
        return data.versions.reverse();
    } catch (e) {
        console.error('Błąd pobierania wersji PaperMC:', e);
        return [];
    }
});

ipcMain.handle('get-fabric-versions', async () => {
    try {
        const res = await fetch('https://meta.fabricmc.net/v2/versions/game');
        const versions = await res.json();
        return versions.map(v => v.version);
    } catch (e) {
        console.error('Błąd pobierania wersji Fabric:', e);
        return [];
    }
});

ipcMain.handle('get-forge-versions', async () => {
    try {

        const mcRes = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
        const mcData = await mcRes.json();

        const releaseVersions = mcData.versions
            .filter(v => v.type === 'release')
            .map(v => v.id)
            .slice(0, 20);

        return releaseVersions;
    } catch (e) {
        console.error('Błąd pobierania wersji Forge:', e);
        return [];
    }
});

ipcMain.handle('get-servers', () => store.get('servers', []));

ipcMain.handle('get-local-ip-address', () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {

            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
});