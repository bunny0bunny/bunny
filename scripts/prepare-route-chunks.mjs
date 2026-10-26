import {readFile,readdir,mkdir,copyFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

export async function prepareRouteChunks(output) {
  const assets=path.join(output,'assets'),chunks=path.join(assets,'_next/static/chunks');
  const aliases={};
  async function walk(dir) {
    for (const entry of await readdir(dir,{withFileTypes:true})) {
      const filename=path.join(dir,entry.name);
      if (entry.isSymbolicLink()) throw new Error('Unexpected symbolic link in framework chunks');
      if (entry.isDirectory()) {await walk(filename);continue;}
      const original='/'+path.relative(assets,filename).split(path.sep).join('/');
      if (!/[\[\]]/.test(original)||!(/\.(js|css)$/.test(filename))) continue;
      const hash=createHash('sha256').update(await readFile(filename)).digest('hex');
      const target=`/_next/static/route-chunks/${hash}${path.extname(filename)}`;
      await mkdir(path.dirname(path.join(assets,target)),{recursive:true});
      await copyFile(filename,path.join(assets,target));
      aliases[original]=target;
    }
  }
  await walk(chunks);
  await writeFile(path.join(output,'route-chunk-aliases.mjs'),'export default '+JSON.stringify(aliases)+';\n');
  return Object.keys(aliases).length;
}
