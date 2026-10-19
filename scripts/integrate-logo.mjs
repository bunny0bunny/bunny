/** Regenerate every shipped brand/icon size from a transparent master; never flatten alpha. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.resolve(process.argv[2]??path.join(root,'public/brand/bunny-master.png'));
const meta=await sharp(source).metadata();
if(!meta.hasAlpha||(await sharp(source).stats()).isOpaque) throw new Error('Logo source must have real transparency; JPEG/opaque backgrounds are not accepted.');
const square=await sharp(source).trim().resize(512,512,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
for(const [file,size,format] of [['src/app/icon.png',64,'png'],['src/app/apple-icon.png',180,'png'],['public/brand/bunny-mark-128.webp',128,'webp'],['public/brand/bunny-mark-256.webp',256,'webp']]){
 const dest=path.join(root,file);await fs.mkdir(path.dirname(dest),{recursive:true});
 await sharp(square).resize(size,size).toFormat(format,format==='webp'?{quality:90,alphaQuality:100}:{compressionLevel:9}).toFile(dest);
 console.log(file);
}
// Legacy browsers also receive the same transparent mascot, with three native sizes.
const sizes=[16,32,48];const entries=await Promise.all(sizes.map(size=>sharp(square).resize(size,size).png().toBuffer()));
const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
for(let i=0;i<sizes.length;i++){const p=6+16*i;header[p]=sizes[i];header[p+1]=sizes[i];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(entries[i].length,p+8);header.writeUInt32LE(offset,p+12);offset+=entries[i].length;}
await fs.writeFile(path.join(root,'src/app/favicon.ico'),Buffer.concat([header,...entries]));
console.log('Transparent favicon.ico (16/32/48)');
