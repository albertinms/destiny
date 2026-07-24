// 将 api/src/functions 下的 Azure Functions 入口打包为独立、免安装的产物，
// 输出到 api/dist，供 GitHub Actions 直接部署（跳过 Azure SWA/Oryx 的 pnpm workspace 构建）。
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const apiDir = path.join(rootDir, 'api');
const entryDir = path.join(apiDir, 'src', 'functions');
const outDir = path.join(apiDir, 'dist', 'functions');

const entryPoints = fs
  .readdirSync(entryDir)
  .filter((file) => file.endsWith('.ts') && file !== 'http-bridge.ts')
  .map((file) => path.join(entryDir, file));

fs.rmSync(path.join(apiDir, 'dist'), { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

await build({
  entryPoints,
  outdir: outDir,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['@azure/functions'],
  tsconfig: path.join(rootDir, 'tsconfig.json'),
  logLevel: 'info',
});

fs.copyFileSync(path.join(apiDir, 'host.json'), path.join(apiDir, 'dist', 'host.json'));

fs.writeFileSync(
  path.join(apiDir, 'dist', 'package.json'),
  JSON.stringify(
    {
      name: 'mingyu-api',
      private: true,
      version: '1.0.0',
      main: 'functions/*.js',
      dependencies: {
        '@azure/functions': '^4.7.2',
      },
    },
    null,
    2,
  ),
);

console.log(`API bundled to ${path.relative(rootDir, path.join(apiDir, 'dist'))}`);
