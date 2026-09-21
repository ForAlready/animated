const http=require('http'),fs=require('fs'),path=require('path');
const {chromium}=require('C:/Users/小可乐/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
exports.run=async task=>{
 const root=__dirname,server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return}const target=file===root?path.join(root,'index.html'):file;fs.stat(target,(err,stat)=>{if(err){res.writeHead(404).end();return}res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.html':'text/html','.glb':'model/gltf-binary'})[path.extname(target)]||'application/octet-stream');res.setHeader('Content-Length',stat.size);fs.createReadStream(target).pipe(res)})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--enable-webgl','--use-angle=swiftshader']});const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];page.on('pageerror',e=>{errors.push(String(e));console.error(String(e))});page.on('console',m=>{if(m.type()==='error')console.error(m.text())});await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForFunction(()=>window.ready,null,{timeout:120000});await page.click('#play');await task(page);if(errors.length)throw Error(errors.join('\n'));
 }finally{await browser?.close();await new Promise(r=>server.close(r))}
};

