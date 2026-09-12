import {build} from 'esbuild';
await build({entryPoints:['worker/index.ts'],bundle:true,platform:'node',format:'esm',outfile:'outputs/test-worker.mjs',sourcemap:'inline'});
