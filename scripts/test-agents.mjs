import 'reflect-metadata';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import source from '../dist/database/typeorm.config.js';
import { AdminModule } from '../dist/modules/admin/admin.module.js';
import { AgentsModule } from '../dist/modules/agents/agents.module.js';
import { AgentsService } from '../dist/modules/agents/agents.service.js';
import { AttentionService } from '../dist/modules/agents/attention.service.js';
import { CaptureProfileService } from '../dist/modules/admin/capture-profile.service.js';
import { AiService } from '../dist/modules/ai/ai.service.js';
import { KnowledgeService } from '../dist/modules/knowledge/knowledge.service.js';
import { initialState } from '../dist/modules/ai/state.js';
import { historicalPaymentFixture } from './payment-test-helpers.mjs';
import { passwordHash } from '../dist/modules/admin/auth.js';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const schema='agents_test_'+randomBytes(8).toString('hex');
const control=new DataSource({...source.options,migrations:[]});
let db,app,web,browser;
try {
  await control.initialize();await control.query(`CREATE SCHEMA ${schema}`);
  const options={...source.options,schema,extra:{options:`-c search_path=${schema}`},synchronize:false};
  db=new DataSource(options);await db.initialize();await db.runMigrations();
  await new KnowledgeService(db).bootstrap();
  class Root {} Module({imports:[TypeOrmModule.forRoot(options),AdminModule,AgentsModule]})(Root);
  app=await NestFactory.create(Root,{logger:false});await app.init();
  const service=app.get(AgentsService), capture=app.get(CaptureProfileService), attention=app.get(AttentionService);
  // No real provider calls or customer communications.
  app.get(AiService).options=(_budget,knowledge)=>({apiKey:'test',provider:'openai',knowledge,fetchImpl:async(_url,request)=>{
    const input=JSON.parse(request.body), name=input.text.format.name;
    let result={status:'answered',answer:'Consulta el contexto aprobado sobre tu tesis.',sourceIds:[1]};
    if(name==='negotiation_turn') result={kind:'business',name:null,university:null,degree:null,thesisStage:null,need:null,deadline:null,service:null,intent:'unchanged',human:false,objection:'none'};
    if(name==='tesi_comercial') result={campos:[],senales:[],objeciones:[]};
    return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]}));
  }});
  const make=message=>({idTurno:randomUUID(),message,history:[],state:initialState()});
  const first=make('Hola'), hello=await service.turn(first,'');
  assert.equal(hello.result.orchestration.agent,'marketing');
  assert.equal((await db.query('SELECT * FROM agente_ia WHERE nombre LIKE $1',['Tesi %'])).length,5);
  const repeat=await service.turn(first,hello.token);
  assert.deepEqual(repeat.result,hello.result);
  assert.equal((await db.query('SELECT * FROM mensaje')).length,2);
  const bill=make('Ya pagué mi cuota, revisa mi saldo');
  const registered=await service.turn(bill,hello.token);
  assert.equal(registered.result.orchestration.agent,'cobranza');
  assert.match(registered.result.reply,/Solicitud registrada/);
  await service.turn(bill,hello.token);
  assert.equal((await db.query('SELECT * FROM agente_solicitud')).length,1);
  const post=await service.turn(make('Tengo una queja'),hello.token);
  assert.equal(post.result.orchestration.agent,'postventa');
  const academic=await service.turn(make('¿Qué es una hipótesis en una tesis?'),hello.token);
  assert.equal(academic.result.orchestration.agent,'academico');
  const negotiation=await service.turn(make('Quiero consultar un paquete'),hello.token);
  assert.equal(negotiation.result.orchestration.agent,'negociador');
  assert.equal(negotiation.result.proposal,null);
  // Reservations fence duplicate/concurrent workers and stale commits.
  const turn=make('Hola');
  const begun=await capture.begin(hello.token,{idTurno:turn.idTurno,mensaje:turn.message},'agents');
  await assert.rejects(()=>capture.begin(hello.token,{idTurno:randomUUID(),mensaje:'Otro'},'agents'),/proceso/);
  await assert.rejects(()=>capture.begin(hello.token,{idTurno:turn.idTurno,mensaje:turn.message}),error=>error.getStatus()===409);
  const result={state:initialState(),reply:'Hola',quickReplies:[],proposal:null,readyForHandoff:false,faq:false,orchestration:{version:1,agent:'marketing',agents:['marketing'],attention:'active'}};
  const finish={idTurno:turn.idTurno,mensaje:turn.message,respuesta:result.reply,resultadoJson:JSON.stringify(result)};
  await assert.rejects(()=>capture.finish(hello.token,finish,randomUUID()),/Reserva/);
  await capture.finish(hello.token,finish,begun.reservation);
  await assert.rejects(()=>capture.begin(hello.token,{idTurno:turn.idTurno,mensaje:turn.message}),/motor/);
  const expiredInput=make('Hola'), expired=await capture.begin(hello.token,{idTurno:expiredInput.idTurno,mensaje:'Hola'},'agents');
  await db.query("UPDATE conversacion SET agente_expira=now()-interval '1 second' WHERE id_conversacion=$1",[expired.conversation]);
  await assert.rejects(()=>capture.finish(hello.token,{...finish,idTurno:expiredInput.idTurno},expired.reservation),/Reserva/);
  const recovered=await capture.begin(hello.token,{idTurno:expiredInput.idTurno,mensaje:'Hola'},'agents');
  await capture.finish(hello.token,{...finish,idTurno:expiredInput.idTurno},recovered.reservation);
  const [admin]=await db.query("INSERT INTO usuario_interno(nombres,apellidos,correo,rol) VALUES('Test','Agents','agents@example.test','administrador') RETURNING id_usuario");
  const requests=(await attention.list()).requests;
  await attention.action(requests[0].id_solicitud,'tomar',requests[0].revision,admin.id_usuario);
  const paused=await service.turn(make('Hola'),hello.token);
  assert.equal(paused.result.orchestration.attention,'human');
  await assert.rejects(()=>attention.action(requests[0].id_solicitud,'reanudar',requests[0].revision+1,admin.id_usuario),/Resuelve/);
  for(const r of (await attention.list()).requests) await attention.action(r.id_solicitud,'resolver',r.revision,admin.id_usuario);
  const resolved=(await attention.list()).requests[0];
  await attention.action(resolved.id_solicitud,'reanudar',resolved.revision,admin.id_usuario);
  const resumed=await service.turn(make('Hola'),hello.token);
  assert.equal(resumed.result.orchestration.attention,'active');
  assert.deepEqual(await attention.generate(),{created:0,batchSize:100});
  const [lead]=await db.query("INSERT INTO lead(nombres,correo,id_estado) SELECT 'Fixture','due@example.test',id_estado FROM estado_lead WHERE codigo='nuevo' RETURNING id_lead");
  const [proposal]=await db.query("INSERT INTO propuesta(id_lead,monto_total,moneda,estado) VALUES($1,100,'PEN','aceptada') RETURNING id_propuesta",[lead.id_lead]);
  const [contract]=await db.query('INSERT INTO contrato(id_lead,id_propuesta) VALUES($1,$2) RETURNING id_contrato',[lead.id_lead,proposal.id_propuesta]);
  const installment=await db.transaction(async m=>{
    const [schedule]=await m.query("INSERT INTO cronograma_pago(id_contrato,monto_programado,cobros_previos,moneda,id_usuario) VALUES($1,100,0,'PEN',$2) RETURNING id_cronograma",[contract.id_contrato,admin.id_usuario]);
    const [version]=await m.query("INSERT INTO cronograma_version(id_cronograma,numero,estado,id_propuesta,moneda,total_acordado,cobros_reconocidos,monto_programado,modalidad,id_autor) VALUES($1,1,'negociado',$2,'PEN',100,0,100,'{}',$3) RETURNING id_version",[schedule.id_cronograma,proposal.id_propuesta,admin.id_usuario]);
    const [q]=await m.query("INSERT INTO cuota_pago(id_cronograma,id_version,nro_cuota,monto,fecha_vencimiento) VALUES($1,$2,1,100,'2020-01-01') RETURNING id_cuota",[schedule.id_cronograma,version.id_version]);
    await m.query('UPDATE cronograma_pago SET id_version_actual=$2 WHERE id_cronograma=$1',[schedule.id_cronograma,version.id_version]);return q;
  });
  assert.equal((await attention.generate()).created,1);
  assert.equal((await attention.generate()).created,0);
  const reminder=(await attention.list()).reminders[0];
  await historicalPaymentFixture(db,"INSERT INTO pago(id_contrato,id_cuota,monto,moneda,metodo,estado,id_usuario_registro,id_lead) VALUES($1,$2,100,'PEN','transferencia','confirmado',$3,$4)",[contract.id_contrato,installment.id_cuota,admin.id_usuario,lead.id_lead]);
  assert.equal((await attention.review(reminder.id_recordatorio,admin.id_usuario)).estado,'obsoleto');
  if(process.argv.includes('--browser')) {
    await app.listen(0,'127.0.0.1');const backend=await app.getUrl();
    const origin='http://127.0.0.1:44329';process.env.APP_ORIGIN=origin;
    process.env.CRM_BRIDGE_SECRET=randomBytes(32).toString('hex');
    await db.query('UPDATE usuario_interno SET password_hash=$2 WHERE id_usuario=$1',[admin.id_usuario,await passwordHash('agents-browser-test')]);
    const frontend=fileURLToPath(new URL('../../tesispro_frontend/',import.meta.url));
    web=spawn(process.execPath,['dist/server/entry.mjs'],{cwd:frontend,windowsHide:true,stdio:'ignore',env:{...process.env,HOST:'127.0.0.1',PORT:'44329',AGENTS_ENABLED:'true',CRM_API_URL:backend,API_PROXY_TARGET:backend}});
    let ready=false;
    for(let i=0;i<80;i++){try {if((await fetch(origin)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
    assert(ready,'Astro did not start');
    const require=createRequire(new URL('../../tesispro_frontend/package.json',import.meta.url));
    const {chromium}=require('@playwright/test');browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin);await page.locator('#tesi-launcher').click();
    await page.locator('#tesi-input').fill('Ya pagué mi cuota');
    await page.locator('#tesi-form').evaluate(form=>form.requestSubmit());
    await page.waitForFunction(()=>document.querySelector('#tesi-messages')?.textContent?.includes('Solicitud registrada'));
    await page.reload();await page.locator('#tesi-launcher').click();
    assert.match(await page.locator('#tesi-messages').innerText(),/Solicitud registrada/);
    const login=await page.request.post(origin+'/api/auth/login',{headers:{Origin:origin},data:{correo:'agents@example.test',password:'agents-browser-test'}});assert.equal(login.status(),200);
    await page.goto(origin+'/admin/agentes');await page.getByRole('heading',{name:'Atención de agentes'}).waitFor();
    await page.getByText('Ya pagué mi cuota',{exact:true}).waitFor();
    assert.deepEqual(errors,[]);console.log('OK: browser chat, persisted reload, authenticated attention panel.');
  }
  console.log('OK: migrations, Nest DI, five roles, real PostgreSQL persistence, idempotency, fencing, ownership, human pause/resume and reminder query.');
} finally {
  if(browser)await browser.close();if(web){web.kill();await new Promise(r=>web.once('exit',r));}
  if(app) await app.close();if(db?.isInitialized) await db.destroy();
  if(control.isInitialized){await control.query(`DROP SCHEMA ${schema} CASCADE`);await control.destroy();}
}
