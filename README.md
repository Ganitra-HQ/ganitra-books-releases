# Ganitra Books for Windows

Ganitra Books is offline accounting software for Indian small and medium businesses: GST invoicing, bills, stock, banking and reports, kept in an encrypted file on your own PC.

**Download it from [ganitra.com/books/download](https://www.ganitra.com/books/download)**, or from the latest release on this page.

This repository only publishes the installers. The source code is not here.

## Requirements

- Windows 10 (version 22H2) or Windows 11
- A 64-bit (x64) PC. Windows on ARM and 32-bit Windows are not supported.
- No internet needed to install or use.

## Checking a download

Every release lists the SHA-256 of its installer, and carries it as a `.sha256` file. In PowerShell, in the folder you saved the installer to:

```powershell
Get-FileHash .\GanitraBooks-<version>-x64-setup.exe -Algorithm SHA256
```

The hash should match the one on the release. If it doesn't, delete the file and download it again.

## Help

Write to [hello@ganitra.com](mailto:hello@ganitra.com).

Ganitra Books is proprietary software. Installing it means accepting its licence terms.
