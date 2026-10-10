import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['scripts/setup-devnet.ts'],bundle:true,platform:'node',format:'esm',outfile:'work/setup-devnet.mjs',packages:'external'});
const r=spawnSync(process.execPath,['work/setup-devnet.mjs',...process.argv.slice(2)],{stdio:'inherit'});process.exit(r.status??1);
