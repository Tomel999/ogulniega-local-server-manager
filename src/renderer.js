document.addEventListener('DOMContentLoaded', () => {

    const path = {
        join: (...args) => args.join('/').replace(/\\/g, '/'),
    };

    const serverList = document.getElementById('server-list');
    const welcomeView = document.getElementById('welcome-view');
    const createServerView = document.getElementById('create-server-view');
    const serverDashboardView = document.getElementById('server-dashboard-view');
    const javaCheckStatus = document.getElementById('java-check-status');
    const fileList = document.getElementById('file-list');
    const breadcrumbs = document.getElementById('breadcrumbs');

    let servers = [];
    let activeServerId = null;
    let currentFileManagerPath = '';

    async function initialize() {
        const hasJava = await window.api.checkJava();
        await loadServers();
        await populateVersionSelector();

        if (!hasJava) {

            javaCheckStatus.textContent = '❌ Brak zainstalowanej Javy! Zainstaluj Javę, aby móc tworzyć i uruchamiać serwery Minecraft.';
            document.querySelector('#welcome-view h1').textContent = 'Wymagana Java!';
            document.querySelector('#welcome-view p').textContent = 'Aby korzystać z Minecraft Server Manager, musisz zainstalować Javę na swoim komputerze.';
            document.getElementById('java-install-info').classList.remove('hidden');
            showView(welcomeView);
        } else if (servers.length > 0) {

            javaCheckStatus.textContent = '✅ Java jest zainstalowana.';
            document.getElementById('java-install-info').classList.add('hidden');
            selectServer(servers[0].id);
        } else {

            javaCheckStatus.textContent = '✅ Java jest zainstalowana.';
            document.querySelector('#welcome-view h1').textContent = 'Witaj w Minecraft Server Manager!';
            document.querySelector('#welcome-view p').textContent = 'Nie masz jeszcze żadnych serwerów. Utwórz swój pierwszy serwer!';
            document.getElementById('java-install-info').classList.add('hidden');
            showView(createServerView);
            document.getElementById('creation-log').textContent = '';
            document.getElementById('create-server-form').reset();
            populateVersionSelector('paper');
        }
    }

    async function loadServers() {
        servers = await window.api.getServers();
        renderServerList();
    }

    async function populateVersionSelector(serverType = 'paper') {
        const versionSelect = document.getElementById('server-version');
        versionSelect.innerHTML = '<option>Ładowanie wersji...</option>';

        try {
            let versions = [];
            switch (serverType) {
                case 'paper':
                    versions = await window.api.getPaperMCVersions();
                    break;
                case 'fabric':
                    versions = await window.api.getFabricVersions();
                    break;
                case 'forge':
                    versions = await window.api.getForgeVersions();
                    break;
            }

            if (versions && versions.length > 0) {
                versionSelect.innerHTML = versions.map(v => `<option value="${v}">${v}</option>`).join('');
            } else {
                versionSelect.innerHTML = '<option value="">Nie udało się pobrać wersji</option>';
            }
        } catch (error) {
            console.error('Błąd podczas pobierania wersji:', error);
            versionSelect.innerHTML = '<option value="">Błąd pobierania wersji</option>';
        }
    }

    function renderServerList() {
        serverList.innerHTML = '';
        servers.forEach(server => {
            const li = document.createElement('li');
            li.textContent = server.name;
            li.dataset.serverId = server.id;
            if (server.id === activeServerId) li.classList.add('active');
            serverList.appendChild(li);
        });
    }

    function showView(view) {
        [welcomeView, createServerView, serverDashboardView].forEach(v => v.classList.add('hidden'));
        view.classList.remove('hidden');
    }

    function showCopyNotification(element, message) {
        const notification = document.createElement('div');
        notification.className = 'copy-notification';
        notification.textContent = message;

        const rect = element.getBoundingClientRect();
        notification.style.left = `${rect.left + rect.width / 2}px`;
        notification.style.top = `${rect.top - 30}px`;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 2000);
    }

    async function copyTextToClipboard(text) {

        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                console.warn('Nie udało się skopiować tekstu używając API schowka:', err);
            }
        }

        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;

            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';

            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();

            const success = document.execCommand('copy');
            document.body.removeChild(textArea);

            if (success) {
                return true;
            }
        } catch (err) {
            console.warn('Nie udało się skopiować tekstu używając execCommand:', err);
        }

        alert(`Nie udało się automatycznie skopiować. Proszę skopiować ręcznie: ${text}`);
        return false;
    }

    async function updateDashboard() {
        const server = servers.find(s => s.id === activeServerId);
        if (!server) return showView(welcomeView);

        document.getElementById('dashboard-title').textContent = server.name;
        document.getElementById('server-status').textContent = server.status === 'running' ? 'Uruchomiony' : 'Zatrzymany';

        const localIp = await window.api.getLocalIpAddress();
        const portElement = document.getElementById('server-port');
        portElement.textContent = server.port ? `${localIp}:${server.port}` : 'N/A';

        if (server.port) {
            portElement.onclick = async () => {
                const serverAddress = `${localIp}:${server.port}`;
                await copyTextToClipboard(serverAddress);
                showCopyNotification(portElement, 'Skopiowano adres IP!');
            };
        } else {
            portElement.onclick = null;
        }

        document.getElementById('server-cpu').textContent = '0%';
        document.getElementById('server-ram-usage').textContent = '0 MB';
        document.getElementById('console-output').textContent = '';
        document.getElementById('player-list').innerHTML = '';
        document.getElementById('player-count').textContent = '0';

        const isRunning = server.status === 'running';
        document.getElementById('start-server-btn').disabled = isRunning;
        document.getElementById('stop-server-btn').disabled = !isRunning;
        document.getElementById('delete-server-btn').disabled = isRunning;
        document.getElementById('edit-properties-btn').disabled = isRunning;

        showView(serverDashboardView);
    }

    function selectServer(serverId) {
        activeServerId = serverId;
        document.querySelector('.tab-link[data-tab="tab-console"]').click();
        renderServerList();
        updateDashboard();
    }

    async function renderFileManager(subfolder = '') {
        currentFileManagerPath = subfolder;
        const files = await window.api.getServerFiles({ serverId: activeServerId, subfolder });
        fileList.innerHTML = '';

        files.sort((a, b) => {
            if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
            return a.name.localeCompare(b.name);
        });

        files.forEach(file => {
            const li = document.createElement('li');
            const icon = file.isDirectory ? '📁' : '📄';
            const type = file.isDirectory ? 'folder' : 'file';
            li.innerHTML = `
                <span class="file-icon">${icon}</span>
                <span class="file-name">${file.name}</span>
                <button class="delete-file-btn" data-path="${path.join(currentFileManagerPath, file.name)}">🗑️</button>
            `;
            li.dataset.name = file.name;
            li.dataset.type = type;
            fileList.appendChild(li);
        });
        updateBreadcrumbs();
    }

    function updateBreadcrumbs() {
        breadcrumbs.innerHTML = '';
        const parts = currentFileManagerPath.split(/[\\/]/).filter(p => p);
        const rootSpan = document.createElement('span');
        rootSpan.textContent = 'serwer';
        rootSpan.dataset.path = '';
        breadcrumbs.appendChild(rootSpan);

        let currentPath = '';
        parts.forEach(part => {
            currentPath = path.join(currentPath, part);
            breadcrumbs.innerHTML += ' / ';
            const partSpan = document.createElement('span');
            partSpan.textContent = part;
            partSpan.dataset.path = currentPath;
            breadcrumbs.appendChild(partSpan);
        });
    }

    serverList.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') selectServer(e.target.dataset.serverId);
    });

    document.getElementById('show-create-server-form-btn').addEventListener('click', () => {
        showView(createServerView);
        activeServerId = null;
        renderServerList();
        document.getElementById('creation-log').textContent = '';
        document.getElementById('create-server-form').reset();

        populateVersionSelector('paper');
    });

    document.getElementById('server-type').addEventListener('change', (e) => {
        populateVersionSelector(e.target.value);
    });

    document.getElementById('create-server-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const creationLog = document.getElementById('creation-log');
        creationLog.textContent = 'Rozpoczynanie tworzenia serwera...';

        const serverType = document.getElementById('server-type').value;
        const serverVersion = document.getElementById('server-version').value;

        if (!serverVersion) {
            creationLog.textContent += '\n\nBłąd! Nie wybrano wersji serwera.';
            return;
        }

        const newServer = await window.api.createServer({
            name: document.getElementById('server-name').value,
            type: serverType,
            version: serverVersion,
            ram: document.getElementById('server-ram').value,
        });

        if (newServer) {
            await loadServers();
            selectServer(newServer.id);
        } else {
            creationLog.textContent += '\n\nBłąd! Sprawdź konsolę deweloperską (Ctrl+Shift+I) po więcej informacji.';
        }
    });

    document.getElementById('start-server-btn').addEventListener('click', () => { if (activeServerId) window.api.startServer(activeServerId); });
    document.getElementById('stop-server-btn').addEventListener('click', () => { if (activeServerId) window.api.stopServer(activeServerId); });
    document.getElementById('open-folder-btn').addEventListener('click', () => { if (activeServerId) window.api.openServerFolder(activeServerId); });

    document.getElementById('create-backup-btn').addEventListener('click', async () => {
        if (!activeServerId) return;

        const server = servers.find(s => s.id === activeServerId);
        if (server.status === 'running') {
            return alert('Nie można utworzyć kopii zapasowej uruchomionego serwera. Zatrzymaj serwer najpierw.');
        }

        if (confirm('Czy na pewno chcesz utworzyć kopię zapasową tego serwera?')) {
            try {

                const backupBtn = document.getElementById('create-backup-btn');
                const originalText = backupBtn.textContent;
                backupBtn.textContent = 'Tworzenie kopii...';
                backupBtn.disabled = true;

                const result = await window.api.createBackup(activeServerId);

                backupBtn.textContent = originalText;
                backupBtn.disabled = false;

                if (result.success) {
                    if (result.partial) {
                        alert(`Kopia zapasowa została utworzona częściowo (niektóre pliki mogły zostać pominięte).\nRozmiar: ${Math.round(result.size / 1024 / 1024 * 100) / 100} MB`);
                    } else {
                        alert(`Kopia zapasowa została utworzona pomyślnie!\nRozmiar: ${Math.round(result.size / 1024 / 1024 * 100) / 100} MB`);
                    }
                } else {
                    if (result.error.includes('Wymagane moduły nie są zainstalowane')) {
                        alert('Wymagane moduły nie są zainstalowane. Instalacja rozpoczęta. Spróbuj ponownie za kilka minut.');
                    } else {
                        alert(`Błąd podczas tworzenia kopii zapasowej: ${result.error}`);
                    }
                }
            } catch (error) {
                console.error('Błąd podczas tworzenia kopii zapasowej:', error);
                alert(`Wystąpił nieoczekiwany błąd: ${error.message}`);

                const backupBtn = document.getElementById('create-backup-btn');
                backupBtn.textContent = 'Utwórz kopię';
                backupBtn.disabled = false;
            }
        }
    });

    document.getElementById('restore-backup-btn').addEventListener('click', async () => {
        if (!activeServerId) return;

        const server = servers.find(s => s.id === activeServerId);
        if (server.status === 'running') {
            return alert('Nie można przywrócić kopii zapasowej uruchomionego serwera. Zatrzymaj serwer najpierw.');
        }

        try {

            const restoreBtn = document.getElementById('restore-backup-btn');
            const originalText = restoreBtn.textContent;
            restoreBtn.textContent = 'Ładowanie kopii...';
            restoreBtn.disabled = true;

            const backups = await window.api.getBackups(activeServerId);

            restoreBtn.textContent = originalText;
            restoreBtn.disabled = false;

            if (backups.length === 0) {
                return alert('Brak dostępnych kopii zapasowych dla tego serwera.');
            }

            const backupList = document.getElementById('backup-list');
            backupList.innerHTML = '';
            let selectedBackupPath = null;

            backups.forEach(backup => {
                const li = document.createElement('li');
                li.dataset.path = backup.path;

                const dateParts = backup.timestamp.split('_');
                const date = dateParts[0].replace(/-/g, '/');
                const time = dateParts[1].replace(/-/g, ':');

                const sizeInMB = Math.round(backup.size / 1024 / 1024 * 100) / 100;

                li.innerHTML = `
                    <span class="backup-date">${date} ${time}</span>
                    <span class="backup-size">${sizeInMB} MB</span>
                `;

                li.addEventListener('click', () => {
                    document.querySelectorAll('#backup-list li').forEach(el => el.classList.remove('selected'));
                    li.classList.add('selected');
                    selectedBackupPath = backup.path;
                    document.getElementById('backup-info').textContent = `Wybrano kopię z ${date} ${time} (${sizeInMB} MB)`;
                });

                backupList.appendChild(li);
            });

            document.getElementById('backup-modal-title').textContent = 'Przywracanie kopii zapasowej';
            document.getElementById('backup-info').textContent = 'Wybierz kopię zapasową do przywrócenia';
            document.getElementById('backup-action-btn').textContent = 'Przywróć';

            document.getElementById('backup-modal-backdrop').classList.remove('hidden');

            document.getElementById('backup-action-btn').onclick = async () => {
                if (!selectedBackupPath) {
                    return alert('Wybierz kopię zapasową do przywrócenia');
                }

                if (confirm('UWAGA: Przywrócenie kopii zapasowej nadpisze wszystkie pliki serwera! Czy na pewno chcesz kontynuować?')) {
                    try {

                        const actionBtn = document.getElementById('backup-action-btn');
                        const originalBtnText = actionBtn.textContent;
                        actionBtn.textContent = 'Przywracanie...';
                        actionBtn.disabled = true;

                        const result = await window.api.restoreBackup({
                            serverId: activeServerId,
                            backupPath: selectedBackupPath
                        });

                        actionBtn.textContent = originalBtnText;
                        actionBtn.disabled = false;

                        if (result.success) {
                            alert('Kopia zapasowa została przywrócona pomyślnie!');
                            document.getElementById('backup-modal-backdrop').classList.add('hidden');
                        } else {
                            if (result.error.includes('Wymagane moduły nie są zainstalowane')) {
                                alert('Wymagane moduły nie są zainstalowane. Instalacja rozpoczęta. Spróbuj ponownie za kilka minut.');
                            } else {
                                alert(`Błąd podczas przywracania kopii zapasowej: ${result.error}`);
                            }
                        }
                    } catch (error) {
                        console.error('Błąd podczas przywracania kopii zapasowej:', error);
                        alert(`Wystąpił nieoczekiwany błąd: ${error.message}`);

                        const actionBtn = document.getElementById('backup-action-btn');
                        actionBtn.textContent = 'Przywróć';
                        actionBtn.disabled = false;
                    }
                }
            };

            document.getElementById('backup-modal-backdrop').classList.remove('hidden');
        } catch (error) {
            console.error('Błąd podczas pobierania kopii zapasowych:', error);
            alert(`Wystąpił błąd podczas pobierania kopii zapasowych: ${error.message}`);

            const restoreBtn = document.getElementById('restore-backup-btn');
            restoreBtn.textContent = 'Przywróć kopię';
            restoreBtn.disabled = false;
        }
    });

    document.getElementById('close-backup-modal-btn').addEventListener('click', () => {
        document.getElementById('backup-modal-backdrop').classList.add('hidden');
    });
    document.getElementById('delete-server-btn').addEventListener('click', async () => {
        if (!activeServerId) return;

        const server = servers.find(s => s.id === activeServerId);
        if (!server) return;

        if (server.status === 'running') {
            alert('Nie można usunąć uruchomionego serwera. Zatrzymaj serwer najpierw.');
            return;
        }

        if (confirm(`Czy na pewno chcesz usunąć serwer "${server.name}"? Tej operacji nie można cofnąć!`)) {
            try {
                const result = await window.api.deleteServer(activeServerId);
                if (result) {
                    console.log('Serwer został pomyślnie usunięty');
                    activeServerId = null;
                    await loadServers();

                    if (servers.length === 0) {
                        document.querySelector('#welcome-view h1').textContent = 'Witaj w Minecraft Server Manager!';
                        document.querySelector('#welcome-view p').textContent = 'Nie masz jeszcze żadnych serwerów. Utwórz swój pierwszy serwer!';
                        document.getElementById('java-install-info').classList.add('hidden');
                        showView(createServerView);
                        document.getElementById('creation-log').textContent = '';
                        document.getElementById('create-server-form').reset();
                        populateVersionSelector('paper');
                    } else {

                        selectServer(servers[0].id);
                    }
                } else {
                    alert('Wystąpił błąd podczas usuwania serwera. Sprawdź konsolę po więcej informacji.');
                }
            } catch (error) {
                console.error('Błąd podczas usuwania serwera:', error);
                alert(`Błąd podczas usuwania serwera: ${error.message}`);
            }
        }
    });
    document.getElementById('command-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.value.trim() && activeServerId) {
            window.api.sendCommand({ serverId: activeServerId, command: e.target.value.trim() });
            e.target.value = '';
        }
    });

    document.querySelector('.tabs').addEventListener('click', (e) => {
        if (e.target.matches('.tab-link')) {
            const tabId = e.target.dataset.tab;
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
            e.target.classList.add('active');
            if (tabId === 'tab-files') renderFileManager(currentFileManagerPath);
        }
    });

    fileList.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (!li) return;
        if (e.target.matches('.delete-file-btn')) {
            const filePath = e.target.dataset.path;
            if (confirm(`Czy na pewno chcesz usunąć "${filePath}"?`)) {
                window.api.deleteServerFile({ serverId: activeServerId, filePath }).then(success => {
                    if (success) renderFileManager(currentFileManagerPath);
                    else alert('Błąd podczas usuwania pliku.');
                });
            }
        } else if (li.dataset.type === 'folder') {
            renderFileManager(path.join(currentFileManagerPath, li.dataset.name));
        }
    });

    breadcrumbs.addEventListener('click', (e) => {
        if (e.target.matches('span')) renderFileManager(e.target.dataset.path);
    });

    document.getElementById('upload-file-btn').addEventListener('click', async () => {
        const sourcePaths = await window.api.openFileDialog();
        if (sourcePaths) {
            if (await window.api.uploadServerFile({ serverId: activeServerId, subfolder: currentFileManagerPath, sourcePaths })) {
                renderFileManager(currentFileManagerPath);
            } else {
                alert('Wystąpił błąd podczas wgrywania plików.');
            }
        }
    });

    const modal = document.getElementById('modal-backdrop');
    const propertiesForm = document.getElementById('properties-form');
    document.getElementById('edit-properties-btn').addEventListener('click', async () => {
        const properties = await window.api.getServerProperties(activeServerId);
        if (!properties) return alert('Nie udało się wczytać pliku server.properties.');
        propertiesForm.innerHTML = '';
        for (const [key, value] of Object.entries(properties)) {
            const label = document.createElement('label');
            label.textContent = key;
            label.htmlFor = `prop-${key}`;
            const input = document.createElement('input');
            input.type = 'text';
            input.id = `prop-${key}`;
            input.name = key;
            input.value = value;
            propertiesForm.append(label, input);
        }
        modal.classList.remove('hidden');
    });
    document.getElementById('close-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('save-properties-btn').addEventListener('click', async () => {
        const newProperties = {};
        propertiesForm.querySelectorAll('input').forEach(i => newProperties[i.name] = i.value);
        if (await window.api.saveServerProperties({ serverId: activeServerId, properties: newProperties })) {
            alert('Zapisano pomyślnie!');
            modal.classList.add('hidden');
            await loadServers();
            updateDashboard();
        } else {
            alert('Błąd zapisu pliku.');
        }
    });

    window.api.onServerLog(({ serverId, log }) => {
        if (serverId === activeServerId) {
            const consoleOutput = document.getElementById('console-output');
            consoleOutput.textContent += log;
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }
    });
    window.api.onCreateLog((log) => { document.getElementById('creation-log').textContent += `\n${log}`; });
    window.api.onServerStatusChange(({ serverId, status }) => {
        const server = servers.find(s => s.id === serverId);
        if (server) {
            server.status = status;
            if (serverId === activeServerId) updateDashboard();
        }
    });
    window.api.onResourceUpdate(({ serverId, cpu, ram }) => {
        if (serverId === activeServerId) {
            document.getElementById('server-cpu').textContent = `${cpu}%`;
            document.getElementById('server-ram-usage').textContent = `${ram} MB`;
        }
    });
    window.api.onPlayerListUpdate(({ serverId, players }) => {
        if (serverId === activeServerId) {
            document.getElementById('player-list').innerHTML = players.map(p => `<li>${p}</li>`).join('');
            document.getElementById('player-count').textContent = players.length;
        }
    });

    initialize();
});