import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const backend=fileURLToPath(new URL('../',import.meta.url));
const landing=fileURLToPath(new URL('../../tesispro-landing/',import.meta.url));
const target=process.env.TEST_UI_TARGET||'http://localhost:4321';
const cases=[
  {name:'R3: captación, descarga, atribución y cita',requirements:[3],file:'scripts/test-journeys.mjs',env:{JOURNEYS_UI_TARGET:target}},
  {name:'R3: publicación, archivos y administración de recursos',requirements:[3],file:'scripts/test-resources.mjs',env:{RESOURCES_UI_TARGET:target}},
  {name:'R3/R6: identidad y conversión buyer a lead',requirements:[3,6],file:'scripts/test-buyers.mjs'},
  {name:'R6/R7/R8: PostgreSQL y recorrido completo en navegador',requirements:[6,7,8],file:'scripts/test-lead-profile.mjs',env:{R6_UI:'1',R7_UI:'1',TEST_UI_TARGET:target}},
  {name:'R7: configuración y versión de reglas',requirements:[7],args:['--test','scripts/test-r7-rules.test.mjs']},
  {name:'R7/R8: ficha, evidencia y revisión en desarrollo',requirements:[7,8],file:'tests/r7-dev-browser.mjs',cwd:landing},
  {name:'R7/R8: interpretación y proveedor IA simulado',requirements:[7,8],cwd:landing,args:['--test','tests/negotiation.test.mjs','tests/ai-provider.test.mjs','tests/r8-proposal.test.mjs','tests/packages.test.mjs','tests/payment-modes.test.mjs','tests/faq-ai.test.mjs']},
  {name:'R8: continuidad financiera de paquetes',requirements:[8],args:['scripts/test-packages.mjs','--finance-only']},
  {name:'R8/R13/R14: contratos',requirements:[8,13,14],file:'scripts/test-contracts.mjs'},
  {name:'R6/R13/R14: regresión administrativa',requirements:[6,13,14],file:'scripts/test-admin.mjs'},
  {name:'R13: cronogramas, abonos y versiones en navegador',requirements:[13],args:['scripts/test-payment-schedules.mjs','--browser'],env:{R13_BROWSER_CHANNEL:process.env.R13_BROWSER_CHANNEL||'msedge'}},
  {name:'R14: registro y verificación en navegador',requirements:[14],args:['scripts/test-payment-verification.mjs','--browser']},
];
const results=[];
for(const entry of cases){
  console.log(`\n>>> ${entry.name}`);
  const started=Date.now();
  const exitCode=await new Promise(resolve=>{
    const child=spawn(process.execPath,entry.args||[entry.file],{cwd:entry.cwd||backend,env:{...process.env,...entry.env},windowsHide:true,stdio:'inherit'});
    child.once('error',error=>{console.error(error.message);resolve(1)});
    child.once('exit',code=>resolve(code??1));
  });
  results.push({name:entry.name,requirements:entry.requirements,passed:exitCode===0,exitCode,durationMs:Date.now()-started});
}
const requirements=Object.fromEntries([3,6,7,8,13,14].map(id=>[`R${id}`,results.filter(r=>r.requirements.includes(id)).every(r=>r.passed)?'PASS':'FAIL']));
await mkdir(new URL('../.temp/',import.meta.url),{recursive:true});
await writeFile(new URL('../.temp/requirements-report.json',import.meta.url),JSON.stringify({date:new Date().toISOString(),timezone:'America/Lima',target,provider:'simulated',requirements,results},null,2)+'\n');
console.table(requirements);
if(results.some(r=>!r.passed))process.exitCode=1;
