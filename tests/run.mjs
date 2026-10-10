import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/domain.test.ts'],bundle:true,platform:'node',format:'esm',outfile:'work/domain.test.mjs',packages:'external'});
const r=spawnSync(process.execPath,['--test','work/domain.test.mjs'],{stdio:'inherit'});process.exit(r.status??1);
