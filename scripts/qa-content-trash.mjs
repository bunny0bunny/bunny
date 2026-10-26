import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import{mkdtemp,writeFile,readFile,readdir}from'node:fs/promises';
import path from'node:path';import{tmpdir}from'node:os';import{randomBytes}from'node:crypto';import{once}from'node:events';import net from'node:net';import{pathToFileURL,fileURLToPath}from'node:url';
// Every subprocess and connection is bound to this newly created loopback DB.
// Run from a temporary cwd so Bun/Prisma cannot pick up project dotenv files.
const originalSpawn=childProcess.spawn;childProcess.spawn=(cmd,args,opts={})=>originalSpawn(cmd,args,{...opts,windowsHide:true});syncBuiltinESMExports();
const root=process.cwd(),folder=await mkdtemp(path.join(tmpdir(),'bunyora-trash-qa-')),name='reader_qa_'+randomBytes(8).toString('hex'),password=randomBytes(24).toString('hex');
const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
const url=`postgresql://reader_qa:${password}@127.0.0.1:${port}/${name}`;
const env={...process.env,DATABASE_URL:url,DIRECT_URL:url,READER_QA_DATABASE_URL:url,READER_QA_DATABASE_NAME:name,NEXTAUTH_SECRET:randomBytes(32).toString('hex'),NEXTAUTH_URL:'http://127.0.0.1:4199',APP_ORIGIN:'http://127.0.0.1:4199',MEDIA_UPLOADS_ENABLED:'1',MEDIA_STORAGE_PREFIX:'test',ACCOUNT_MAIL_MODE:'local',ACCOUNT_MAIL_LOCAL_DIR:path.join(folder,'mail'),R2_ACCOUNT_ID:'',R2_ACCESS_KEY_ID:'',R2_SECRET_ACCESS_KEY:'',R2_BUCKET_NAME:'',NODE_ENV:'test'};
const report={completed:false,checks:[],folder};
async function run(cmd,args,label){const p=childProcess.spawn(cmd,args,{cwd:folder,env,stdio:['ignore','pipe','pipe']});let output='';for(const stream of[p.stdout,p.stderr])stream.on('data',b=>{output+=b.toString().split(url).join('[isolated DB]').split(password).join('[redacted]');});const timer=setTimeout(()=>p.kill(),240000);const[code]=await once(p,'exit');clearTimeout(timer);await writeFile(path.join(folder,label+'.log'),output);if(code!==0){console.log(output.slice(-18000));throw Error(label+' failed ('+code+')');}console.log(label+': passed');report.checks.push(label);}
const{default:EmbeddedPostgres}=await import('embedded-postgres');const{default:getBinaries}=await import(pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.resolve('embedded-postgres'))),'binary.js')).href),binaries=await getBinaries();
const pg=new EmbeddedPostgres({databaseDir:path.join(folder,'postgres'),port,user:'reader_qa',password,persistent:true,initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
console.log('Content trash QA artifacts: '+folder);
try{
 await pg.initialise();await pg.start();let client=pg.getPgClient('postgres','127.0.0.1');await client.connect();await client.query(`CREATE DATABASE "${name}" ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C'`);await client.end();client=pg.getPgClient(name,'127.0.0.1');await client.connect();
 // Replay the saved migration SQL, including the additive trash migration.
 for(const m of(await readdir(path.join(root,'prisma/migrations'),{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort()){
  if(m==='20261025120000_pdf_source_retention'&&process.argv.includes('--all'))await client.query(`
   INSERT INTO "Profile"(id,email,nickname,"passwordHash","updatedAt") VALUES ('legacy-profile','legacy-fixture@bunny.test','Legacy','x',now());
   INSERT INTO "Series"(id,slug,"titleAr","synopsisAr",format,author,"coverPath","updatedAt") VALUES ('legacy-series','legacy-upload-fixture','Legacy','Legacy','manga','QA','',now());
   INSERT INTO "Chapter"(id,"seriesId",number,"titleAr","updatedAt") VALUES ('legacy-chapter','legacy-series',1,'Legacy',now());
   INSERT INTO "ChapterRevision"(id,"chapterId","revisionNumber","titleAr","updatedAt") VALUES ('legacy-revision','legacy-chapter',1,'Legacy',now());
   INSERT INTO "ChapterUpload"(id,"revisionId","chapterId","createdById","sourceName","sourceBytes","expectedPages","revisionVersion","expiresAt","updatedAt") VALUES ('legacy-upload','legacy-revision','legacy-chapter','legacy-profile','legacy.pdf',5,1,1,'2000-01-01',now());
   INSERT INTO "MediaAsset"(id,"uploadId","chapterId","pageIndex","objectKey",mime,bytes,"readyAt") VALUES ('legacy-asset','legacy-upload','legacy-chapter',-1,'media/test/legacy-upload/legacy-asset.pdf','application/pdf',5,now());
  `);
  await client.query(await readFile(path.join(root,'prisma/migrations',m,'migration.sql'),'utf8'));
 }
 const cols=await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name='ContentTrash'`);if(!cols.rows.some(c=>c.column_name==='activeKey'))throw Error('Trash migration missing');await client.end();report.checks.push('all migrations replayed on isolated PostgreSQL');
 const testsDir=path.join(root,'tests/team-access');
 let files=process.argv.includes('--all')?(await readdir(testsDir)).filter(f=>f.endsWith('.test.ts')):['content-trash.test.ts','content-trash-boundaries.test.ts'];
 if(process.argv.includes('--all')){
  await run('bun',['--tsconfig-override='+path.join(root,'tsconfig.json'),path.join(root,'prisma/seed.ts')],'isolated-seed');
  await run(process.execPath,[path.join(root,'tests/reader/seed.mjs')],'isolated-reader-seed');
 }
 const failures=[];
 for(const f of files)try{await run('bun',['test','--tsconfig-override='+path.join(root,'tsconfig.json'),'--preload='+path.join(testsDir,'session-fixture.ts'),path.join(testsDir,f)],f.replace('.test.ts',''));}catch(error){failures.push({file:f,error:error.message});}
 if(failures.length){report.failures=failures;throw Error(`${failures.length} test file(s) failed; see per-file logs`);}
 report.completed=true;
}catch(error){report.error=error.message;console.error(error.message);process.exitCode=1;}
finally{if(pg.process?.exitCode===null){const stop=childProcess.spawn(binaries.pg_ctl,['-D',path.join(folder,'postgres'),'stop','-m','fast','-w','-t','20'],{stdio:'ignore',windowsHide:true});await once(stop,'exit');pg.process=undefined;}await writeFile(path.join(folder,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
