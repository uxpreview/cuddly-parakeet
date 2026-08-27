import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'
const EXE=process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const b=await chromium.launch({executablePath:existsSync(EXE)?EXE:undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const p=await(await b.newContext()).newPage()
const [f,X,Y,W2,H2,TR,TG,TB,TOL]=process.argv.slice(2)
const data='data:image/png;base64,'+readFileSync(f).toString('base64')
console.log(JSON.stringify(await p.evaluate(async({data,X,Y,W2,H2,T,TOL})=>{
 const img=new Image(); img.src=data; await img.decode()
 const c=document.createElement('canvas'); c.width=img.width;c.height=img.height
 const ctx=c.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0)
 const D=ctx.getImageData(0,0,c.width,c.height).data, W=c.width
 let n=0,x0=1e9,y0=1e9,x1=-1,y1=-1; const rows={}
 for(let y=Y;y<Y+H2;y++)for(let x=X;x<X+W2;x++){const i=(y*W+x)*4
  if(Math.abs(D[i]-T[0])<TOL&&Math.abs(D[i+1]-T[1])<TOL&&Math.abs(D[i+2]-T[2])<TOL){
   n++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);rows[y]=(rows[y]||0)+1}}
 return {n,bbox:[x0,y0,x1,y1],w:x1-x0+1,h:y1-y0+1,rows}
},{data,X:+X,Y:+Y,W2:+W2,H2:+H2,T:[+TR,+TG,+TB],TOL:+TOL})))
await b.close()
