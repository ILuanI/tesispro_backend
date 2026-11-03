import {createServer,request as proxyRequest} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

// Pages/assets come from the existing development server. Source API handlers
// run in this isolated test process so their private CRM bridge targets its schema.
// No production server, parallel build, or operational database fixtures are used.
export async function developmentUiProxy(backend,target='http://localhost:4321') {
  const require=createRequire(new URL('../../tesispro-landing/package.json',import.meta.url));
  const {build}=createRequire(require.resolve('astro/package.json'))('esbuild');
  const handlers=new Map();
  for(const [path,source] of [['/api/negotiation','src/pages/api/negotiation.ts'],['/api/internal/proposal','src/pages/api/internal/proposal.ts']]) {
    const bundle=await build({entryPoints:[fileURLToPath(new URL('../../tesispro-landing/'+source,import.meta.url))],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env':'{}'}});
    handlers.set(path,await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64')));
  }
  const server=createServer(async(req,res)=>{
    try {
      const pathname=new URL(req.url,'http://localhost').pathname;
      if(handlers.has(pathname)) {
        const parts=[];for await(const chunk of req)parts.push(chunk);
        const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(parts)});
        const endpoint=handlers.get(pathname),handler=endpoint[req.method]||endpoint.ALL;
        const result=handler?await handler({request}):new Response(null,{status:405});
        res.statusCode=result.status;
        result.headers.forEach((value,key)=>{if(key!=='set-cookie')res.setHeader(key,value)});
        const cookies=result.headers.getSetCookie();if(cookies.length)res.setHeader('set-cookie',cookies);
        res.end(Buffer.from(await result.arrayBuffer()));return;
      }
      const api=pathname.startsWith('/api/'),redirect=pathname.startsWith('/r/');
      const upstream=new URL(api||redirect?backend:target);
      const proxy=proxyRequest({hostname:upstream.hostname,port:upstream.port,path:api?req.url.slice(4):req.url,method:req.method,headers:{...req.headers,host:upstream.host}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res)});
      proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end()});req.pipe(proxy);
    }catch(error){if(!res.headersSent)res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:String(error.message)}))}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {origin:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
