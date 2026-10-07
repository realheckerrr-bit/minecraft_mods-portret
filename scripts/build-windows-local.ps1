$ErrorActionPreference = 'Stop'

# Use a fast Electron mirror when the GitHub release CDN is slow on Windows.
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'

npm run dist:win
