const fs=require('fs');const p='packages/cds-htmx/test/integration/fcl.test.js';const raw=fs.readFileSync(p,'utf8');const crlf=raw.includes('\r\n');let s=raw.replace(/\r\n/g,'\n')
const a='data-hf-col="0">\s*<div class="hf-fcl__scroll">'
if(!s.includes(a)) throw new Error('x')
s=s.replace(a,()=>'data-hf-col="0"[^>]*>\s*<div class="hf-fcl__scroll">')
fs.writeFileSync(p,crlf?s.replace(/\n/g,'\r\n'):s)
