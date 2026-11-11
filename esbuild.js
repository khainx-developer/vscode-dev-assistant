const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const watchPlugin = {
  name: 'watch-markers',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`> ${location ? `${location.file}:${location.line}:${location.column}: ` : ''}error: ${text}`);
      }
      console.log('[watch] build finished');
    });
  },
};

/** Extension host bundle (Node). */
const extensionBuild = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  platform: 'node',
  outfile: 'dist/extension.js',
  external: ['vscode'],
  logLevel: 'silent',
  plugins: [watchPlugin],
};

/**
 * Webview bundles (browser). Each entry imports its own CSS, so esbuild emits
 * dist/webview/<name>.js and dist/webview/<name>.css — loaded by src/ui/webview/html.ts.
 */
const webviewBuild = {
  entryPoints: {
    dashboard: 'src/ui/webview/dashboard/main.js',
    sidebar: 'src/ui/webview/sidebar/main.js',
    tool: 'src/ui/webview/tool/main.js',
  },
  bundle: true,
  format: 'iife',
  target: ['chrome114'],
  minify: production,
  sourcemap: production ? false : 'inline',
  platform: 'browser',
  outdir: 'dist/webview',
  logLevel: 'silent',
  plugins: [watchPlugin],
};

async function main() {
  const contexts = await Promise.all([esbuild.context(extensionBuild), esbuild.context(webviewBuild)]);

  if (watch) {
    await Promise.all(contexts.map((ctx) => ctx.watch()));
  } else {
    await Promise.all(contexts.map((ctx) => ctx.rebuild()));
    await Promise.all(contexts.map((ctx) => ctx.dispose()));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
