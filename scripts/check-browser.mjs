import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

async function javascriptFiles(directory){
  const output=[];
  for(const entry of await readdir(directory,{withFileTypes:true})){
    const path=join(directory,entry.name);
    if(entry.isDirectory())output.push(...await javascriptFiles(path));
    else if(entry.isFile()&&entry.name.endsWith('.js'))output.push(path);
  }
  return output;
}

let failed=false;
for(const file of await javascriptFiles(fileURLToPath(new URL('../public/js',import.meta.url)))){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0){failed=true;process.stderr.write(result.stderr||`${file} failed syntax validation\n`);}
}
if(failed)process.exitCode=1;
else console.log('Browser JavaScript syntax checks passed.');
