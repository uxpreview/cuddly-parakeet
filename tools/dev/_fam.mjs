import { chromium } from 'playwright'
import { readFileSync, existsSync } from 'node:fs'
const PAL=[['skyZenith','#CFE3E0'],['skyRim','#F2DFAE'],['limestone','#E3C08C'],['limestoneShadow','#9DA9A2'],['river','#4E8F86'],['pine','#4E6E58'],['path','#EFE3C8'],['deadwood','#8A7C64'],['riverShallow','#7BAA9A'],['riverDeep','#3B6E68'],['scrub','#7E8A63'],['townStone','#D6CDBB'],['townRoof','#C79877'],['sea','#6E9AA0'],['shirt','#3E6E8E'],['shorts','#8A5A3B'],['skin','#D6A57A'],['hair','#4E3D30'],['coat','#E5D5BC'],['points','#F7F2E8'],['collar','#D0342C'],['print','#959780']]
const EXE=process.env.CHROMIUM ?? '/opt/pw-browsers/chromium'
const b=await chromium.launch({executablePath:existsSync(EXE)?EXE:undefined,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']})
const p=await(await b.newContext()).newPage()
const [f,X,Y,W2,H2]=process.argv.slice(2)
const data='data:image/png;base64,'+readFileSync(f).toString('base64')
const r=await p.evaluate(async({data,PAL,X,Y,W2,H2})=>{
 const img=new Image(); img.src=data; await img.decode()
 const c=document.createElement('canvas'); c.width=img.width;c.height=img.height
 const ctx=c.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0)
 const D=ctx.getImageData(0,0,c.width,c.height).data, W=c.width
 const f2l=(v)=>{v/=255; return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4)}
 const lab=(r,g,bl)=>{r=f2l(r);g=f2l(g);bl=f2l(bl)
  let x=(0.4124*r+0.3576*g+0.1805*bl)/0.95047, y=(0.2126*r+0.7152*g+0.0722*bl), z=(0.0193*r+0.1192*g+0.9505*bl)/1.08883
  const f3=t=>t>0.008856?Math.cbrt(t):7.787*t+16/116
  x=f3(x);y=f3(y);z=f3(z); return [116*y-16,500*(x-y),200*(y-z)]}
 const P=PAL.map(([id,hex])=>({id,hex,lab:lab(parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16))}))
 const counts={},de={}
 let n=0
 for(let y=Y;y<Y+H2;y++)for(let x=X;x<X+W2;x++){const i=(y*W+x)*4
  const L=lab(D[i],D[i+1],D[i+2])
  let bi=0,bd=1e9
  for(let k=0;k<P.length;k++){const d=Math.hypot(L[0]-P[k].lab[0],L[1]-P[k].lab[1],L[2]-P[k].lab[2]); if(d<bd){bd=d;bi=k}}
  counts[P[bi].id]=(counts[P[bi].id]||0)+1; de[P[bi].id]=(de[P[bi].id]||0)+bd; n++}
 return Object.entries(counts).sort((a,b)=>b[1]-a[1]).filter(([k,v])=>v/n>0.005)
   .map(([k,v])=>`${k} ${(100*v/n).toFixed(1)}% dE${(de[k]/v).toFixed(1)}`)
},{data,PAL,X:+X,Y:+Y,W2:+W2,H2:+H2})
console.log(f.split('/').pop(),`[${X},${Y},${W2}x${H2}]`,r.join(' | '))
await b.close()
