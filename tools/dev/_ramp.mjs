import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'
const EXE=process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const b=await chromium.launch({executablePath:existsSync(EXE)?EXE:undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const p=await(await b.newContext()).newPage()
const [f,Y,X0,X1]=process.argv.slice(2)
const data='data:image/png;base64,'+readFileSync(f).toString('base64')
console.log(f.split('/').pop(),'y='+Y,JSON.stringify(await p.evaluate(async({data,Y,X0,X1})=>{
 const img=new Image(); img.src=data; await img.decode()
 const c=document.createElement('canvas'); c.width=img.width;c.height=img.height
 const ctx=c.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0)
 const D=ctx.getImageData(0,0,c.width,c.height).data, W=c.width
 const med=x=>{const a=[];for(let k=-2;k<=2;k++){const i=(Y*W+x+k)*4;a.push(0.2126*D[i]+0.7152*D[i+1]+0.0722*D[i+2])}a.sort((p,q)=>p-q);return a[2]}
 const L=[]; for(let x=X0;x<=X1;x++)L.push(med(x))
 let nb=0,flat=0
 for(let i=1;i<L.length;i++){if(Math.abs(L[i]-L[i-1])>1.6)nb++; if(Math.abs(L[i]-L[i-1])<0.35)flat++}
 // longest monotone (allowing plateaus) run
 let best=0,bd=0,cur=1,dir=0,st=0,bs=0
 for(let i=1;i<L.length;i++){const d=Math.sign(L[i]-L[i-1])
  if(d===0||d===dir){cur++}else{if(cur>best){best=cur;bd=L[i-1]-L[st];bs=st}dir=d;st=i-cur;cur=2}}
 if(cur>best){best=cur;bd=L[L.length-1]-L[st];bs=st}
 return {span:L.length,boundaries:nb,flatFrac:+(100*flat/(L.length-1)).toFixed(1),longestMonotonePx:best,itsDeltaL:+bd.toFixed(1),startX:X0+bs,Lmin:+Math.min(...L).toFixed(1),Lmax:+Math.max(...L).toFixed(1)}
},{data,Y:+Y,X0:+X0,X1:+X1})))
await b.close()
