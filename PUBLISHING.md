# Publishing a release

For whoever ships Ganitra Books. Releases are made only with `publish.mjs`, from the PC that built the installer.

## Once per PC

- Node.js 22 (already needed to build Ganitra Books).
- GitHub CLI: `winget install GitHub.cli`, then `gh auth login` as an account that can write to this repository.

## Each release

1. Set the version in `apps/desktop/src-tauri/tauri.conf.json` of the Ganitra Books repo and build the installer (`scripts/build-release.ps1` once there is a signing certificate; `npm run tauri build` in `apps/desktop` until then).
2. From a clone of this repository:

   ```powershell
   node publish.mjs "C:\code\ganitra-books\target\release\bundle\nsis\Ganitra Books_0.1.0_x64-setup.exe" `
     --notes notes.md --site C:\code\ms-babu-associates\site
   ```

   Add `--allow-unsigned` while the installer is not code-signed. `--notes` and `--site` are optional.
3. Build and deploy the website, so `/books/download` and `/books/download/latest` point at the new file.

## What the script does, and refuses to do

- Takes the version from the installer's name (`Ganitra Books_X.Y.Z_x64-setup.exe`) and publishes tag `vX.Y.Z` with the file renamed to `GanitraBooks-X.Y.Z-x64-setup.exe`, plus a `.sha256` file.
- **Never replaces a published version.** If the tag exists, it stops: bump the version and build again. People who already downloaded a version must always be able to check it against the published hash.
- **Refuses an unsigned installer** unless you pass `--allow-unsigned`, so an unsigned build can't go out by accident once signing is in place.
- Shows what it will publish and asks you to type `yes` (`--yes` skips this).
- Uploads to a **draft** release, downloads the file back and compares its SHA-256 with the installer you built. Only if they match does the release go public and become "Latest". If they don't, the draft stays unpublished; delete it on GitHub and run the script again.
- With `--site`, writes the link, version, date, size, file name, SHA-256 and signed status into the website's `src/config/books.ts`. Without it, it prints them for you to paste.

## Repository rules

- Public, so anyone can download. Nothing secret ever goes here: no keys, certificates, licence files, `.env` files or source code.
- Only the release owner has write access.
- Release immutability is on (Settings → General → Releases), so a published release's files and tag can't be changed afterwards.
- Installers are never committed (`.gitignore`); they only live on releases.
- To withdraw a broken version, mark its release as a pre-release or edit its notes to say so, and publish a fixed version with a new number. Don't delete it unless it is harmful, because links to it would break.
