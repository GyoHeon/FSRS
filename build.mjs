import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'

const bundle = await build({
  entryPoints: {app:'src/app.js'}, bundle:true, format:'esm', splitting:true,
  outdir:'assets', entryNames:'[name]-[hash]',
  write:false, minify:true
})
const entry = bundle.outputFiles.find(output => basename(output.path).startsWith('app-'))
const assets = Object.fromEntries(bundle.outputFiles.map(output => ['/assets/'+basename(output.path),output.text]))
await mkdir('dist/.openai',{recursive:true})
await mkdir('dist/server',{recursive:true})
const hosting = await readFile('.openai/hosting.json').catch(error => {
  if (error.code === 'ENOENT') return null
  throw error
})
if (hosting) await writeFile('dist/.openai/hosting.json',hosting)
const html = (await readFile('src/index.html','utf8')).replace('ENTRY',basename(entry.path))
const server = await readFile('src/server.js','utf8')
await writeFile('dist/server/index.js','const html = '+JSON.stringify(html)+';\nconst assets = '+JSON.stringify(assets)+';\n'+server)
for (const [path, content] of Object.entries(assets)) console.log(path, Buffer.byteLength(content))
