const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {

    checkJava: () => ipcRenderer.invoke('check-java'),
    getPaperMCVersions: () => ipcRenderer.invoke('get-papermc-versions'),
    getFabricVersions: () => ipcRenderer.invoke('get-fabric-versions'),
    getForgeVersions: () => ipcRenderer.invoke('get-forge-versions'),
    getServers: () => ipcRenderer.invoke('get-servers'),
    createServer: (serverConfig) => ipcRenderer.invoke('create-server', serverConfig),
    deleteServer: (serverId) => ipcRenderer.invoke('delete-server', serverId),
    getServerProperties: (serverId) => ipcRenderer.invoke('get-server-properties', serverId),
    saveServerProperties: (data) => ipcRenderer.invoke('save-server-properties', data),
    openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    getServerFiles: (data) => ipcRenderer.invoke('get-server-files', data),
    uploadServerFile: (data) => ipcRenderer.invoke('upload-server-file', data),
    deleteServerFile: (data) => ipcRenderer.invoke('delete-server-file', data),
    createBackup: (serverId) => ipcRenderer.invoke('create-backup', serverId),
    getBackups: (serverId) => ipcRenderer.invoke('get-backups', serverId),
    restoreBackup: (data) => ipcRenderer.invoke('restore-backup', data),
    getLocalIpAddress: () => ipcRenderer.invoke('get-local-ip-address'),

    startServer: (serverId) => ipcRenderer.send('start-server', serverId),
    stopServer: (serverId) => ipcRenderer.send('stop-server', serverId),
    sendCommand: (data) => ipcRenderer.send('send-command', data),
    openServerFolder: (serverId) => ipcRenderer.send('open-server-folder', serverId),

    onServerLog: (callback) => ipcRenderer.on('server-log', (event, ...args) => callback(...args)),
    onServerStatusChange: (callback) => ipcRenderer.on('server-status-change', (event, ...args) => callback(...args)),
    onCreateLog: (callback) => ipcRenderer.on('create-log', (event, ...args) => callback(...args)),
    onResourceUpdate: (callback) => ipcRenderer.on('resource-update', (event, ...args) => callback(...args)),
    onPlayerListUpdate: (callback) => ipcRenderer.on('player-list-update', (event, ...args) => callback(...args)),
});