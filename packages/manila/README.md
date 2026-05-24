# manila

Electron Forge app in the Tuna accessibility ecosystem.
TypeScript renderer + main process wired through Webpack.

## Develop

```
npm install
npm start         # electron-forge start
npm run package   # bundle the app
npm run make      # build distributables
npm run lint      # eslint
```

## Layout

- `src/index.ts` — main process
- `src/preload.ts` — preload script
- `src/renderer.ts` — renderer entrypoint
- `src/index.html`, `src/index.css` — renderer shell
- `src/modules/` — app modules

## License

AGPL-3.0 — see `LICENSE`.
