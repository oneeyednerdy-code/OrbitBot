import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const excluded=new Set(['CHECKSUMS.txt','FILE-MANIFEST.txt']);

async function files(directory){
  const output=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    if(entry.name==='node_modules'||entry.name==='.wrangler'||entry.name.endsWith('.zip'))continue;
    const path=join(directory,entry.name);
    if(entry.isDirectory())output.push(...await files(path));
    else if(entry.isFile())output.push(relative(root,path).replaceAll('\\','/'));
  }
  return output;
}

const manifest=(await files(root)).filter(path=>!excluded.has(path)).sort((a,b)=>a.localeCompare(b));
await writeFile(join(root,'FILE-MANIFEST.txt'),`${manifest.join('\n')}\n`);
const checksums=[];
for(const path of manifest){const digest=createHash('sha256').update(await readFile(join(root,path))).digest('hex');checksums.push(`${digest}  ${path}`);}
await writeFile(join(root,'CHECKSUMS.txt'),`${checksums.join('\n')}\n`);
console.log(`Release metadata refreshed for ${manifest.length} files.`);
